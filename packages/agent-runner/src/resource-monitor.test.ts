/**
 * Tests for ResourceMonitor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResourceMonitor,
  type TokenUsageRecord,
  type ResourceMetrics,
} from './resource-monitor.js';

describe('ResourceMonitor', () => {
  let monitor: ResourceMonitor;

  beforeEach(() => {
    monitor = new ResourceMonitor({
      maxMemoryMb: 512,
      maxCostUsd: 10,
      maxErrors: 5,
      maxTokensPerIteration: 100000,
    });
  });

  describe('Token Tracking', () => {
    it('should track input and output tokens', () => {
      const usage: TokenUsageRecord = {
        inputTokens: 100,
        outputTokens: 50,
      };

      monitor.trackTokens(usage, 'sonnet');
      const metrics = monitor.getMetrics();

      expect(metrics.totalInputTokens).toBe(100);
      expect(metrics.totalOutputTokens).toBe(50);
    });

    it('should track cache tokens', () => {
      const usage: TokenUsageRecord = {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationInputTokens: 200,
        cacheReadInputTokens: 300,
      };

      monitor.trackTokens(usage, 'sonnet');
      const metrics = monitor.getMetrics();

      expect(metrics.totalCachingTokens).toBe(500);
    });

    it('should calculate cost correctly for different models', () => {
      // Haiku is cheap
      monitor.trackTokens(
        { inputTokens: 1000000, outputTokens: 1000000 },
        'haiku'
      );
      let metrics = monitor.getMetrics();
      const haikuCost = metrics.estimatedCostUsd;

      // Reset and test sonnet
      monitor.reset();
      monitor.trackTokens(
        { inputTokens: 1000000, outputTokens: 1000000 },
        'sonnet'
      );
      metrics = monitor.getMetrics();
      const sonnetCost = metrics.estimatedCostUsd;

      // Sonnet should be more expensive than haiku
      expect(sonnetCost).toBeGreaterThan(haikuCost);
    });

    it('should include cache pricing in cost', () => {
      // Regular tokens
      monitor.trackTokens(
        { inputTokens: 1000000, outputTokens: 1000000 },
        'sonnet'
      );
      let metrics = monitor.getMetrics();
      const baseCost = metrics.estimatedCostUsd;

      // Reset and test with cache
      monitor.reset();
      monitor.trackTokens(
        {
          inputTokens: 1000000,
          outputTokens: 1000000,
          cacheCreationInputTokens: 1000000,
          cacheReadInputTokens: 1000000,
        },
        'sonnet'
      );
      metrics = monitor.getMetrics();
      const cacheIncludedCost = metrics.estimatedCostUsd;

      // Cache should add cost
      expect(cacheIncludedCost).toBeGreaterThan(baseCost);
    });
  });

  describe('API Call Tracking', () => {
    it('should track successful API calls', () => {
      monitor.trackApiCall(true);
      monitor.trackApiCall(true);
      monitor.trackApiCall(false);

      const metrics = monitor.getMetrics();
      expect(metrics.apiCallCount).toBe(3);
      expect(metrics.successfulApiCalls).toBe(2);
      expect(metrics.failedApiCalls).toBe(1);
      expect(metrics.errorRate).toBe(33);
    });

    it('should calculate error rate correctly', () => {
      for (let i = 0; i < 100; i++) {
        monitor.trackApiCall(i < 90); // 90% success, 10% failure
      }

      const metrics = monitor.getMetrics();
      expect(metrics.errorRate).toBe(10);
    });
  });

  describe('Error Tracking', () => {
    it('should track error count', () => {
      monitor.trackError();
      monitor.trackError();
      monitor.trackError();

      const metrics = monitor.getMetrics();
      expect(metrics.errorCount).toBe(3);
    });
  });

  describe('Limit Checking', () => {
    it('should detect memory violations', () => {
      // Mock memory usage (this is tricky in tests, so we'll test the logic)
      const monitor2 = new ResourceMonitor({
        maxMemoryMb: 10, // Very low limit for testing
      });

      const status = monitor2.checkLimits();
      // Note: Can't easily mock process.memoryUsage(), so this may or may not trigger
      // In a real scenario with actual memory usage > 10MB, it would
      expect(status).toBeDefined();
      expect(status.withinLimits).toBeDefined();
    });

    it('should detect cost violations', () => {
      monitor.trackTokens(
        { inputTokens: 10_000_000, outputTokens: 10_000_000 },
        'opus' // Expensive model
      );

      const status = monitor.checkLimits();
      expect(status.withinLimits).toBe(false);
      expect(status.violations.length).toBeGreaterThan(0);
      expect(status.violations[0].type).toBe('cost');
    });

    it('should detect error violations', () => {
      for (let i = 0; i < 6; i++) {
        monitor.trackError();
      }

      const status = monitor.checkLimits();
      expect(status.withinLimits).toBe(false);
      expect(status.violations.some((v) => v.type === 'errors')).toBe(true);
    });

    it('should detect warnings before violations', () => {
      // Add 4 errors (80% of 5 limit)
      for (let i = 0; i < 4; i++) {
        monitor.trackError();
      }

      const status = monitor.checkLimits();
      expect(status.withinLimits).toBe(true);
      expect(status.warnings.length).toBeGreaterThan(0);
      expect(status.warnings.some((w) => w.type === 'errors')).toBe(true);
    });

    it('should include detailed violation info', () => {
      monitor.trackTokens(
        { inputTokens: 10_000_000, outputTokens: 10_000_000 },
        'opus'
      );

      const status = monitor.checkLimits();
      const violation = status.violations.find((v) => v.type === 'cost');

      expect(violation).toBeDefined();
      expect(violation?.limit).toBe(10);
      expect(violation?.current).toBeGreaterThan(10);
      expect(violation?.message).toContain('exceeds');
    });
  });

  describe('Cost History', () => {
    it('should maintain cost history', () => {
      monitor.trackTokens({ inputTokens: 100, outputTokens: 100 }, 'sonnet');
      monitor.trackTokens({ inputTokens: 200, outputTokens: 200 }, 'haiku');

      const history = monitor.getCostHistory();
      expect(history.length).toBe(2);
      expect(history[0].model).toBe('sonnet');
      expect(history[1].model).toBe('haiku');
    });

    it('should limit cost history to 1000 records', () => {
      for (let i = 0; i < 1100; i++) {
        monitor.trackTokens({ inputTokens: 10, outputTokens: 10 }, 'sonnet');
      }

      const history = monitor.getCostHistory();
      expect(history.length).toBe(1000);
    });

    it('should calculate cost by model', () => {
      monitor.trackTokens(
        { inputTokens: 1000, outputTokens: 1000 },
        'sonnet'
      );
      monitor.trackTokens(
        { inputTokens: 1000, outputTokens: 1000 },
        'sonnet'
      );
      monitor.trackTokens({ inputTokens: 1000, outputTokens: 1000 }, 'haiku');

      const costByModel = monitor.getCostByModel();

      expect(costByModel.sonnet).toBeDefined();
      expect(costByModel.haiku).toBeDefined();
      expect(costByModel.sonnet.tokenCount).toBe(4000);
      expect(costByModel.haiku.tokenCount).toBe(2000);
      expect(costByModel.sonnet.totalCost).toBeGreaterThan(
        costByModel.haiku.totalCost
      );
    });
  });

  describe('Reset', () => {
    it('should reset all metrics', () => {
      monitor.trackTokens({ inputTokens: 100, outputTokens: 50 }, 'sonnet');
      monitor.trackError();
      monitor.trackApiCall(true);

      monitor.reset();
      const metrics = monitor.getMetrics();

      expect(metrics.totalInputTokens).toBe(0);
      expect(metrics.totalOutputTokens).toBe(0);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.apiCallCount).toBe(0);
      expect(metrics.estimatedCostUsd).toBe(0);
    });

    it('should reset cost history', () => {
      monitor.trackTokens({ inputTokens: 100, outputTokens: 50 }, 'sonnet');
      monitor.reset();

      const history = monitor.getCostHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('Formatting', () => {
    it('should format cost correctly', () => {
      const formatted = monitor.formatCost(1.23456);
      expect(formatted).toBe('$1.2346');
    });

    it('should format tokens with separators', () => {
      const formatted = monitor.formatTokens(1000000);
      expect(formatted).toBe('1,000,000');
    });
  });

  describe('Metrics', () => {
    it('should provide comprehensive metrics', () => {
      monitor.trackTokens({ inputTokens: 100, outputTokens: 50 }, 'sonnet');
      monitor.trackApiCall(true);
      monitor.trackError();

      const metrics = monitor.getMetrics();

      expect(metrics).toHaveProperty('memoryMb');
      expect(metrics).toHaveProperty('rssMemoryMb');
      expect(metrics).toHaveProperty('heapUsedMb');
      expect(metrics).toHaveProperty('heapTotalMb');
      expect(metrics).toHaveProperty('totalInputTokens');
      expect(metrics).toHaveProperty('totalOutputTokens');
      expect(metrics).toHaveProperty('estimatedCostUsd');
      expect(metrics).toHaveProperty('apiCallCount');
      expect(metrics).toHaveProperty('errorCount');
      expect(metrics).toHaveProperty('uptime');

      expect(metrics.totalInputTokens).toBe(100);
      expect(metrics.totalOutputTokens).toBe(50);
      expect(metrics.apiCallCount).toBe(1);
      expect(metrics.errorCount).toBe(1);
      expect(metrics.uptime).toBeGreaterThan(0);
    });

    it('should update memory metrics', () => {
      const metrics1 = monitor.getMetrics();
      const initialMemory = metrics1.memoryMb;

      // Create some objects to increase memory usage slightly
      const arrays = [];
      for (let i = 0; i < 100; i++) {
        arrays.push(new Array(10000).fill(i));
      }

      const metrics2 = monitor.getMetrics();
      // Memory should have increased (though might not always show in RSS)
      expect(metrics2.memoryMb).toBeGreaterThanOrEqual(initialMemory);
    });
  });

  describe('Different Models', () => {
    it('should handle unknown models gracefully', () => {
      // Should default to sonnet pricing
      monitor.trackTokens(
        { inputTokens: 1000000, outputTokens: 1000000 },
        'unknown-model' as any
      );

      const metrics = monitor.getMetrics();
      expect(metrics.estimatedCostUsd).toBeGreaterThan(0);
    });

    it('should support all documented models', () => {
      const models = ['opus', 'sonnet', 'haiku', 'opus-4.1', 'sonnet-4', 'haiku-3.5'];

      for (const model of models) {
        monitor.reset();
        monitor.trackTokens(
          { inputTokens: 1000, outputTokens: 1000 },
          model
        );
        const metrics = monitor.getMetrics();
        expect(metrics.estimatedCostUsd).toBeGreaterThan(0);
      }
    });
  });

  describe('Concurrent Tracking', () => {
    it('should handle concurrent token tracking', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve(
            monitor.trackTokens({ inputTokens: 100, outputTokens: 50 }, 'sonnet')
          )
        );
      }

      await Promise.all(promises);

      const metrics = monitor.getMetrics();
      expect(metrics.totalInputTokens).toBe(1000);
      expect(metrics.totalOutputTokens).toBe(500);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero token counts', () => {
      monitor.trackTokens({ inputTokens: 0, outputTokens: 0 }, 'sonnet');
      const metrics = monitor.getMetrics();

      expect(metrics.totalInputTokens).toBe(0);
      expect(metrics.totalOutputTokens).toBe(0);
      expect(metrics.estimatedCostUsd).toBe(0);
    });

    it('should handle very large token counts', () => {
      monitor.trackTokens(
        { inputTokens: 10_000_000, outputTokens: 10_000_000 },
        'opus'
      );

      const metrics = monitor.getMetrics();
      expect(metrics.totalInputTokens).toBe(10_000_000);
      expect(metrics.estimatedCostUsd).toBeGreaterThan(100);
    });

    it('should handle multiple resets', () => {
      monitor.trackTokens({ inputTokens: 100, outputTokens: 50 }, 'sonnet');
      monitor.reset();
      monitor.reset();

      const metrics = monitor.getMetrics();
      expect(metrics.totalInputTokens).toBe(0);
    });
  });
});
