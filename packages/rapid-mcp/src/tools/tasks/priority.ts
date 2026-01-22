/**
 * Task Priority Tools
 *
 * Tools for dynamic priority calculation and analysis.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../../server.js';
import { createLogger } from '../../utils/logger.js';
import { TaskSchema } from './types.js';
import { getTask, getAllTasks } from './storage.js';
import {
  calculatePriorityScore,
  sortByDynamicPriority,
  findOverdueTasks,
  findCriticalPathTasks,
  detectPriorityInversion,
} from '../priority-scoring.js';

const logger = createLogger('tasks');

/**
 * Register priority tools with the MCP server
 */
export function registerPriorityTools(server: McpServer, context: ServerContext): void {
  // Task reprioritization tools
  server.registerTool(
    'task_recalculate_priorities',
    {
      title: 'Recalculate Task Priorities',
      description:
        'Dynamically recalculate all pending task priorities based on deadlines, age, and dependencies. Returns tasks sorted by dynamic priority score.',
      inputSchema: z.object({
        filter: z
          .enum(['pending', 'all', 'urgent'])
          .optional()
          .describe('Filter tasks by status. "urgent" includes in_progress and pending only'),
        limit: z.number().optional().describe('Maximum tasks to return (default: all)'),
      }),
      outputSchema: z.object({
        recalculated: z.number(),
        tasks: z.array(
          z.object({
            task: TaskSchema,
            score: z.object({
              totalScore: z.number(),
              basePriority: z.number(),
              deadlinePressure: z.number(),
              agingBonus: z.number(),
              dependencyDepth: z.number(),
              factors: z.object({
                isOverdue: z.boolean(),
                daysUntilDeadline: z.number().nullable(),
                hoursOld: z.number(),
                blockingTaskCount: z.number(),
              }),
            }),
          })
        ),
      }),
    },
    async (args) => {
      const { filter = 'pending', limit } = args as { filter?: string; limit?: number };

      const allTasks = await getAllTasks();
      let tasksToSort = allTasks;

      // Filter tasks
      if (filter === 'pending') {
        tasksToSort = tasksToSort.filter((t) => t.status === 'pending');
      } else if (filter === 'urgent') {
        tasksToSort = tasksToSort.filter((t) => ['pending', 'in_progress'].includes(t.status));
      }

      // Sort by dynamic priority
      const sorted = sortByDynamicPriority(tasksToSort);

      // Apply limit if specified
      const result = limit ? sorted.slice(0, limit) : sorted;

      // Calculate scores for all results
      const withScores = result.map((task) => ({
        task,
        score: calculatePriorityScore(task, tasksToSort),
      }));

      if (context.verbose) {
        logger.info(`[task_recalculate_priorities] Recalculated ${withScores.length} tasks`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ recalculated: withScores.length, tasks: withScores }, null, 2),
          },
        ],
        structuredContent: { recalculated: withScores.length, tasks: withScores },
      };
    }
  );

  // Find overdue tasks
  server.registerTool(
    'task_find_overdue',
    {
      title: 'Find Overdue Tasks',
      description: 'Find tasks that have passed their deadline and need immediate attention.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        overdueCount: z.number(),
        overdue: z.array(
          z.object({
            task: TaskSchema,
            score: z.object({
              totalScore: z.number(),
              factors: z.object({
                isOverdue: z.boolean(),
                daysUntilDeadline: z.number().nullable(),
              }),
            }),
          })
        ),
      }),
    },
    async () => {
      const allTasks = await getAllTasks();
      const overdue = findOverdueTasks(allTasks);

      if (context.verbose && overdue.length > 0) {
        logger.warn(`[task_find_overdue] Found ${overdue.length} overdue tasks`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ overdueCount: overdue.length, overdue }, null, 2),
          },
        ],
        structuredContent: { overdueCount: overdue.length, overdue },
      };
    }
  );

  // Find critical path tasks
  server.registerTool(
    'task_find_critical_path',
    {
      title: 'Find Critical Path Tasks',
      description:
        'Find tasks that are blocking many other tasks (critical path). These should be prioritized for faster completion.',
      inputSchema: z.object({
        minBlocking: z
          .number()
          .optional()
          .describe('Minimum number of tasks blocked to consider critical (default: 2)'),
      }),
      outputSchema: z.object({
        criticalCount: z.number(),
        critical: z.array(TaskSchema),
      }),
    },
    async (args) => {
      const { minBlocking = 2 } = args as { minBlocking?: number };
      const allTasks = await getAllTasks();
      const critical = findCriticalPathTasks(allTasks, minBlocking);

      if (context.verbose && critical.length > 0) {
        logger.info(`[task_find_critical_path] Found ${critical.length} critical path tasks`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ criticalCount: critical.length, critical }, null, 2),
          },
        ],
        structuredContent: { criticalCount: critical.length, critical },
      };
    }
  );

  // Detect priority inversions
  server.registerTool(
    'task_detect_priority_inversion',
    {
      title: 'Detect Priority Inversion',
      description:
        'Detect priority inversion scenarios where low-priority tasks are older than high-priority tasks. Helps prevent task starvation.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        inversionCount: z.number(),
        inversions: z.array(
          z.object({
            lowPriorityTask: TaskSchema,
            highPriorityTask: TaskSchema,
            ageDifferenceHours: z.number(),
          })
        ),
      }),
    },
    async () => {
      const allTasks = await getAllTasks();
      const inversions = detectPriorityInversion(allTasks);

      if (context.verbose && inversions.length > 0) {
        logger.warn(`[task_detect_priority_inversion] Found ${inversions.length} priority inversions`);
      }

      const formattedInversions = inversions.map((inv) => ({
        lowPriorityTask: inv.lowPriorityTask,
        highPriorityTask: inv.highPriorityTask,
        ageDifferenceHours: inv.ageDifference / (1000 * 60 * 60),
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { inversionCount: formattedInversions.length, inversions: formattedInversions },
              null,
              2
            ),
          },
        ],
        structuredContent: {
          inversionCount: formattedInversions.length,
          inversions: formattedInversions,
        },
      };
    }
  );

  // Get priority score for a specific task
  server.registerTool(
    'task_get_priority_score',
    {
      title: 'Get Priority Score',
      description: 'Get detailed priority score breakdown for a specific task, showing all contributing factors.',
      inputSchema: z.object({
        taskId: z.string().describe('Task ID to analyze'),
      }),
      outputSchema: z.object({
        task: TaskSchema.optional(),
        score: z.object({
          basePriority: z.number(),
          deadlinePressure: z.number(),
          agingBonus: z.number(),
          dependencyDepth: z.number(),
          totalScore: z.number(),
          factors: z.object({
            isOverdue: z.boolean(),
            daysUntilDeadline: z.number().nullable(),
            hoursOld: z.number(),
            blockingTaskCount: z.number(),
          }),
        }),
      }),
    },
    async (args) => {
      const { taskId } = args as { taskId: string };

      const task = await getTask(taskId);
      if (!task) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Task ${taskId} not found` }, null, 2),
            },
          ],
          structuredContent: { error: `Task ${taskId} not found` },
        };
      }

      const allTasks = await getAllTasks();
      const score = calculatePriorityScore(task, allTasks);

      if (context.verbose) {
        logger.debug(`[task_get_priority_score] Scored task ${taskId}:${task.title}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ task, score }, null, 2),
          },
        ],
        structuredContent: { task, score },
      };
    }
  );
}
