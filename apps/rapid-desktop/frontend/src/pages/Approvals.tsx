import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useData } from '../hooks/useData';
import { useToast } from '../components/Toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
  Check,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApprovalRequest {
  id: string;
  toolName: string;
  agentId: string;
  agentName: string;
  action: string;
  args: Record<string, unknown>;
  reason?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  expiresAt?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

const RISK_CONFIG = {
  low: {
    icon: ShieldCheck,
    bgClass: 'bg-success/10',
    textClass: 'text-success',
    borderClass: 'border-success/30',
  },
  medium: {
    icon: Shield,
    bgClass: 'bg-warning/10',
    textClass: 'text-warning',
    borderClass: 'border-warning/30',
  },
  high: {
    icon: ShieldAlert,
    bgClass: 'bg-orange-500/10',
    textClass: 'text-orange-400',
    borderClass: 'border-orange-500/30',
  },
  critical: {
    icon: AlertTriangle,
    bgClass: 'bg-destructive/10',
    textClass: 'text-destructive',
    borderClass: 'border-destructive/30',
  },
};

export function ApprovalsPage() {
  const { fetchApprovals } = useData();
  const toast = useToast();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch real approvals from backend via MCP (no mock fallback - real data only)
      const approvals = (await fetchApprovals()) as Record<string, unknown>[];
      // Map to ApprovalRequest type
      const mapped: ApprovalRequest[] = approvals.map((a) => ({
        id: String(a.id || ''),
        toolName: String(a.toolName || ''),
        agentId: String(a.agentId || ''),
        agentName: String(a.agentName || ''),
        action: String(a.action || ''),
        args: (a.args as Record<string, unknown>) || {},
        reason: a.reason as string | undefined,
        riskLevel: (a.riskLevel as ApprovalRequest['riskLevel']) || 'low',
        createdAt: String(a.createdAt || new Date().toISOString()),
        expiresAt: a.expiresAt as string | undefined,
        status: (a.status as ApprovalRequest['status']) || 'pending',
      }));
      setRequests(mapped);
    } catch (err) {
      console.error('Failed to fetch approval requests:', err);
      setRequests([]);
      toast.error('Failed to Load Approvals', 'Backend not responding - ensure daemon is running');
    } finally {
      setLoading(false);
    }
  }, [fetchApprovals, toast]);

  useEffect(() => {
    fetchRequests();
    // Poll for new requests
    const interval = setInterval(fetchRequests, 10000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  const { approveRequest, rejectRequest } = useData();

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    const request = requests.find((r) => r.id === id);
    try {
      // Call backend to approve request
      await approveRequest(id, `Approved via desktop UI`);

      // Update local state
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'approved' } : r)));
      setSelectedRequest(null);
      toast.success('Request Approved', request?.action || 'Action has been authorized');

      // Refresh list after approval
      await fetchRequests();
    } catch (err) {
      console.error('Failed to approve:', err);
      toast.error(
        'Approval Failed',
        err instanceof Error ? err.message : 'Could not process the approval request'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    const request = requests.find((r) => r.id === id);
    try {
      // Call backend to reject request
      await rejectRequest(id, `Rejected via desktop UI`);

      // Update local state
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'rejected' } : r)));
      setSelectedRequest(null);
      toast.warning('Request Rejected', request?.action || 'Action has been denied');

      // Refresh list after rejection
      await fetchRequests();
    } catch (err) {
      console.error('Failed to reject:', err);
      toast.error(
        'Rejection Failed',
        err instanceof Error ? err.message : 'Could not process the rejection'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (filter === 'pending') return r.status === 'pending';
    if (filter === 'resolved') return r.status !== 'pending';
    return true;
  });

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Approval Queue</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Review and approve agent actions requiring human authorization
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border border-warning/30 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
            <span className="text-warning font-medium">
              {pendingCount} pending approval{pendingCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['pending', 'resolved', 'all'] as const).map((f) => (
          <Badge
            key={f}
            variant={filter === f ? 'default' : 'secondary'}
            className="cursor-pointer capitalize"
            onClick={() => setFilter(f)}
          >
            {f}
            {f === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 opacity-70">{pendingCount}</span>
            )}
          </Badge>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Request list */}
        <Card className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground p-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading approval requests...
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground p-8">
                <div className="text-center">
                  <ShieldCheck className="w-16 h-16 mx-auto mb-4 opacity-30" />
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
              <div className="divide-y divide-border">
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
          </ScrollArea>
        </Card>

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
  );
}

