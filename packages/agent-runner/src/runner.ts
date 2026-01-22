/**
 * Agent Runner
 *
 * Main runner class that spawns and manages AI coding CLI processes,
 * parses their output, and streams events to Redis.
 *
 * Optionally integrates with the evaluation system to capture interactions
 * for prompt improvement and A/B testing.
 */

import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentConfig,
  AgentMetrics,
  AgentState,
  AgentStatus,
  CliAdapter,
  StreamEvent,
  RunnerEvents,
} from './types.js';
import { getAdapter } from './adapters/index.js';
import { ResourceMonitor, type TokenUsageRecord } from './resource-monitor.js';
import type {
  EvaluationLogger,
  EvaluationLogBuilder,
  ToolCallRecord,
  EvaluationOutcome,
} from '@a3t/rapid-core';

// Pricing per 1M tokens (approximate)
const PRICING = {
  opus: { input: 15, output: 75 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 0.25, output: 1.25 },
};

export interface AgentRunnerOptions {
  /** Redis client for streaming events */
  redis?: {
    xadd(
      key: string,
      id: string,
      ...args: string[]
    ): Promise<string | null>;
  };
  /** Stream key prefix for Redis */
  streamKeyPrefix?: string;
  /** Callback for events (alternative to Redis) */
  onEvent?: (event: StreamEvent) => void;
  /** Callback for state changes */
  onStateChange?: (state: AgentState) => void;
  /** Interval for metrics updates (ms) */
  metricsInterval?: number;
  /** Evaluation logger for capturing interactions */
  evaluationLogger?: EvaluationLogger;
  /** Session ID for evaluation logs */
  sessionId?: string;
  /** Prompt version for A/B testing */
  promptVersion?: string;
  /** Experiment variant for A/B testing */
  experimentVariant?: string;
  /** Callback for resource limit alerts */
  onLimitAlert?: (
    type: 'warning' | 'violation',
    violation: {
      type: string;
      limit: number;
      current: number;
      message: string;
    }
  ) => void;
}

export class AgentRunner extends EventEmitter {
  private config: AgentConfig;
  private adapter: CliAdapter;
  private process: ChildProcess | null = null;
  private status: AgentStatus = 'stopped';
  private metrics: AgentMetrics;
  private options: AgentRunnerOptions;
  private metricsTimer: NodeJS.Timeout | null = null;
  private eventBuffer: StreamEvent[] = [];
  private resourceMonitor: ResourceMonitor;

  // Evaluation tracking
  private currentLogBuilder: EvaluationLogBuilder | null = null;
  private iterationStartTime: number = 0;
  private iterationTokens = { input: 0, output: 0 };
  private iterationToolCalls: ToolCallRecord[] = [];
  private iterationContent = '';
  private iterationThinking = '';
  private currentToolUse: {
    id: string;
    name: string;
    input: Record<string, unknown>;
    startTime: number;
  } | null = null;

  constructor(config: AgentConfig, options: AgentRunnerOptions = {}) {
    super();
    this.config = config;
    this.adapter = getAdapter(config.tool);
    this.options = {
      streamKeyPrefix: 'rapid:agent:stream',
      metricsInterval: 5000,
      ...options,
    };

    this.resourceMonitor = new ResourceMonitor(config.limits);

    this.metrics = {
      agentId: config.agentId,
      startedAt: '',
      iteration: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCostUsd: 0,
      errorCount: 0,
      memoryMb: 0,
      lastHeartbeat: new Date().toISOString(),
    };
  }

  /**
   * Start the agent process
   */
  async start(): Promise<void> {
    if (this.status !== 'stopped') {
      throw new Error(`Cannot start agent in status: ${this.status}`);
    }

    // Check if tool is available
    const available = await this.adapter.isAvailable();
    if (!available) {
      throw new Error(
        `Tool ${this.config.tool} is not available on this system`
      );
    }

    this.setStatus('starting');
    this.metrics.startedAt = new Date().toISOString();

    try {
      await this.spawnProcess();
      this.setStatus('running');
      this.startMetricsTimer();
      this.emitTyped('started', this.config);
    } catch (error) {
      this.setStatus('error');
      this.emitTyped('error', error as Error);
      throw error;
    }
  }

