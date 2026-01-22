/**
 * Metrics Hook
 *
 * Fetches cost, task metrics, and agent performance data from MCP tools.
 * Provides computed statistics for KPI cards including trends.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMcp } from './useMcp';
import { useAppStore } from '../stores/app';

export interface CostSummary {
  totalCost: number;
  costByModel: Record<string, number>;
  costByAgent: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  periodHours: number;
}

export interface TaskMetrics {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  blocked: number;
  successRate: number;
  avgCompletionTimeMs: number;
}

export interface AgentMetrics {
  agentId: string;
  tasksCompleted: number;
  avgCompletionTimeMs: number;
  successRate: number;
  totalCost: number;
}

export interface KPIMetrics {
  todayCost: number;
  yesterdayCost: number;
  costTrend: number; // percentage change
  activeAgents: number;
  taskQueue: number; // pending + in_progress
  successRate: number; // 24h completion rate
  avgLatency: number; // average response/completion time
  totalTasks: number;
  completedTasks: number;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_METRICS: KPIMetrics = {
  todayCost: 0,
  yesterdayCost: 0,
  costTrend: 0,
  activeAgents: 0,
  taskQueue: 0,
  successRate: 0,
  avgLatency: 0,
  totalTasks: 0,
  completedTasks: 0,
  isLoading: true,
  error: null,
};

/**
 * Hook to fetch and compute KPI metrics for dashboard cards
 */
