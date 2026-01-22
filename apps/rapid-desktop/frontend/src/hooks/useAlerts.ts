/**
 * Alerts Hook
 *
 * Fetches and computes alert data from various MCP tools for the dashboard alerts section.
 * Generates alerts for:
 * - Budget alerts (70%, 90%, 100% thresholds)
 * - Stale agent warnings (no heartbeat)
 * - Pending approvals count
 * - Task timeouts
 * - High error rates
 */

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useMcp } from './useMcp';
import { useAppStore } from '../stores/app';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertType = 'budget' | 'stale_agent' | 'approval' | 'timeout' | 'error_rate';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: string;
  actionLabel?: string;
  actionType?: 'view' | 'restart' | 'review' | 'dismiss';
  metadata?: Record<string, unknown>;
}

export interface AlertsState {
  alerts: Alert[];
  isLoading: boolean;
  error: string | null;
  dismissedIds: Set<string>;
}

const BUDGET_THRESHOLDS = {
  warning: 0.7, // 70%
  high: 0.9, // 90%
  critical: 1.0, // 100%
};

// Default daily budget limit if not configured
const DEFAULT_BUDGET_LIMIT = 50; // $50

/**
 * Hook to fetch and manage dashboard alerts
 */
export function useAlerts(refreshIntervalMs = 30000) {
  const [state, setState] = useState<AlertsState>({
    alerts: [],
    isLoading: true,
    error: null,
    dismissedIds: new Set(),
  });

  const { callTool } = useMcp();
  const agents = useAppStore((s) => s.agents);
  const tasks = useAppStore((s) => s.tasks);
  const messages = useAppStore((s) => s.messages);

  const fetchAlerts = useCallback(async () => {
    const alerts: Alert[] = [];

    try {
      // 1. Budget alerts - check current spend vs limit
      try {
        const costResult = await callTool('get_cost_summary', { hours: 24 });
        const costData = costResult.structuredContent as { totalCost?: number } | null;
        const todayCost = costData?.totalCost || 0;
        const budgetLimit = DEFAULT_BUDGET_LIMIT; // TODO: Get from config

        const usagePercent = todayCost / budgetLimit;

        if (usagePercent >= BUDGET_THRESHOLDS.critical) {
          alerts.push({
            id: 'budget-critical',
            type: 'budget',
            severity: 'critical',
            title: 'Budget Exceeded',
            message: `Daily spend ($${todayCost.toFixed(2)}) has exceeded the $${budgetLimit} limit`,
            timestamp: new Date().toISOString(),
            actionLabel: 'View Costs',
            actionType: 'view',
            metadata: { currentSpend: todayCost, limit: budgetLimit, percent: usagePercent * 100 },
          });
        } else if (usagePercent >= BUDGET_THRESHOLDS.high) {
          alerts.push({
            id: 'budget-high',
            type: 'budget',
            severity: 'warning',
            title: 'Budget Alert: 90%',
            message: `Daily spend ($${todayCost.toFixed(2)}) is at ${(usagePercent * 100).toFixed(0)}% of limit`,
            timestamp: new Date().toISOString(),
            actionLabel: 'View Costs',
            actionType: 'view',
            metadata: { currentSpend: todayCost, limit: budgetLimit, percent: usagePercent * 100 },
          });
        } else if (usagePercent >= BUDGET_THRESHOLDS.warning) {
          alerts.push({
            id: 'budget-warning',
            type: 'budget',
            severity: 'info',
            title: 'Budget Alert: 70%',
            message: `Daily spend ($${todayCost.toFixed(2)}) is at ${(usagePercent * 100).toFixed(0)}% of limit`,
            timestamp: new Date().toISOString(),
            actionLabel: 'View Costs',
            actionType: 'view',
            metadata: { currentSpend: todayCost, limit: budgetLimit, percent: usagePercent * 100 },
          });
        }
      } catch (err) {
        console.warn('Failed to fetch budget data for alerts:', err);
      }

      // 2. Stale agent warnings - check for agents without recent heartbeat
      try {
        const healthResult = await callTool('bus_health', {
          staleThresholdSeconds: 60,
          includeStale: true,
        });
        const healthData = healthResult.structuredContent as {
          staleAgents?: Array<{ id: string; name: string; lastSeen?: string }>;
        } | null;

        if (healthData?.staleAgents && healthData.staleAgents.length > 0) {
          for (const staleAgent of healthData.staleAgents) {
            alerts.push({
              id: `stale-agent-${staleAgent.id}`,
              type: 'stale_agent',
              severity: 'warning',
              title: 'Agent Not Responding',
              message: `${staleAgent.name} has not sent a heartbeat recently`,
              timestamp: staleAgent.lastSeen || new Date().toISOString(),
              actionLabel: 'Restart',
              actionType: 'restart',
              metadata: { agentId: staleAgent.id, agentName: staleAgent.name },
            });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch agent health for alerts:', err);
      }

      // 3. Pending approvals - check for tasks requiring approval
      try {
        const pendingApprovalTasks = tasks.filter((t) => t.status === 'pending' && t.tags?.includes('requires_approval'));
        if (pendingApprovalTasks.length > 0) {
          alerts.push({
            id: 'pending-approvals',
            type: 'approval',
            severity: 'info',
            title: 'Pending Approvals',
            message: `${pendingApprovalTasks.length} task${pendingApprovalTasks.length > 1 ? 's' : ''} waiting for approval`,
            timestamp: new Date().toISOString(),
            actionLabel: 'Review',
            actionType: 'review',
            metadata: { count: pendingApprovalTasks.length, taskIds: pendingApprovalTasks.map((t) => t.id) },
          });
        }
      } catch (err) {
        console.warn('Failed to check pending approvals:', err);
      }

      // 4. Task timeouts - check for tasks stuck in progress too long
      try {
        const timeoutResult = await callTool('task_detect_timeouts', {
          claimTimeoutSeconds: 300, // 5 min
          progressTimeoutSeconds: 120, // 2 min without progress
        });
        const timeoutData = timeoutResult.structuredContent as {
          timedOutTasks?: Array<{ id: string; title: string; reason: string }>;
        } | null;

        if (timeoutData?.timedOutTasks && timeoutData.timedOutTasks.length > 0) {
          for (const timedOut of timeoutData.timedOutTasks) {
            alerts.push({
              id: `timeout-${timedOut.id}`,
              type: 'timeout',
              severity: 'warning',
              title: 'Task Timeout',
              message: `"${timedOut.title}" - ${timedOut.reason}`,
              timestamp: new Date().toISOString(),
              actionLabel: 'View Task',
              actionType: 'view',
              metadata: { taskId: timedOut.id },
            });
          }
        }
      } catch (err) {
        console.warn('Failed to check task timeouts:', err);
      }

      // 5. High error rates - check recent error messages
      try {
        const recentErrors = messages.filter(
          (m) =>
            m.type === 'error' &&
            new Date(m.timestamp).getTime() > Date.now() - 3600000 // Last hour
        );

        if (recentErrors.length >= 5) {
          alerts.push({
            id: 'high-error-rate',
            type: 'error_rate',
            severity: recentErrors.length >= 10 ? 'critical' : 'warning',
            title: 'High Error Rate',
            message: `${recentErrors.length} errors in the last hour`,
            timestamp: new Date().toISOString(),
            actionLabel: 'View Events',
            actionType: 'view',
            metadata: { errorCount: recentErrors.length },
          });
        }
      } catch (err) {
        console.warn('Failed to calculate error rate:', err);
      }

      setState((prev) => ({
        ...prev,
        alerts,
        isLoading: false,
        error: null,
      }));
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: `Failed to fetch alerts: ${err}`,
      }));
    }
  }, [callTool, tasks, messages]);

  // Dismiss an alert
  const dismissAlert = useCallback((alertId: string) => {
    setState((prev) => ({
      ...prev,
      dismissedIds: new Set([...prev.dismissedIds, alertId]),
    }));
  }, []);

  // Clear all dismissed alerts
  const clearDismissed = useCallback(() => {
    setState((prev) => ({
      ...prev,
      dismissedIds: new Set(),
    }));
  }, []);

  // Filter out dismissed alerts
  const visibleAlerts = useMemo(() => {
    return state.alerts.filter((a) => !state.dismissedIds.has(a.id));
  }, [state.alerts, state.dismissedIds]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Set up refresh interval
  useEffect(() => {
    const interval = setInterval(fetchAlerts, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetchAlerts, refreshIntervalMs]);

  return {
    alerts: visibleAlerts,
    allAlerts: state.alerts,
    isLoading: state.isLoading,
    error: state.error,
    dismissAlert,
    clearDismissed,
    refresh: fetchAlerts,
  };
}
