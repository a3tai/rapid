/**
 * Task CRUD Tools
 *
 * Tools for creating, reading, updating, and deleting tasks.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { ServerContext } from '../../server.js';
import { createLogger } from '../../utils/logger.js';
import {
  TaskSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from './types.js';
import {
  getTask,
  createTask,
  updateTask,
  deleteTask,
  getAllTasks,
  filterTasks,
} from './storage.js';

const logger = createLogger('tasks');

/**
 * Register CRUD tools with the MCP server
 */
export function registerCrudTools(server: McpServer, context: ServerContext): void {
  // Tool: Create a task
  server.registerTool(
    'task_create',
    {
      title: 'Create Task',
      description:
        'Create a new task for tracking work. Supports Phase 1 Task Assignment Protocol with capabilities and deadlines.',
      inputSchema: {
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Detailed description'),
        priority: TaskPrioritySchema.default('normal').describe('Task priority'),
        assignedTo: z.string().optional().describe('Agent ID or name to assign to'),
        parentId: z.string().optional().describe('Parent task ID for subtasks'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
        createdBy: z.string().describe('Agent ID or name creating the task'),
        // Phase 1 fields
        deadline: z.string().optional().describe('ISO8601 deadline for task completion'),
        requiredCapabilities: z
          .array(z.string())
          .optional()
          .describe('Required agent capabilities (e.g., ["read", "write", "bash"])'),
        estimatedDuration: z.number().optional().describe('Estimated seconds to complete'),
        dependencies: z.array(z.string()).optional().describe('Task IDs that must complete first'),
        // Human-in-the-Loop approval fields
        requiresApproval: z
          .boolean()
          .optional()
          .describe('Whether task requires human approval before work can begin'),
        approvalType: z
          .enum(['before_claim', 'before_commit', 'before_deploy'])
          .optional()
          .describe('When approval is needed'),
        approvalReason: z.string().optional().describe('Reason why approval is required'),
      },
      outputSchema: {
        task: TaskSchema,
        created: z.boolean(),
      },
    },
    async (args) => {
      const {
        title,
        description,
        priority = 'normal',
        assignedTo,
        parentId,
        tags,
        createdBy,
        deadline,
        requiredCapabilities,
        estimatedDuration,
        dependencies,
        requiresApproval,
        approvalType,
        approvalReason,
      } = args as {
        title: string;
        description?: string;
        priority?: TaskPriority;
        assignedTo?: string;
        parentId?: string;
        tags?: string[];
        createdBy: string;
        deadline?: string;
        requiredCapabilities?: string[];
        estimatedDuration?: number;
        dependencies?: string[];
        requiresApproval?: boolean;
        approvalType?: 'before_claim' | 'before_commit' | 'before_deploy';
        approvalReason?: string;
      };

      const now = new Date().toISOString();
      const initialStatus = requiresApproval ? 'pending_approval' : 'pending';

      const taskInput: Task = {
        id: randomUUID(),
        title,
        description,
        status: initialStatus,
        priority,
        createdAt: now,
        updatedAt: now,
        createdBy,
        assignedTo,
        parentId,
        tags,
        deadline,
        requiredCapabilities,
        estimatedDuration,
        dependencies,
        attemptNumber: 1,
        requiresApproval,
        approvalType,
        approvalReason,
      };

      const task = await createTask(taskInput, createdBy);

      if (context.verbose) {
        logger.debug(
          `[task_create] Created task ${task.id}: ${title}${requiredCapabilities ? ` [${requiredCapabilities.join(', ')}]` : ''}`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ task, created: true }, null, 2) }],
        structuredContent: { task, created: true },
      };
    }
  );

  // Tool: List tasks
  server.registerTool(
    'task_list',
    {
      title: 'List Tasks',
      description: 'List tasks with optional filtering.',
      inputSchema: {
        status: TaskStatusSchema.optional().describe('Filter by status'),
        assignedTo: z.string().optional().describe('Filter by assigned agent'),
        createdBy: z.string().optional().describe('Filter by creator'),
        parentId: z.string().optional().describe('Filter by parent (subtasks)'),
        tags: z.array(z.string()).optional().describe('Filter by tags (any match)'),
      },
      outputSchema: {
        tasks: z.array(TaskSchema),
        count: z.number(),
      },
    },
    async (args) => {
      const { status, assignedTo, createdBy, parentId, tags } = args as {
        status?: TaskStatus;
        assignedTo?: string;
        createdBy?: string;
        parentId?: string;
        tags?: string[];
      };

      let filtered = await filterTasks({ status, assignedTo, createdBy, parentId, tags });

      // Sort by priority (urgent first) then by creation date
      const priorityOrder: Record<TaskPriority, number> = {
        urgent: 0,
        high: 1,
        normal: 2,
        low: 3,
      };
      filtered.sort((a, b) => {
        const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (pDiff !== 0) return pDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      const output = { tasks: filtered, count: filtered.length };

      if (context.verbose) {
        logger.debug(`[task_list] Found ${filtered.length} tasks`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Update task
  server.registerTool(
    'task_update',
    {
      title: 'Update Task',
      description: 'Update an existing task.',
      inputSchema: {
        id: z.string().describe('Task ID to update'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        status: TaskStatusSchema.optional().describe('New status'),
        priority: TaskPrioritySchema.optional().describe('New priority'),
        assignedTo: z.string().optional().describe('New assignee'),
        tags: z.array(z.string()).optional().describe('New tags'),
      },
      outputSchema: {
        task: TaskSchema.nullable(),
        updated: z.boolean(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { id, ...updates } = args as {
        id: string;
        title?: string;
        description?: string;
        status?: TaskStatus;
        priority?: TaskPriority;
        assignedTo?: string;
        tags?: string[];
      };

      const existingTask = await getTask(id);

      if (!existingTask) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { task: null, updated: false, error: `Task '${id}' not found` },
        };
      }

      // Apply updates using the storage adapter
      const task = await updateTask(id, updates, 'system');

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Failed to update task '${id}'` }) }],
          structuredContent: { task: null, updated: false, error: `Failed to update task '${id}'` },
        };
      }

      if (context.verbose) {
        logger.debug(`[task_update] Updated task ${id}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ task, updated: true }, null, 2) }],
        structuredContent: { task, updated: true },
      };
    }
  );

  // Tool: Delete task
  server.registerTool(
    'task_delete',
    {
      title: 'Delete Task',
      description: 'Delete a task by ID.',
      inputSchema: {
        id: z.string().describe('Task ID to delete'),
      },
      outputSchema: {
        deleted: z.boolean(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { id } = args as { id: string };

      const existingTask = await getTask(id);
      if (!existingTask) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { deleted: false, error: `Task '${id}' not found` },
        };
      }

      const deleted = await deleteTask(id, 'system');

      if (context.verbose) {
        logger.debug(`[task_delete] Deleted task ${id}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ deleted }) }],
        structuredContent: { deleted },
      };
    }
  );

  // Tool: Get task by ID
  server.registerTool(
    'task_get',
    {
      title: 'Get Task',
      description: 'Get a specific task by ID, including subtasks.',
      inputSchema: {
        id: z.string().describe('Task ID'),
        includeSubtasks: z.boolean().default(true).describe('Include subtasks'),
      },
      outputSchema: {
        task: TaskSchema.nullable(),
        subtasks: z.array(TaskSchema).optional(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { id, includeSubtasks = true } = args as { id: string; includeSubtasks?: boolean };

      const task = await getTask(id);

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { task: null, error: `Task '${id}' not found` },
        };
      }

      let subtasks: Task[] | undefined;
      if (includeSubtasks) {
        const allTasks = await getAllTasks();
        subtasks = allTasks.filter((t) => t.parentId === id);
      }

      const output = { task, subtasks };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