  /**
   * Stop the agent process gracefully
   */
  async stop(reason = 'manual'): Promise<void> {
    if (!this.process) {
      return;
    }

    this.setStatus('stopping');
    this.stopMetricsTimer();

    // Complete any pending evaluation log
    if (this.currentLogBuilder) {
      const outcome: EvaluationOutcome =
        reason === 'error_limit' ? 'failure' : 'partial';
      await this.completeEvaluationLog(outcome);
    }

    // Send SIGTERM first
    this.process.kill('SIGTERM');

    // Wait for graceful shutdown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if still running
        if (this.process) {
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      this.process?.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.process = null;
    this.setStatus('stopped');
    this.emitTyped('stopped', reason);
  }

  /**
   * Send a message/prompt to the running agent
   */
  async sendMessage(message: string): Promise<void> {
    if (!this.process?.stdin?.writable) {
      throw new Error('Agent process is not running or stdin is not writable');
    }

    this.process.stdin.write(message + '\n');
    this.metrics.iteration++;
  }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return {
      status: this.status,
      config: this.config,
      metrics: { ...this.metrics },
    };
  }

  /**
   * Get buffered events (for replay)
   */
  getEventBuffer(): StreamEvent[] {
    return [...this.eventBuffer];
  }

  /**
   * Get resource monitor for detailed metrics
   */
  getResourceMonitor(): ResourceMonitor {
    return this.resourceMonitor;
  }

  private async spawnProcess(): Promise<void> {
    const args = this.adapter.buildArgs(this.config);
    const command = this.config.tool;

    this.process = spawn(command, args, {
      cwd: this.config.workdir,
      env: {
        ...process.env,
        RAPID_AGENT_ID: this.config.agentId,
        RAPID_AGENT_NAME: this.config.agentName,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Parse stdout line by line
    if (this.process.stdout) {
      const rl = createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        this.handleLine(line);
      });
    }

    // Parse stderr
    if (this.process.stderr) {
      const rl = createInterface({
        input: this.process.stderr,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        this.handleStderr(line);
      });
    }

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      this.handleExit(code, signal);
    });

    this.process.on('error', (error) => {
      this.resourceMonitor.trackError();
      this.metrics.errorCount++;
      this.emitTyped('error', error);
    });

