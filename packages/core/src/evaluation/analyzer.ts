/**
 * Evaluation Analyzer
 *
 * Provides querying, analysis, and export capabilities for evaluation logs.
 * Supports aggregation, A/B testing comparison, and training data generation.
 */

import type {
  EvaluationLog,
  EvaluationMetrics,
  EvaluationQueryOptions,
  ABTestComparison,
  TrainingExport,
  TrainingExample,
  EvaluationOutcome,
} from './types.js';
import type { EvaluationLogger } from './logger.js';

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))] ?? 0;
}

/**
 * Evaluation Analyzer class
 */
export class EvaluationAnalyzer {
  private logger: EvaluationLogger;

  constructor(logger: EvaluationLogger) {
    this.logger = logger;
  }

  /**
   * Calculate aggregated metrics for a set of logs
   */
  async calculateMetrics(options?: EvaluationQueryOptions): Promise<EvaluationMetrics> {
    const logs = await this.logger.query({
      ...options,
      limit: options?.limit ?? 10000,
    });

    if (logs.length === 0) {
      return this.emptyMetrics();
    }

    // Outcome distribution
    const outcomeDistribution: Record<EvaluationOutcome, number> = {
      success: 0,
      failure: 0,
      partial: 0,
      unknown: 0,
    };

    // Latency values for percentile calculation
    const latencies: number[] = [];

    // Token totals
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    // Error count
    let errorCount = 0;

    // User ratings
    const ratings: number[] = [];

    // Tool usage
    const toolUsage: Record<string, number> = {};

    // Process each log
    for (const log of logs) {
      // Outcome
      outcomeDistribution[log.outcome]++;

      // Latency
      latencies.push(log.latencyMs);

      // Tokens
      totalInputTokens += log.tokens.inputTokens;
      totalOutputTokens += log.tokens.outputTokens;

      // Cost
      totalCost += log.cost.totalCost;

      // Errors
      if (log.outcome === 'failure' || log.errorMessage) {
        errorCount++;
      }

      // User rating
      if (log.userFeedback?.rating !== undefined) {
        ratings.push(log.userFeedback.rating);
      }

      // Tool usage
      for (const toolCall of log.toolCalls) {
        toolUsage[toolCall.name] = (toolUsage[toolCall.name] ?? 0) + 1;
      }
    }

    // Sort latencies for percentile calculation
    latencies.sort((a, b) => a - b);

    // Calculate averages
    const avgLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const avgInputTokens = totalInputTokens / logs.length;
    const avgOutputTokens = totalOutputTokens / logs.length;
    const avgCost = totalCost / logs.length;
    const errorRate = errorCount / logs.length;

    // Time period
    const sortedByTime = [...logs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const periodStart = sortedByTime[0]?.timestamp ?? new Date().toISOString();
    const periodEnd = sortedByTime[sortedByTime.length - 1]?.timestamp ?? new Date().toISOString();

    const result: EvaluationMetrics = {
      totalLogs: logs.length,
      outcomeDistribution,
      avgLatencyMs,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      p99LatencyMs: percentile(latencies, 99),
      avgInputTokens,
      avgOutputTokens,
      totalCost,
      avgCost,
      errorRate,
      toolUsageFrequency: toolUsage,
      periodStart,
      periodEnd,
    };

    // Only add avgUserRating if we have ratings
    if (ratings.length > 0) {
      result.avgUserRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    }

    return result;
  }

  /**
   * Empty metrics for when no logs match
   */
  private emptyMetrics(): EvaluationMetrics {
    return {
      totalLogs: 0,
      outcomeDistribution: { success: 0, failure: 0, partial: 0, unknown: 0 },
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      avgInputTokens: 0,
      avgOutputTokens: 0,
      totalCost: 0,
      avgCost: 0,
      errorRate: 0,
      toolUsageFrequency: {},
      periodStart: new Date().toISOString(),
      periodEnd: new Date().toISOString(),
    };
  }

  /**
   * Compare two prompt variants for A/B testing
   */
  async compareVariants(variantA: string, variantB: string): Promise<ABTestComparison> {
    const logsA = await this.logger.query({ experimentVariant: variantA, limit: 10000 });
    const logsB = await this.logger.query({ experimentVariant: variantB, limit: 10000 });

    const metricsA = await this.calculateMetrics({ experimentVariant: variantA });
    const metricsB = await this.calculateMetrics({ experimentVariant: variantB });

    // Calculate statistical significance (simplified chi-square for outcomes)
    const outcomePValue = this.calculateOutcomePValue(logsA, logsB);
    const latencyPValue = this.calculateTTestPValue(
      logsA.map((l) => l.latencyMs),
      logsB.map((l) => l.latencyMs)
    );
    const costPValue = this.calculateTTestPValue(
      logsA.map((l) => l.cost.totalCost),
      logsB.map((l) => l.cost.totalCost)
    );

    // Determine recommendation
    let recommendation: 'A' | 'B' | 'inconclusive' = 'inconclusive';
    const significanceThreshold = 0.05;

    if (outcomePValue !== undefined && outcomePValue < significanceThreshold) {
      // Significant difference in outcomes
      const successRateA = metricsA.outcomeDistribution.success / metricsA.totalLogs;
      const successRateB = metricsB.outcomeDistribution.success / metricsB.totalLogs;
      recommendation = successRateA > successRateB ? 'A' : 'B';
    } else if (latencyPValue !== undefined && latencyPValue < significanceThreshold) {
      // Significant difference in latency (prefer lower)
      recommendation = metricsA.avgLatencyMs < metricsB.avgLatencyMs ? 'A' : 'B';
    } else if (costPValue !== undefined && costPValue < significanceThreshold) {
      // Significant difference in cost (prefer lower)
      recommendation = metricsA.avgCost < metricsB.avgCost ? 'A' : 'B';
    }

    const result: ABTestComparison = {
      variantA,
      variantB,
      sampleSizeA: logsA.length,
      sampleSizeB: logsB.length,
      metricsA,
      metricsB,
    };

    // Only add p-values if they are defined
    if (outcomePValue !== undefined) {
      result.outcomePValue = outcomePValue;
    }
    if (latencyPValue !== undefined) {
      result.latencyPValue = latencyPValue;
    }
    if (costPValue !== undefined) {
      result.costPValue = costPValue;
    }
    if (recommendation !== 'inconclusive') {
      result.recommendation = recommendation;
    }

    return result;
  }

  /**
   * Calculate p-value for outcome comparison (simplified chi-square)
   */
  private calculateOutcomePValue(logsA: EvaluationLog[], logsB: EvaluationLog[]): number | undefined {
    if (logsA.length < 30 || logsB.length < 30) {
      return undefined; // Not enough samples
    }

    const successA = logsA.filter((l) => l.outcome === 'success').length;
    const failA = logsA.length - successA;
    const successB = logsB.filter((l) => l.outcome === 'success').length;
    const failB = logsB.length - successB;

    const total = logsA.length + logsB.length;
    const totalSuccess = successA + successB;
    const totalFail = failA + failB;

    // Expected values
    const eSuccessA = (logsA.length * totalSuccess) / total;
    const eFailA = (logsA.length * totalFail) / total;
    const eSuccessB = (logsB.length * totalSuccess) / total;
    const eFailB = (logsB.length * totalFail) / total;

    // Chi-square statistic
    const chiSquare =
      Math.pow(successA - eSuccessA, 2) / eSuccessA +
      Math.pow(failA - eFailA, 2) / eFailA +
      Math.pow(successB - eSuccessB, 2) / eSuccessB +
      Math.pow(failB - eFailB, 2) / eFailB;

    // Approximate p-value for 1 degree of freedom
    return this.chiSquarePValue(chiSquare, 1);
  }

  /**
   * Calculate p-value for t-test (two-tailed)
   */
  private calculateTTestPValue(samplesA: number[], samplesB: number[]): number | undefined {
    if (samplesA.length < 30 || samplesB.length < 30) {
      return undefined; // Not enough samples
    }

    const meanA = samplesA.reduce((a, b) => a + b, 0) / samplesA.length;
    const meanB = samplesB.reduce((a, b) => a + b, 0) / samplesB.length;

    const varA =
      samplesA.reduce((sum, x) => sum + Math.pow(x - meanA, 2), 0) / (samplesA.length - 1);
    const varB =
      samplesB.reduce((sum, x) => sum + Math.pow(x - meanB, 2), 0) / (samplesB.length - 1);

    const se = Math.sqrt(varA / samplesA.length + varB / samplesB.length);
    if (se === 0) return undefined;

    const t = Math.abs(meanA - meanB) / se;
    // df would be used for more precise t-distribution lookup
    // const df = samplesA.length + samplesB.length - 2;

    // Approximate p-value using normal distribution for large df
    return 2 * (1 - this.normalCDF(t));
  }

  /**
   * Approximate chi-square p-value
   */
  private chiSquarePValue(x: number, df: number): number {
    // Use approximation for df=1
    if (df === 1) {
      return 2 * (1 - this.normalCDF(Math.sqrt(x)));
    }
    // Fallback approximation
    return Math.exp(-x / 2);
  }

  /**
   * Normal CDF approximation
   */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Get top errors by frequency
   */
  async getTopErrors(limit = 10): Promise<Array<{ error: string; count: number; logs: string[] }>> {
    const logs = await this.logger.query({ outcome: 'failure', limit: 10000 });

    const errorMap = new Map<string, { count: number; logs: string[] }>();

    for (const log of logs) {
      const errorKey = log.errorMessage || log.errorType || 'Unknown error';
      const existing = errorMap.get(errorKey) || { count: 0, logs: [] };
      existing.count++;
      if (existing.logs.length < 5) {
        existing.logs.push(log.id);
      }
      errorMap.set(errorKey, existing);
    }

    return Array.from(errorMap.entries())
      .map(([error, data]) => ({ error, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get tool usage statistics
   */
  async getToolStats(): Promise<
    Array<{
      tool: string;
      totalCalls: number;
      successRate: number;
      avgDuration: number;
    }>
  > {
    const logs = await this.logger.query({ limit: 10000 });

    const toolStats = new Map<
      string,
      {
        total: number;
        success: number;
        durations: number[];
      }
    >();

    for (const log of logs) {
      for (const toolCall of log.toolCalls) {
        const existing = toolStats.get(toolCall.name) || { total: 0, success: 0, durations: [] };
        existing.total++;
        if (toolCall.success) existing.success++;
        existing.durations.push(toolCall.durationMs);
        toolStats.set(toolCall.name, existing);
      }
    }

    return Array.from(toolStats.entries())
      .map(([tool, stats]) => ({
        tool,
        totalCalls: stats.total,
        successRate: stats.success / stats.total,
        avgDuration: stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length,
      }))
      .sort((a, b) => b.totalCalls - a.totalCalls);
  }

  /**
   * Get cost breakdown by persona
   */
  async getCostByPersona(): Promise<
    Array<{
      persona: string;
      totalCost: number;
      avgCost: number;
      totalInteractions: number;
    }>
  > {
    const logs = await this.logger.query({ limit: 10000 });

    const personaStats = new Map<
      string,
      {
        cost: number;
        count: number;
      }
    >();

    for (const log of logs) {
      const existing = personaStats.get(log.persona) || { cost: 0, count: 0 };
      existing.cost += log.cost.totalCost;
      existing.count++;
      personaStats.set(log.persona, existing);
    }

    return Array.from(personaStats.entries())
      .map(([persona, stats]) => ({
        persona,
        totalCost: stats.cost,
        avgCost: stats.cost / stats.count,
        totalInteractions: stats.count,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);
  }

  /**
   * Generate time-series data for metrics over time
   */
  async getMetricsOverTime(
    granularity: 'hour' | 'day' | 'week' = 'day',
    options?: EvaluationQueryOptions
  ): Promise<
    Array<{
      period: string;
      metrics: EvaluationMetrics;
    }>
  > {
    const logs = await this.logger.query({ ...options, limit: 10000 });

    // Group logs by time period
    const periods = new Map<string, EvaluationLog[]>();

    for (const log of logs) {
      const date = new Date(log.timestamp);
      let periodKey: string;

      switch (granularity) {
        case 'hour':
          periodKey = date.toISOString().substring(0, 13) + ':00:00Z';
          break;
        case 'day':
          periodKey = date.toISOString().split('T')[0] ?? '';
          break;
        case 'week': {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          periodKey = weekStart.toISOString().split('T')[0] ?? '';
          break;
        }
      }

      const existing = periods.get(periodKey) || [];
      existing.push(log);
      periods.set(periodKey, existing);
    }

    // Calculate metrics for each period
    const results: Array<{ period: string; metrics: EvaluationMetrics }> = [];

    for (const [period, periodLogs] of periods) {
      const metrics = await this.calculateMetricsFromLogs(periodLogs);
      results.push({ period, metrics });
    }

    // Sort by period
    return results.sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Calculate metrics from a specific set of logs
   */
  private async calculateMetricsFromLogs(logs: EvaluationLog[]): Promise<EvaluationMetrics> {
    if (logs.length === 0) {
      return this.emptyMetrics();
    }

    const outcomeDistribution: Record<EvaluationOutcome, number> = {
      success: 0,
      failure: 0,
      partial: 0,
      unknown: 0,
    };

    const latencies: number[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let errorCount = 0;
    const ratings: number[] = [];
    const toolUsage: Record<string, number> = {};

    for (const log of logs) {
      outcomeDistribution[log.outcome]++;
      latencies.push(log.latencyMs);
      totalInputTokens += log.tokens.inputTokens;
      totalOutputTokens += log.tokens.outputTokens;
      totalCost += log.cost.totalCost;
      if (log.outcome === 'failure' || log.errorMessage) errorCount++;
      if (log.userFeedback?.rating !== undefined) ratings.push(log.userFeedback.rating);
      for (const tc of log.toolCalls) {
        toolUsage[tc.name] = (toolUsage[tc.name] ?? 0) + 1;
      }
    }

    latencies.sort((a, b) => a - b);

    const sortedByTime = [...logs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const metrics: EvaluationMetrics = {
      totalLogs: logs.length,
      outcomeDistribution,
      avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      p99LatencyMs: percentile(latencies, 99),
      avgInputTokens: totalInputTokens / logs.length,
      avgOutputTokens: totalOutputTokens / logs.length,
      totalCost,
      avgCost: totalCost / logs.length,
      errorRate: errorCount / logs.length,
      toolUsageFrequency: toolUsage,
      periodStart: sortedByTime[0]?.timestamp ?? new Date().toISOString(),
      periodEnd: sortedByTime[sortedByTime.length - 1]?.timestamp ?? new Date().toISOString(),
    };

    // Only include avgUserRating if there are ratings
    if (ratings.length > 0) {
      metrics.avgUserRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    }

    return metrics;
  }

  /**
   * Export logs as training data
   */
  async exportForTraining(options?: {
    /** Only include successful outcomes */
    successOnly?: boolean;
    /** Minimum user rating */
    minRating?: number;
    /** Filter by persona */
    persona?: string;
    /** Maximum examples to export */
    maxExamples?: number;
  }): Promise<TrainingExport> {
    // Build query options, only including defined values
    const queryOpts: EvaluationQueryOptions = {
      limit: options?.maxExamples ?? 10000,
    };
    if (options?.persona) {
      queryOpts.persona = options.persona;
    }

    let logs = await this.logger.query(queryOpts);

    // Apply filters
    if (options?.successOnly) {
      logs = logs.filter((l) => l.outcome === 'success');
    }

    if (options?.minRating !== undefined) {
      logs = logs.filter(
        (l) => l.userFeedback?.rating !== undefined && l.userFeedback.rating >= options.minRating!
      );
    }

    // Convert to training examples
    const examples: TrainingExample[] = logs.map((log) => {
      const example: TrainingExample = {
        system: log.systemPrompt,
        user: log.userMessage,
        assistant: log.responseContent,
        outcome: log.outcome,
        toolsUsed: log.toolCalls.map((tc) => tc.name),
        sourceLogId: log.id,
      };
      // Only include rating if it exists
      if (log.userFeedback?.rating !== undefined) {
        example.rating = log.userFeedback.rating;
      }
      return example;
    });

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      count: examples.length,
      examples,
    };
  }

  /**
   * Export training data in JSONL format (for fine-tuning)
   */
  async exportToJSONL(options?: Parameters<EvaluationAnalyzer['exportForTraining']>[0]): Promise<string> {
    const trainingData = await this.exportForTraining(options);

    const lines = trainingData.examples.map((example) =>
      JSON.stringify({
        messages: [
          { role: 'system', content: example.system },
          { role: 'user', content: example.user },
          { role: 'assistant', content: example.assistant },
        ],
      })
    );

    return lines.join('\n');
  }

  /**
   * Get summary statistics
   */
  async getSummary(): Promise<{
    totalInteractions: number;
    uniqueAgents: number;
    uniqueSessions: number;
    uniquePersonas: number;
    totalCost: number;
    successRate: number;
    avgLatency: number;
    dateRange: { start: string; end: string };
  }> {
    const logs = await this.logger.query({ limit: 10000 });

    const agents = new Set(logs.map((l) => l.agentId));
    const sessions = new Set(logs.map((l) => l.sessionId));
    const personas = new Set(logs.map((l) => l.persona));

    const successCount = logs.filter((l) => l.outcome === 'success').length;
    const totalCost = logs.reduce((sum, l) => sum + l.cost.totalCost, 0);
    const avgLatency =
      logs.length > 0 ? logs.reduce((sum, l) => sum + l.latencyMs, 0) / logs.length : 0;

    const sortedByTime = [...logs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
      totalInteractions: logs.length,
      uniqueAgents: agents.size,
      uniqueSessions: sessions.size,
      uniquePersonas: personas.size,
      totalCost,
      successRate: logs.length > 0 ? successCount / logs.length : 0,
      avgLatency,
      dateRange: {
        start: sortedByTime[0]?.timestamp ?? new Date().toISOString(),
        end: sortedByTime[sortedByTime.length - 1]?.timestamp ?? new Date().toISOString(),
      },
    };
  }
}

/**
 * Create an evaluation analyzer instance
 */
export function createEvaluationAnalyzer(logger: EvaluationLogger): EvaluationAnalyzer {
  return new EvaluationAnalyzer(logger);
}
