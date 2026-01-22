/**
 * @a3t/agent-runner
 *
 * Sophisticated agent runner for RAPID with streaming output and multi-tool support.
 *
 * Features:
 * - Multi-tool support: Claude, Gemini, OpenCode, Aider
 * - Unified stream event format
 * - Redis streaming for real-time updates
 * - Token usage tracking and cost estimation
 * - Resource limits and error handling
 * - Resource monitoring with automatic alerts
 *
 * @example
 * ```typescript
 * import { AgentRunner, ResourceMonitor } from '@a3t/agent-runner';
 *
 * const runner = new AgentRunner({
 *   agentId: 'my-agent',
 *   agentName: 'Worker',
 *   tool: 'claude',
 *   model: 'sonnet',
 *   workdir: '/path/to/project',
 *   task: 'Implement the user authentication feature',
 *   limits: {
 *     maxMemoryMb: 512,
 *     maxCostUsd: 10,
 *     maxErrors: 10,
 *   },
 * });
 *
 * runner.on('event', (event) => {
 *   console.log(`[${event.type}] ${event.content}`);
 * });
 *
 * const monitor = runner.getResourceMonitor();
 * console.log('Current metrics:', monitor.getMetrics());
 *
 * await runner.start();
 * ```
 */

// Types
export type {
  AgentTool,
  ModelTier,
  StreamEventType,
  StreamEvent,
  TokenUsage,
  AgentConfig,
  ResourceLimits,
  AgentMetrics,
  AgentStatus,
  AgentState,
  CliAdapter,
  ClaudeStreamEvent,
  RunnerEvents,
} from './types.js';

// Runner
export { AgentRunner, type AgentRunnerOptions } from './runner.js';

// Resource Monitor
export {
  ResourceMonitor,
  type TokenUsageRecord,
  type CostBreakdown,
  type ResourceMetrics,
  type LimitStatus,
  type LimitViolation,
  type LimitWarning,
} from './resource-monitor.js';

// Adapters
export {
  ClaudeAdapter,
  GeminiAdapter,
  AiderAdapter,
  OpenCodeAdapter,
  getAdapter,
  getAvailableTools,
} from './adapters/index.js';
