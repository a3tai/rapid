import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useSuggestions } from '../stores/app';
import { useData } from '../hooks/useData';
import { useToast } from '../components/Toast';
import type { Suggestion } from '../stores/app';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Check, X, Minus, Zap, Lightbulb } from 'lucide-react';

function SuggestionBadge({ category }: { category: string }) {
  const variants: Record<string, 'default' | 'destructive' | 'info' | 'warning' | 'secondary'> = {
    feature: 'default',
    fix: 'destructive',
    improvement: 'info',
    refactor: 'warning',
    docs: 'secondary',
  };
  return <Badge variant={variants[category] || 'secondary'}>{category}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'destructive' | 'success' | 'warning' | 'info' | 'secondary' | 'muted'> = {
    proposed: 'muted',
    voting: 'warning',
    approved: 'success',
    rejected: 'destructive',
    orchestrator_approved: 'success',
    orchestrator_vetoed: 'destructive',
    implemented: 'info',
  };
  return <Badge variant={variants[status] || 'muted'}>{status.replace('_', ' ')}</Badge>;
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { submitVote, overrideSuggestion } = useData();
  const toast = useToast();
  const [votingId, setVotingId] = useState<string | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const totalVotes = suggestion.approveCount + suggestion.rejectCount + suggestion.abstainCount;
  const approvePercent =
    totalVotes > 0 ? Math.round((suggestion.approveCount / totalVotes) * 100) : 0;

  const handleVote = async (vote: 'approve' | 'reject' | 'abstain') => {
    setVotingId(vote);
    try {
      await submitVote(suggestion.id, vote);
      toast.success('Vote Submitted', `You voted to ${vote} this suggestion`);
    } catch (err) {
      toast.error('Vote Failed', err instanceof Error ? err.message : 'Could not submit vote');
    } finally {
      setVotingId(null);
    }
  };

  const handleOverride = async (decision: 'approved' | 'vetoed') => {
    if (!overrideReason.trim()) {
      toast.error('Reason Required', 'Please provide a reason for your decision');
      return;
    }

    try {
      await overrideSuggestion(suggestion.id, decision, overrideReason);
      toast.success(`Orchestrator ${decision}`, `Suggestion has been ${decision}`);
      setShowOverride(false);
      setOverrideReason('');
    } catch (err) {
      toast.error(
        'Override Failed',
        err instanceof Error ? err.message : 'Could not process override'
      );
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">{suggestion.title}</CardTitle>
            <CardDescription className="mt-1">{suggestion.description}</CardDescription>
          </div>
          <div className="flex gap-2 ml-4">
            <SuggestionBadge category={suggestion.category} />
            <StatusBadge status={suggestion.status} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Proposed by {suggestion.proposedByName}</span>
          <span>{formatDistanceToNow(new Date(suggestion.createdAt), { addSuffix: true })}</span>
        </div>

        {/* Voting info */}
        {(suggestion.status === 'proposed' || suggestion.status === 'voting') && totalVotes > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Votes: {totalVotes}</span>
              <span>{approvePercent}% approve</span>
            </div>
            <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-muted">
              {suggestion.approveCount > 0 && (
                <div
                  className="bg-success"
                  style={{ width: `${(suggestion.approveCount / Math.max(totalVotes, 1)) * 100}%` }}
                />
              )}
              {suggestion.rejectCount > 0 && (
                <div
                  className="bg-destructive"
                  style={{ width: `${(suggestion.rejectCount / Math.max(totalVotes, 1)) * 100}%` }}
                />
              )}
              {suggestion.abstainCount > 0 && (
                <div
                  className="bg-warning"
                  style={{ width: `${(suggestion.abstainCount / Math.max(totalVotes, 1)) * 100}%` }}
                />
              )}
            </div>
            <div className="flex gap-4 text-xs">
              <span className="text-success flex items-center gap-1">
                <Check className="w-3 h-3" /> {suggestion.approveCount}
              </span>
              <span className="text-destructive flex items-center gap-1">
                <X className="w-3 h-3" /> {suggestion.rejectCount}
              </span>
              <span className="text-warning flex items-center gap-1">
                <Minus className="w-3 h-3" /> {suggestion.abstainCount}
              </span>
            </div>
          </div>
        )}

        {/* Orchestrator decision */}
        {suggestion.orchestratorDecision && (
          <Card className="bg-muted/50">
            <CardContent className="p-3 space-y-1">
              <div className="font-semibold text-sm">
                Orchestrator{' '}
                {suggestion.orchestratorDecision.decision === 'approved' ? (
                  <span className="text-success">Approved</span>
                ) : (
                  <span className="text-destructive">Vetoed</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {suggestion.orchestratorDecision.reason}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Voting buttons - for voting/proposed status */}
        {(suggestion.status === 'voting' || suggestion.status === 'proposed') &&
          !suggestion.orchestratorDecision && (
            <div className="flex gap-2 pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleVote('approve')}
                disabled={votingId !== null}
                className="flex-1 text-success hover:text-success hover:bg-success/10"
              >
                <Check className="w-4 h-4 mr-1" />
                {votingId === 'approve' ? '...' : 'Approve'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleVote('abstain')}
                disabled={votingId !== null}
                className="flex-1 text-warning hover:text-warning hover:bg-warning/10"
              >
                <Minus className="w-4 h-4 mr-1" />
                {votingId === 'abstain' ? '...' : 'Abstain'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleVote('reject')}
                disabled={votingId !== null}
                className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <X className="w-4 h-4 mr-1" />
                {votingId === 'reject' ? '...' : 'Reject'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOverride(!showOverride)}
                className="flex-1"
              >
                <Zap className="w-4 h-4 mr-1" />
                Override
              </Button>
            </div>
          )}

        {/* Orchestrator override form */}
        {showOverride && !suggestion.orchestratorDecision && (
          <Card className="bg-muted/50">
            <CardContent className="p-3 space-y-3">
              <Label className="text-sm font-medium">Override Decision</Label>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOverride('approved')}
                  className="flex-1 text-success hover:text-success hover:bg-success/10"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOverride('vetoed')}
                  className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <X className="w-4 h-4 mr-1" />
                  Veto
                </Button>
              </div>
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason for override..."
                className="text-sm resize-none"
                rows={2}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOverride(false)}
                className="w-full"
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

export function Suggestions() {
  const suggestions = useSuggestions();

  const stats = {
    total: suggestions.length,
    voting: suggestions.filter((s) => s.status === 'voting' || s.status === 'proposed').length,
    approved: suggestions.filter(
      (s) => s.status === 'approved' || s.status === 'orchestrator_approved'
    ).length,
    rejected: suggestions.filter(
      (s) => s.status === 'rejected' || s.status === 'orchestrator_vetoed'
    ).length,
  };

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Suggestions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Voting</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.voting}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rejected</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Suggestions list */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Active Suggestions</h2>

        {suggestions.length === 0 ? (
          <Card className="p-8 text-center">
            <CardContent className="flex flex-col items-center justify-center space-y-4">
              <Lightbulb className="w-12 h-12 text-muted-foreground" />
              <div className="text-lg font-medium">No suggestions yet</div>
              <p className="text-muted-foreground">
                Use `rapid suggest "your idea"` to propose new suggestions
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {suggestions.map((suggestion) => (
              <SuggestionCard key={suggestion.id} suggestion={suggestion} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
