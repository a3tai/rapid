/**
 * Resource Monitor
 *
 * Tracks resource usage (memory, tokens, cost) for agent execution
 * and enforces limits with alert capabilities.
 */

import type { ResourceLimits } from './types.js';

/**
 * Token usage for a single operation
 */
export interface TokenUsageRecord {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

/**
 * Cost breakdown for operations
 */
export interface CostBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  inputCost: number;
  outputCost: number;
  cacheCost?: number;
  totalCost: number;
}

/**
 * Resource metrics snapshot
 */
export interface ResourceMetrics {
  memoryMb: number;
  rssMemoryMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachingTokens: number;
  estimatedCostUsd: number;
  apiCallCount: number;
  errorCount: number;
  successfulApiCalls: number;
  failedApiCalls: number;
  errorRate: number;
  uptime: number;
}

/**
 * Limit status result
 */
export interface LimitStatus {
  withinLimits: boolean;
  violations: LimitViolation[];
  warnings: LimitWarning[];
}

/**
 * Single limit violation
 */
export interface LimitViolation {
  type: 'memory' | 'tokens' | 'cost' | 'errors';
  limit: number;
  current: number;
  message: string;
}

/**
 * Single limit warning (approaching limit)
 */
export interface LimitWarning {
  type: 'memory' | 'tokens' | 'cost' | 'errors';
  limit: number;
  current: number;
  percentageUsed: number;
  message: string;
}

/**
 * Model pricing per 1M tokens
 */
const MODEL_PRICING = {
  'opus-4.1': { input: 15, output: 75, cache_creation: 18.75, cache_read: 1.875 },
  opus: { input: 15, output: 75, cache_creation: 18.75, cache_read: 1.875 },
  'sonnet-4': { input: 3, output: 15, cache_creation: 3.75, cache_read: 0.375 },
  sonnet: { input: 3, output: 15, cache_creation: 3.75, cache_read: 0.375 },
  'haiku-3.5': { input: 0.25, output: 1.25, cache_creation: 0.3125, cache_read: 0.03125 },
  haiku: { input: 0.25, output: 1.25, cache_creation: 0.3125, cache_read: 0.03125 },
} as const;

export class ResourceMonitor {
  private limits: ResourceLimits;
  private startTime: number;
  private startMemory: NodeJS.MemoryUsage;

  // Tracking
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCacheCreationTokens = 0;
  private totalCacheReadTokens = 0;
  private estimatedCostUsd = 0;
  private apiCallCount = 0;
  private successfulApiCalls = 0;
  private failedApiCalls = 0;
  private errorCount = 0;
  private costHistory: CostBreakdown[] = [];

  constructor(limits: ResourceLimits = {}) {
    this.limits = {
      maxMemoryMb: limits.maxMemoryMb ?? 512,
      maxTokensPerIteration: limits.maxTokensPerIteration ?? 100000,
      maxCostUsd: limits.maxCostUsd ?? 10,
      maxErrors: limits.maxErrors ?? 10,
    };

    this.startTime = Date.now();
    this.startMemory = process.memoryUsage();
  }

  /**
   * Track token usage from an API call
   */
  trackTokens(usage: TokenUsageRecord, model: string = 'sonnet'): void {
    this.totalInputTokens += usage.inputTokens;
    this.totalOutputTokens += usage.outputTokens;
    this.totalCacheCreationTokens += usage.cacheCreationInputTokens ?? 0;
    this.totalCacheReadTokens += usage.cacheReadInputTokens ?? 0;

    this.updateCostEstimate(usage, model);
  }

  /**
   * Track API call completion
   */
  trackApiCall(success: boolean): void {
    this.apiCallCount++;
    if (success) {
      this.successfulApiCalls++;
    } else {
      this.failedApiCalls++;
    }
  }

  /**
   * Track error occurrence
   */
  trackError(): void {
    this.errorCount++;
  }

  /**
   * Calculate cost for tokens and update tracking
   */
  private updateCostEstimate(usage: TokenUsageRecord, model: string): void {
    const pricing =
      MODEL_PRICING[model as keyof typeof MODEL_PRICING] ||
      MODEL_PRICING.sonnet;

    const inputCost = (usage.inputTokens * pricing.input) / 1_000_000;
    const outputCost = (usage.outputTokens * pricing.output) / 1_000_000;
    let cacheCost = 0;

    if (usage.cacheCreationInputTokens) {
      cacheCost +=
        (usage.cacheCreationInputTokens * pricing.cache_creation) / 1_000_000;
    }
    if (usage.cacheReadInputTokens) {
      cacheCost +=
        (usage.cacheReadInputTokens * pricing.cache_read) / 1_000_000;
    }

    const totalCost = inputCost + outputCost + cacheCost;
    this.estimatedCostUsd += totalCost;

    this.costHistory.push({
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      inputCost,
      outputCost,
      cacheCost: cacheCost > 0 ? cacheCost : undefined,
      totalCost,
    });

    // Keep only last 1000 cost records
    if (this.costHistory.length > 1000) {
      this.costHistory.shift();
    }
  }

