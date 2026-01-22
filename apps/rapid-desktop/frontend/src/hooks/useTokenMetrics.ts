/**
 * Token Metrics Hook
 *
 * Fetches token usage statistics from the MCP get_cost_summary endpoint.
 * Provides total tokens, input/output breakdown, efficiency metrics, and task averages.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useMcp, pollingManager } from './useMcp';

export interface TokenMetrics {
  /** Total input tokens across all sessions */
  inputTokens: number;
  /** Total output tokens across all sessions */
  outputTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Cache read tokens (if available) */
  cacheReadTokens: number;
  /** Cache write tokens (if available) */
  cacheWriteTokens: number;
  /** Average tokens per task (if task count available) */
  avgTokensPerTask: number;
  /** Token efficiency ratio (output/input) - higher means more output per input */
  efficiencyRatio: number;
  /** Total number of tasks used for calculating average */
  taskCount: number;
}

interface CostSummaryResponse {
  totalCost?: number;
  totalTokens?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  byModel?: Record<string, {
    cost?: number;
    tokens?: {
      input?: number;
      output?: number;
      total?: number;
    };
  }>;
  byAgent?: Record<string, {
    cost?: number;
    tokens?: {
      input?: number;
      output?: number;
      total?: number;
    };
  }>;
  bySession?: Record<string, unknown>;
  period?: {
    hours?: number;
  };
}

interface MetricsResponse {
  summary?: {
    totalTasks?: number;
    completed?: number;
    failed?: number;
    avgDurationMs?: number;
  };
}

const defaultMetrics: TokenMetrics = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  avgTokensPerTask: 0,
  efficiencyRatio: 0,
  taskCount: 0,
};

/**
 * Hook for fetching and managing token usage metrics
 */
export function useTokenMetrics(pollingIntervalMs = 10000) {
  const { callTool } = useMcp();
  const [metrics, setMetrics] = useState<TokenMetrics>(defaultMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialFetch = useRef(true);

  /**
   * Fetch token metrics from MCP endpoint
   */
  const fetchMetrics = useCallback(async () => {
    try {
      // Only show loading on initial fetch to prevent flicker
      if (isInitialFetch.current) {
        setLoading(true);
      }

      // Fetch cost summary which includes token usage
      const costResult = await callTool('get_cost_summary', { hours: 24 });
      const costData = costResult.structuredContent as CostSummaryResponse;

      // Fetch task metrics to get task count for average calculation
      const metricsResult = await callTool('metrics_get', { periodHours: 24 });
      const metricsData = metricsResult.structuredContent as MetricsResponse;

      // Extract token data
      const inputTokens = costData?.totalTokens?.input ?? 0;
      const outputTokens = costData?.totalTokens?.output ?? 0;
      const totalTokens = costData?.totalTokens?.total ?? inputTokens + outputTokens;
      const cacheReadTokens = costData?.totalTokens?.cacheRead ?? 0;
      const cacheWriteTokens = costData?.totalTokens?.cacheWrite ?? 0;

      // Get task count from metrics
      const taskCount = metricsData?.summary?.totalTasks ?? 0;

      // Calculate derived metrics
      const avgTokensPerTask = taskCount > 0 ? Math.round(totalTokens / taskCount) : 0;
      const efficiencyRatio = inputTokens > 0 ? outputTokens / inputTokens : 0;

      setMetrics({
        inputTokens,
        outputTokens,
        totalTokens,
        cacheReadTokens,
        cacheWriteTokens,
        avgTokensPerTask,
        efficiencyRatio,
        taskCount,
      });

      setError(null);
      isInitialFetch.current = false;
    } catch (err) {
      console.error('[useTokenMetrics] Failed to fetch metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch token metrics');
      // Keep existing metrics on error to prevent flicker
    } finally {
      if (isInitialFetch.current) {
        setLoading(false);
      }
    }
  }, [callTool]);

  /**
   * Force refresh metrics
   */
  const refresh = useCallback(async () => {
    isInitialFetch.current = true;
    await fetchMetrics();
  }, [fetchMetrics]);

  // Set up polling
  useEffect(() => {
    // Initial fetch
    fetchMetrics();

    // Set up polling via PollingManager
    const unsubscribe = pollingManager.subscribe(
      'token-metrics',
      () => {},
      fetchMetrics,
      pollingIntervalMs
    );

    return unsubscribe;
  }, [fetchMetrics, pollingIntervalMs]);

  return {
    metrics,
    loading,
    error,
    refresh,
  };
}