interface ApprovalRowProps {
  request: ApprovalRequest;
  isSelected: boolean;
  isProcessing: boolean;
  onClick: () => void;
  onApprove: () => void;
  onReject: () => void;
}

function ApprovalRow({
  request,
  isSelected,
  isProcessing,
  onClick,
  onApprove,
  onReject,
}: ApprovalRowProps) {
  const riskConfig = RISK_CONFIG[request.riskLevel];
  const RiskIcon = riskConfig.icon;
  const isPending = request.status === 'pending';

  return (
    <div
      className={cn(
        'p-4 hover:bg-muted cursor-pointer transition-colors',
        isSelected && 'bg-muted',
        isPending && 'border-l-4',
        isPending && riskConfig.borderClass
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        {/* Risk indicator */}
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
            riskConfig.bgClass
          )}
        >
          <RiskIcon className={cn('w-5 h-5', riskConfig.textClass)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{request.action}</span>
            <Badge variant="outline" className={cn('text-xs', riskConfig.textClass)}>
              {request.riskLevel}
            </Badge>
            {request.status !== 'pending' && (
              <Badge
                variant={
                  request.status === 'approved'
                    ? 'success'
                    : request.status === 'rejected'
                      ? 'destructive'
                      : 'secondary'
                }
                className="text-xs"
              >
                {request.status}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{request.toolName}</span>
            <span>•</span>
            <span>{request.agentName}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}</span>
          </div>

          {request.reason && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-1">{request.reason}</p>
          )}
        </div>

        {/* Quick actions */}
        {isPending && (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              onClick={onReject}
              disabled={isProcessing}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <X className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onApprove}
              disabled={isProcessing}
              className="text-success hover:text-success hover:bg-success/10"
            >
              <Check className="w-5 h-5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

interface ApprovalDetailProps {
  request: ApprovalRequest;
  isProcessing: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}

function ApprovalDetail({
  request,
  isProcessing,
  onClose,
  onApprove,
  onReject,
}: ApprovalDetailProps) {
  const riskConfig = RISK_CONFIG[request.riskLevel];
  const isPending = request.status === 'pending';

  return (
    <Card className="w-96 overflow-auto flex flex-col">
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{request.action}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={riskConfig.textClass}>
                {request.riskLevel} risk
              </Badge>
              {request.status !== 'pending' && (
                <Badge variant={request.status === 'approved' ? 'success' : 'destructive'}>
                  {request.status}
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      {/* Details */}
      <CardContent className="space-y-4 flex-1">
        <div>
          <Label className="text-muted-foreground">Tool</Label>
          <span className="font-mono text-sm block mt-1">{request.toolName}</span>
        </div>

        <div>
          <Label className="text-muted-foreground">Agent</Label>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-xs text-primary font-medium">
                {request.agentName[0].toUpperCase()}
              </span>
            </div>
            <span className="text-sm">{request.agentName}</span>
            <span className="text-xs text-muted-foreground font-mono">{request.agentId}</span>
          </div>
        </div>

        {request.reason && (
          <div>
            <Label className="text-muted-foreground">Reason</Label>
            <p className="text-sm mt-1">{request.reason}</p>
          </div>
        )}

        <div>
          <Label className="text-muted-foreground">Arguments</Label>
          <pre className="mt-1 p-3 bg-muted rounded-lg text-xs font-mono overflow-auto max-h-40">
            {JSON.stringify(request.args, null, 2)}
          </pre>
        </div>

        <div>
          <Label className="text-muted-foreground">Requested</Label>
          <span className="text-sm block mt-1">
            {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
          </span>
        </div>

        {request.expiresAt && isPending && (
          <div>
            <Label className="text-muted-foreground">Expires</Label>
            <span className="text-sm text-warning block mt-1">
              {formatDistanceToNow(new Date(request.expiresAt), { addSuffix: true })}
            </span>
          </div>
        )}
      </CardContent>

      {/* Actions */}
      {isPending && (
        <div className="p-4 border-t flex gap-2">
          <Button
            variant="outline"
            onClick={onReject}
            disabled={isProcessing}
            className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reject'}
          </Button>
          <Button
            variant="outline"
            onClick={onApprove}
            disabled={isProcessing}
            className="flex-1 text-success border-success/30 hover:bg-success/10"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Approve'}
          </Button>
        </div>
      )}
    </Card>
  );
}
