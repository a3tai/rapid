/**
 * Task Auto-Discovery and Watching Tool
 *
 * Enables agents to watch for pending tasks and auto-claim them based on capabilities.
 * This tool implements the Task Auto-Discovery feature for Phase 2 UX improvements.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerContext } from '../server.js';

/**
 * Task interface (matches tasks.ts)
 */
interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'pending_approval' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  assignedTo?: string;
  parentId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  deadline?: string;
  claimedAt?: string;
  claimDeadline?: string;
  lastProgressAt?: string;
  requiredCapabilities?: string[];
  estimatedDuration?: number;
  dependencies?: string[];
  result?: Record<string, unknown>;
  errorCode?: string;
  canRetry?: boolean;
  attemptNumber?: number;
  requiresApproval?: boolean;
  approvalType?: 'before_claim' | 'before_commit' | 'before_deploy';
  approvedBy?: string;
  approvedAt?: string;
  approvalReason?: string;
}

/**
 * Load tasks from persistent storage
 */
async function loadTasks(projectDir: string): Promise<Task[]> {
  const tasksFilePath = join(projectDir, '.rapid', 'tasks.json');
  try {
    const content = await readFile(tasksFilePath, 'utf-8');
    return JSON.parse(content) as Task[];
  } catch {
    return [];
  }
}

/**
 * Filter tasks by agent capabilities
 */
function filterTasksByCapabilities(tasks: Task[], capabilities: string[]): Task[] {
  return tasks.filter((task) => {
    // Skip non-pending tasks
    if (task.status !== 'pending' && task.status !== 'pending_approval') {
      return false;
    }

    // Skip already assigned tasks
    if (task.assignedTo) {
      return false;
    }

    // If task has required capabilities, agent must have all of them
    if (task.requiredCapabilities && task.requiredCapabilities.length > 0) {
      return task.requiredCapabilities.every((cap) => capabilities.includes(cap));
    }

    return true;
  });
}

/**
 * Score a task for the agent (higher = better match)
 */
function scoreTask(
  task: Task,
  agentWorktree?: string,
  agentCapabilities: string[] = []
): number {
  let score = 0;

  // Priority bonus
  const priorityScores: Record<string, number> = {
    low: 10,
    normal: 30,
    high: 70,
    urgent: 100,
  };
  score += priorityScores[task.priority] || 30;

  // Age bonus (older tasks get higher priority)
  const ageMs = Date.now() - new Date(task.createdAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  score += Math.min(ageHours * 2, 30); // Up to +30 for very old tasks

  // Capability match bonus
  if (task.requiredCapabilities) {
    const matchedCount = task.requiredCapabilities.filter((cap) =>
      agentCapabilities.includes(cap)
    ).length;
    score += matchedCount * 5;
  }

  // Worktree affinity bonus
  if (agentWorktree && task.metadata?.worktree === agentWorktree) {
    score += 40;
  }

  return score;
}

/**
 * Register task watching tools with MCP server
 */
export function registerTaskWatchTools(server: McpServer, context: ServerContext): void {
  /**
   * Tool: Watch for matching tasks
   * Allows agents to discover pending tasks matching their capabilities
   */
  server.registerTool(
    'task_watch',
    {
      title: 'Watch for Task Auto-Discovery',
      description:
        'Discover pending tasks that match your agent capabilities. Returns matching tasks sorted by priority and age.',
      inputSchema: z.object({
        capabilities: z
          .array(z.string())
          .describe('List of capabilities this agent has (e.g., ["python", "testing", "documentation"])'),
        worktree: z.string().optional().describe('Current worktree/branch for affinity scoring'),
        maxResults: z.number().optional().default(10).describe('Maximum tasks to return'),
        minPriority: z
          .enum(['low', 'normal', 'high', 'urgent'])
          .optional()
          .describe('Minimum priority level to return'),
        tags: z
          .array(z.string())
          .optional()
          .describe('Only return tasks with any of these tags'),
      }),
      outputSchema: z.object({
        tasks: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            description: z.string().optional(),
            priority: z.string(),
            status: z.string(),
            createdAt: z.string(),
            requiredCapabilities: z.array(z.string()).optional(),
            estimatedDuration: z.number().optional(),
            score: z.number().describe('Relevance score for this agent (0-300+)'),
          })
        ),
        count: z.number(),
        nextCheck: z.string().describe('Recommended time for next check (ISO8601)'),
      }),
    },
    async (input) => {
      try {
        const tasks = await loadTasks(context.projectDir);

        // Filter by capability match
        const matched = filterTasksByCapabilities(tasks, input.capabilities);

        // Score tasks
        const scored = matched
          .map((task) => ({
            task,
            score: scoreTask(task, input.worktree, input.capabilities),
          }))
          .sort((a, b) => b.score - a.score);

        // Apply additional filters
        let filtered = scored;

        if (input.minPriority) {
          const priorityOrder = { low: 0, normal: 1, high: 2, urgent: 3 };
          const minPriorityLevel = priorityOrder[input.minPriority] || 0;
          filtered = filtered.filter(
            (item) => priorityOrder[item.task.priority] >= minPriorityLevel
          );
        }

        if (input.tags && input.tags.length > 0) {
          filtered = filtered.filter((item) =>
            item.task.tags?.some((tag) => input.tags!.includes(tag))
          );
        }

        // Limit results
        const limited = filtered.slice(0, input.maxResults || 10);

        // Calculate next check time (stagger checks to reduce load)
        const nextCheck = new Date(Date.now() + 30 * 1000).toISOString(); // 30 seconds

        const output = {
          tasks: limited.map((item) => ({
            id: item.task.id,
            title: item.task.title,
            description: item.task.description,
            priority: item.task.priority,
            status: item.task.status,
            createdAt: item.task.createdAt,
            requiredCapabilities: item.task.requiredCapabilities,
            estimatedDuration: item.task.estimatedDuration,
            score: item.score,
          })),
          count: limited.length,
          nextCheck,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch {
        const output = {
          tasks: [],
          count: 0,
          nextCheck: new Date(Date.now() + 60 * 1000).toISOString(),
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    }
  );

  /**
   * Tool: Get task details for watching
   * Returns full details of a specific task for validation before claiming
   */
  server.registerTool(
    'task_get_details',
    {
      title: 'Get Task Details',
      description: 'Retrieve full details of a task before deciding to claim it',
      inputSchema: z.object({
        taskId: z.string().describe('ID of the task to get details for'),
      }),
      outputSchema: z.object({
        found: z.boolean(),
        task: z
          .object({
            id: z.string(),
            title: z.string(),
            description: z.string().optional(),
            priority: z.string(),
            status: z.string(),
            createdAt: z.string(),
            updatedAt: z.string(),
            requiredCapabilities: z.array(z.string()).optional(),
            estimatedDuration: z.number().optional(),
            deadline: z.string().optional(),
            dependencies: z.array(z.string()).optional(),
            requiresApproval: z.boolean().optional(),
            metadata: z.record(z.unknown()).optional(),
          })
          .optional(),
      }),
    },
    async (input) => {
      try {
        const tasks = await loadTasks(context.projectDir);
        const task = tasks.find((t) => t.id === input.taskId);

        if (!task) {
          const output = { found: false };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
          };
        }

        const output = {
          found: true,
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            priority: task.priority,
            status: task.status,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            requiredCapabilities: task.requiredCapabilities,
            estimatedDuration: task.estimatedDuration,
            deadline: task.deadline,
            dependencies: task.dependencies,
            requiresApproval: task.requiresApproval,
            metadata: task.metadata,
          },
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch {
        const output = { found: false };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    }
  );
}