  /**
   * Get current resource metrics
   */
  getMetrics(): ResourceMetrics {
    const memory = process.memoryUsage();
    const uptime = Date.now() - this.startTime;

    return {
      memoryMb: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      rssMemoryMb: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCachingTokens: this.totalCacheCreationTokens + this.totalCacheReadTokens,
      estimatedCostUsd: Math.round(this.estimatedCostUsd * 10000) / 10000,
      apiCallCount: this.apiCallCount,
      errorCount: this.errorCount,
      successfulApiCalls: this.successfulApiCalls,
      failedApiCalls: this.failedApiCalls,
      errorRate:
        this.apiCallCount > 0
          ? Math.round((this.failedApiCalls / this.apiCallCount) * 100)
          : 0,
      uptime,
    };
  }

  /**
   * Check if resource usage violates configured limits
   */
  checkLimits(): LimitStatus {
    const metrics = this.getMetrics();
    const violations: LimitViolation[] = [];
    const warnings: LimitWarning[] = [];

    // Check memory limit
    if (
      this.limits.maxMemoryMb &&
      metrics.memoryMb > this.limits.maxMemoryMb
    ) {
      violations.push({
        type: 'memory',
        limit: this.limits.maxMemoryMb,
        current: metrics.memoryMb,
        message: `Memory usage (${metrics.memoryMb}MB) exceeds limit (${this.limits.maxMemoryMb}MB)`,
      });
    } else if (
      this.limits.maxMemoryMb &&
      metrics.memoryMb > this.limits.maxMemoryMb * 0.9
    ) {
      warnings.push({
        type: 'memory',
        limit: this.limits.maxMemoryMb,
        current: metrics.memoryMb,
        percentageUsed: Math.round(
          (metrics.memoryMb / this.limits.maxMemoryMb) * 100
        ),
        message: `Memory usage (${metrics.memoryMb}MB) approaching limit (${this.limits.maxMemoryMb}MB)`,
      });
    }

    // Check cost limit
    if (this.limits.maxCostUsd && metrics.estimatedCostUsd > this.limits.maxCostUsd) {
      violations.push({
        type: 'cost',
        limit: this.limits.maxCostUsd,
        current: metrics.estimatedCostUsd,
        message: `Cost ($${metrics.estimatedCostUsd}) exceeds limit ($${this.limits.maxCostUsd})`,
      });
    } else if (
      this.limits.maxCostUsd &&
      metrics.estimatedCostUsd > this.limits.maxCostUsd * 0.9
    ) {
      warnings.push({
        type: 'cost',
        limit: this.limits.maxCostUsd,
        current: metrics.estimatedCostUsd,
        percentageUsed: Math.round(
          (metrics.estimatedCostUsd / this.limits.maxCostUsd) * 100
        ),
        message: `Cost ($${metrics.estimatedCostUsd}) approaching limit ($${this.limits.maxCostUsd})`,
      });
    }

    // Check error limit
    if (this.limits.maxErrors && metrics.errorCount > this.limits.maxErrors) {
      violations.push({
        type: 'errors',
        limit: this.limits.maxErrors,
        current: metrics.errorCount,
        message: `Error count (${metrics.errorCount}) exceeds limit (${this.limits.maxErrors})`,
      });
    } else if (
      this.limits.maxErrors &&
      metrics.errorCount > this.limits.maxErrors * 0.7
    ) {
      warnings.push({
        type: 'errors',
        limit: this.limits.maxErrors,
        current: metrics.errorCount,
        percentageUsed: Math.round(
          (metrics.errorCount / this.limits.maxErrors) * 100
        ),
        message: `Error count (${metrics.errorCount}) approaching limit (${this.limits.maxErrors})`,
      });
    }

    return {
      withinLimits: violations.length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Get cost history for analysis
   */
  getCostHistory(): CostBreakdown[] {
    return [...this.costHistory];
  }

  /**
   * Get cost summary by model
   */
  getCostByModel(): Record<string, { tokenCount: number; totalCost: number }> {
    const summary: Record<
      string,
      { tokenCount: number; totalCost: number }
    > = {};

    for (const record of this.costHistory) {
      if (!summary[record.model]) {
        summary[record.model] = { tokenCount: 0, totalCost: 0 };
      }
      summary[record.model].tokenCount +=
        record.inputTokens + record.outputTokens;
      summary[record.model].totalCost += record.totalCost;
    }

    return summary;
  }

  /**
   * Reset all tracking (useful for iterative processes)
   */
  reset(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalCacheCreationTokens = 0;
    this.totalCacheReadTokens = 0;
    this.estimatedCostUsd = 0;
    this.apiCallCount = 0;
    this.successfulApiCalls = 0;
    this.failedApiCalls = 0;
    this.errorCount = 0;
    this.costHistory = [];
  }

  /**
   * Get formatted cost string
   */
  formatCost(cost: number): string {
    return `$${cost.toFixed(4)}`;
  }

  /**
   * Get formatted token count with separators
   */
  formatTokens(tokens: number): string {
    return tokens.toLocaleString();
  }
}
