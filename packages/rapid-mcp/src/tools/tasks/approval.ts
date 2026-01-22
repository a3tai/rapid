/**
 * Task Approval Tools
 *
 * Tools for human-in-the-loop approval workflow.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../../server.js';
import { createLogger } from '../../utils/logger.js';
import { TaskSchema } from './types.js';
import { getTask, updateTask } from './storage.js';

const logger = createLogger('tasks');

/**
 * Register approval tools with the MCP server
 */
export function registerApprovalTools(server: McpServer, context: ServerContext): void {
  // Tool: Approve pending task
  server.registerTool(
    'task_approve',
    {
      title: 'Approve Task',
      description:
        'Approve a task that requires human-in-the-loop approval. Transitions task from pending_approval to pending status.',
      inputSchema: {
        taskId: z.string().describe('Task ID to approve'),
        approvedBy: z.string().describe('User or agent ID approving the task'),
      },
      outputSchema: {
        task: TaskSchema.optional(),
        approved: z.boolean(),
        message: z.string(),
      },
    },
    async (args) => {
      const { taskId, approvedBy } = args as { taskId: string; approvedBy: string };

      const existingTask = await getTask(taskId);
      if (!existingTask) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { approved: false, message: `Task ${taskId} not found` },
                null,
                2
              ),
            },
          ],
          structuredContent: { approved: false, message: `Task ${taskId} not found` },
        };
      }

      if (existingTask.status !== 'pending_approval') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  approved: false,
                  message: `Task is in ${existingTask.status} status, not pending_approval`,
                },
                null,
                2
              ),
            },
          ],
          structuredContent: {
            approved: false,
            message: `Task is in ${existingTask.status} status, not pending_approval`,
          },
        };
      }

      // Approve the task
      const now = new Date().toISOString();
      const task = await updateTask(
        taskId,
        {
          status: 'pending',
          approvedBy,
          approvedAt: now,
        },
        approvedBy
      );

      if (!task) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { approved: false, message: `Failed to approve task ${taskId}` },
                null,
                2
              ),
            },
          ],
          structuredContent: { approved: false, message: `Failed to approve task ${taskId}` },
        };
      }

      if (context.verbose) {
        logger.debug(`[task_approve] Task ${taskId} approved by ${approvedBy}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { task, approved: true, message: `Task ${taskId} approved successfully` },
              null,
              2
            ),
          },
        ],
        structuredContent: {
          task,
          approved: true,
          message: `Task ${taskId} approved successfully`,
        },
      };
    }
  );

  // Tool: Reject pending task
  server.registerTool(
    'task_reject',
    {
      title: 'Reject Task',
      description: 'Reject a task that requires human-in-the-loop approval. Cancels the task.',
      inputSchema: {
        taskId: z.string().describe('Task ID to reject'),
        rejectedBy: z.string().describe('User or agent ID rejecting the task'),
        reason: z.string().describe('Reason for rejection'),
      },
      outputSchema: {
        task: TaskSchema.optional(),
        rejected: z.boolean(),
        message: z.string(),
      },
    },
    async (args) => {
      const { taskId, rejectedBy, reason } = args as {
        taskId: string;
        rejectedBy: string;
        reason: string;
      };

      const existingTask = await getTask(taskId);
      if (!existingTask) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { rejected: false, message: `Task ${taskId} not found` },
                null,
                2
              ),
            },
          ],
          structuredContent: { rejected: false, message: `Task ${taskId} not found` },
        };
      }

      if (existingTask.status !== 'pending_approval') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  rejected: false,
                  message: `Task is in ${existingTask.status} status, not pending_approval`,
                },
                null,
                2
              ),
            },
          ],
          structuredContent: {
            rejected: false,
            message: `Task is in ${existingTask.status} status, not pending_approval`,
          },
        };
      }

      // Reject the task
      const metadata = {
        ...existingTask.metadata,
        rejectedBy,
        rejectionReason: reason,
      };

      const task = await updateTask(
        taskId,
        {
          status: 'cancelled',
          metadata,
        },
        rejectedBy
      );

      if (!task) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { rejected: false, message: `Failed to reject task ${taskId}` },
                null,
                2
              ),
            },
          ],
          structuredContent: { rejected: false, message: `Failed to reject task ${taskId}` },
        };
      }

      if (context.verbose) {
        logger.debug(`[task_reject] Task ${taskId} rejected by ${rejectedBy}: ${reason}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { task, rejected: true, message: `Task ${taskId} rejected: ${reason}` },
              null,
              2
            ),
          },
        ],
        structuredContent: { task, rejected: true, message: `Task ${taskId} rejected: ${reason}` },
      };
    }
  );
}
