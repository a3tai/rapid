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
export function useCostSummary(\n  periodHours: number = 24,\n  enabled: boolean = true,\n  refreshInterval: number = 60000\n) {\n  const { callTool } = useMcp();\n  const [data, setData] = useState<CostSummaryData | null>(null);\n  const [loading, setLoading] = useState(false);\n  const [error, setError] = useState<string | null>(null);\n  const pollingRef = useRef<NodeJS.Timeout | null>(null);\n  const cacheRef = useRef<{ data: CostSummaryData; timestamp: number } | null>(null);\n\n  const fetchCostSummary = useCallback(async () => {\n    if (!enabled) return;\n\n    setLoading(true);\n    setError(null);\n\n    try {\n      const result = (await callTool('get_cost_summary', {\n        hours: periodHours,\n      })) as { structuredContent?: unknown };\n\n      const costData = result?.structuredContent as {\n        totalCost?: number;\n        inputTokens?: number;\n        outputTokens?: number;\n        cacheReadTokens?: number;\n        cacheWriteTokens?: number;\n        byModel?: Array<{\n          model: string;\n          cost: number;\n          inputTokens?: number;\n          outputTokens?: number;\n          percentOfTotal?: number;\n        }>;\n        byAgent?: Array<{\n          agentId: string;\n          agentName?: string;\n          cost: number;\n          tasksCompleted?: number;\n          costPerTask?: number;\n        }>;\n      };\n\n      if (costData) {\n        const summary: CostSummaryData = {\n          totalCost: costData.totalCost || 0,\n          inputTokens: costData.inputTokens || 0,\n          outputTokens: costData.outputTokens || 0,\n          cacheReadTokens: costData.cacheReadTokens || 0,\n          cacheWriteTokens: costData.cacheWriteTokens || 0,\n          byModel: (costData.byModel || []).map((m) => ({\n            model: m.model,\n            cost: m.cost,\n            inputTokens: m.inputTokens || 0,\n            outputTokens: m.outputTokens || 0,\n            percentOfTotal: m.percentOfTotal || 0,\n          })),\n          byAgent: (costData.byAgent || []).map((a) => ({\n            agentId: a.agentId,\n            agentName: a.agentName,\n            cost: a.cost,\n            tasksCompleted: a.tasksCompleted || 0,\n            costPerTask: a.costPerTask || 0,\n          })),\n          periodHours,\n          timestamp: Date.now(),\n        };\n\n        setData(summary);\n        cacheRef.current = { data: summary, timestamp: Date.now() };\n      }\n    } catch (err) {\n      setError(err instanceof Error ? err.message : 'Failed to fetch cost summary');\n      console.error('[useCostSummary] Error:', err);\n    } finally {\n      setLoading(false);\n    }\n  }, [callTool, periodHours, enabled]);\n\n  // Return cached data if available\n  const refetch = useCallback(async () => {\n    await fetchCostSummary();\n  }, [fetchCostSummary]);\n\n  // Setup polling\n  useEffect(() => {\n    if (!enabled) {\n      if (pollingRef.current) {\n        clearInterval(pollingRef.current);\n        pollingRef.current = null;\n      }\n      return;\n    }\n\n    // Return cached data immediately if fresh\n    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < refreshInterval) {\n      setData(cacheRef.current.data);\n    } else {\n      // Initial fetch\n      fetchCostSummary();\n    }\n\n    // Setup polling interval\n    pollingRef.current = setInterval(fetchCostSummary, refreshInterval);\n\n    return () => {\n      if (pollingRef.current) {\n        clearInterval(pollingRef.current);\n        pollingRef.current = null;\n      }\n    };\n  }, [enabled, fetchCostSummary, refreshInterval]);\n\n  return {\n    data,\n    loading,\n    error,\n    refetch,\n  };\n}\n\n/**\n * Hook for fetching detailed cost records with optional filtering\n *\n * @param filter - Filter options for cost records\n * @param enabled - Enable/disable polling (default: true)\n * @param refreshInterval - Polling interval in ms (default: 120000 = 2 minutes)\n * @returns Cost records array with loading/error states and refetch function\n *\n * @example\n * const { data: records, loading, error, refetch } = useCostRecords({\n *   startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),\n *   agentId: 'agent-123'\n * });\n */\nexport function useCostRecords(\n  filter: CostRecordsFilter = {},\n  enabled: boolean = true,\n  refreshInterval: number = 120000\n) {\n  const { callTool } = useMcp();\n  const [data, setData] = useState<CostRecord[]>([]);\n  const [loading, setLoading] = useState(false);\n  const [error, setError] = useState<string | null>(null);\n  const pollingRef = useRef<NodeJS.Timeout | null>(null);\n  const cacheRef = useRef<{ data: CostRecord[]; timestamp: number } | null>(null);\n\n  const fetchCostRecords = useCallback(async () => {\n    if (!enabled) return;\n\n    setLoading(true);\n    setError(null);\n\n    try {\n      const params: Record<string, unknown> = {\n        limit: 1000,\n      };\n\n      if (filter.agentId) {\n        params.agentId = filter.agentId;\n      }\n      if (filter.model) {\n        params.model = filter.model;\n      }\n      if (filter.startDate) {\n        params.startDate = filter.startDate.toISOString();\n      }\n      if (filter.endDate) {\n        params.endDate = filter.endDate.toISOString();\n      }\n      if (filter.minCost !== undefined) {\n        params.minCost = filter.minCost;\n      }\n      if (filter.maxCost !== undefined) {\n        params.maxCost = filter.maxCost;\n      }\n\n      const result = (await callTool('get_cost_records', params)) as {\n        structuredContent?: unknown;\n      };\n\n      const recordsData = result?.structuredContent as {\n        records?: Array<{\n          id: string;\n          timestamp: string;\n          agentId: string;\n          agentName?: string;\n          model: string;\n          inputTokens?: number;\n          outputTokens?: number;\n          cacheReadTokens?: number;\n          cacheWriteTokens?: number;\n          cost: number;\n          taskId?: string;\n          session?: string;\n        }>;\n      };\n\n      if (recordsData?.records) {\n        const records: CostRecord[] = recordsData.records.map((r) => ({\n          id: r.id,\n          timestamp: r.timestamp,\n          agentId: r.agentId,\n          agentName: r.agentName,\n          model: r.model,\n          inputTokens: r.inputTokens || 0,\n          outputTokens: r.outputTokens || 0,\n          cacheReadTokens: r.cacheReadTokens || 0,\n          cacheWriteTokens: r.cacheWriteTokens || 0,\n          cost: r.cost,\n          taskId: r.taskId,\n          session: r.session,\n        }));\n\n        setData(records);\n        cacheRef.current = { data: records, timestamp: Date.now() };\n      } else {\n        setData([]);\n      }\n    } catch (err) {\n      setError(err instanceof Error ? err.message : 'Failed to fetch cost records');\n      console.error('[useCostRecords] Error:', err);\n    } finally {\n      setLoading(false);\n    }\n  }, [callTool, filter, enabled]);\n\n  const refetch = useCallback(async () => {\n    await fetchCostRecords();\n  }, [fetchCostRecords]);\n\n  // Setup polling\n  useEffect(() => {\n    if (!enabled) {\n      if (pollingRef.current) {\n        clearInterval(pollingRef.current);\n        pollingRef.current = null;\n      }\n      return;\n    }\n\n    // Return cached data immediately if fresh\n    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < refreshInterval) {\n      setData(cacheRef.current.data);\n    } else {\n      // Initial fetch\n      fetchCostRecords();\n    }\n\n    // Setup polling interval\n    pollingRef.current = setInterval(fetchCostRecords, refreshInterval);\n\n    return () => {\n      if (pollingRef.current) {\n        clearInterval(pollingRef.current);\n        pollingRef.current = null;\n      }\n    };\n  }, [enabled, fetchCostRecords, refreshInterval]);\n\n  return {\n    data,\n    loading,\n    error,\n    refetch,\n  };\n}\n\n/**\n * Hook for monitoring an individual agent's budget\n *\n * @param agentId - The agent ID to monitor\n * @param enabled - Enable/disable polling (default: true)\n * @param refreshInterval - Polling interval in ms (default: 30000 = 30 seconds)\n * @returns Agent budget data with loading/error states and refetch function\n *\n * @example\n * const { data: budget, loading, error } = useAgentBudget('agent-123');\n * if (budget?.status === 'exceeded') {\n *   return <div className=\"text-red-600\">Budget exceeded!</div>;\n * }\n */\nexport function useAgentBudget(\n  agentId: string,\n  enabled: boolean = true,\n  refreshInterval: number = 30000\n) {\n  const { callTool } = useMcp();\n  const [data, setData] = useState<AgentBudgetData | null>(null);\n  const [loading, setLoading] = useState(false);\n  const [error, setError] = useState<string | null>(null);\n  const pollingRef = useRef<NodeJS.Timeout | null>(null);\n  const cacheRef = useRef<{ data: AgentBudgetData; timestamp: number } | null>(null);\n\n  const fetchAgentBudget = useCallback(async () => {\n    if (!enabled || !agentId) return;\n\n    setLoading(true);\n    setError(null);\n\n    try {\n      const result = (await callTool('check_agent_budget', {\n        agentId,\n      })) as { structuredContent?: unknown };\n\n      const budgetData = result?.structuredContent as {\n        agentId?: string;\n        agentName?: string;\n        spent?: number;\n        limit?: number;\n        percentUsed?: number;\n        remainingBudget?: number;\n        projectedOverage?: number;\n      };\n\n      if (budgetData) {\n        const spent = budgetData.spent || 0;\n        const limit = budgetData.limit || 0;\n        const percentUsed = budgetData.percentUsed || 0;\n        const remainingBudget = budgetData.remainingBudget ?? limit - spent;\n\n        // Determine status based on percentage used\n        let status: 'ok' | 'warning' | 'exceeded' = 'ok';\n        if (percentUsed >= 100) {\n          status = 'exceeded';\n        } else if (percentUsed >= 90) {\n          status = 'warning';\n        }\n\n        const budget: AgentBudgetData = {\n          agentId,\n          agentName: budgetData.agentName,\n          spent,\n          limit,\n          percentUsed,\n          remainingBudget,\n          projectedOverage: budgetData.projectedOverage,\n          status,\n        };\n\n        setData(budget);\n        cacheRef.current = { data: budget, timestamp: Date.now() };\n      }\n    } catch (err) {\n      setError(err instanceof Error ? err.message : 'Failed to fetch agent budget');\n      console.error('[useAgentBudget] Error:', err);\n    } finally {\n      setLoading(false);\n    }\n  }, [callTool, agentId, enabled]);\n\n  const refetch = useCallback(async () => {\n    await fetchAgentBudget();\n  }, [fetchAgentBudget]);\n\n  // Setup polling\n  useEffect(() => {\n    if (!enabled || !agentId) {\n      if (pollingRef.current) {\n        clearInterval(pollingRef.current);\n        pollingRef.current = null;\n      }\n      setData(null);\n      return;\n    }\n\n    // Return cached data immediately if fresh\n    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < refreshInterval) {\n      setData(cacheRef.current.data);\n    } else {\n      // Initial fetch\n      fetchAgentBudget();\n    }\n\n    // Setup polling interval\n    pollingRef.current = setInterval(fetchAgentBudget, refreshInterval);\n\n    return () => {\n      if (pollingRef.current) {\n        clearInterval(pollingRef.current);\n        pollingRef.current = null;\n      }\n    };\n  }, [enabled, agentId, fetchAgentBudget, refreshInterval]);\n\n  return {\n    data,\n    loading,\n    error,\n    refetch,\n  };\n}\n\n/**\n * Hook for monitoring a session's overall budget\n *\n * @param sessionId - The session ID to monitor (optional, defaults to current session)\n * @param enabled - Enable/disable polling (default: true)\n * @param refreshInterval - Polling interval in ms (default: 60000 = 1 minute)\n * @returns Session budget data with loading/error states and refetch function\n *\n * @example\n * const { data: budget, loading } = useSessionBudget('session-abc');\n * return (\n *   <div>\n *     <div>Spent: ${budget?.spent}</div>\n *     <ProgressBar value={budget?.percentUsed} />\n *   </div>\n * );\n */\nexport function useSessionBudget(\n  sessionId?: string,\n  enabled: boolean = true,\n  refreshInterval: number = 60000\n) {\n  const { callTool } = useMcp();\n  const [data, setData] = useState<SessionBudgetData | null>(null);\n  const [loading, setLoading] = useState(false);\n  const [error, setError] = useState<string | null>(null);\n  const pollingRef = useRef<NodeJS.Timeout | null>(null);\n  const cacheRef = useRef<{ data: SessionBudgetData; timestamp: number } | null>(null);\n\n  const fetchSessionBudget = useCallback(async () => {\n    if (!enabled) return;\n\n    setLoading(true);\n    setError(null);\n\n    try {\n      const params: Record<string, unknown> = {};\n      if (sessionId) {\n        params.sessionId = sessionId;\n      }\n\n      const result = (await callTool('check_session_budget', params)) as {\n        structuredContent?: unknown;\n      };\n\n      const budgetData = result?.structuredContent as {\n        sessionId?: string;\n        spent?: number;\n        limit?: number;\n        percentUsed?: number;\n        remainingBudget?: number;\n        agentCount?: number;\n      };\n\n      if (budgetData) {\n        const spent = budgetData.spent || 0;\n        const limit = budgetData.limit || 0;\n        const percentUsed = budgetData.percentUsed || 0;\n        const agentCount = budgetData.agentCount || 0;\n        const avgCostPerAgent = agentCount > 0 ? spent / agentCount : 0;\n        const remainingBudget = budgetData.remainingBudget ?? limit - spent;\n\n        const budget: SessionBudgetData = {\n          sessionId: budgetData.sessionId || sessionId || 'current',\n          spent,\n          limit,\n          percentUsed,\n          remainingBudget,\n          agentCount,\n          avgCostPerAgent,\n        };\n\n        setData(budget);\n        cacheRef.current = { data: budget, timestamp: Date.now() };\n      }\n    } catch (err) {\n      setError(err instanceof Error ? err.message : 'Failed to fetch session budget');\n      console.error('[useSessionBudget] Error:', err);\n    } finally {\n      setLoading(false);\n    }\n  }, [callTool, sessionId, enabled]);\n\n  const refetch = useCallback(async () => {\n    await fetchSessionBudget();\n  }, [fetchSessionBudget]);\n\n  // Setup polling\n  useEffect(() => {\n    if (!enabled) {\n      if (pollingRef.current) {\n        clearInterval(pollingRef.current);\n        pollingRef.current = null;\n      }\n      return;\n    }\n\n    // Return cached data immediately if fresh\n    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < refreshInterval) {\n      setData(cacheRef.current.data);\n    } else {\n      // Initial fetch\n      fetchSessionBudget();\n    }\n\n    // Setup polling interval\n    pollingRef.current = setInterval(fetchSessionBudget, refreshInterval);\n\n    return () => {\n      if (pollingRef.current) {\n        clearInterval(pollingRef.current);\n        pollingRef.current = null;\n      }\n    };\n  }, [enabled, fetchSessionBudget, refreshInterval]);\n\n  return {\n    data,\n    loading,\n    error,\n    refetch,\n  };\n}\n\n/**\n * Helper function to format cost as currency\n *\n * @example\n * formatCost(0.00456) // \"$0.0046\"\n * formatCost(1.23) // \"$1.23\"\n */\nexport function formatCost(cost: number): string {\n  if (cost < 0.01) return `$${cost.toFixed(4)}`;\n  if (cost < 1) return `$${cost.toFixed(3)}`;\n  return `$${cost.toFixed(2)}`;\n}\n\n/**\n * Helper function to format tokens as human-readable string\n *\n * @example\n * formatTokens(1000) // \"1.0K\"\n * formatTokens(1500000) // \"1.5M\"\n */\nexport function formatTokens(tokens: number): string {\n  if (tokens < 1000) return `${tokens}`;\n  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;\n  return `${(tokens / 1000000).toFixed(1)}M`;\n}\n\n/**\n * Helper function to calculate cost per token\n *\n * @example\n * costPerToken(0.01, 1000) // \"0.00001\"\n */\nexport function costPerToken(cost: number, tokens: number): string {\n  if (tokens === 0) return '0';\n  const cpt = cost / tokens;\n  return cpt.toFixed(6);\n}\n"