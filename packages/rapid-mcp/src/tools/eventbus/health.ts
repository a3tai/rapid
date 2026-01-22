/**
 * Event Bus Health Tools
 *
 * Tools for monitoring agent health, heartbeats, and bus status.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../../server.js';
import { getProjectId } from '../../utils/projectId.js';
import { createLogger } from '../../utils/logger.js';
import { getEventBus, getBusMode, isRedisBus } from './storage.js';
import type { AgentReport, TaskRecord } from './types.js';

const logger = createLogger('eventbus');

/**
 * Register health monitoring tools with the MCP server
 */
export function registerHealthTools(server: McpServer, context: ServerContext): void {
  // Tool: Get bus status
  server.registerTool(
    'bus_status',
    {
      title: 'Event Bus Status',
      description: 'Get the current status and statistics of the event bus.',
      inputSchema: {},
      outputSchema: {
        projectId: z.string(),
        mode: z.string(),
        connected: z.boolean(),
        messageCount: z.number(),
        activeAgents: z.number(),
        streamLength: z.number(),
      },
    },
    async () => {
      const projectId = await getProjectId(context.projectDir);
      const bus = await getEventBus(projectId);
      const stats = await bus.getStats();
      const mode = getBusMode(bus);

      const output = {
        projectId,
        mode,
        ...stats,
      };

      if (context.verbose) {
        logger.debug(
          `Bus status: ${stats.messageCount} messages, ${stats.activeAgents} agents [${mode}]`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Send heartbeat
  server.registerTool(
    'bus_heartbeat',
    {
      title: 'Send Heartbeat',
      description:
        'Send a heartbeat to keep the agent registered as active. ' +
        'Agents should call this periodically (recommended: every 30-60 seconds) ' +
        'to avoid being marked as stale.',
      inputSchema: {
        agentId: z.string().describe('Your agent ID from bus_register'),
      },
      outputSchema: {
        success: z.boolean(),
        agentId: z.string(),
        timestamp: z.string(),
        nextHeartbeatIn: z.number().describe('Recommended seconds until next heartbeat'),
      },
    },
    async (args) => {
      const { agentId } = args as { agentId: string };

      const projectId = await getProjectId(context.projectDir);
      const bus = await getEventBus(projectId);
      await bus.heartbeat(agentId);

      const output = {
        success: true,
        agentId,
        timestamp: new Date().toISOString(),
        nextHeartbeatIn: 30, // Recommend 30 second intervals
      };

      if (context.verbose) {
        logger.debug(` Heartbeat from agent: ${agentId}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Check agent health
  server.registerTool(
    'bus_health',
    {
      title: 'Check Agent Health',
      description:
        'Check the health status of agents on the event bus. ' +
        'Returns active agents, stale agents (no heartbeat in threshold), and statistics.',
      inputSchema: {
        staleThresholdSeconds: z
          .number()
          .default(60)
          .describe('Seconds without heartbeat before agent is considered stale (default: 60)'),
        includeStale: z
          .boolean()
          .default(true)
          .describe('Include list of stale agents in response'),
        cleanupStale: z.boolean().default(false).describe('Remove stale agents from the registry'),
      },
      outputSchema: {
        healthy: z.number().describe('Number of healthy (active) agents'),
        stale: z.number().describe('Number of stale agents'),
        total: z.number().describe('Total registered agents'),
        activeAgents: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            worktree: z.string().optional(),
            lastSeen: z.string().optional(),
          })
        ),
        staleAgents: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              worktree: z.string().optional(),
              lastSeen: z.string().optional(),
            })
          )
          .optional(),
        cleanedUp: z.number().optional().describe('Number of stale agents removed'),
      },
    },
    async (args) => {
      const { staleThresholdSeconds, includeStale, cleanupStale } = args as {
        staleThresholdSeconds?: number;
        includeStale?: boolean;
        cleanupStale?: boolean;
      };

      const projectId = await getProjectId(context.projectDir);
      const bus = await getEventBus(projectId);
      const threshold = staleThresholdSeconds ?? 60;

      // Get active agents (within threshold)
      const activeAgents = isRedisBus(bus)
        ? await bus.getActiveAgents(threshold)
        : await bus.getActiveAgents();

      // Get all agents to find stale ones (use very large window)
      const allAgents = isRedisBus(bus)
        ? await bus.getActiveAgents(86400) // 24 hours
        : await bus.getActiveAgents();

      // Find stale agents (in allAgents but not in activeAgents)
      const activeIds = new Set(activeAgents.map((a) => a.id));
      const staleAgents = allAgents.filter((a) => !activeIds.has(a.id));

      let cleanedUp = 0;

      // Cleanup stale agents if requested (only works with Redis EventBus)
      if (cleanupStale && isRedisBus(bus) && staleAgents.length > 0) {
        // Remove stale agents from registry
        for (const agent of staleAgents) {
          try {
            await bus.unregisterAgent(agent.id);
            cleanedUp++;
          } catch {
            // Ignore errors during cleanup
          }
        }
      }

      const output: {
        healthy: number;
        stale: number;
        total: number;
        activeAgents: Array<{ id: string; name: string; worktree?: string }>;
        staleAgents?: Array<{ id: string; name: string; worktree?: string }>;
        cleanedUp?: number;
      } = {
        healthy: activeAgents.length,
        stale: staleAgents.length,
        total: allAgents.length,
        activeAgents: activeAgents.map((a) => ({
          id: a.id,
          name: a.name,
          ...(a.worktree && { worktree: a.worktree }),
        })),
      };

      if (includeStale) {
        output.staleAgents = staleAgents.map((a) => ({
          id: a.id,
          name: a.name,
          ...(a.worktree && { worktree: a.worktree }),
        }));
      }

      if (cleanupStale) {
        output.cleanedUp = cleanedUp;
      }

      if (context.verbose) {
        logger.debug(
          `Health check: ${activeAgents.length} active, ${staleAgents.length} stale`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Monitor agent health continuously
  server.registerTool(
    'bus_health_report',
    {
      title: 'Agent Health Report',
      description:
        'Generate a comprehensive health report for all agents including uptime, ' +
        'message activity, and task assignments. Use for dashboard/monitoring.',
      inputSchema: {
        includeMessageCounts: z.boolean().default(true).describe('Include message count per agent'),
        includeTaskSummary: z.boolean().default(true).describe('Include task summary per agent'),
        staleThresholdSeconds: z.number().default(60).describe('Seconds for stale detection'),
      },
      outputSchema: {
        timestamp: z.string(),
        summary: z.object({
          totalAgents: z.number(),
          healthyAgents: z.number(),
          staleAgents: z.number(),
          degradedAgents: z.number(),
        }),
        agents: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            status: z.enum(['healthy', 'degraded', 'stale']),
            worktree: z.string().optional(),
            messagesToday: z.number().optional(),
            tasksAssigned: z.number().optional(),
            tasksCompleted: z.number().optional(),
          })
        ),
        recommendations: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      const { includeMessageCounts, includeTaskSummary, staleThresholdSeconds } = args as {
        includeMessageCounts?: boolean;
        includeTaskSummary?: boolean;
        staleThresholdSeconds?: number;
      };

      const projectId = await getProjectId(context.projectDir);
      const bus = await getEventBus(projectId);
      const threshold = staleThresholdSeconds ?? 60;
      const degradedThreshold = threshold * 2; // 2x threshold = degraded

      // Get agents at different thresholds
      const healthyAgents = isRedisBus(bus)
        ? await bus.getActiveAgents(threshold)
        : await bus.getActiveAgents();
      const degradedAgentsAll = isRedisBus(bus)
        ? await bus.getActiveAgents(degradedThreshold)
        : await bus.getActiveAgents();
      const allAgents = isRedisBus(bus)
        ? await bus.getActiveAgents(86400)
        : await bus.getActiveAgents();

      const healthyIds = new Set(healthyAgents.map((a) => a.id));
      const degradedIds = new Set(degradedAgentsAll.map((a) => a.id));

      // Classify agents
      const agentReports: AgentReport[] = [];

      let degradedCount = 0;
      let staleCount = 0;

      for (const agent of allAgents) {
        let status: 'healthy' | 'degraded' | 'stale';
        if (healthyIds.has(agent.id)) {
          status = 'healthy';
        } else if (degradedIds.has(agent.id)) {
          status = 'degraded';
          degradedCount++;
        } else {
          status = 'stale';
          staleCount++;
        }

        const report: AgentReport = {
          id: agent.id,
          name: agent.name,
          status,
          ...(agent.worktree && { worktree: agent.worktree }),
        };

        // Add message counts if requested
        if (includeMessageCounts) {
          const history = await bus.getHistory({ hours: 24 });
          report.messagesToday = history.filter((m) => m.fromAgent.id === agent.id).length;
        }

        // Add task summary if requested
        if (includeTaskSummary) {
          const tasksFilePath = `${context.projectDir}/.rapid/tasks.json`;
          try {
            const { readFile } = await import('node:fs/promises');
            const content = await readFile(tasksFilePath, 'utf-8');
            const tasks = JSON.parse(content) as TaskRecord[];
            report.tasksAssigned = tasks.filter((t) => t.assignedTo === agent.id).length;
            report.tasksCompleted = tasks.filter(
              (t) => t.assignedTo === agent.id && t.status === 'completed'
            ).length;
          } catch {
            // No tasks file
          }
        }

        agentReports.push(report);
      }

      // Generate recommendations
      const recommendations: string[] = [];
      if (staleCount > 0) {
        recommendations.push(
          `${staleCount} stale agent(s) detected. Consider running bus_recover_tasks.`
        );
      }
      if (degradedCount > 0) {
        recommendations.push(`${degradedCount} degraded agent(s). Check for connectivity issues.`);
      }
      if (healthyAgents.length === 0 && allAgents.length > 0) {
        recommendations.push('No healthy agents! All agents may be offline or stuck.');
      }
      if (allAgents.length === 0) {
        recommendations.push('No agents registered. Run bus_register to add agents.');
      }

      const output = {
        timestamp: new Date().toISOString(),
        summary: {
          totalAgents: allAgents.length,
          healthyAgents: healthyAgents.length,
          staleAgents: staleCount,
          degradedAgents: degradedCount,
        },
        agents: agentReports,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
      };

      if (context.verbose) {
        logger.debug(
          `[bus_health_report] Report: ${healthyAgents.length} healthy, ${degradedCount} degraded, ${staleCount} stale`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
