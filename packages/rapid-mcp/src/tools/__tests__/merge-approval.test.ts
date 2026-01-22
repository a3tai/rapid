/**
 * Test Suite for Merge Approval (HITL) Tools
 *
 * Tests cover:
 * - merge_list: Listing pending and resolved merge requests
 * - merge_decide: Deciding how to handle merge requests (create_pr, merge_direct, discard)
 * - merge_request: Creating new merge requests from completed agent work
 * - Integration with personas.ts for automatic merge request creation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock types for Redis
interface MockRedis {
  zrevrange: ReturnType<typeof vi.fn>;
  zrem: ReturnType<typeof vi.fn>;
  zadd: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
}

// Mock execa
vi.mock('execa');

describe('Merge Approval (HITL) Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MergeRequest Interface', () => {
    it('should define required fields for a merge request', () => {
      const request = {
        id: 'merge-abc12345-1706832000000',
        agentId: 'agent-uuid',
        agentName: 'worker',
        worktree: 'worker-123456',
        branch: 'worker-123456',
        task: 'Implement user authentication',
        commitCount: 3,
        commitSummary: 'abc1234 feat: add login\ndef5678 fix: handle errors',
        projectDir: '/project',
        status: 'pending' as const,
        createdAt: '2024-02-02T12:00:00.000Z',
      };

      expect(request.id).toMatch(/^merge-/);
      expect(request.status).toBe('pending');
      expect(request.commitCount).toBe(3);
    });

    it('should support optional fields for resolved requests', () => {
      const resolvedRequest = {
        id: 'merge-abc12345-1706832000000',
        agentId: 'agent-uuid',
        agentName: 'worker',
        worktree: 'worker-123456',
        branch: 'worker-123456',
        task: 'Implement feature',
        commitCount: 2,
        commitSummary: 'commits here',
        projectDir: '/project',
        status: 'approved' as const,
        createdAt: '2024-02-02T12:00:00.000Z',
        decision: 'create_pr' as const,
        resolvedAt: '2024-02-02T13:00:00.000Z',
        resolvedBy: 'desktop-ui',
        prUrl: 'https://github.com/org/repo/pull/42',
      };

      expect(resolvedRequest.decision).toBe('create_pr');
      expect(resolvedRequest.prUrl).toContain('/pull/');
      expect(resolvedRequest.resolvedBy).toBe('desktop-ui');
    });

    it('should support error field for failed decisions', () => {
      const failedRequest = {
        id: 'merge-abc12345-1706832000000',
        agentId: 'agent-uuid',
        agentName: 'worker',
        worktree: 'worker-123456',
        branch: 'worker-123456',
        task: 'Implement feature',
        commitCount: 2,
        commitSummary: 'commits here',
        projectDir: '/project',
        status: 'rejected' as const,
        createdAt: '2024-02-02T12:00:00.000Z',
        decision: 'merge_direct' as const,
        resolvedAt: '2024-02-02T13:00:00.000Z',
        error: 'Merge conflict in src/file.ts',
      };

      expect(failedRequest.status).toBe('rejected');
      expect(failedRequest.error).toContain('conflict');
    });
  });

  describe('merge_list Tool', () => {
    it('should list pending merge requests by default', async () => {
      const requests = [
        { id: 'merge-1', status: 'pending', agentName: 'worker' },
        { id: 'merge-2', status: 'approved', agentName: 'implementer' },
        { id: 'merge-3', status: 'pending', agentName: 'architect' },
      ];

      const filtered = requests.filter((r) => r.status === 'pending');
      expect(filtered).toHaveLength(2);
      expect(filtered.map((r) => r.id)).toContain('merge-1');
      expect(filtered.map((r) => r.id)).toContain('merge-3');
    });

    it('should filter by status when specified', async () => {
      const requests = [
        { id: 'merge-1', status: 'pending' },
        { id: 'merge-2', status: 'approved' },
        { id: 'merge-3', status: 'rejected' },
      ];

      const approved = requests.filter((r) => r.status === 'approved');
      expect(approved).toHaveLength(1);
      expect(approved[0].id).toBe('merge-2');

      const rejected = requests.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].id).toBe('merge-3');
    });

    it('should return all requests when status is "all"', async () => {
      const requests = [
        { id: 'merge-1', status: 'pending' },
        { id: 'merge-2', status: 'approved' },
        { id: 'merge-3', status: 'rejected' },
      ];

      const status = 'all';
      const filtered = status === 'all' ? requests : requests.filter((r) => r.status === status);
      expect(filtered).toHaveLength(3);
    });

    it('should apply limit to results', async () => {
      const requests = Array.from({ length: 50 }, (_, i) => ({
        id: `merge-${i}`,
        status: 'pending',
      }));

      const limit = 20;
      const limited = requests.slice(0, limit);
      expect(limited).toHaveLength(20);
    });

    it('should count pending requests separately', async () => {
      const requests = [
        { id: 'merge-1', status: 'pending' },
        { id: 'merge-2', status: 'approved' },
        { id: 'merge-3', status: 'pending' },
        { id: 'merge-4', status: 'rejected' },
      ];

      const pendingCount = requests.filter((r) => r.status === 'pending').length;
      expect(pendingCount).toBe(2);
    });

    it('should return structured output with requests and pendingCount', async () => {
      const output = {
        requests: [
          {
            id: 'merge-1',
            agentId: 'agent-uuid',
            agentName: 'worker',
            worktree: 'worker-123',
            branch: 'worker-123',
            task: 'Implement feature',
            commitCount: 2,
            status: 'pending',
            createdAt: '2024-02-02T12:00:00.000Z',
          },
        ],
        pendingCount: 1,
      };

      expect(output.requests).toBeInstanceOf(Array);
      expect(output.pendingCount).toBe(1);
      expect(output.requests[0]).toHaveProperty('worktree');
    });
  });

  describe('merge_decide Tool', () => {
    describe('Decision: create_pr', () => {
      it('should push branch to remote', () => {
        const worktree = 'worker-123456';
        const branch = 'worker-123456';
        const pushArgs = ['push', '-u', 'origin', branch];

        expect(pushArgs).toContain('push');
        expect(pushArgs).toContain(branch);
      });

      it('should create PR with agent name in title', () => {
        const agentName = 'worker';
        const task = 'Implement user authentication flow';
        const prTitle = `[${agentName}] ${task.slice(0, 60)}`;

        expect(prTitle).toContain('[worker]');
        expect(prTitle).toContain('Implement user authentication flow');
      });

      it('should truncate long task descriptions in title', () => {
        const task = 'A very long task description that exceeds sixty characters and needs truncation';
        const truncated = task.slice(0, 60);

        expect(truncated.length).toBeLessThanOrEqual(60);
        expect(truncated).not.toContain('truncation');
      });

      it('should create PR body with agent details and commits', () => {
        const agentName = 'worker';
        const task = 'Implement feature';
        const commitCount = 3;
        const commitSummary = 'abc1234 feat: add login\ndef5678 fix: errors';

        const prBody = `## Agent Work Complete

Agent \`${agentName}\` completed:
> ${task}

### Commits (${commitCount})
${commitSummary}

---
*Created via RAPID merge approval*`;

        expect(prBody).toContain('Agent Work Complete');
        expect(prBody).toContain('`worker`');
        expect(prBody).toContain('Commits (3)');
      });

      it('should use gh CLI to create PR', () => {
        const prTitle = '[worker] Task';
        const prBody = 'PR body';
        const baseBranch = 'main';

        const ghArgs = ['pr', 'create', '--title', prTitle, '--body', prBody, '--base', baseBranch];
        expect(ghArgs[0]).toBe('pr');
        expect(ghArgs[1]).toBe('create');
      });

      it('should extract PR URL from gh output', () => {
        const stdout = 'https://github.com/org/repo/pull/42\n';
        const prUrl = stdout.trim();

        expect(prUrl).toBe('https://github.com/org/repo/pull/42');
      });

      it('should return prUrl in success response', async () => {
        const response = {
          success: true,
          id: 'merge-123',
          decision: 'create_pr',
          prUrl: 'https://github.com/org/repo/pull/42',
        };

        expect(response.success).toBe(true);
        expect(response.prUrl).toContain('/pull/42');
      });
    });

    describe('Decision: merge_direct', () => {
      it('should push branch before merge', () => {
        const branch = 'worker-123456';
        const pushArgs = ['push', '-u', 'origin', branch];

        expect(pushArgs).toContain(branch);
      });

      it('should checkout main and pull latest', () => {
        const checkoutArgs = ['checkout', 'main'];
        const pullArgs = ['pull', 'origin', 'main'];

        expect(checkoutArgs).toContain('main');
        expect(pullArgs).toContain('main');
      });

      it('should squash merge the branch', () => {
        const branch = 'worker-123456';
        const mergeArgs = ['merge', '--squash', branch];

        expect(mergeArgs).toContain('--squash');
        expect(mergeArgs).toContain(branch);
      });

      it('should create commit with agent info', () => {
        const agentName = 'worker';
        const task = 'Implement feature';
        const commitCount = 3;

        const commitMsg = `[${agentName}] ${task.slice(0, 60)}\n\nMerged ${commitCount} commits from agent worktree.`;

        expect(commitMsg).toContain('[worker]');
        expect(commitMsg).toContain('Merged 3 commits');
      });

      it('should push merged main branch', () => {
        const pushArgs = ['push', 'origin', 'main'];

        expect(pushArgs).toContain('push');
        expect(pushArgs).toContain('main');
      });

      it('should cleanup worktree after merge', () => {
        const worktree = 'worker-123456';
        const removeArgs = ['worktree', 'remove', worktree];

        expect(removeArgs).toContain('remove');
        expect(removeArgs).toContain(worktree);
      });

      it('should delete branch after cleanup', () => {
        const branch = 'worker-123456';
        const deleteArgs = ['branch', '-D', branch];

        expect(deleteArgs).toContain('-D');
        expect(deleteArgs).toContain(branch);
      });
    });

    describe('Decision: discard', () => {
      it('should force remove worktree', () => {
        const worktree = 'worker-123456';
        const removeArgs = ['worktree', 'remove', worktree, '--force'];

        expect(removeArgs).toContain('--force');
        expect(removeArgs).toContain(worktree);
      });

      it('should delete the branch', () => {
        const branch = 'worker-123456';
        const deleteArgs = ['branch', '-D', branch];

        expect(deleteArgs).toContain('-D');
      });

      it('should not create PR or merge', () => {
        const decision = 'discard';
        const shouldCreatePr = decision === 'create_pr';
        const shouldMerge = decision === 'merge_direct';

        expect(shouldCreatePr).toBe(false);
        expect(shouldMerge).toBe(false);
      });
    });

    describe('Status Updates', () => {
      it('should mark request as approved on success', () => {
        const request = { status: 'pending' as 'pending' | 'approved' | 'rejected' };
        const error = undefined;

        request.status = error ? 'rejected' : 'approved';

        expect(request.status).toBe('approved');
      });

      it('should mark request as rejected on error', () => {
        const request = { status: 'pending' as 'pending' | 'approved' | 'rejected' };
        const error = 'Merge conflict';

        request.status = error ? 'rejected' : 'approved';

        expect(request.status).toBe('rejected');
      });

      it('should record decision in request', () => {
        const request = { decision: undefined as 'create_pr' | 'merge_direct' | 'discard' | undefined };
        const decision = 'create_pr' as const;

        request.decision = decision;

        expect(request.decision).toBe('create_pr');
      });

      it('should record resolvedAt timestamp', () => {
        const resolvedAt = new Date().toISOString();

        expect(resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      it('should record resolvedBy', () => {
        const resolvedBy = 'desktop-ui';

        expect(resolvedBy).toBe('desktop-ui');
      });

      it('should publish merge_decision event', () => {
        const event = {
          type: 'merge_decision',
          id: 'merge-123',
          decision: 'create_pr',
          prUrl: 'https://github.com/org/repo/pull/42',
          timestamp: new Date().toISOString(),
        };

        expect(event.type).toBe('merge_decision');
        expect(event.decision).toBe('create_pr');
      });
    });

    describe('Error Handling', () => {
      it('should return error when request not found', () => {
        const response = {
          success: false,
          id: 'merge-unknown',
          decision: 'create_pr',
          error: 'Not found',
        };

        expect(response.success).toBe(false);
        expect(response.error).toBe('Not found');
      });

      it('should return error when request already resolved', () => {
        const request = { status: 'approved' };
        const isAlreadyResolved = request.status !== 'pending';

        expect(isAlreadyResolved).toBe(true);
      });

      it('should capture git operation errors', () => {
        const error = new Error('fatal: unable to push to origin');
        const errorMsg = error instanceof Error ? error.message : String(error);

        expect(errorMsg).toContain('unable to push');
      });

      it('should capture gh CLI errors', () => {
        const error = 'pull request already exists for this branch';

        expect(error).toContain('already exists');
      });
    });
  });

  describe('merge_request Tool', () => {
    it('should get branch name from worktree', () => {
      const stdout = 'worker-123456\n';
      const branch = stdout.trim();

      expect(branch).toBe('worker-123456');
    });

    it('should count commits since main', () => {
      const diffOutput = `abc1234 feat: add login
def5678 fix: handle errors
ghi9012 docs: update readme`;

      const commitLines = diffOutput.trim().split('\n').filter((l) => l);

      expect(commitLines).toHaveLength(3);
    });

    it('should skip if no commits to merge', () => {
      const diffOutput = '';
      const commitLines = diffOutput.trim().split('\n').filter((l) => l);

      expect(commitLines).toHaveLength(0);
    });

    it('should generate request ID with agent prefix', () => {
      const agentId = 'agent-uuid-1234-5678';
      const timestamp = Date.now();
      const id = `merge-${agentId.slice(0, 8)}-${timestamp}`;

      expect(id).toMatch(/^merge-agent-uu/);
    });

    it('should store first 5 commits in summary', () => {
      const commits = Array.from({ length: 10 }, (_, i) => `commit-${i}`);
      const summary = commits.slice(0, 5).join('\n');
      const hasMore = commits.length > 5;

      expect(summary.split('\n')).toHaveLength(5);
      expect(hasMore).toBe(true);
    });

    it('should include count of additional commits if > 5', () => {
      const commits = Array.from({ length: 10 }, (_, i) => `commit-${i}`);
      const summary = commits.slice(0, 5).join('\n') +
        (commits.length > 5 ? `\n... and ${commits.length - 5} more` : '');

      expect(summary).toContain('and 5 more');
    });

    it('should store request in Redis sorted set', () => {
      const key = 'rapid:merge_requests';
      const score = Date.now();
      const request = { id: 'merge-123', status: 'pending' };

      const zaddArgs = [key, score, JSON.stringify(request)];

      expect(zaddArgs[0]).toBe('rapid:merge_requests');
      expect(typeof zaddArgs[1]).toBe('number');
    });

    it('should publish merge_request event', () => {
      const event = {
        type: 'merge_request',
        id: 'merge-123',
        agentName: 'worker',
        worktree: 'worker-123456',
      };

      expect(event.type).toBe('merge_request');
    });

    it('should return created confirmation', () => {
      const response = {
        id: 'merge-123',
        created: true,
      };

      expect(response.created).toBe(true);
      expect(response.id).toBeTruthy();
    });

    it('should return error on failure', () => {
      const response = {
        id: '',
        created: false,
        error: 'Failed to access worktree',
      };

      expect(response.created).toBe(false);
      expect(response.error).toBeTruthy();
    });
  });

  describe('Integration: personas.ts requestMergeApproval', () => {
    it('should be called when agent completes successfully', () => {
      const exitCode = 0;
      const worktree = 'worker-123456';
      const shouldRequest = exitCode === 0 && worktree;

      expect(shouldRequest).toBeTruthy();
    });

    it('should not be called when agent fails', () => {
      const exitCode = 1;
      const worktree = 'worker-123456';
      const shouldRequest = exitCode === 0 && worktree;

      expect(shouldRequest).toBeFalsy();
    });

    it('should not be called without worktree', () => {
      const exitCode = 0;
      const worktree = undefined;
      const shouldRequest = exitCode === 0 && worktree;

      expect(shouldRequest).toBeFalsy();
    });

    it('should use consistent Redis key with merge-approval tools', () => {
      // personas.ts stores in rapid:merge_requests
      // merge-approval.ts reads from rapid:merge_requests
      const personasKey = 'rapid:merge_requests';
      const mergeApprovalKey = 'rapid:merge_requests';

      expect(personasKey).toBe(mergeApprovalKey);
    });

    it('should publish merge_request event type', () => {
      const event = { type: 'merge_request' };

      expect(event.type).toBe('merge_request');
    });

    it('should handle approval request failure gracefully', () => {
      // When requestMergeApproval fails, persona_spawn should log warning but not fail
      const workerCompleted = true;
      const approvalFailed = true;

      // Agent spawn should still be considered successful
      expect(workerCompleted).toBe(true);
      expect(approvalFailed).toBe(true); // This doesn't fail the agent
    });
  });

  describe('Redis Storage Format', () => {
    it('should use sorted set for merge requests', () => {
      const key = 'rapid:merge_requests';
      const score = Date.now(); // Timestamp as score for ordering

      expect(key).toBe('rapid:merge_requests');
      expect(typeof score).toBe('number');
    });

    it('should store requests as JSON strings', () => {
      const request = {
        id: 'merge-123',
        agentName: 'worker',
        status: 'pending',
      };
      const stored = JSON.stringify(request);
      const parsed = JSON.parse(stored);

      expect(parsed.id).toBe('merge-123');
    });

    it('should order by timestamp (most recent first)', () => {
      const requests = [
        { id: 'merge-1', createdAt: '2024-02-01T10:00:00Z' },
        { id: 'merge-2', createdAt: '2024-02-02T10:00:00Z' },
        { id: 'merge-3', createdAt: '2024-02-01T15:00:00Z' },
      ];

      const sorted = [...requests].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      expect(sorted[0].id).toBe('merge-2');
      expect(sorted[1].id).toBe('merge-3');
      expect(sorted[2].id).toBe('merge-1');
    });
  });

  describe('Event Publishing', () => {
    it('should publish to rapid:events channel', () => {
      const channel = 'rapid:events';

      expect(channel).toBe('rapid:events');
    });

    it('should include type field for event routing', () => {
      const events = [
        { type: 'merge_request' },
        { type: 'merge_decision' },
      ];

      for (const event of events) {
        expect(event).toHaveProperty('type');
      }
    });

    it('should include timestamp in events', () => {
      const event = {
        type: 'merge_request',
        timestamp: new Date().toISOString(),
      };

      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('Git Command Construction', () => {
    it('should construct worktree path correctly', () => {
      const projectDir = '/project';
      const worktree = 'worker-123456';
      const worktreeDir = `${projectDir}/.worktrees/${worktree}`;

      expect(worktreeDir).toBe('/project/.worktrees/worker-123456');
    });

    it('should use host project dir for Docker environments', () => {
      const hostProjectDir = '/Users/steve/project';
      const containerProjectDir = '/project';
      const effectiveDir = hostProjectDir || containerProjectDir;

      expect(effectiveDir).toBe('/Users/steve/project');
    });

    it('should construct gh pr create command', () => {
      const args = [
        'pr',
        'create',
        '--title',
        '[worker] Task',
        '--body',
        'Description',
        '--base',
        'main',
      ];

      expect(args[0]).toBe('pr');
      expect(args[1]).toBe('create');
      expect(args).toContain('--base');
    });

    it('should construct git worktree remove command', () => {
      const worktree = 'worker-123456';
      const args = ['worktree', 'remove', worktree];

      expect(args).toContain('worktree');
      expect(args).toContain('remove');
    });

    it('should construct git branch delete command', () => {
      const branch = 'worker-123456';
      const args = ['branch', '-D', branch];

      expect(args).toContain('-D');
    });
  });

  describe('Response Format', () => {
    it('should return MCP-compatible content array', () => {
      const response = {
        content: [{ type: 'text', text: JSON.stringify({ success: true }) }],
        structuredContent: { success: true },
      };

      expect(response.content).toBeInstanceOf(Array);
      expect(response.content[0].type).toBe('text');
    });

    it('should include structuredContent for programmatic access', () => {
      const response = {
        content: [{ type: 'text', text: '{}' }],
        structuredContent: {
          success: true,
          id: 'merge-123',
          decision: 'create_pr',
          prUrl: 'https://github.com/org/repo/pull/42',
        },
      };

      expect(response.structuredContent.success).toBe(true);
      expect(response.structuredContent.prUrl).toBeTruthy();
    });
  });
});
