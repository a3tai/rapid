/**
 * Evaluation System Tests
 *
 * Comprehensive test suite for the evaluation logger, analyzer, and storage backends.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createEvaluationLogger,
  createEvaluationAnalyzer,
  calculateCost,
  EvaluationLogger,
} from './index.js';
import type {
  EvaluationLog,
  EvaluationLogBuilder,
  TokenUsage,
  CostBreakdown,
  ToolCallRecord,
} from './types.js';

describe('EvaluationLogger', () => {
  let logger: EvaluationLogger;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `eval-test-${randomUUID()}`);
  });

  afterEach(async () => {
    try {
      await logger.close();
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Cleanup may fail if not initialized
    }
  });

  describe('Memory Storage', () => {
    beforeEach(() => {
      logger = createEvaluationLogger({
        storage: { type: 'memory' },
      });
    });

    it('should store and retrieve logs', async () => {
      const builder = logger.startLog('session-1', 'agent-1', 'architect');
      builder
        .setPrompt('You are helpful', 'Help me understand X')
        .setResponse('Here is an explanation')
        .setOutcome('success')
        .setModel('claude-opus-4-20250514')
        .setMetrics(
          { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          1000,
          { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'opus' }
        );

      const log = await logger.completeLog(builder);

      expect(log).toBeDefined();
      expect(log.sessionId).toBe('session-1');
      expect(log.outcome).toBe('success');

      const retrieved = await logger.get(log.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.outcome).toBe('success');
    });

    it('should query logs with filters', async () => {
      // Create multiple logs
      for (let i = 0; i < 5; i++) {
        const builder = logger.startLog('session-1', `agent-${i}`, 'implementer');
        builder
          .setPrompt('System', `User prompt ${i}`)
          .setResponse('Response')
          .setOutcome(i % 2 === 0 ? 'success' : 'failure')
          .setModel('claude-sonnet-4-20250514')
          .setMetrics(
            { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            1000,
            { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'sonnet' }
          );
        await logger.completeLog(builder);
      }

      const successLogs = await logger.query({ outcome: 'success' });
      expect(successLogs.length).toBe(3);

      const agent2Logs = await logger.query({ agentId: 'agent-2' });
      expect(agent2Logs.length).toBe(1);
    });

    it('should count logs', async () => {
      for (let i = 0; i < 3; i++) {
        const builder = logger.startLog('session-1', 'agent-1', 'architect');
        builder
          .setPrompt('System', 'User prompt')
          .setResponse('Response')
          .setOutcome('success')
          .setModel('claude-opus-4-20250514')
          .setMetrics(
            { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            1000,
            { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'opus' }
          );
        await logger.completeLog(builder);
      }

      const count = await logger.count({});
      expect(count).toBe(3);
    });

    it('should delete logs', async () => {
      const builder = logger.startLog('session-1', 'agent-1', 'architect');
      builder
        .setPrompt('System', 'User prompt')
        .setResponse('Response')
        .setOutcome('success')
        .setModel('claude-opus-4-20250514')
        .setMetrics(
          { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          1000,
          { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'opus' }
        );

      const log = await logger.completeLog(builder);

      let retrieved = await logger.get(log.id);
      expect(retrieved).toBeDefined();

      await logger.delete(log.id);
      retrieved = await logger.get(log.id);
      expect(retrieved).toBeNull();
    });

    it('should add user feedback', async () => {
      const builder = logger.startLog('session-1', 'agent-1', 'architect');
      builder
        .setPrompt('System', 'User prompt')
        .setResponse('Response')
        .setOutcome('unknown')
        .setModel('claude-opus-4-20250514')
        .setMetrics(
          { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          1000,
          { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'opus' }
        );

      const log = await logger.completeLog(builder);

      const result = await logger.addFeedback(log.id, {
        rating: 4,
        comment: 'Good response',
        taskCompleted: true,
        timestamp: new Date().toISOString(),
      });

      expect(result).toBe(true);

      const updated = await logger.get(log.id);
      expect(updated?.userFeedback?.rating).toBe(4);
      expect(updated?.outcome).toBe('success');
    });
  });

  describe('File Storage', () => {
    beforeEach(() => {
      logger = createEvaluationLogger({
        storage: { type: 'file', fileDir: tmpDir },
      });
    });

    it('should persist logs to disk', async () => {
      const builder = logger.startLog('session-1', 'agent-1', 'architect');
      builder
        .setPrompt('System', 'User prompt')
        .setResponse('Response')
        .setOutcome('success')
        .setModel('claude-opus-4-20250514')
        .setMetrics(
          { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          1000,
          { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'opus' }
        );

      const log = await logger.completeLog(builder);

      // Create new logger instance to simulate reloading
      const logger2 = createEvaluationLogger({
        storage: { type: 'file', fileDir: tmpDir },
      });

      const retrieved = await logger2.get(log.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.outcome).toBe('success');

      await logger2.close();
    });
  });

  describe('SQLite Storage', () => {
    beforeEach(() => {
      logger = createEvaluationLogger({
        storage: { type: 'sqlite', sqlitePath: join(tmpDir, 'eval.db') },
      });
    });

    it('should store and retrieve logs using SQLite', async () => {
      const builder = logger.startLog('session-1', 'agent-1', 'architect');
      builder
        .setPrompt('System', 'User prompt')
        .setResponse('Response')
        .setOutcome('success')
        .setModel('claude-opus-4-20250514')
        .setMetrics(
          { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          1000,
          { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'opus' }
        );

      const log = await logger.completeLog(builder);

      // Create new logger to verify persistence
      const logger2 = createEvaluationLogger({
        storage: { type: 'sqlite', sqlitePath: join(tmpDir, 'eval.db') },
      });

      const retrieved = await logger2.get(log.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.outcome).toBe('success');
      expect(retrieved?.latencyMs).toBe(1000);

      await logger2.close();
    });

    it('should query with SQLite', async () => {
      for (let i = 0; i < 5; i++) {
        const builder = logger.startLog('session-1', `agent-${i}`, 'implementer');
        builder
          .setPrompt('System', `Prompt ${i}`)
          .setResponse('Response')
          .setOutcome(i % 2 === 0 ? 'success' : 'failure')
          .setModel('claude-sonnet-4-20250514')
          .setMetrics(
            { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            1000,
            { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'sonnet' }
          );
        await logger.completeLog(builder);
      }

      const successLogs = await logger.query({ outcome: 'success' });
      expect(successLogs.length).toBeGreaterThan(0);
    });
  });

  describe('EvaluationLogBuilder', () => {
    beforeEach(() => {
      logger = createEvaluationLogger({
        storage: { type: 'memory' },
      });
    });

    it('should build logs with all fields', async () => {
      const builder = logger.startLog('session-1', 'agent-1', 'architect');

      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'ReadFile',
        input: { path: '/example.ts' },
        output: 'file contents',
        success: true,
        durationMs: 50,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      builder
        .setTask('task-1')
        .setPrompt('You are helpful', 'Help with X')
        .addContext('/path/to/file')
        .setResponse('Here is the answer', 'Let me think...')
        .addToolCall(toolCall)
        .setOutcome('success')
        .setModel('claude-opus-4-20250514')
        .setPromptVersion('v1', 'variant-a')
        .addMetadata('custom', 'value')
        .setMetrics(
          { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          1000,
          { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'opus' }
        );

      const log = await logger.completeLog(builder);

      expect(log.taskId).toBe('task-1');
      expect(log.contextIncluded).toContain('/path/to/file');
      expect(log.toolCalls).toHaveLength(1);
      expect(log.thinkingContent).toBe('Let me think...');
      expect(log.promptVersion).toBe('v1');
      expect(log.experimentVariant).toBe('variant-a');
      expect(log.metadata?.custom).toBe('value');
    });

    it('should require session info', () => {
      const builder: Partial<EvaluationLogBuilder> & {
        build: () => EvaluationLog;
      } = {
        build: () => {
          throw new Error('Session info required');
        },
      };

      expect(() => {
        builder.build();
      }).toThrow('Session info required');
    });
  });
});

describe('EvaluationAnalyzer', () => {
  let logger: EvaluationLogger;

  beforeEach(() => {
    logger = createEvaluationLogger({
      storage: { type: 'memory' },
    });
  });

  afterEach(async () => {
    await logger.close();
  });

  it('should calculate metrics', async () => {
    // Create 10 logs with varying outcomes
    for (let i = 0; i < 10; i++) {
      const builder = logger.startLog('session-1', 'agent-1', 'architect');
      builder
        .setPrompt('System', 'Prompt')
        .setResponse('Response')
        .setOutcome(i < 8 ? 'success' : 'failure')
        .setModel('claude-sonnet-4-20250514')
        .setMetrics(
          { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          1000 + i * 100,
          { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'sonnet' }
        );
      await logger.completeLog(builder);
    }

    const analyzer = createEvaluationAnalyzer(logger);
    const metrics = await analyzer.calculateMetrics();

    expect(metrics.totalLogs).toBe(10);
    expect(metrics.outcomeDistribution.success).toBe(8);
    expect(metrics.outcomeDistribution.failure).toBe(2);
    expect(metrics.avgCost).toBeGreaterThan(0);
    expect(metrics.avgLatencyMs).toBeGreaterThan(0);
    expect(metrics.errorRate).toBeCloseTo(0.2, 1);
  });

  it('should export training data', async () => {
    for (let i = 0; i < 3; i++) {
      const builder = logger.startLog('session-1', 'agent-1', 'architect');
      builder
        .setPrompt('System prompt', `User prompt ${i}`)
        .setResponse(`Response ${i}`)
        .setOutcome('success')
        .setModel('claude-opus-4-20250514')
        .setMetrics(
          { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          1000,
          { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'opus' }
        );
      await logger.completeLog(builder);
    }

    const analyzer = createEvaluationAnalyzer(logger);
    const training = await analyzer.exportForTraining();

    expect(training.examples.length).toBe(3);
    expect(training.examples[0].assistant).toContain('Response');
  });

  it('should export to JSONL', async () => {
    const builder = logger.startLog('session-1', 'agent-1', 'architect');
    builder
      .setPrompt('System', 'User prompt')
      .setResponse('Response')
      .setOutcome('success')
      .setModel('claude-opus-4-20250514')
      .setMetrics(
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        1000,
        { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'opus' }
      );
    await logger.completeLog(builder);

    const analyzer = createEvaluationAnalyzer(logger);
    const jsonl = await analyzer.exportToJSONL();

    expect(jsonl).toContain('messages');
    const lines = jsonl.split('\n');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('should get top errors', async () => {
    for (let i = 0; i < 5; i++) {
      const builder = logger.startLog('session-1', 'agent-1', 'architect');
      builder
        .setPrompt('System', 'Prompt')
        .setResponse('Response')
        .setOutcome('failure')
        .setModel('claude-opus-4-20250514')
        .setMetrics(
          { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          1000,
          { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'opus' }
        );

      if (i < 3) {
        builder.setOutcome('failure', 'Timeout error');
      } else {
        builder.setOutcome('failure', 'API error');
      }
      await logger.completeLog(builder);
    }

    const analyzer = createEvaluationAnalyzer(logger);
    const errors = await analyzer.getTopErrors(5);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].count).toBeGreaterThan(0);
  });

  it('should get tool stats', async () => {
    const builder = logger.startLog('session-1', 'agent-1', 'architect');

    const toolCall: ToolCallRecord = {
      id: 'tool-1',
      name: 'ReadFile',
      input: { path: '/file' },
      output: 'content',
      success: true,
      durationMs: 100,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    builder
      .setPrompt('System', 'Prompt')
      .setResponse('Response')
      .addToolCall(toolCall)
      .setOutcome('success')
      .setModel('claude-opus-4-20250514')
      .setMetrics(
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        1000,
        { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'opus' }
      );

    await logger.completeLog(builder);

    const analyzer = createEvaluationAnalyzer(logger);
    const stats = await analyzer.getToolStats();

    expect(stats.length).toBeGreaterThan(0);
    const readFileStat = stats.find((s) => s.tool === 'ReadFile');
    expect(readFileStat).toBeDefined();
    expect(readFileStat?.totalCalls).toBe(1);
  });

  it('should get summary', async () => {
    for (let i = 0; i < 3; i++) {
      const builder = logger.startLog(`session-${i}`, `agent-${i}`, 'architect');
      builder
        .setPrompt('System', 'Prompt')
        .setResponse('Response')
        .setOutcome(i === 0 ? 'success' : 'failure')
        .setModel('claude-opus-4-20250514')
        .setMetrics(
          { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          1000,
          { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, pricingTier: 'opus' }
        );
      await logger.completeLog(builder);
    }

    const analyzer = createEvaluationAnalyzer(logger);
    const summary = await analyzer.getSummary();

    expect(summary.totalInteractions).toBe(3);
    expect(summary.uniqueAgents).toBe(3);
    expect(summary.uniqueSessions).toBe(3);
    expect(summary.successRate).toBeCloseTo(1 / 3, 1);
  });
});

describe('Cost Calculation', () => {
  it('should calculate cost for different models', () => {
    const tokens: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
    };

    const opusCost = calculateCost(tokens, 'claude-opus-4-20250514');
    const sonnetCost = calculateCost(tokens, 'claude-sonnet-4-20250514');
    const haikuCost = calculateCost(tokens, 'claude-3-5-haiku-20241022');

    expect(opusCost.pricingTier).toBe('opus');
    expect(sonnetCost.pricingTier).toBe('sonnet');
    expect(haikuCost.pricingTier).toBe('haiku');

    // Opus should be more expensive than sonnet
    expect(opusCost.totalCost).toBeGreaterThan(sonnetCost.totalCost);

    // Sonnet should be more expensive than haiku
    expect(sonnetCost.totalCost).toBeGreaterThan(haikuCost.totalCost);
  });

  it('should use default pricing if model not found', () => {
    const tokens: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
    };

    const cost = calculateCost(tokens, 'unknown-model');
    expect(cost.pricingTier).toBe('sonnet'); // Default
    expect(cost.totalCost).toBeGreaterThan(0);
  });
});
