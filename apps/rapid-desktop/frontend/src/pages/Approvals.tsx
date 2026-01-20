import { useState, useEffect, useCallback } from 'react'
import { clsx } from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import { useMcp } from '../hooks/useMcp'
import { useToast } from '../components/Toast'

interface ApprovalRequest {
  id: string
  toolName: string
  agentId: string
  agentName: string
  action: string
  args: Record<string, unknown>
  reason?: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  createdAt: string
  expiresAt?: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
}

const RISK_COLORS = {
  low: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
}

export function ApprovalsPage() {
  const { fetchApprovals } = useMcp()
  const toast = useToast()
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('pending')
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch real approvals from backend via MCP
      const approvals = await fetchApprovals()

      // If no approvals from backend, show mock data for demo
      if (approvals.length === 0) {
        const mockRequests: ApprovalRequest[] = [
          {
            id: 'apr-001',
            toolName: 'write_file',
            agentId: 'worker-123',
            agentName: 'worker',
            action: 'Write to .env file',
            args: { path: '.env.production', content: 'API_KEY=...' },
            reason: 'Updating production API key configuration',
            riskLevel: 'high',
            createdAt: new Date(Date.now() - 120000).toISOString(),
            expiresAt: new Date(Date.now() + 180000).toISOString(),
            status: 'pending',
          },
          {
            id: 'apr-002',
            toolName: 'delete_file',
            agentId: 'worker-456',
            agentName: 'worker',
            action: 'Delete database migration',
            args: { path: 'migrations/20240115_drop_users.sql' },
            reason: 'Cleaning up unused migration file',
            riskLevel: 'critical',
            createdAt: new Date(Date.now() - 300000).toISOString(),
            status: 'pending',
          },
          {
            id: 'apr-003',
            toolName: 'secure_exec',
            agentId: 'orchestrator-789',
            agentName: 'orchestrator',
            action: 'Run deployment script',
            args: { command: './deploy.sh', sandbox: 'permissive' },
            reason: 'Deploying latest changes to staging',
            riskLevel: 'medium',
            createdAt: new Date(Date.now() - 600000).toISOString(),
            status: 'approved',
          },
        ]
        setRequests(mockRequests)
      } else {
        setRequests(approvals)
      }
    } catch (err) {
      console.error('Failed to fetch approval requests:', err)
      toast.error('Failed to Load Approvals', 'Could not fetch approval requests')
    } finally {
      setLoading(false)
    }
  }, [fetchApprovals, toast])

  useEffect(() => {
    fetchRequests()
    // Poll for new requests
    const interval = setInterval(fetchRequests, 10000)
    return () => clearInterval(interval)
  }, [fetchRequests])

  const { approveRequest, rejectRequest } = useMcp()

  const handleApprove = async (id: string) => {
    setProcessingId(id)
    const request = requests.find((r) => r.id === id)
    try {
      // Call backend to approve request
      await approveRequest(id, `Approved via desktop UI`)

      // Update local state
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'approved' } : r))
      )
      setSelectedRequest(null)
      toast.success('Request Approved', request?.action || 'Action has been authorized')

      // Refresh list after approval
      await fetchRequests()
    } catch (err) {
      console.error('Failed to approve:', err)
      toast.error('Approval Failed', err instanceof Error ? err.message : 'Could not process the approval request')
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (id: string) => {
    setProcessingId(id)
    const request = requests.find((r) => r.id === id)
    try {
      // Call backend to reject request
      await rejectRequest(id, `Rejected via desktop UI`)

      // Update local state
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'rejected' } : r))
      )
      setSelectedRequest(null)
      toast.warning('Request Rejected', request?.action || 'Action has been denied')

      // Refresh list after rejection
      await fetchRequests()
    } catch (err) {
      console.error('Failed to reject:', err)
      toast.error('Rejection Failed', err instanceof Error ? err.message : 'Could not process the rejection')
    } finally {
      setProcessingId(null)
    }
  }

  const filteredRequests = requests.filter((r) => {
    if (filter === 'pending') return r.status === 'pending'
    if (filter === 'resolved') return r.status !== 'pending'
    return true
  })

  const pendingCount = requests.filter((r) => r.status === 'pending').length

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Approval Queue</h2>
          <p className="text-rapid-muted text-sm mt-1">
            Review and approve agent actions requiring human authorization
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-yellow-400 font-medium">
              {pendingCount} pending approval{pendingCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['pending', 'resolved', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'badge cursor-pointer transition-colors capitalize',
              filter === f
                ? 'bg-rapid-accent text-white'
                : 'badge-neutral hover:bg-rapid-border'
            )}
          >
            {f}
            {f === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 opacity-70">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Request list */}
        <div className="flex-1 card overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full text-rapid-muted">
                Loading approval requests...
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="flex items-center justify-center h-full text-rapid-muted">
                <div className="text-center">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 opacity-30"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <p className="text-lg font-medium">
                    {filter === 'pending' ? 'No pending approvals' : 'No approval requests'}
                  </p>
                  <p className="text-sm mt-1 max-w-xs mx-auto">
                    {filter === 'pending'
                      ? 'All clear! Agent actions requiring approval will appear here.'
                      : 'Approval requests from agents will appear here.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-rapid-border">
                {filteredRequests.map((request) => (
                  <ApprovalRow
                    key={request.id}
                    request={request}
                    isSelected={selectedRequest?.id === request.id}
                    isProcessing={processingId === request.id}
                    onClick={() => setSelectedRequest(request)}
                    onApprove={() => handleApprove(request.id)}
                    onReject={() => handleReject(request.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedRequest && (
          <ApprovalDetail
            request={selectedRequest}
            isProcessing={processingId === selectedRequest.id}
            onClose={() => setSelectedRequest(null)}
            onApprove={() => handleApprove(selectedRequest.id)}
            onReject={() => handleReject(selectedRequest.id)}
          />
        )}
      </div>
    </div>
  )
}

interface ApprovalRowProps {
  request: ApprovalRequest
  isSelected: boolean
  isProcessing: boolean
  onClick: () => void
  onApprove: () => void
  onReject: () => void
}

function ApprovalRow({
  request,
  isSelected,
  isProcessing,
  onClick,
  onApprove,
  onReject,
}: ApprovalRowProps) {
  const riskColors = RISK_COLORS[request.riskLevel]
  const isPending = request.status === 'pending'

  return (
    <div
      className={clsx(
        'p-4 hover:bg-rapid-elevated cursor-pointer transition-colors',
        isSelected && 'bg-rapid-elevated',
        isPending && 'border-l-4',
        isPending && riskColors.border
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        {/* Risk indicator */}
        <div
          className={clsx(
            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
            riskColors.bg
          )}
        >
          <RiskIcon level={request.riskLevel} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{request.action}</span>
            <span className={clsx('badge text-xs', riskColors.bg, riskColors.text)}>
              {request.riskLevel}
            </span>
            {request.status !== 'pending' && (
              <span
                className={clsx(
                  'badge text-xs',
                  request.status === 'approved'
                    ? 'badge-success'
                    : request.status === 'rejected'
                    ? 'badge-error'
                    : 'badge-neutral'
                )}
              >
                {request.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 text-sm text-rapid-muted">
            <span className="font-mono">{request.toolName}</span>
            <span>•</span>
            <span>{request.agentName}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}</span>
          </div>

          {request.reason && (
            <p className="text-sm text-rapid-muted mt-2 line-clamp-1">{request.reason}</p>
          )}
        </div>

        {/* Quick actions */}
        {isPending && (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onReject}
              disabled={isProcessing}
              className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              title="Reject"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <button
              onClick={onApprove}
              disabled={isProcessing}
              className="p-2 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
              title="Approve"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface ApprovalDetailProps {
  request: ApprovalRequest
  isProcessing: boolean
  onClose: () => void
  onApprove: () => void
  onReject: () => void
}

function ApprovalDetail({
  request,
  isProcessing,
  onClose,
  onApprove,
  onReject,
}: ApprovalDetailProps) {
  const riskColors = RISK_COLORS[request.riskLevel]
  const isPending = request.status === 'pending'

  return (
    <div className="w-96 card p-4 overflow-auto flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold">{request.action}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={clsx('badge', riskColors.bg, riskColors.text)}>
              {request.riskLevel} risk
            </span>
            {request.status !== 'pending' && (
              <span
                className={clsx(
                  'badge',
                  request.status === 'approved' ? 'badge-success' : 'badge-error'
                )}
              >
                {request.status}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-rapid-muted hover:text-rapid-text">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Details */}
      <div className="space-y-4 flex-1">
        <div>
          <label className="block text-sm font-medium text-rapid-muted mb-1">Tool</label>
          <span className="font-mono text-sm">{request.toolName}</span>
        </div>

        <div>
          <label className="block text-sm font-medium text-rapid-muted mb-1">Agent</label>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-rapid-accent/20 flex items-center justify-center">
              <span className="text-xs text-rapid-accent font-medium">
                {request.agentName[0].toUpperCase()}
              </span>
            </div>
            <span className="text-sm">{request.agentName}</span>
            <span className="text-xs text-rapid-muted font-mono">{request.agentId}</span>
          </div>
        </div>

        {request.reason && (
          <div>
            <label className="block text-sm font-medium text-rapid-muted mb-1">Reason</label>
            <p className="text-sm">{request.reason}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-rapid-muted mb-1">Arguments</label>
          <pre className="p-3 bg-rapid-bg rounded-lg text-xs font-mono overflow-auto max-h-40">
            {JSON.stringify(request.args, null, 2)}
          </pre>
        </div>

        <div>
          <label className="block text-sm font-medium text-rapid-muted mb-1">Requested</label>
          <span className="text-sm">
            {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
          </span>
        </div>

        {request.expiresAt && isPending && (
          <div>
            <label className="block text-sm font-medium text-rapid-muted mb-1">Expires</label>
            <span className="text-sm text-yellow-400">
              {formatDistanceToNow(new Date(request.expiresAt), { addSuffix: true })}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      {isPending && (
        <div className="pt-4 mt-4 border-t border-rapid-border flex gap-2">
          <button
            onClick={onReject}
            disabled={isProcessing}
            className="flex-1 btn bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 disabled:opacity-50"
          >
            {isProcessing ? 'Processing...' : 'Reject'}
          </button>
          <button
            onClick={onApprove}
            disabled={isProcessing}
            className="flex-1 btn bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/30 disabled:opacity-50"
          >
            {isProcessing ? 'Processing...' : 'Approve'}
          </button>
        </div>
      )}
    </div>
  )
}

function RiskIcon({ level }: { level: ApprovalRequest['riskLevel'] }) {
  const color = RISK_COLORS[level].text

  if (level === 'critical') {
    return (
      <svg className={clsx('w-5 h-5', color)} fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    )
  }

  if (level === 'high') {
    return (
      <svg className={clsx('w-5 h-5', color)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    )
  }

  if (level === 'medium') {
    return (
      <svg className={clsx('w-5 h-5', color)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    )
  }

  return (
    <svg className={clsx('w-5 h-5', color)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  )
}
