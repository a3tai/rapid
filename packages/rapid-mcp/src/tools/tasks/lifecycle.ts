/**
 * Task Lifecycle Tools
 *
 * Tools for managing task lifecycle: claim, progress, complete, fail, timeouts.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../../server.js';
import { createLogger } from '../../utils/logger.js';
import { TaskSchema, type Task } from './types.js';
import { getTask, updateTask, getAllTasks } from './storage.js';

const logger = createLogger('tasks');

/**
 * Register lifecycle tools with the MCP server
 */
export function registerLifecycleTools(server: McpServer, context: ServerContext): void {
  // Tool: Claim a task
  server.registerTool(
    'task_claim',
    {
      title: 'Claim Task',
      description:
        'Claim a task (assign it to yourself and mark as in_progress). Implements Phase 1 Task Assignment Protocol with capability matching.',
      inputSchema: {
        id: z.string().describe('Task ID to claim'),
        agentId: z.string().describe('Your agent ID'),
        agentName: z.string().optional().describe('Your agent name'),
        agentCapabilities: z.array(z.string()).optional().describe('Your agent capabilities'),
      },
      outputSchema: {
        task: TaskSchema.nullable(),
        claimed: z.boolean(),
        error: z.string().optional(),
        reason: z.string().optional(),
      },
    },
    async (args) => {
      const { id, agentId, agentName, agentCapabilities } = args as {
        id: string;
        agentId: string;
        agentName?: string;
        agentCapabilities?: string[];
      };

      const existingTask = await getTask(id);

      if (!existingTask) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { task: null, claimed: false, error: `Task '${id}' not found` },
        };
      }

      // Phase 1: Check if task is still pending
      if (existingTask.status !== 'pending') {
        const reason =
          existingTask.status === 'in_progress' && existingTask.assignedTo
            ? `already claimed by ${existingTask.assignedTo}`
            : `already ${existingTask.status}`;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Cannot claim task: ${reason}`,
              }),
            },
          ],
          structuredContent: {
            task: existingTask,
            claimed: false,
            error: `Cannot claim task: ${reason}`,
          },
        };
      }

      // Phase 1: Check capability match
      if (existingTask.requiredCapabilities && existingTask.requiredCapabilities.length > 0) {
        if (!agentCapabilities || agentCapabilities.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Agent has no capabilities but task requires: ${existingTask.requiredCapabilities.join(', ')}`,
                }),
              },
            ],
            structuredContent: {
              task: existingTask,
              claimed: false,
              error: `Agent has no capabilities but task requires: ${existingTask.requiredCapabilities.join(', ')}`,
            },
          };
        }

        const missingCaps = existingTask.requiredCapabilities.filter(
          (cap) => !agentCapabilities.includes(cap)
        );
        if (missingCaps.length > 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Agent missing required capabilities: ${missingCaps.join(', ')}`,
                }),
              },
            ],
            structuredContent: {
              task: existingTask,
              claimed: false,
              error: `Agent missing required capabilities: ${missingCaps.join(', ')}`,
            },
          };
        }
      }

      // Phase 1: Atomically claim the task
      const now = new Date().toISOString();
      const claimDeadline = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes from now

      const task = await updateTask(
        id,
        {
          assignedTo: agentId,
          status: 'in_progress',
          claimedAt: now,
          claimDeadline,
          lastProgressAt: now,
        },
        agentId
      );

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Failed to claim task '${id}'` }) }],
          structuredContent: { task: null, claimed: false, error: `Failed to claim task '${id}'` },
        };
      }

      if (context.verbose) {
        logger.debug(
          `[task_claim] Agent ${agentName || agentId} claimed task ${id}${
            task.requiredCapabilities
              ? ` (capabilities: ${task.requiredCapabilities.join(', ')})`
              : ''
          }`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ task, claimed: true }, null, 2) }],
        structuredContent: { task, claimed: true },
      };
    }
  );

  // Tool: Update task progress
  server.registerTool(
    'task_progress',
    {
      title: 'Update Task Progress',
      description:
        'Send progress update for an in-progress task. Phase 1 Task Assignment Protocol.',
      inputSchema: {
        id: z.string().describe('Task ID'),
        progress: z.number().min(0).max(1).describe('Progress percentage (0.0 - 1.0)'),
        message: z.string().optional().describe('Progress message/notes'),
        agentId: z.string().optional().describe('Agent ID sending update'),
      },
      outputSchema: {
        task: TaskSchema.nullable(),
        updated: z.boolean(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const {
        id,
        progress,
        message,
        agentId,
      } = args as {
        id: string;
        progress: number;
        message?: string;
        agentId?: string;
      };

      const existingTask = await getTask(id);

      if (!existingTask) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { task: null, updated: false, error: `Task '${id}' not found` },
        };
      }

      if (existingTask.status !== 'in_progress') {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: `Task '${id}' is not in progress` }) },
          ],
          structuredContent: { task: existingTask, updated: false, error: `Task '${id}' is not in progress` },
        };
      }

      // Phase 1: Update progress timestamp
      const now = new Date().toISOString();

      // Build metadata update
      const metadata = {
        ...existingTask.metadata,
        progressPercentage: progress,
        ...(message ? { lastProgressMessage: message } : {}),
      };

      const task = await updateTask(
        id,
        {
          lastProgressAt: now,
          metadata,
        },
        agentId || 'system'
      );

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Failed to update task '${id}'` }) }],
          structuredContent: { task: null, updated: false, error: `Failed to update task '${id}'` },
        };
      }

      if (context.verbose) {
        logger.debug(
          `[task_progress] Task ${id}: ${Math.round(progress * 100)}%${message ? ` - ${message}` : ''}`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ task, updated: true }, null, 2) }],
        structuredContent: { task, updated: true },
      };
    }
  );

  // Tool: Complete a task
  server.registerTool(
    'task_complete',
    {
      title: 'Complete Task',
      description: 'Mark a task as completed. Phase 1 Task Assignment Protocol. If task is from a worktree, triggers PR creation and merge workflow.',
      inputSchema: {
        id: z.string().describe('Task ID to complete'),
        summary: z.string().optional().describe('Completion summary'),
        result: z.record(z.unknown()).optional().describe('Result data to store'),
        agentId: z.string().optional().describe('Agent ID completing the task'),
        worktree: z.string().optional().describe('Worktree name if this task was completed in a worktree'),
        createPr: z.boolean().optional().describe('Auto-create PR from worktree (default: true if worktree provided)'),
        validateFirst: z.boolean().optional().describe('Run tests/lint before creating PR (default: true)'),
      },
      outputSchema: {
        task: TaskSchema.nullable(),
        completed: z.boolean(),
        worktreeMergeInitiated: z.boolean().optional(),
        prNumber: z.number().optional(),
        validationPassed: z.boolean().optional(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const {
        id,
        summary,
        result,
        agentId,
        worktree,
        createPr = worktree ? true : false,
        validateFirst = true,
      } = args as {
        id: string;
        summary?: string;
        result?: Record<string, unknown>;
        agentId?: string;
        worktree?: string;
        createPr?: boolean;
        validateFirst?: boolean;
      };

      const existingTask = await getTask(id);

      if (!existingTask) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { task: null, completed: false, error: `Task '${id}' not found` },
        };
      }

      const now = new Date().toISOString();

      // Build metadata
      let metadata = { ...existingTask.metadata };
      if (summary) {
        metadata.completionSummary = summary;
      }
      if (worktree) {
        metadata.worktree = worktree;
        metadata.mergeWorkflowInitiated = true;
        metadata.mergeWorkflowInitiatedAt = now;
      }

      let task = await updateTask(
        id,
        {
          status: 'completed',
          result,
          metadata,
        },
        agentId || 'system'
      );

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Failed to complete task '${id}'` }) }],
          structuredContent: { task: null, completed: false, error: `Failed to complete task '${id}'` },
        };
      }

      if (context.verbose) {
        logger.debug(`[task_complete] Completed task ${id}${summary ? ` - ${summary}` : ''}`);
      }

      // If worktree is provided, initiate merge workflow
      let worktreeMergeInitiated = false;
      const validationPassed = false;
      let prNumber: number | undefined;

      if (worktree && createPr) {
        logger.info(`[task_complete] Initiating worktree merge workflow for '${worktree}'`);
        worktreeMergeInitiated = true;

        // Note: The actual PR creation will be handled via bus_send or separate workflow
        // Store the merge workflow state in task metadata
        metadata = {
          ...metadata,
          needsMergeWorkflow: true,
          validateFirst,
        };
        task = await updateTask(id, { metadata }, agentId || 'system');
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ task, completed: true, worktreeMergeInitiated }, null, 2) }],
        structuredContent: {
          task,
          completed: true,
          worktreeMergeInitiated,
          validationPassed,
          prNumber,
        },
      };
    }
  );

  // Tool: Fail a task
  server.registerTool(
    'task_fail',
    {
      title: 'Fail Task',
      description:
        'Mark a task as failed with error information. Phase 1 Task Assignment Protocol.',
      inputSchema: {
        id: z.string().describe('Task ID'),
        error: z.string().describe('Error message'),
        errorCode: z.string().optional().describe('Error code'),
        canRetry: z.boolean().default(true).describe('Whether task can be retried'),
        agentId: z.string().optional().describe('Agent ID that encountered error'),
      },
      outputSchema: {
        task: TaskSchema.nullable(),
        failed: z.boolean(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const {
        id,
        error,
        errorCode,
        canRetry,
        agentId,
      } = args as {
        id: string;
        error: string;
        errorCode?: string;
        canRetry?: boolean;
        agentId?: string;
      };

      const existingTask = await getTask(id);

      if (!existingTask) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { task: null, failed: false, error: `Task '${id}' not found` },
        };
      }

      const now = new Date().toISOString();
      const newAttemptNumber = (existingTask.attemptNumber ?? 1) + 1;

      const metadata = {
        ...existingTask.metadata,
        lastError: error,
        lastErrorAt: now,
      };

      const task = await updateTask(
        id,
        {
          status: 'pending', // Reset to pending for retry
          errorCode,
          canRetry: canRetry ?? true,
          attemptNumber: newAttemptNumber,
          assignedTo: undefined, // Release from agent
          metadata,
        },
        agentId || 'system'
      );

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Failed to update task '${id}'` }) }],
          structuredContent: { task: null, failed: false, error: `Failed to update task '${id}'` },
        };
      }

      if (context.verbose) {
        logger.debug(
          `[task_fail] Task ${id} failed (attempt ${newAttemptNumber}): ${error}${canRetry ? ' (can retry)' : ' (no retry)'}`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ task, failed: true }, null, 2) }],
        structuredContent: { task, failed: true },
      };
    }
  );

  // Tool: Detect timeouts (Phase 1)
  server.registerTool(
    'task_detect_timeouts',
    {
      title: 'Detect Task Timeouts',
      description:
        'Detect and release tasks with claim or progress timeouts. Phase 1 Task Assignment Protocol timeout detection.',
      inputSchema: {
        progressTimeoutSeconds: z
          .number()
          .default(60)
          .describe('Seconds without progress before timeout'),
        claimTimeoutSeconds: z
          .number()
          .default(300)
          .describe('Seconds to complete claim and start progress'),
      },
      outputSchema: {
        timedOut: z.array(
          z.object({
            taskId: z.string(),
            reason: z.string(),
            wasAssignedTo: z.string().optional(),
          })
        ),
        count: z.number(),
      },
    },
    async (args) => {
      const { progressTimeoutSeconds = 60, claimTimeoutSeconds: _claimTimeoutSeconds = 300 } =
        args as {
          progressTimeoutSeconds?: number;
          claimTimeoutSeconds?: number;
        };

      const timedOut: Array<{
        taskId: string;
        reason: string;
        wasAssignedTo?: string;
      }> = [];
      const now = Date.now();

      const allTasks = await getAllTasks();
      for (const task of allTasks) {
        if (task.status !== 'in_progress') {
          continue; // Only check in-progress tasks
        }

        // Check claim deadline: task must show progress within 5 minutes of claiming
        if (task.claimedAt && task.claimDeadline) {
          const claimDeadlineTime = new Date(task.claimDeadline).getTime();
          if (now > claimDeadlineTime) {
            // Claim timeout: agent claimed but never started working
            const timeout: { taskId: string; reason: string; wasAssignedTo?: string } = {
              taskId: task.id,
              reason: 'claim_timeout',
            };
            if (task.assignedTo) timeout.wasAssignedTo = task.assignedTo;
            timedOut.push(timeout);

            const metadata = {
              ...task.metadata,
              timeoutReason: 'claim_timeout',
            };

            await updateTask(
              task.id,
              {
                status: 'pending',
                assignedTo: undefined,
                claimedAt: undefined,
                claimDeadline: undefined,
                metadata,
              },
              'system'
            );
            continue;
          }
        }

        // Check progress timeout: no progress updates for N seconds
        if (task.lastProgressAt) {
          const lastProgressTime = new Date(task.lastProgressAt).getTime();
          const timeSinceProgress = (now - lastProgressTime) / 1000;

          if (timeSinceProgress > progressTimeoutSeconds) {
            // Progress timeout: no updates from agent
            const timeout: { taskId: string; reason: string; wasAssignedTo?: string } = {
              taskId: task.id,
              reason: `progress_timeout_${Math.floor(timeSinceProgress)}s`,
            };
            if (task.assignedTo) timeout.wasAssignedTo = task.assignedTo;
            timedOut.push(timeout);

            const metadata = {
              ...task.metadata,
              timeoutReason: 'progress_timeout',
            };

            await updateTask(
              task.id,
              {
                status: 'pending',
                assignedTo: undefined,
                claimedAt: undefined,
                claimDeadline: undefined,
                metadata,
              },
              'system'
            );
          }
        }
      }

      if (context.verbose && timedOut.length > 0) {
        logger.debug(`[task_detect_timeouts] Found ${timedOut.length} timed-out tasks`);
        for (const item of timedOut) {
          logger.debug(
            `  - Task ${item.taskId}: ${item.reason}${item.wasAssignedTo ? ` (was assigned to ${item.wasAssignedTo})` : ''}`
          );
        }
      }

      return {
        content: [
          { type: 'text', text: JSON.stringify({ timedOut, count: timedOut.length }, null, 2) },
        ],
        structuredContent: { timedOut, count: timedOut.length },
      };
    }
  );
}
