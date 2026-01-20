/**
 * Task Management Tools
 *
 * MCP tools for managing tasks across agents. Agents can create,
 * update, and track tasks, enabling coordination and progress tracking.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ServerContext } from '../server.js';

// Task status enum
const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'blocked', 'cancelled']);
type TaskStatus = z.infer<typeof TaskStatusSchema>;

// Task priority enum
const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
type TaskPriority = z.infer<typeof TaskPrioritySchema>;

// Task schema - includes Phase 1 Task Assignment Protocol fields
const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(), // Agent ID or name
  assignedTo: z.string().optional(), // Agent ID or name
  parentId: z.string().optional(), // For subtasks
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  // Phase 1: Task Assignment Protocol fields
  deadline: z.string().optional(), // ISO8601 timestamp when task must complete
  claimedAt: z.string().optional(), // When task was claimed
  claimDeadline: z.string().optional(), // 5-min timeout from claim for starting progress
  lastProgressAt: z.string().optional(), // When last progress update was sent
  requiredCapabilities: z.array(z.string()).optional(), // Capabilities agent must have
  estimatedDuration: z.number().optional(), // Seconds
  dependencies: z.array(z.string()).optional(), // Task IDs that must complete first
  result: z.record(z.unknown()).optional(), // Result data on completion
  errorCode: z.string().optional(), // Error code if failed
  canRetry: z.boolean().optional(), // Whether task can be retried
  attemptNumber: z.number().optional(), // Current attempt number
});

type Task = z.infer<typeof TaskSchema>;

// In-memory task store
const tasks = new Map<string, Task>();

// File path for persistence
let tasksFilePath: string;

/**
 * Load tasks from disk
 */
async function loadTasks(projectDir: string): Promise<void> {
  tasksFilePath = join(projectDir, '.rapid', 'tasks.json');
  try {
    const content = await readFile(tasksFilePath, 'utf-8');
    const loaded = JSON.parse(content) as Task[];
    for (const task of loaded) {
      tasks.set(task.id, task);
    }
  } catch {
    // File doesn't exist yet, that's ok
  }
}

/**
 * Save tasks to disk
 */
async function saveTasks(): Promise<void> {
  const taskList = Array.from(tasks.values());
  const dir = join(tasksFilePath, '..');
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // Directory may exist
  }
  await writeFile(tasksFilePath, JSON.stringify(taskList, null, 2), 'utf-8');
}

/**
 * Register task management tools with the MCP server
 */
