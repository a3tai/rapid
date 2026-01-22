import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useSuggestions } from '../stores/app';
import { useMcp } from '../hooks/useMcp';
import { useToast } from '../components/Toast';
import type { Suggestion } from '../stores/app';

function SuggestionBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    feature: 'badge-primary',
    fix: 'badge-error',
    improvement: 'badge-info',
    refactor: 'badge-warning',
    docs: 'badge-secondary',
  };
  return <span className={`badge ${colors[category] || 'badge-neutral'}`}>{category}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    proposed: 'badge-neutral',
    voting: 'badge-warning',
    approved: 'badge-success',
    rejected: 'badge-error',
    orchestrator_approved: 'badge-success',
    orchestrator_vetoed: 'badge-error',
    implemented: 'badge-info',
  };
  return (
    <span className={`badge ${colors[status] || 'badge-neutral'}`}>{status.replace('_', ' ')}</span>
  );
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { submitVote, overrideSuggestion } = useMcp();
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
    <div className="card bg-rapid-elevated p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold">{suggestion.title}</h3>
          <p className="text-sm text-rapid-muted mt-1">{suggestion.description}</p>
        </div>
        <div className="flex gap-2">
          <SuggestionBadge category={suggestion.category} />
          <StatusBadge status={suggestion.status} />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-rapid-muted">
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
          <div className="flex gap-1 h-2 bg-rapid-base rounded-full overflow-hidden">
            {suggestion.approveCount > 0 && (
              <div
                className="bg-success"
                style={{ width: `${(suggestion.approveCount / Math.max(totalVotes, 1)) * 100}%` }}
              />
            )}
            {suggestion.rejectCount > 0 && (
              <div
                className="bg-error"
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
            <span className="text-success">✓ {suggestion.approveCount}</span>
            <span className="text-error">✗ {suggestion.rejectCount}</span>
            <span className="text-warning">~ {suggestion.abstainCount}</span>
          </div>
        </div>
      )}

      {/* Orchestrator decision */}
      {suggestion.orchestratorDecision && (
        <div className="bg-rapid-base p-3 rounded-lg border border-rapid-border text-sm space-y-1">
          <div className="font-semibold">
            Orchestrator{' '}
            {suggestion.orchestratorDecision.decision === 'approved' ? '✓ Approved' : '✗ Vetoed'}
          </div>
          <p className="text-rapid-muted">{suggestion.orchestratorDecision.reason}</p>
        </div>
      )}

      {/* Voting buttons - for voting/proposed status */}
      {(suggestion.status === 'voting' || suggestion.status === 'proposed') &&
        !suggestion.orchestratorDecision && (
          <div className="flex gap-2 pt-2 border-t border-rapid-border">
            <button
              onClick={() => handleVote('approve')}
              disabled={votingId !== null}
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
              title="Vote to approve"
            >
              {votingId === 'approve' ? '...' : '✓ Approve'}
            </button>
            <button
              onClick={() => handleVote('abstain')}
              disabled={votingId !== null}
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 disabled:opacity-50 transition-colors"
              title="Abstain from voting"
            >
              {votingId === 'abstain' ? '...' : '~ Abstain'}
            </button>
            <button
              onClick={() => handleVote('reject')}
              disabled={votingId !== null}
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              title="Vote to reject"
            >
              {votingId === 'reject' ? '...' : '✗ Reject'}
            </button>
            <button
              onClick={() => setShowOverride(!showOverride)}
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-rapid-border text-rapid-muted hover:bg-rapid-elevated transition-colors"
              title="Orchestrator override"
            >
              ⚡ Override
            </button>
          </div>
        )}

      {/* Orchestrator override form */}
      {showOverride && !suggestion.orchestratorDecision && (
        <div className="bg-rapid-base p-3 rounded-lg border border-rapid-border space-y-2">
          <label className="block text-sm font-medium">Override Decision</label>
          <div className="flex gap-2">
            <button
              onClick={() => handleOverride('approved')}
              className="flex-1 px-2 py-2 text-sm rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
            >
              ✓ Approve
            </button>
            <button
              onClick={() => handleOverride('vetoed')}
              className="flex-1 px-2 py-2 text-sm rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              ✗ Veto
            </button>
          </div>
          <textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Reason for override..."
            className="input w-full text-sm resize-none"
            rows={2}
          />
          <button
            onClick={() => setShowOverride(false)}
            className="w-full px-2 py-1 text-xs rounded-lg bg-rapid-border text-rapid-muted hover:bg-rapid-elevated transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
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
        <div className="card p-4">
          <div className="text-rapid-muted text-sm">Total Suggestions</div>
          <div className="text-2xl font-bold mt-2">{stats.total}</div>
        </div>
        <div className="card p-4">
          <div className="text-rapid-muted text-sm">Voting</div>
          <div className="text-2xl font-bold mt-2 text-warning">{stats.voting}</div>
        </div>
        <div className="card p-4">
          <div className="text-rapid-muted text-sm">Approved</div>
          <div className="text-2xl font-bold mt-2 text-success">{stats.approved}</div>
        </div>
        <div className="card p-4">
          <div className="text-rapid-muted text-sm">Rejected</div>
          <div className="text-2xl font-bold mt-2 text-error">{stats.rejected}</div>
        </div>
      </div>

      {/* Suggestions list */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Active Suggestions</h2>

        {suggestions.length === 0 ? (
          <div className="card p-8 text-center text-rapid-muted">
            <div className="text-lg mb-2">💭 No suggestions yet</div>
            <p>Use `rapid suggest "your idea"` to propose new suggestions</p>
          </div>
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
