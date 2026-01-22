/**
 * React hooks for fetching and managing cost data from RAPID MCP server
 *
 * Provides cost tracking, budget monitoring, and financial metrics:
 * - useCostSummary: Overall cost breakdown by model and agent
 * - useCostRecords: Detailed cost records with filtering
 * - useAgentBudget: Individual agent budget tracking
 * - useSessionBudget: Session-level budget tracking
 *
 * All hooks include:
 * - Automatic polling with configurable intervals
 * - Caching to prevent excessive API calls
 * - Error handling and loading states
 * - Manual refetch capability
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMcp } from './useMcp';

/**
 * Cost breakdown by model (e.g., Opus, Sonnet, Haiku)
 */
export interface CostByModel {
  model: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  percentOfTotal: number;
}

/**
 * Cost breakdown by agent
 */
export interface CostByAgent {
  agentId: string;
  agentName?: string;
  cost: number;
  tasksCompleted: number;
  costPerTask: number;
}

/**
 * Overall cost summary data
 */
export interface CostSummaryData {
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  byModel: CostByModel[];
  byAgent: CostByAgent[];
  periodHours: number;
  timestamp: number;
}

/**
 * Individual cost record
 */
export interface CostRecord {
  id: string;
  timestamp: string;
  agentId: string;
  agentName?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cost: number;
  taskId?: string;
  session?: string;
}

/**
 * Agent budget information
 */
export interface AgentBudgetData {
  agentId: string;
  agentName?: string;
  spent: number;
  limit: number;
  percentUsed: number;
  remainingBudget: number;
  projectedOverage?: number;
  status: 'ok' | 'warning' | 'exceeded';
}

/**
 * Session budget information
 */
export interface SessionBudgetData {
  sessionId: string;
  spent: number;
  limit?: number;
  percentUsed: number;
  remainingBudget: number;
  agentCount: number;
  avgCostPerAgent: number;
}

/**
 * Filter options for cost records
 */
export interface CostRecordsFilter {
  agentId?: string;
  model?: string;
  startDate?: Date;
  endDate?: Date;
  minCost?: number;
  maxCost?: number;
}

/**
 * Hook for fetching overall cost summary
 *
 * @param periodHours - Time period to summarize (default: 24)
 * @param enabled - Enable/disable polling (default: true)
 * @param refreshInterval - Polling interval in ms (default: 60000 = 1 minute)
 * @returns Cost summary data with loading/error states and refetch function
 *
 * @example
 * const { data, loading, error, refetch } = useCostSummary(24);
 * if (loading) return <div>Loading...</div>;
 * if (error) return <div>Error: {error}</div>;
 * return <div>Total cost: ${data?.totalCost}</div>;
 */
