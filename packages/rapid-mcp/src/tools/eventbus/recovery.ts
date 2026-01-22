/**
 * Event Bus Recovery Tools
 *
 * Tools for recovering tasks from stale agents.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../../server.js';
import { getProjectId } from '../../utils/projectId.js';
import { createLogger } from '../../utils/logger.js';
import { getEventBus, isRedisBus } from './storage.js';
import type { AgentInfo, TaskRecord } from './types.js';

const logger = createLogger('eventbus');

/**
 * Register recovery tools with the MCP server
 */
export function registerRecoveryTools(server: McpServer, context: ServerContext): void {
  // Tool: Recover tasks from stale agents
  server.registerTool(
    'bus_recover_tasks',
    {
      title: 'Recover Tasks from Stale Agents',
      description:
        'Find in-progress tasks assigned to stale agents and reset them for reassignment. ' +
        'This implements the Agent Lifecycle Protocol recovery phase. ' +
        'Tasks are reset to pending status so healthy agents can claim them.',
      inputSchema: {
        staleThresholdSeconds: z
          .number()
          .default(120)
          .describe('Seconds without heartbeat before agent is considered stale (default: 120)'),
        dryRun: z
          .boolean()
          .default(false)
          .describe('If true, only report what would be recovered without making changes'),
        notifyBus: z.boolean().default(true).describe('Send recovery notification to event bus'),
        orchestratorId: z.string().optional().describe('ID of orchestrator performing recovery'),
      },
      outputSchema: {
        staleAgents: z.array(z.string()).describe('IDs of agents detected as stale'),
        recoveredTasks: z.array(
          z.object({
            taskId: z.string(),
            title: z.string(),
            previousAgent: z.string(),
            status: z.string(),
          })
        ),
        recoveredCount: z.number(),
        dryRun: z.boolean(),
        notificationSent: z.boolean(),
      },
    },
    async (args) => {
      const { staleThresholdSeconds, dryRun, notifyBus, orchestratorId } = args as {
        staleThresholdSeconds?: number;
        dryRun?: boolean;
        notifyBus?: boolean;
        orchestratorId?: string;
      };

      const projectId = await getProjectId(context.projectDir);
      const bus = await getEventBus(projectId);
      const threshold = staleThresholdSeconds ?? 120;
      const isDryRun = dryRun ?? false;
      const shouldNotify = notifyBus ?? true;

      // Get active vs stale agents
      const activeAgents = isRedisBus(bus)
        ? await bus.getActiveAgents(threshold)
        : await bus.getActiveAgents();
      const allAgents = isRedisBus(bus)
        ? await bus.getActiveAgents(86400)
        : await bus.getActiveAgents();

      const activeIds = new Set(activeAgents.map((a) => a.id));
      const staleAgentList = allAgents.filter((a) => !activeIds.has(a.id));
      const staleAgentIds = staleAgentList.map((a) => a.id);

      // Load tasks from .rapid/tasks.json
      const tasksFilePath = `${context.projectDir}/.rapid/tasks.json`;
      let tasks: TaskRecord[] = [];

      try {
        const { readFile } = await import('node:fs/promises');
        const content = await readFile(tasksFilePath, 'utf-8');
        tasks = JSON.parse(content);
      } catch {
        // No tasks file or couldn't read
      }

      // Find tasks assigned to stale agents that are in_progress
      const tasksToRecover = tasks.filter(
        (t) => t.status === 'in_progress' && t.assignedTo && staleAgentIds.includes(t.assignedTo)
      );

      const recoveredTasks: Array<{
        taskId: string;
        title: string;
        previousAgent: string;
        status: string;
      }> = [];

      if (!isDryRun && tasksToRecover.length > 0) {
        // Reset tasks to pending
        for (const task of tasksToRecover) {
          const originalAssignee = task.assignedTo || 'unknown';
          recoveredTasks.push({
            taskId: task.id,
            title: task.title,
            previousAgent: originalAssignee,
            status: 'reset_to_pending',
          });

          // Update task in array
          task.status = 'pending';
          delete (task as { assignedTo?: string }).assignedTo;
          task.updatedAt = new Date().toISOString();
        }

        // Save updated tasks
        try {
          const { writeFile } = await import('node:fs/promises');
          await writeFile(tasksFilePath, JSON.stringify(tasks, null, 2), 'utf-8');
        } catch (err) {
          logger.error('Failed to save tasks', err);
        }
      } else if (isDryRun) {
        // Just report what would be recovered
        for (const task of tasksToRecover) {
          recoveredTasks.push({
            taskId: task.id,
            title: task.title,
            previousAgent: task.assignedTo || 'unknown',
            status: 'would_reset',
          });
        }
      }

      let notificationSent = false;

      // Send recovery notification to event bus
      if (shouldNotify && recoveredTasks.length > 0 && !isDryRun) {
        const fromAgent: AgentInfo = {
          id: orchestratorId || 'orchestrator',
          name: 'orchestrator',
        };

        await bus.sendMessage('coordination', fromAgent, {
          title: 'Task Recovery: Stale agents detected',
          content:
            `Recovered ${recoveredTasks.length} task(s) from stale agents:\n` +
            recoveredTasks
              .map((t) => `- ${t.title} (${t.taskId}) from ${t.previousAgent}`)
              .join('\n') +
            `\n\nStale agents: ${staleAgentIds.join(', ')}\n` +
            `Tasks are now available for claiming by healthy agents.`,
          actionable: true,
        });
        notificationSent = true;
      }

      const output = {
        staleAgents: staleAgentIds,
        recoveredTasks,
        recoveredCount: recoveredTasks.length,
        dryRun: isDryRun,
        notificationSent,
      };

      if (context.verbose) {
        logger.debug(
          `[bus_recover_tasks] Recovered ${recoveredTasks.length} tasks from ${staleAgentIds.length} stale agents`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
