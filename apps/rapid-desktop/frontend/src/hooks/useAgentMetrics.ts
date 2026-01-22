/**
 * Hook for fetching agent metrics and budget data
 *
 * Calls MCP tools via Wails backend:
 * - metrics_agent_report: task stats
 * - check_agent_budget: budget/cost
 * - get_cost_summary: token breakdown
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useData } from './useData';

export interface AgentTaskMetrics {
  completed: number;
  failed: number;
  avgCompletionTimeMs: number;
  successRate: number;
}

export interface AgentBudget {
  spent: number;
  limit: number;
  percentUsed: number;
  exceeded: boolean;
}

export interface CostByModel {
  model: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
}

export interface CostSummary {
  totalCost: number;
  byModel: CostByModel[];
  byAgent: Array<{ agentId: string; cost: number }>;
}

export interface AgentMetricsData {
  metrics: AgentTaskMetrics | null;
  budget: AgentBudget | null;
  costSummary: CostSummary | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch agent metrics, budget, and cost data
 */
export function useAgentMetrics(
  agentId: string | null,
  enabled: boolean = true
): AgentMetricsData & { refetch: () => Promise<void> } {
  const { callTool } = useData();
  const [metrics, setMetrics] = useState<AgentTaskMetrics | null>(null);
  const [budget, setBudget] = useState<AgentBudget | null>(null);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metricsPollingRef = useRef<NodeJS.Timeout | null>(null);
  const costPollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!agentId) return;

    try {
      // Fetch agent report (task stats)
      const reportResult = await callTool('metrics_agent_report', {
        agentId,
        periodHours: 24,
      }) as { structuredContent?: unknown };

      const report = reportResult?.structuredContent as {
        agents?: Array<{
          agentId: string;
          completed: number;
          failed: number;
          avgCompletionTimeMs: number;
          successRate: number;
        }>;
      };

      if (report?.agents?.length) {
        const agentReport = report.agents.find(a => a.agentId === agentId) || report.agents[0];
        setMetrics({
          completed: agentReport.completed || 0,
          failed: agentReport.failed || 0,
          avgCompletionTimeMs: agentReport.avgCompletionTimeMs || 0,
          successRate: agentReport.successRate || 0,
        });
      }
    } catch (err) {
      console.warn('[useAgentMetrics] Failed to fetch metrics:', err);
      // Don't set error for metrics - they may not exist yet
    }
  }, [agentId, callTool]);

  const fetchBudget = useCallback(async () => {
    if (!agentId) return;

    try {
      // Check agent budget
      const budgetResult = await callTool('check_agent_budget', {
        agentId,
      }) as { structuredContent?: unknown };

      const budgetData = budgetResult?.structuredContent as {
        spent?: number;
        limit?: number;
        percentUsed?: number;
        exceeded?: boolean;
      };

      if (budgetData) {
        setBudget({
          spent: budgetData.spent || 0,
          limit: budgetData.limit || 0,
          percentUsed: budgetData.percentUsed || 0,
          exceeded: budgetData.exceeded || false,
        });
      }
    } catch (err) {
      console.warn('[useAgentMetrics] Failed to fetch budget:', err);
      // Don't set error for budget - may not be configured
    }
  }, [agentId, callTool]);

  const fetchCostSummary = useCallback(async () => {
    try {
      // Get cost summary (overall, not agent-specific)
      const costResult = await callTool('get_cost_summary', {
        hours: 24,
      }) as { structuredContent?: unknown };

      const costData = costResult?.structuredContent as {
        totalCost?: number;
        byModel?: Array<{
          model: string;
          cost: number;
          inputTokens?: number;
          outputTokens?: number;
        }>;
        byAgent?: Array<{
          agentId: string;
          cost: number;
        }>;
      };

      if (costData) {
        setCostSummary({
          totalCost: costData.totalCost || 0,
          byModel: (costData.byModel || []).map(m => ({
            model: m.model,
            cost: m.cost,
            inputTokens: m.inputTokens || 0,
            outputTokens: m.outputTokens || 0,
          })),
          byAgent: costData.byAgent || [],
        });
      }
    } catch (err) {
      console.warn('[useAgentMetrics] Failed to fetch cost summary:', err);
      // Don't set error for cost - may not be tracking
    }
  }, [callTool]);

  const refetch = useCallback(async () => {
    if (!agentId || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        fetchMetrics(),
        fetchBudget(),
        fetchCostSummary(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }, [agentId, enabled, fetchMetrics, fetchBudget, fetchCostSummary]);

  // Initial fetch and polling setup
  useEffect(() => {
    if (!enabled || !agentId) {
      setMetrics(null);
      setBudget(null);
      setCostSummary(null);
      return;
    }

    // Initial fetch
    refetch();

    // Poll metrics and budget every 30 seconds
    metricsPollingRef.current = setInterval(() => {
      fetchMetrics();
      fetchBudget();
    }, 30000);

    // Poll cost summary every 60 seconds
    costPollingRef.current = setInterval(() => {
      fetchCostSummary();
    }, 60000);

    return () => {
      if (metricsPollingRef.current) {
        clearInterval(metricsPollingRef.current);
        metricsPollingRef.current = null;
      }
      if (costPollingRef.current) {
        clearInterval(costPollingRef.current);
        costPollingRef.current = null;
      }
    };
  }, [agentId, enabled, refetch, fetchMetrics, fetchBudget, fetchCostSummary]);

  return {
    metrics,
    budget,
    costSummary,
    loading,
    error,
    refetch,
  };
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Format cost to currency string
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}