export function registerTaskTools(server: McpServer, context: ServerContext): void {
  // Initialize task store
  loadTasks(context.projectDir).catch(console.error);

  // Tool: Create a task
  server.registerTool(
    'task_create',
    {
      title: 'Create Task',
      description: 'Create a new task for tracking work. Supports Phase 1 Task Assignment Protocol with capabilities and deadlines.',
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
        requiredCapabilities: z.array(z.string()).optional().describe('Required agent capabilities (e.g., ["read", "write", "bash"])'),
        estimatedDuration: z.number().optional().describe('Estimated seconds to complete'),
        dependencies: z.array(z.string()).optional().describe('Task IDs that must complete first'),
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
      };

      const now = new Date().toISOString();
      const task: Task = {
        id: randomUUID(),
        title,
        description,
        status: 'pending',
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
      };

      tasks.set(task.id, task);
      await saveTasks();

      if (context.verbose) {
        console.error(`[task_create] Created task ${task.id}: ${title}${requiredCapabilities ? ` [${requiredCapabilities.join(', ')}]` : ''}`);
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

      let filtered = Array.from(tasks.values());

      if (status) {
        filtered = filtered.filter((t) => t.status === status);
      }
      if (assignedTo) {
        filtered = filtered.filter((t) => t.assignedTo === assignedTo);
      }
      if (createdBy) {
        filtered = filtered.filter((t) => t.createdBy === createdBy);
      }
      if (parentId) {
        filtered = filtered.filter((t) => t.parentId === parentId);
      }
      if (tags && tags.length > 0) {
        filtered = filtered.filter((t) => t.tags?.some((tag) => tags.includes(tag)));
      }

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
        console.error(`[task_list] Found ${filtered.length} tasks`);
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

      const task = tasks.get(id);

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { task: null, updated: false, error: `Task '${id}' not found` },
        };
      }

      // Apply updates
      if (updates.title !== undefined) task.title = updates.title;
      if (updates.description !== undefined) task.description = updates.description;
      if (updates.status !== undefined) task.status = updates.status;
      if (updates.priority !== undefined) task.priority = updates.priority;
      if (updates.assignedTo !== undefined) task.assignedTo = updates.assignedTo;
      if (updates.tags !== undefined) task.tags = updates.tags;
      task.updatedAt = new Date().toISOString();

      await saveTasks();

      if (context.verbose) {
        console.error(`[task_update] Updated task ${id}`);
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

      if (!tasks.has(id)) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { deleted: false, error: `Task '${id}' not found` },
        };
      }

      tasks.delete(id);
      await saveTasks();

      if (context.verbose) {
        console.error(`[task_delete] Deleted task ${id}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ deleted: true }) }],
        structuredContent: { deleted: true },
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

      const task = tasks.get(id);

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { task: null, error: `Task '${id}' not found` },
        };
      }

      let subtasks: Task[] | undefined;
      if (includeSubtasks) {
        subtasks = Array.from(tasks.values()).filter((t) => t.parentId === id);
      }

      const output = { task, subtasks };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Claim a task
  server.registerTool(
    'task_claim',
    {
      title: 'Claim Task',
      description: "Claim a task (assign it to yourself and mark as in_progress). Implements Phase 1 Task Assignment Protocol with capability matching.",
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

      const task = tasks.get(id);

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { task: null, claimed: false, error: `Task '${id}' not found` },
        };
      }

      // Phase 1: Check if task is still pending
      if (task.status !== 'pending') {
        const reason = task.status === 'in_progress' && task.assignedTo
          ? `already claimed by ${task.assignedTo}`
          : `already ${task.status}`;
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
            task,
            claimed: false,
            error: `Cannot claim task: ${reason}`,
          },
        };
      }

      // Phase 1: Check capability match
      if (task.requiredCapabilities && task.requiredCapabilities.length > 0) {
        if (!agentCapabilities || agentCapabilities.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Agent has no capabilities but task requires: ${task.requiredCapabilities.join(', ')}`,
                }),
              },
            ],
            structuredContent: {
              task,
              claimed: false,
              error: `Agent has no capabilities but task requires: ${task.requiredCapabilities.join(', ')}`,
            },
          };
        }

        const missingCaps = task.requiredCapabilities.filter(
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
              task,
              claimed: false,
              error: `Agent missing required capabilities: ${missingCaps.join(', ')}`,
            },
          };
        }
      }

      // Phase 1: Atomically claim the task
      const now = new Date().toISOString();
      const claimDeadline = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes from now

      task.assignedTo = agentId;
      task.status = 'in_progress';
      task.claimedAt = now;
      task.claimDeadline = claimDeadline;
      task.lastProgressAt = now;
      task.updatedAt = now;

      await saveTasks();

      if (context.verbose) {
        console.error(
          `[task_claim] Agent ${agentName || agentId} claimed task ${id}${
            task.requiredCapabilities ? ` (capabilities: ${task.requiredCapabilities.join(', ')})` : ''
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
      description: 'Send progress update for an in-progress task. Phase 1 Task Assignment Protocol.',
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
      const { id, progress, message, agentId: _agentId } = args as {
        id: string;
        progress: number;
        message?: string;
        agentId?: string;
      };

      const task = tasks.get(id);

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { task: null, updated: false, error: `Task '${id}' not found` },
        };
      }

      if (task.status !== 'in_progress') {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' is not in progress` }) }],
          structuredContent: { task, updated: false, error: `Task '${id}' is not in progress` },
        };
      }

      // Phase 1: Update progress timestamp
      const now = new Date().toISOString();
      task.lastProgressAt = now;
      task.updatedAt = now;

      // Store progress in metadata
      if (!task.metadata) {
        task.metadata = {};
      }
      task.metadata.progressPercentage = progress;
      if (message) {
        task.metadata.lastProgressMessage = message;
      }

      await saveTasks();

      if (context.verbose) {
        console.error(`[task_progress] Task ${id}: ${Math.round(progress * 100)}%${message ? ` - ${message}` : ''}`);
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
      description: 'Mark a task as completed. Phase 1 Task Assignment Protocol.',
      inputSchema: {
        id: z.string().describe('Task ID to complete'),
        summary: z.string().optional().describe('Completion summary'),
        result: z.record(z.unknown()).optional().describe('Result data to store'),
        agentId: z.string().optional().describe('Agent ID completing the task'),
      },
      outputSchema: {
        task: TaskSchema.nullable(),
        completed: z.boolean(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { id, summary, result, agentId: _agentId } = args as {
        id: string;
        summary?: string;
        result?: Record<string, unknown>;
        agentId?: string;
      };

      const task = tasks.get(id);

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { task: null, completed: false, error: `Task '${id}' not found` },
        };
      }

      const now = new Date().toISOString();
      task.status = 'completed';
      task.updatedAt = now;
      task.result = result;

      if (summary) {
        task.metadata = { ...task.metadata, completionSummary: summary };
      }

      await saveTasks();

      if (context.verbose) {
        console.error(`[task_complete] Completed task ${id}${summary ? ` - ${summary}` : ''}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ task, completed: true }, null, 2) }],
        structuredContent: { task, completed: true },
      };
    }
  );

  // Tool: Fail a task
  server.registerTool(
    'task_fail',
    {
      title: 'Fail Task',
      description: 'Mark a task as failed with error information. Phase 1 Task Assignment Protocol.',
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
      const { id, error, errorCode, canRetry, agentId: _agentId } = args as {
        id: string;
        error: string;
        errorCode?: string;
        canRetry?: boolean;
        agentId?: string;
      };

      const task = tasks.get(id);

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Task '${id}' not found` }) }],
          structuredContent: { task: null, failed: false, error: `Task '${id}' not found` },
        };
      }

      const now = new Date().toISOString();
      task.status = 'pending'; // Reset to pending for retry
      task.updatedAt = now;
      task.errorCode = errorCode;
      task.canRetry = canRetry ?? true;
      task.attemptNumber = (task.attemptNumber ?? 1) + 1;
      task.assignedTo = undefined; // Release from agent

      if (!task.metadata) {
        task.metadata = {};
      }
      task.metadata.lastError = error;
      task.metadata.lastErrorAt = now;

      await saveTasks();

      if (context.verbose) {
        console.error(
          `[task_fail] Task ${id} failed (attempt ${task.attemptNumber}): ${error}${canRetry ? ' (can retry)' : ' (no retry)'}`
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
      description: 'Detect and release tasks with claim or progress timeouts. Phase 1 Task Assignment Protocol timeout detection.',
      inputSchema: {
        progressTimeoutSeconds: z.number().default(60).describe('Seconds without progress before timeout'),
        claimTimeoutSeconds: z.number().default(300).describe('Seconds to complete claim and start progress'),
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
      const { progressTimeoutSeconds = 60, claimTimeoutSeconds: _claimTimeoutSeconds = 300 } = args as {
        progressTimeoutSeconds?: number;
        claimTimeoutSeconds?: number;
      };

      const timedOut: Array<{
        taskId: string;
        reason: string;
        wasAssignedTo?: string;
      }> = [];
      const now = Date.now();

      for (const task of tasks.values()) {
        if (task.status !== 'in_progress') {
          continue; // Only check in-progress tasks
        }

        // Check claim deadline: task must show progress within 5 minutes of claiming
        if (task.claimedAt && task.claimDeadline) {
          const claimDeadlineTime = new Date(task.claimDeadline).getTime();
          if (now > claimDeadlineTime) {
            // Claim timeout: agent claimed but never started working
            timedOut.push({
              taskId: task.id,
              reason: 'claim_timeout',
              wasAssignedTo: task.assignedTo,
            });
            task.status = 'pending';
            task.assignedTo = undefined;
            task.claimedAt = undefined;
            task.claimDeadline = undefined;
            task.updatedAt = new Date().toISOString();
            if (!task.metadata) task.metadata = {};
            task.metadata.timeoutReason = 'claim_timeout';
            continue;
          }
        }

        // Check progress timeout: no progress updates for N seconds
        if (task.lastProgressAt) {
          const lastProgressTime = new Date(task.lastProgressAt).getTime();
          const timeSinceProgress = (now - lastProgressTime) / 1000;

          if (timeSinceProgress > progressTimeoutSeconds) {
            // Progress timeout: no updates from agent
            timedOut.push({
              taskId: task.id,
              reason: `progress_timeout_${Math.floor(timeSinceProgress)}s`,
              wasAssignedTo: task.assignedTo,
            });
            task.status = 'pending';
            task.assignedTo = undefined;
            task.claimedAt = undefined;
            task.claimDeadline = undefined;
            task.updatedAt = new Date().toISOString();
            if (!task.metadata) task.metadata = {};
            task.metadata.timeoutReason = 'progress_timeout';
          }
        }
      }

      // Save any changes
      if (timedOut.length > 0) {
        await saveTasks();
      }

      if (context.verbose && timedOut.length > 0) {
        console.error(`[task_detect_timeouts] Found ${timedOut.length} timed-out tasks`);
        for (const item of timedOut) {
          console.error(
            `  - Task ${item.taskId}: ${item.reason}${item.wasAssignedTo ? ` (was assigned to ${item.wasAssignedTo})` : ''}`
          );
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ timedOut, count: timedOut.length }, null, 2) }],
        structuredContent: { timedOut, count: timedOut.length },
      };
    }
  );
}
