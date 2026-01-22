import { useEffect, useState } from 'react';
import { useData } from '../hooks/useData';

export interface SecurityStatus {
  trustLevel: 'development' | 'staging' | 'production';
  sandboxEnabled: boolean;
  sandboxMethod?: string;
  strictMode: boolean;
  humanApprovalEnabled: boolean;
  auditLoggingEnabled: boolean;
  pendingApprovals: number;
  recentViolations: number;
  budgetUsage: {
    sessionBudget: { used: number; limit: number; percentage: number };
    agentBudget: { used: number; limit: number; percentage: number };
  };
  lastAuditEvent?: {
    timestamp: string;
    eventType: string;
    agentId?: string;
    allowed: boolean;
  };
}

export function SecurityPanel() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toolUnavailable, setToolUnavailable] = useState(false);
  const { callTool: _callTool } = useData();

  useEffect(() => {
    loadSecurityStatus();
    // Refresh every 30 seconds (longer interval since tool may not exist)
    const interval = setInterval(loadSecurityStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadSecurityStatus = async () => {
    // Don't retry if we know the tool doesn't exist
    if (toolUnavailable) return;

    try {
      setLoading(true);

      // Call MCP to get real security status
      const result = await _callTool('security_status', {});

      if (result?.structuredContent) {
        setStatus(result.structuredContent as SecurityStatus);
      } else {
        // No data available - show null state
        setStatus(null);
      }
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Check if the tool doesn't exist - hide panel gracefully
      if (errorMessage.includes('not found') ||
          errorMessage.includes('Tool security_status') ||
          errorMessage.includes('status 400') ||
          errorMessage.includes('-32602')) {
        setToolUnavailable(true);
        setStatus(null);
        setError(null);
      } else {
        // Actual error - show it
        setStatus(null);
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // Hide panel entirely if tool doesn't exist
  if (toolUnavailable) {
    return null;
  }

  if (loading && !status) {
    return (
      <div className="card p-4">
        <div className="space-y-3">
          <div className="h-4 bg-rapid-elevated rounded w-1/3 animate-pulse" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-3 bg-rapid-elevated rounded w-2/3 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4 border border-red-500/20 bg-red-500/5">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div className="text-sm text-red-500">{error}</div>
        </div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Security Configuration</h2>
        <button
          onClick={loadSecurityStatus}
          className="text-xs px-3 py-1.5 rounded-md bg-rapid-elevated hover:bg-rapid-elevated/80 transition"
        >
          Refresh
        </button>
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Trust Level */}
        <div className="card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rapid-muted">Trust Level</span>
            <span
              className={`badge badge-sm ${
                status.trustLevel === 'production'
                  ? 'badge-error'
                  : status.trustLevel === 'staging'
                    ? 'badge-warning'
                    : 'badge-info'
              }`}
            >
              {status.trustLevel}
            </span>
          </div>
        </div>

        {/* Sandbox */}
        <div className="card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rapid-muted">Sandbox</span>
            <div className="flex items-center gap-2">
              {status.sandboxEnabled && <span className="status-dot status-dot-active" />}
              <span className="text-xs">{status.sandboxMethod || 'disabled'}</span>
            </div>
          </div>
        </div>

        {/* Human Approval */}
        <div className="card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rapid-muted">Human Approval</span>
            <span
              className={`status-dot ${status.humanApprovalEnabled ? 'status-dot-active' : 'status-dot-inactive'}`}
            />
          </div>
        </div>

        {/* Audit Logging */}
        <div className="card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rapid-muted">Audit Logging</span>
            <span
              className={`status-dot ${status.auditLoggingEnabled ? 'status-dot-active' : 'status-dot-inactive'}`}
            />
          </div>
        </div>
      </div>

      {/* Budget Usage */}
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-medium">Budget Usage</h3>

        {/* Session Budget */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-rapid-muted">Session Budget</span>
            <span>
              ${status.budgetUsage.sessionBudget.used.toFixed(2)} / $
              {status.budgetUsage.sessionBudget.limit}
            </span>
          </div>
          <div className="w-full bg-rapid-elevated rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all ${
                status.budgetUsage.sessionBudget.percentage > 90
                  ? 'bg-red-500'
                  : status.budgetUsage.sessionBudget.percentage > 75
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(status.budgetUsage.sessionBudget.percentage, 100)}%` }}
            />
          </div>
        </div>

        {/* Agent Budget */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-rapid-muted">Agent Budget</span>
            <span>
              ${status.budgetUsage.agentBudget.used.toFixed(2)} / $
              {status.budgetUsage.agentBudget.limit}
            </span>
          </div>
          <div className="w-full bg-rapid-elevated rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all ${
                status.budgetUsage.agentBudget.percentage > 90
                  ? 'bg-red-500'
                  : status.budgetUsage.agentBudget.percentage > 75
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(status.budgetUsage.agentBudget.percentage, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Alerts */}
      {(status.pendingApprovals > 0 || status.recentViolations > 0) && (
        <div className="card p-4 space-y-2 border border-yellow-500/20 bg-yellow-500/5">
          {status.pendingApprovals > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-yellow-700">{status.pendingApprovals} pending approval(s)</span>
            </div>
          )}
          {status.recentViolations > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M13.477 14.89A6 6 0 015.11 2.476M14.89 2.11a6 6 0 018.813 8.813M1.5 6.5h6v6h-6v-6z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-red-700">{status.recentViolations} recent violation(s)</span>
            </div>
          )}
        </div>
      )}

      {/* Last Event */}
      {status.lastAuditEvent && (
        <div className="card p-3 bg-rapid-elevated text-xs space-y-1">
          <div className="font-medium">Last Event</div>
          <div className="flex items-center justify-between text-rapid-muted">
            <span>{status.lastAuditEvent.eventType}</span>
            <span className={status.lastAuditEvent.allowed ? 'text-green-600' : 'text-red-600'}>
              {status.lastAuditEvent.allowed ? '✓ Allowed' : '✗ Denied'}
            </span>
          </div>
          <div className="text-rapid-muted">
            {new Date(status.lastAuditEvent.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}
