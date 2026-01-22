/**
 * Merge Approval Tools
 *
 * HITL (Human-in-the-Loop) approval workflow for agent worktree merges.
 * When an agent completes work in a worktree, this system lets humans
 * or orchestrators decide how to handle the changes:
 *
 * 1. Create PR - Push branch and create pull request for review
 * 2. Merge directly - Squash merge directly to main
 * 3. Discard - Clean up worktree and throw away changes
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execa } from 'execa';
import { join } from 'node:path';
import type { Redis as RedisType } from 'ioredis';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('merge-approval');

/**
 * Merge request stored in Redis
 */
interface MergeRequest {
  id: string;
  agentId: string;
  agentName: string;
  worktree: string;
  branch: string;
  task: string;
  commitCount: number;
  commitSummary: string;
  projectDir: string;
  status: 'pending' | 'approved' | 'rejected';
  decision?: 'create_pr' | 'merge_direct' | 'discard';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  prUrl?: string;
  error?: string;
}

const MERGE_REQUESTS_KEY = 'rapid:merge_requests';

/**
 * Get Redis client using dynamic import to avoid bundling issues
 * Supports both REDIS_URL (for Docker) and REDIS_HOST/REDIS_PORT (for local)
 */
async function getRedis(): Promise<RedisType> {
  const Redis = (await import('ioredis')).default;

  // Check for REDIS_URL first (Docker environments)
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    return new Redis(redisUrl);
  }

  // Fall back to REDIS_HOST/REDIS_PORT (local environments)
  return new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  });
}

/**
 * Register merge approval tools with the MCP server
 */