    // Send initial task if stdin is available
    if (this.config.task && this.process.stdin) {
      this.process.stdin.write(this.config.task + '\n');
    }
  }

  private handleLine(line: string): void {
    const event = this.adapter.parseLine(line);
    if (event) {
      this.processEvent(event);
    }
  }

  private handleStderr(line: string): void {
    // Create error event from stderr
    const event: StreamEvent = {
      source: this.config.tool,
      type: 'error',
      content: line,
      timestamp: new Date().toISOString(),
      isError: true,
    };
    this.processEvent(event);
  }

  private processEvent(event: StreamEvent): void {
    // Add event ID if missing
    if (!event.eventId) {
      event.eventId = uuidv4();
    }

    // Update metrics from usage info
    if (event.usage) {
      this.metrics.totalInputTokens += event.usage.inputTokens;
      this.metrics.totalOutputTokens += event.usage.outputTokens;
      this.updateCostEstimate();

      // Track in resource monitor
      const usage: TokenUsageRecord = {
        inputTokens: event.usage.inputTokens,
        outputTokens: event.usage.outputTokens,
        cacheCreationInputTokens: event.usage.cacheCreationInputTokens,
        cacheReadInputTokens: event.usage.cacheReadInputTokens,
      };
      this.resourceMonitor.trackTokens(
        usage,
        this.config.model || 'sonnet'
      );

      // Track for evaluation
      this.iterationTokens.input += event.usage.inputTokens;
      this.iterationTokens.output += event.usage.outputTokens;
    }

    // Track evaluation data based on event type
    this.trackEvaluationEvent(event);

    // Track errors
    if (event.isError) {
      this.resourceMonitor.trackError();
      this.metrics.errorCount++;
      this.checkErrorLimit();
    } else {
      this.resourceMonitor.trackApiCall(true);
    }

    // Check resource limits and emit alerts
    this.checkResourceLimits();

    // Buffer event
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > 1000) {
      this.eventBuffer.shift();
    }

    // Emit event
    this.emitTyped('event', event);

    // Send to callback
    this.options.onEvent?.(event);

    // Stream to Redis
    this.streamToRedis(event);
  }

  /**
   * Check resource limits and emit alerts if needed
   */
  private checkResourceLimits(): void {
    const limitStatus = this.resourceMonitor.checkLimits();

    // Emit warnings
    for (const warning of limitStatus.warnings) {
      this.options.onLimitAlert?.('warning', {
        type: warning.type,
        limit: warning.limit,
        current: warning.current,
        message: warning.message,
      });
    }

    // Stop if hard limits exceeded
    if (!limitStatus.withinLimits) {
      for (const violation of limitStatus.violations) {
        this.options.onLimitAlert?.('violation', {
          type: violation.type,
          limit: violation.limit,
          current: violation.current,
          message: violation.message,
        });

        // Stop agent immediately for cost/memory/error limits
        if (['cost', 'memory', 'errors'].includes(violation.type)) {
          this.stop(`limit_exceeded:${violation.type}`);
        }
      }
    }
  }

  /**
   * Track event data for evaluation logging
   */
  private trackEvaluationEvent(event: StreamEvent): void {
    if (!this.options.evaluationLogger) return;

    switch (event.type) {
      case 'init':
        // Start new iteration/interaction log
        this.startEvaluationLog();
        break;

      case 'thinking':
        // Capture thinking content
        if (event.content) {
          this.iterationThinking += event.content;
        }
        break;

      case 'text':
        // Capture response content
        if (event.content) {
          this.iterationContent += event.content;
        }
        break;

      case 'tool_use':
        // Start tracking a tool call
        if (event.toolName) {
          this.currentToolUse = {
            id: event.toolUseId || uuidv4(),
            name: event.toolName,
            input: event.toolInput || {},
            startTime: Date.now(),
          };
        }
        break;

      case 'tool_result':
        // Complete the tool call
        if (this.currentToolUse) {
          const toolCall: ToolCallRecord = {
            id: this.currentToolUse.id,
            name: this.currentToolUse.name,
            input: this.currentToolUse.input,
            output: event.content,
            success: !event.isError,
            durationMs: Date.now() - this.currentToolUse.startTime,
            startedAt: new Date(
              this.currentToolUse.startTime
            ).toISOString(),
            completedAt: new Date().toISOString(),
          };
          this.iterationToolCalls.push(toolCall);
          this.currentToolUse = null;
        }
        break;

      case 'complete':
        // End of iteration - complete the evaluation log
        this.completeEvaluationLog('success');
        break;

      case 'error':
        // Track error but don't necessarily end the iteration
        if (event.content) {
          this.iterationContent += `\n[Error: ${event.content}]`;
        }
        break;
    }
  }

  /**
   * Start a new evaluation log for an interaction
   */
  private startEvaluationLog(): void {
    if (!this.options.evaluationLogger) return;

    // Complete any existing log first
    if (this.currentLogBuilder) {
      this.completeEvaluationLog('partial');
    }

    const sessionId = this.options.sessionId || this.config.agentId;
    this.currentLogBuilder = this.options.evaluationLogger.startLog(
      sessionId,
      this.config.agentId,
      this.config.agentName
    );

    // Set model and prompt version if configured
    this.currentLogBuilder.setModel(this.config.model || 'sonnet');
    if (this.options.promptVersion) {
      this.currentLogBuilder.setPromptVersion(
        this.options.promptVersion,
        this.options.experimentVariant
      );
    }

    // Set the task/prompt
    this.currentLogBuilder.setPrompt('', this.config.task);

    // Add metadata
    this.currentLogBuilder.addMetadata('tool', this.config.tool);
    this.currentLogBuilder.addMetadata('workdir', this.config.workdir);

    // Reset iteration tracking
    this.iterationStartTime = Date.now();
    this.iterationTokens = { input: 0, output: 0 };
    this.iterationToolCalls = [];
    this.iterationContent = '';
    this.iterationThinking = '';
  }

  /**
   * Complete the current evaluation log
   */
  private async completeEvaluationLog(
    outcome: EvaluationOutcome
  ): Promise<void> {
    if (!this.currentLogBuilder || !this.options.evaluationLogger) return;

    try {
      // Set response content
      this.currentLogBuilder.setResponse(
        this.iterationContent,
        this.iterationThinking || undefined
      );

      // Add all tool calls
      for (const toolCall of this.iterationToolCalls) {
        this.currentLogBuilder.addToolCall(toolCall);
      }

      // Set outcome
      const hasErrors = this.iterationToolCalls.some((tc) => !tc.success);
      const finalOutcome =
        hasErrors && outcome === 'success' ? 'partial' : outcome;
      this.currentLogBuilder.setOutcome(finalOutcome);

      // Calculate and set metrics
      const latencyMs = Date.now() - this.iterationStartTime;
      const tokens = {
        inputTokens: this.iterationTokens.input,
        outputTokens: this.iterationTokens.output,
        totalTokens: this.iterationTokens.input + this.iterationTokens.output,
      };

      // Calculate cost using pricing
      const tier = this.config.model || 'sonnet';
      const pricing = PRICING[tier] || PRICING.sonnet;
      const inputCost = (tokens.inputTokens * pricing.input) / 1_000_000;
      const outputCost = (tokens.outputTokens * pricing.output) / 1_000_000;

      this.currentLogBuilder.setMetrics(tokens, latencyMs, {
        inputCost,
        outputCost,
        totalCost: inputCost + outputCost,
        pricingTier: tier,
      });

      // Complete and store the log
      await this.options.evaluationLogger.completeLog(this.currentLogBuilder);

      // Reset for next iteration
      this.currentLogBuilder = null;
    } catch (error) {
      console.error('Failed to complete evaluation log:', error);
      this.currentLogBuilder = null;
    }
  }

  private async streamToRedis(event: StreamEvent): Promise<void> {
    if (!this.options.redis) return;

    const streamKey = `${this.options.streamKeyPrefix}:${this.config.agentId}`;

    try {
      await this.options.redis.xadd(
        streamKey,
        '*',
        'type',
        event.type,
        'source',
        event.source,
        'content',
        event.content || '',
        'timestamp',
        event.timestamp,
        'eventId',
        event.eventId || '',
        'data',
        JSON.stringify(event)
      );
    } catch (error) {
      console.error('Failed to stream event to Redis:', error);
    }
  }

  private handleExit(
    code: number | null,
    signal: NodeJS.Signals | null
  ): void {
    this.stopMetricsTimer();
    const reason = signal ? `signal:${signal}` : `exit:${code}`;

    if (this.status === 'stopping') {
      // Expected stop
      this.setStatus('stopped');
    } else if (code === 0) {
      // Completed successfully
      this.setStatus('stopped');
    } else {
      // Unexpected exit
      this.setStatus('error');
    }

    this.emitTyped('stopped', reason, code ?? undefined);
  }

  private setStatus(status: AgentStatus): void {
    this.status = status;
    this.metrics.lastHeartbeat = new Date().toISOString();
    this.options.onStateChange?.(this.getState());
  }

  private updateCostEstimate(): void {
    const tier = this.config.model || 'sonnet';
    const pricing = PRICING[tier] || PRICING.sonnet;

    this.metrics.estimatedCostUsd =
      (this.metrics.totalInputTokens * pricing.input +
        this.metrics.totalOutputTokens * pricing.output) /
      1_000_000;
  }

  private checkErrorLimit(): void {
    const maxErrors = this.config.limits?.maxErrors ?? 10;
    if (this.metrics.errorCount >= maxErrors) {
      this.stop('error_limit');
    }
  }

  private startMetricsTimer(): void {
    this.metricsTimer = setInterval(() => {
      const resourceMetrics = this.resourceMonitor.getMetrics();
      this.metrics.memoryMb = resourceMetrics.memoryMb;
      this.metrics.lastHeartbeat = new Date().toISOString();
      this.emitTyped('metrics', this.metrics);
    }, this.options.metricsInterval);
  }

  private stopMetricsTimer(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  // Type-safe event emitter methods
  private emitTyped<K extends keyof RunnerEvents>(
    event: K,
    ...args: Parameters<RunnerEvents[K]>
  ): boolean {
    return this.emit(event, ...args);
  }

  on<K extends keyof RunnerEvents>(
    event: K,
    listener: RunnerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  once<K extends keyof RunnerEvents>(
    event: K,
    listener: RunnerEvents[K]
  ): this {
    return super.once(event, listener);
  }

  off<K extends keyof RunnerEvents>(
    event: K,
    listener: RunnerEvents[K]
  ): this {
    return super.off(event, listener);
  }
}