export function useCostSummary(
  periodHours: number = 24,
  enabled: boolean = true,
  refreshInterval: number = 60000
) {
  const { callTool } = useMcp();
  const [data, setData] = useState<CostSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const cacheRef = useRef<{ data: CostSummaryData; timestamp: number } | null>(null);

  const fetchCostSummary = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const result = (await callTool('get_cost_summary', {
        hours: periodHours,
      })) as { structuredContent?: unknown };

      const costData = result?.structuredContent as {
        totalCost?: number;
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        byModel?: Array<{
          model: string;
          cost: number;
          inputTokens?: number;
          outputTokens?: number;
          percentOfTotal?: number;
        }>;
        byAgent?: Array<{
          agentId: string;
          agentName?: string;
          cost: number;
          tasksCompleted?: number;
          costPerTask?: number;
        }>;
      };

      if (costData) {
        const summary: CostSummaryData = {
          totalCost: costData.totalCost || 0,
          inputTokens: costData.inputTokens || 0,
          outputTokens: costData.outputTokens || 0,
          cacheReadTokens: costData.cacheReadTokens || 0,
          cacheWriteTokens: costData.cacheWriteTokens || 0,
          byModel: (costData.byModel || []).map((m) => ({
            model: m.model,
            cost: m.cost,
            inputTokens: m.inputTokens || 0,
            outputTokens: m.outputTokens || 0,
            percentOfTotal: m.percentOfTotal || 0,
          })),
          byAgent: (costData.byAgent || []).map((a) => ({
            agentId: a.agentId,
            agentName: a.agentName,
            cost: a.cost,
            tasksCompleted: a.tasksCompleted || 0,
            costPerTask: a.costPerTask || 0,
          })),
          periodHours,
          timestamp: Date.now(),
        };

        setData(summary);
        cacheRef.current = { data: summary, timestamp: Date.now() };
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cost summary');
      console.error('[useCostSummary] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [callTool, periodHours, enabled]);

  // Return cached data if available
  const refetch = useCallback(async () => {
    await fetchCostSummary();
  }, [fetchCostSummary]);

  // Setup polling
  useEffect(() => {
    if (!enabled) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    // Return cached data immediately if fresh
    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < refreshInterval) {
      setData(cacheRef.current.data);
    } else {
      // Initial fetch
      fetchCostSummary();
    }

    // Setup polling interval
    pollingRef.current = setInterval(fetchCostSummary, refreshInterval);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [enabled, fetchCostSummary, refreshInterval]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}

/**
 * Hook for fetching detailed cost records with optional filtering
 *
 * @param filter - Filter options for cost records
 * @param enabled - Enable/disable polling (default: true)
 * @param refreshInterval - Polling interval in ms (default: 120000 = 2 minutes)
 * @returns Cost records array with loading/error states and refetch function
 *
 * @example
 * const { data: records, loading, error, refetch } = useCostRecords({
 *   startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
 *   agentId: 'agent-123'
 * });
 */
export function useCostRecords(
  filter: CostRecordsFilter = {},
  enabled: boolean = true,
  refreshInterval: number = 120000
) {
  const { callTool } = useMcp();
  const [data, setData] = useState<CostRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const cacheRef = useRef<{ data: CostRecord[]; timestamp: number } | null>(null);

  const fetchCostRecords = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const params: Record<string, unknown> = {
        limit: 1000,
      };

      if (filter.agentId) {
        params.agentId = filter.agentId;
      }
      if (filter.model) {
        params.model = filter.model;
      }
      if (filter.startDate) {
        params.startDate = filter.startDate.toISOString();
      }
      if (filter.endDate) {
        params.endDate = filter.endDate.toISOString();
      }
      if (filter.minCost !== undefined) {
        params.minCost = filter.minCost;
      }
      if (filter.maxCost !== undefined) {
        params.maxCost = filter.maxCost;
      }

      const result = (await callTool('get_cost_records', params)) as {
        structuredContent?: unknown;
      };

      const recordsData = result?.structuredContent as {
        records?: Array<{
          id: string;
          timestamp: string;
          agentId: string;
          agentName?: string;
          model: string;
          inputTokens?: number;
          outputTokens?: number;
          cacheReadTokens?: number;
          cacheWriteTokens?: number;
          cost: number;
          taskId?: string;
          session?: string;
        }>;
      };

      if (recordsData?.records) {
        const records: CostRecord[] = recordsData.records.map((r) => ({
          id: r.id,
          timestamp: r.timestamp,
          agentId: r.agentId,
          agentName: r.agentName,
          model: r.model,
          inputTokens: r.inputTokens || 0,
          outputTokens: r.outputTokens || 0,
          cacheReadTokens: r.cacheReadTokens || 0,
          cacheWriteTokens: r.cacheWriteTokens || 0,
          cost: r.cost,
          taskId: r.taskId,
          session: r.session,
        }));

        setData(records);
        cacheRef.current = { data: records, timestamp: Date.now() };
      } else {
        setData([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cost records');
      console.error('[useCostRecords] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [callTool, filter, enabled]);

  const refetch = useCallback(async () => {
    await fetchCostRecords();
  }, [fetchCostRecords]);

  // Setup polling
  useEffect(() => {
    if (!enabled) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    // Return cached data immediately if fresh
    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < refreshInterval) {
      setData(cacheRef.current.data);
    } else {
      // Initial fetch
      fetchCostRecords();
    }

    // Setup polling interval
    pollingRef.current = setInterval(fetchCostRecords, refreshInterval);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [enabled, fetchCostRecords, refreshInterval]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}

/**
 * Hook for monitoring an individual agent's budget
 *
 * @param agentId - The agent ID to monitor
 * @param enabled - Enable/disable polling (default: true)
 * @param refreshInterval - Polling interval in ms (default: 30000 = 30 seconds)
 * @returns Agent budget data with loading/error states and refetch function
 *
 * @example
 * const { data: budget, loading, error } = useAgentBudget('agent-123');
 * if (budget?.status === 'exceeded') {
 *   return <div className=\"text-red-600\">Budget exceeded!</div>;
 * }
 */
export function useAgentBudget(
  agentId: string,
  enabled: boolean = true,
  refreshInterval: number = 30000
) {
  const { callTool } = useMcp();
  const [data, setData] = useState<AgentBudgetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const cacheRef = useRef<{ data: AgentBudgetData; timestamp: number } | null>(null);

  const fetchAgentBudget = useCallback(async () => {
    if (!enabled || !agentId) return;

    setLoading(true);
    setError(null);

    try {
      const result = (await callTool('check_agent_budget', {
        agentId,
      })) as { structuredContent?: unknown };

      const budgetData = result?.structuredContent as {
        agentId?: string;
        agentName?: string;
        spent?: number;
        limit?: number;
        percentUsed?: number;
        remainingBudget?: number;
        projectedOverage?: number;
      };

      if (budgetData) {
        const spent = budgetData.spent || 0;
        const limit = budgetData.limit || 0;
        const percentUsed = budgetData.percentUsed || 0;
        const remainingBudget = budgetData.remainingBudget ?? limit - spent;

        // Determine status based on percentage used
        let status: 'ok' | 'warning' | 'exceeded' = 'ok';
        if (percentUsed >= 100) {
          status = 'exceeded';
        } else if (percentUsed >= 90) {
          status = 'warning';
        }

        const budget: AgentBudgetData = {
          agentId,
          agentName: budgetData.agentName,
          spent,
          limit,
          percentUsed,
          remainingBudget,
          projectedOverage: budgetData.projectedOverage,
          status,
        };

        setData(budget);
        cacheRef.current = { data: budget, timestamp: Date.now() };
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch agent budget');
      console.error('[useAgentBudget] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [callTool, agentId, enabled]);

  const refetch = useCallback(async () => {
    await fetchAgentBudget();
  }, [fetchAgentBudget]);

  // Setup polling
  useEffect(() => {
    if (!enabled || !agentId) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setData(null);
      return;
    }

    // Return cached data immediately if fresh
    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < refreshInterval) {
      setData(cacheRef.current.data);
    } else {
      // Initial fetch
      fetchAgentBudget();
    }

    // Setup polling interval
    pollingRef.current = setInterval(fetchAgentBudget, refreshInterval);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [enabled, agentId, fetchAgentBudget, refreshInterval]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}

/**
 * Hook for monitoring a session's overall budget
 *
 * @param sessionId - The session ID to monitor (optional, defaults to current session)
 * @param enabled - Enable/disable polling (default: true)
 * @param refreshInterval - Polling interval in ms (default: 60000 = 1 minute)
 * @returns Session budget data with loading/error states and refetch function
 *
 * @example
 * const { data: budget, loading } = useSessionBudget('session-abc');
 * return (
 *   <div>
 *     <div>Spent: ${budget?.spent}</div>
 *     <ProgressBar value={budget?.percentUsed} />
 *   </div>
 * );
 */
export function useSessionBudget(
  sessionId?: string,
  enabled: boolean = true,
  refreshInterval: number = 60000
) {
  const { callTool } = useMcp();
  const [data, setData] = useState<SessionBudgetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const cacheRef = useRef<{ data: SessionBudgetData; timestamp: number } | null>(null);

  const fetchSessionBudget = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const params: Record<string, unknown> = {};
      if (sessionId) {
        params.sessionId = sessionId;
      }

      const result = (await callTool('check_session_budget', params)) as {
        structuredContent?: unknown;
      };

      const budgetData = result?.structuredContent as {
        sessionId?: string;
        spent?: number;
        limit?: number;
        percentUsed?: number;
        remainingBudget?: number;
        agentCount?: number;
      };

      if (budgetData) {
        const spent = budgetData.spent || 0;
        const limit = budgetData.limit || 0;
        const percentUsed = budgetData.percentUsed || 0;
        const agentCount = budgetData.agentCount || 0;
        const avgCostPerAgent = agentCount > 0 ? spent / agentCount : 0;
        const remainingBudget = budgetData.remainingBudget ?? limit - spent;

        const budget: SessionBudgetData = {
          sessionId: budgetData.sessionId || sessionId || 'current',
          spent,
          limit,
          percentUsed,
          remainingBudget,
          agentCount,
          avgCostPerAgent,
        };

        setData(budget);
        cacheRef.current = { data: budget, timestamp: Date.now() };
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch session budget');
      console.error('[useSessionBudget] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [callTool, sessionId, enabled]);

  const refetch = useCallback(async () => {
    await fetchSessionBudget();
  }, [fetchSessionBudget]);

  // Setup polling
  useEffect(() => {
    if (!enabled) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    // Return cached data immediately if fresh
    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < refreshInterval) {
      setData(cacheRef.current.data);
    } else {
      // Initial fetch
      fetchSessionBudget();
    }

    // Setup polling interval
    pollingRef.current = setInterval(fetchSessionBudget, refreshInterval);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [enabled, fetchSessionBudget, refreshInterval]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}

/**
 * Helper function to format cost as currency
 *
 * @example
 * formatCost(0.00456) // \"$0.0046\"
 * formatCost(1.23) // \"$1.23\"
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Helper function to format tokens as human-readable string
 *
 * @example
 * formatTokens(1000) // \"1.0K\"
 * formatTokens(1500000) // \"1.5M\"
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(1)}M`;
}

/**
 * Helper function to calculate cost per token
 *
 * @example
 * costPerToken(0.01, 1000) // \"0.00001\"
 */
export function costPerToken(cost: number, tokens: number): string {
  if (tokens === 0) return '0';
  const cpt = cost / tokens;
  return cpt.toFixed(6);
}