export function registerMergeApprovalTools(server: McpServer, context: ServerContext): void {
  /**
   * List pending merge requests
   */
  server.registerTool(
    'merge_list',
    {
      title: 'List Merge Requests',
      description:
        'List pending and resolved merge requests from completed agents. ' +
        'Use this to see which agent worktrees are waiting for merge decisions.',
      inputSchema: {
        status: z
          .enum(['pending', 'approved', 'rejected', 'all'])
          .default('pending')
          .describe('Filter by status'),
        limit: z.number().min(1).max(100).default(20).describe('Maximum results'),
      },
      outputSchema: {
        requests: z.array(
          z.object({
            id: z.string(),
            agentId: z.string(),
            agentName: z.string(),
            worktree: z.string(),
            branch: z.string(),
            task: z.string(),
            commitCount: z.number(),
            status: z.string(),
            decision: z.string().optional(),
            createdAt: z.string(),
            prUrl: z.string().optional(),
          })
        ),
        pendingCount: z.number(),
      },
    },
    async (args) => {
      const { status, limit } = args as {
        status: 'pending' | 'approved' | 'rejected' | 'all';
        limit: number;
      };

      const redis = await getRedis();
      try {
        // Get all merge requests from sorted set
        const items = await redis.zrevrange(MERGE_REQUESTS_KEY, 0, -1);
        let requests: MergeRequest[] = items.map((item) => JSON.parse(item));

        // Filter by status
        if (status !== 'all') {
          requests = requests.filter((r) => r.status === status);
        }

        // Count pending
        const pendingCount = requests.filter((r) => r.status === 'pending').length;

        // Apply limit
        requests = requests.slice(0, limit);

        const output = {
          requests: requests.map((r) => ({
            id: r.id,
            agentId: r.agentId,
            agentName: r.agentName,
            worktree: r.worktree,
            branch: r.branch,
            task: r.task,
            commitCount: r.commitCount,
            status: r.status,
            decision: r.decision,
            createdAt: r.createdAt,
            prUrl: r.prUrl,
          })),
          pendingCount,
        };

        if (context.verbose) {
          logger.debug(`[merge_list] Found ${requests.length} requests (${pendingCount} pending)`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } finally {
        await redis.quit();
      }
    }
  );

  /**
   * Respond to a merge request with a decision
   */
  server.registerTool(
    'merge_decide',
    {
      title: 'Decide Merge Request',
      description:
        'Decide how to handle a completed agent worktree. ' +
        'Options: create_pr (create pull request), merge_direct (squash to main), discard (throw away).',
      inputSchema: {
        id: z.string().describe('Merge request ID'),
        decision: z
          .enum(['create_pr', 'merge_direct', 'discard'])
          .describe('How to handle the changes'),
        resolvedBy: z.string().default('desktop-ui').describe('Who made this decision'),
      },
      outputSchema: {
        success: z.boolean(),
        id: z.string(),
        decision: z.string(),
        prUrl: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { id, decision, resolvedBy } = args as {
        id: string;
        decision: 'create_pr' | 'merge_direct' | 'discard';
        resolvedBy: string;
      };

      const redis = await getRedis();
      try {
        // Find the merge request
        const items = await redis.zrevrange(MERGE_REQUESTS_KEY, 0, -1);
        const requests: MergeRequest[] = items.map((item) => JSON.parse(item));
        const request = requests.find((r) => r.id === id);

        if (!request) {
          return {
            content: [{ type: 'text', text: `Merge request ${id} not found` }],
            structuredContent: { success: false, id, decision, error: 'Not found' },
          };
        }

        if (request.status !== 'pending') {
          return {
            content: [{ type: 'text', text: `Merge request ${id} already resolved` }],
            structuredContent: { success: false, id, decision, error: 'Already resolved' },
          };
        }

        logger.info(`[merge_decide] Processing decision '${decision}' for ${id}`);

        let prUrl: string | undefined;
        let error: string | undefined;

        const worktreeDir = join(request.projectDir, '.worktrees', request.worktree);

        try {
          switch (decision) {
            case 'create_pr': {
              // Push branch and create PR
              await execa('git', ['push', '-u', 'origin', request.branch], {
                cwd: worktreeDir,
                reject: false,
              });

              const prTitle = `[${request.agentName}] ${request.task.slice(0, 60)}`;
              const prBody = `## Agent Work Complete

Agent \`${request.agentName}\` completed:
> ${request.task}

### Commits (${request.commitCount})
${request.commitSummary}

---
*Created via RAPID merge approval*`;

              const { stdout } = await execa(
                'gh',
                ['pr', 'create', '--title', prTitle, '--body', prBody, '--base', 'main'],
                { cwd: request.projectDir }
              );
              prUrl = stdout.trim();
              logger.info(`[merge_decide] Created PR: ${prUrl}`);
              break;
            }

            case 'merge_direct': {
              // Push branch then merge
              await execa('git', ['push', '-u', 'origin', request.branch], {
                cwd: worktreeDir,
                reject: false,
              });

              // Checkout main and merge
              await execa('git', ['checkout', 'main'], { cwd: request.projectDir });
              await execa('git', ['pull', 'origin', 'main'], { cwd: request.projectDir });
              await execa('git', ['merge', '--squash', request.branch], { cwd: request.projectDir });

              const commitMsg = `[${request.agentName}] ${request.task.slice(0, 60)}\n\nMerged ${request.commitCount} commits from agent worktree.`;
              await execa('git', ['commit', '-m', commitMsg], { cwd: request.projectDir });
              await execa('git', ['push', 'origin', 'main'], { cwd: request.projectDir });

              // Cleanup worktree
              await execa('git', ['worktree', 'remove', request.worktree], {
                cwd: request.projectDir,
                reject: false,
              });
              await execa('git', ['branch', '-D', request.branch], {
                cwd: request.projectDir,
                reject: false,
              });

              logger.info(`[merge_decide] Merged directly to main and cleaned up`);
              break;
            }

            case 'discard': {
              // Just cleanup the worktree
              await execa('git', ['worktree', 'remove', request.worktree, '--force'], {
                cwd: request.projectDir,
                reject: false,
              });
              await execa('git', ['branch', '-D', request.branch], {
                cwd: request.projectDir,
                reject: false,
              });
              logger.info(`[merge_decide] Discarded worktree ${request.worktree}`);
              break;
            }
          }
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          logger.error(`[merge_decide] Error executing ${decision}: ${error}`);
        }

        // Update request status
        request.status = error ? 'rejected' : 'approved';
        request.decision = decision;
        request.resolvedAt = new Date().toISOString();
        request.resolvedBy = resolvedBy;
        if (prUrl) request.prUrl = prUrl;
        if (error) request.error = error;

        // Remove old entry and add updated one
        await redis.zrem(MERGE_REQUESTS_KEY, items[requests.indexOf(request)]);
        await redis.zadd(MERGE_REQUESTS_KEY, Date.now(), JSON.stringify(request));

        // Publish event for UI updates
        await redis.publish(
          'rapid:events',
          JSON.stringify({
            type: 'merge_decision',
            id,
            decision,
            prUrl,
            error,
            timestamp: new Date().toISOString(),
          })
        );

        const output = {
          success: !error,
          id,
          decision,
          prUrl,
          error,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } finally {
        await redis.quit();
      }
    }
  );

  /**
   * Create a merge request (called by persona_spawn on completion)
   */
  server.registerTool(
    'merge_request',
    {
      title: 'Create Merge Request',
      description:
        'Create a merge request for an agent worktree. ' +
        'Called automatically when agents complete their work.',
      inputSchema: {
        agentId: z.string().describe('Agent ID'),
        agentName: z.string().describe('Agent name (persona)'),
        worktree: z.string().describe('Worktree name'),
        task: z.string().describe('Task description'),
        projectDir: z.string().describe('Project directory'),
      },
      outputSchema: {
        id: z.string(),
        created: z.boolean(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { agentId, agentName, worktree, task, projectDir } = args as {
        agentId: string;
        agentName: string;
        worktree: string;
        task: string;
        projectDir: string;
      };

      const redis = await getRedis();
      try {
        const worktreeDir = join(projectDir, '.worktrees', worktree);

        // Get branch name
        const { stdout: branch } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: worktreeDir,
        });

        // Get commit info
        const { stdout: diffOutput } = await execa(
          'git',
          ['log', 'origin/main..HEAD', '--oneline'],
          { cwd: worktreeDir, reject: false }
        );

        const commitLines = diffOutput.trim().split('\n').filter((l) => l);
        if (commitLines.length === 0) {
          return {
            content: [{ type: 'text', text: 'No commits to merge' }],
            structuredContent: { id: '', created: false, error: 'No commits' },
          };
        }

        const id = `merge-${agentId.slice(0, 8)}-${Date.now()}`;

        const request: MergeRequest = {
          id,
          agentId,
          agentName,
          worktree,
          branch: branch.trim(),
          task,
          commitCount: commitLines.length,
          commitSummary: commitLines.slice(0, 5).join('\n'),
          projectDir,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };

        // Store in Redis sorted set
        await redis.zadd(MERGE_REQUESTS_KEY, Date.now(), JSON.stringify(request));

        // Publish event for UI notification
        await redis.publish(
          'rapid:events',
          JSON.stringify({
            type: 'merge_request',
            ...request,
          })
        );

        logger.info(`[merge_request] Created merge request ${id} for ${worktree}`);

        return {
          content: [{ type: 'text', text: `Merge request ${id} created` }],
          structuredContent: { id, created: true },
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error(`[merge_request] Failed: ${error}`);
        return {
          content: [{ type: 'text', text: `Failed: ${error}` }],
          structuredContent: { id: '', created: false, error },
        };
      } finally {
        await redis.quit();
      }
    }
  );
}