export function useKPIMetrics(refreshIntervalMs = 30000) {
  const [metrics, setMetrics] = useState<KPIMetrics>(DEFAULT_METRICS);
  const { callTool } = useMcp();
  const agents = useAppStore((state) => state.agents);
  const tasks = useAppStore((state) => state.tasks);

  const fetchMetrics = useCallback(async () => {
    try {
      // Fetch cost summary for today (24h)
      const costResult = await callTool('get_cost_summary', { hours: 24 });
      const costData = costResult.structuredContent as CostSummary | null;

      // Fetch cost summary for yesterday (24-48h ago) for trend calculation
      let yesterdayCost = 0;
      try {
        const yesterdayResult = await callTool('get_cost_summary', { hours: 48 });
        const yesterdayData = yesterdayResult.structuredContent as CostSummary | null;
        if (yesterdayData && costData) {
          // Estimate yesterday's cost as (48h total) - (24h total)
          yesterdayCost = Math.max(0, (yesterdayData.totalCost || 0) - (costData.totalCost || 0));
        }
      } catch {
        // Yesterday's cost not available, use 0
      }

      // Fetch task metrics
      const metricsResult = await callTool('metrics_get', { periodHours: 24 });
      const metricsData = metricsResult.structuredContent as {
        taskCompletions?: number;
        taskFailures?: number;
        avgCompletionTimeMs?: number;
      } | null;

      // Calculate derived metrics
      const todayCost = costData?.totalCost || 0;
      const costTrend = yesterdayCost > 0
        ? ((todayCost - yesterdayCost) / yesterdayCost) * 100
        : 0;

      // Calculate success rate from tasks
      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const failedTasks = tasks.filter(t => t.status === 'cancelled' || t.status === 'blocked').length;
      const totalFinished = completedTasks + failedTasks;
      const successRate = totalFinished > 0 ? (completedTasks / totalFinished) * 100 : 100;

      // Calculate task queue (pending + in_progress)
      const taskQueue = tasks.filter(
        t => t.status === 'pending' || t.status === 'in_progress'
      ).length;

      setMetrics({
        todayCost,
        yesterdayCost,
        costTrend,
        activeAgents: agents.length,
        taskQueue,
        successRate,
        avgLatency: metricsData?.avgCompletionTimeMs || 0,
        totalTasks: tasks.length,
        completedTasks,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      console.error('Failed to fetch KPI metrics:', err);
      // Keep existing metrics but mark as potentially stale
      setMetrics(prev => ({
        ...prev,
        isLoading: false,
        error: `Failed to fetch metrics: ${err}`,
      }));
    }
  }, [callTool, agents, tasks]);

  // Fetch on mount and when agents/tasks change
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Set up refresh interval
  useEffect(() => {
    const interval = setInterval(fetchMetrics, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetchMetrics, refreshIntervalMs]);

  return { metrics, refresh: fetchMetrics };
}

/**
 * Hook to fetch detailed cost records
 */
export function useCostRecords(options: { agentId?: string; limit?: number } = {}) {
  const [records, setRecords] = useState<Array<{
    timestamp: string;
    agentId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { callTool } = useMcp();

  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await callTool('get_cost_records', {
        agentId: options.agentId,
        limit: options.limit || 100,
      });
      const data = result.structuredContent as { records?: typeof records };
      setRecords(data?.records || []);
    } catch (err) {
      console.error('Failed to fetch cost records:', err);
    } finally {
      setIsLoading(false);
    }
  }, [callTool, options.agentId, options.limit]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return { records, isLoading, refresh: fetchRecords };
}

/**
 * Hook to fetch agent performance metrics
 */
export function useAgentMetrics(periodHours = 24) {
  const [agentMetrics, setAgentMetrics] = useState<AgentMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { callTool } = useMcp();

  const fetchAgentMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await callTool('metrics_agent_report', { periodHours });
      const data = result.structuredContent as { agents?: AgentMetrics[] };
      setAgentMetrics(data?.agents || []);
    } catch (err) {
      console.error('Failed to fetch agent metrics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [callTool, periodHours]);

  useEffect(() => {
    fetchAgentMetrics();
  }, [fetchAgentMetrics]);

  return { agentMetrics, isLoading, refresh: fetchAgentMetrics };
}

/**
 * Token Usage Statistics
 */
export interface TokenUsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  avgTokensPerTask: number;
  efficiencyRatio: number; // output/input ratio
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_TOKEN_STATS: TokenUsageStats = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  avgTokensPerTask: 0,
  efficiencyRatio: 0,
  isLoading: true,
  error: null,
};

/**
 * Hook to fetch token usage statistics from MCP get_cost_summary endpoint
 */
export function useTokenUsageStats(refreshIntervalMs = 30000) {
  const [stats, setStats] = useState<TokenUsageStats>(DEFAULT_TOKEN_STATS);
  const { callTool } = useMcp();
  const tasks = useAppStore((state) => state.tasks);

  const fetchStats = useCallback(async () => {
    try {
      // Fetch cost summary which includes token data
      const result = await callTool('get_cost_summary', { hours: 24 });
      const data = result.structuredContent as CostSummary | null;

      if (data) {
        const inputTokens = data.inputTokens || 0;
        const outputTokens = data.outputTokens || 0;
        const totalTokens = data.totalTokens || inputTokens + outputTokens;

        // Calculate average tokens per completed task
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const avgTokensPerTask = completedTasks > 0 ? totalTokens / completedTasks : 0;

        // Calculate efficiency ratio (output/input)
        const efficiencyRatio = inputTokens > 0 ? outputTokens / inputTokens : 0;

        setStats({
          inputTokens,
          outputTokens,
          totalTokens,
          avgTokensPerTask,
          efficiencyRatio,
          isLoading: false,
          error: null,
        });
      } else {
        setStats(prev => ({
          ...prev,
          isLoading: false,
          error: 'No token data available',
        }));
      }
    } catch (err) {
      console.error('Failed to fetch token usage stats:', err);
      setStats(prev => ({
        ...prev,
        isLoading: false,
        error: `Failed to fetch token stats: ${err}`,
      }));
    }
  }, [callTool, tasks]);

  // Fetch on mount and when tasks change
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Set up refresh interval
  useEffect(() => {
    const interval = setInterval(fetchStats, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetchStats, refreshIntervalMs]);

  return { stats, refresh: fetchStats };
}
