/**
 * Alerts Section Component
 *
 * Displays alerts requiring attention on the dashboard:
 * - Budget alerts (70%, 90%, 100% thresholds)
 * - Stale agent warnings (no heartbeat)
 * - Pending approvals count
 * - Task timeouts
 * - High error rates
 *
 * Each alert has action buttons and can be dismissed.
 */

import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useAlerts, type Alert, type AlertSeverity, type AlertType } from '../hooks/useAlerts';
import { useAppStore } from '../stores/app';
import { useMcp } from '../hooks/useMcp';

// Alert type configuration with icons, colors, and labels
const ALERT_CONFIG: Record<AlertType, { icon: string; label: string }> = {
  budget: { icon: '💰', label: 'Budget' },
  stale_agent: { icon: '⏱️', label: 'Agent' },
  approval: { icon: '📋', label: 'Approval' },
  timeout: { icon: '⏰', label: 'Timeout' },
  error_rate: { icon: '⚠️', label: 'Errors' },
};

// Severity color configuration
const SEVERITY_CONFIG: Record<AlertSeverity, { bg: string; border: string; text: string; icon: string }> = {
  critical: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    icon: '🔴',
  },
  warning: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    icon: '🟡',
  },
  info: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    icon: '🔵',
  },
};

interface AlertsSectionProps {
  /** Maximum alerts to display */
  maxAlerts?: number;
  /** Show loading skeleton */
  showLoading?: boolean;
}

export function AlertsSection({ maxAlerts = 5, showLoading = true }: AlertsSectionProps) {
  const { alerts, isLoading, dismissAlert, refresh } = useAlerts();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const { spawnAgent, stopAgent } = useMcp();

  // Handle alert actions
  const handleAction = async (alert: Alert) => {
    switch (alert.actionType) {
      case 'view':
        if (alert.type === 'budget') {
          // Navigate to a cost view (could be dashboard or dedicated cost page)
          setActiveView('dashboard');
        } else if (alert.type === 'timeout' || alert.metadata?.taskId) {
          setActiveView('tasks');
        } else if (alert.type === 'error_rate') {
          setActiveView('events');
        }
        break;
      case 'review':
        setActiveView('approvals');
        break;
      case 'restart':
        if (alert.metadata?.agentId) {
          try {
            // Stop and respawn the agent
            await stopAgent(alert.metadata.agentId as string);
            // Optionally respawn with same name
            const agentName = alert.metadata.agentName as string || 'worker';
            await spawnAgent(agentName, 'Restarted from alert');
            dismissAlert(alert.id);
          } catch (err) {
            console.error('Failed to restart agent:', err);
          }
        }
        break;
      case 'dismiss':
        dismissAlert(alert.id);
        break;
    }
  };

  const displayAlerts = alerts.slice(0, maxAlerts);
  const hiddenCount = alerts.length - maxAlerts;

  if (isLoading && showLoading) {
    return <AlertsSectionSkeleton />;
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="p-4 border-b border-rapid-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Alerts</h3>
          {alerts.length > 0 && (
            <span
              className={clsx(
                'px-2 py-0.5 text-xs rounded-full font-medium',
                alerts.some((a) => a.severity === 'critical')
                  ? 'bg-red-500/20 text-red-400'
                  : alerts.some((a) => a.severity === 'warning')
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-blue-500/20 text-blue-400'
              )}
            >
              {alerts.length}
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          className="text-xs text-rapid-muted hover:text-rapid-text transition-colors"
          title="Refresh alerts"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* Alert list */}
      <div className="divide-y divide-rapid-border">
        {displayAlerts.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-rapid-muted text-sm">No alerts - everything looks good!</p>
          </div>
        ) : (
          displayAlerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onAction={() => handleAction(alert)}
              onDismiss={() => dismissAlert(alert.id)}
            />
          ))
        )}
      </div>

      {/* Footer with hidden count */}
      {hiddenCount > 0 && (
        <div className="p-3 border-t border-rapid-border bg-rapid-elevated/50 text-center">
          <span className="text-xs text-rapid-muted">
            +{hiddenCount} more alert{hiddenCount > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

interface AlertRowProps {
  alert: Alert;
  onAction: () => void;
  onDismiss: () => void;
}

function AlertRow({ alert, onAction, onDismiss }: AlertRowProps) {
  const typeConfig = ALERT_CONFIG[alert.type];
  const severityConfig = SEVERITY_CONFIG[alert.severity];

  return (
    <div
      className={clsx(
        'p-4 transition-colors hover:bg-rapid-elevated/30',
        severityConfig.bg
      )}
    >
      <div className="flex items-start gap-3">
        {/* Severity indicator */}
        <div className="flex-shrink-0 mt-0.5">
          <span className="text-lg" title={alert.severity}>
            {severityConfig.icon}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm" title={typeConfig.label}>
              {typeConfig.icon}
            </span>
            <span className={clsx('font-medium text-sm', severityConfig.text)}>
              {alert.title}
            </span>
          </div>
          <p className="text-sm text-rapid-muted line-clamp-2">{alert.message}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-rapid-muted">
              {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
            </span>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {alert.actionLabel && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction();
                  }}
                  className={clsx(
                    'text-xs px-2 py-1 rounded transition-colors',
                    'bg-rapid-elevated hover:bg-rapid-border',
                    severityConfig.text
                  )}
                >
                  {alert.actionLabel}
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                className="text-xs px-2 py-1 rounded text-rapid-muted hover:text-rapid-text hover:bg-rapid-elevated transition-colors"
                title="Dismiss alert"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertsSectionSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="p-4 border-b border-rapid-border flex items-center justify-between">
        <div className="h-5 w-16 bg-rapid-elevated rounded" />
        <div className="h-4 w-4 bg-rapid-elevated rounded" />
      </div>
      <div className="divide-y divide-rapid-border">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-rapid-elevated rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-rapid-elevated rounded" />
                <div className="h-3 w-48 bg-rapid-elevated rounded" />
                <div className="h-3 w-24 bg-rapid-elevated rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AlertsSection;
