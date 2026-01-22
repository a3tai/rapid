/**
 * Agent Registry Tools
 *
 * Tools for registering agents and querying agent identity.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../../server.js';
import { getProjectId } from '../../utils/projectId.js';
import { createLogger } from '../../utils/logger.js';
import { getEventBus, getBusMode, isRedisBus } from './storage.js';
import type { AgentInfo, TaskRecord } from './types.js';

const logger = createLogger('eventbus');

/**
 * Register agent registry tools with the MCP server
 */
export function registerAgentRegistryTools(server: McpServer, context: ServerContext): void {
  // Tool: Register agent
  server.registerTool(
    'bus_register',
    {
      title: 'Register Agent',
      description:
        'Register this agent with the event bus for inter-agent communication. ' +
        'Must be called before sending or receiving messages.',
      inputSchema: {
        agentName: z.string().describe('Name of the agent (e.g., "claude", "opencode", "aider")'),
        worktree: z.string().optional().describe('Git worktree or branch name'),
        session: z.string().optional().describe('Session identifier'),
      },
      outputSchema: {
        agentId: z.string(),
        projectId: z.string(),
        registeredAt: z.string(),
        mode: z.string(),
      },
    },
    async (args) => {
      const { agentName, worktree, session } = args as {
        agentName: string;
        worktree?: string;
        session?: string;
      };

      // Determine project ID dynamically for consistency across worktrees
      const projectId = await getProjectId(context.projectDir);

      // Generate deterministic agent ID based on session if provided, otherwise use timestamp
      // This helps agents maintain consistent identity across reconnections
      const agentId = session
        ? `${agentName}-${session.replace(/[^a-zA-Z0-9-]/g, '-')}`
        : `${agentName}-${Date.now()}`;
      const agent: AgentInfo = {
        id: agentId,
        name: agentName,
        worktree,
        session,
      };

      const bus = await getEventBus(projectId);
      await bus.registerAgent(agent);

      const mode = getBusMode(bus);

      const output = {
        agentId,
        projectId,
        registeredAt: new Date().toISOString(),
        mode,
      };

      if (context.verbose) {
        logger.debug(`Registered agent: ${agentName} (${agentId}) [${mode}]`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Who am I - agent identity and context
  server.registerTool(
    'bus_whoami',
    {
      title: 'Who Am I',
      description:
        'Get information about your agent identity and current context. ' +
        'Use this when starting a session or switching between tasks to understand your role. ' +
        'Also provides guidance for clearing context between tasks.',
      inputSchema: {
        agentId: z.string().describe('Your agent ID from bus_register'),
        includeAssignedTasks: z
          .boolean()
          .default(true)
          .describe('Include list of tasks assigned to you'),
      },
      outputSchema: {
        identity: z.object({
          agentId: z.string(),
          name: z.string(),
          worktree: z.string().optional(),
          session: z.string().optional(),
          registeredAt: z.string().optional(),
        }),
        status: z.object({
          isRegistered: z.boolean(),
          busMode: z.string(),
          lastHeartbeat: z.string().optional(),
        }),
        assignedTasks: z
          .array(
            z.object({
              id: z.string(),
              title: z.string(),
              status: z.string(),
              priority: z.string(),
            })
          )
          .optional(),
        guidance: z.object({
          currentRole: z.string(),
          clearContextTip: z.string(),
          nextActions: z.array(z.string()),
        }),
      },
    },
    async (args) => {
      const { agentId, includeAssignedTasks } = args as {
        agentId: string;
        includeAssignedTasks?: boolean;
      };

      const projectId = await getProjectId(context.projectDir);
      const bus = await getEventBus(projectId);
      const busMode = getBusMode(bus);

      // Find agent in registry
      const allAgents = isRedisBus(bus)
        ? await bus.getActiveAgents(86400)
        : await bus.getActiveAgents();

      const agent = allAgents.find((a) => a.id === agentId);
      const isRegistered = !!agent;

      // Build identity info
      const identity = {
        agentId,
        name: agent?.name || 'unknown',
        worktree: agent?.worktree,
        session: agent?.session,
        registeredAt: undefined as string | undefined,
      };

      // Get assigned tasks if requested
      let assignedTasks: Array<{
        id: string;
        title: string;
        status: string;
        priority: string;
      }> = [];

      if (includeAssignedTasks !== false) {
        const tasksFilePath = `${context.projectDir}/.rapid/tasks.json`;
        try {
          const { readFile } = await import('node:fs/promises');
          const content = await readFile(tasksFilePath, 'utf-8');
          const tasks = JSON.parse(content) as TaskRecord[];
          assignedTasks = tasks
            .filter((t) => t.assignedTo === agentId)
            .map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
            }));
        } catch {
          // No tasks file
        }
      }

      // Determine role based on agent name
      let currentRole = 'worker';
      if (identity.name.includes('orchestrator')) {
        currentRole = 'orchestrator';
      } else if (identity.name.includes('designer')) {
        currentRole = 'designer';
      } else if (identity.name.includes('reviewer') || identity.name.includes('critic')) {
        currentRole = 'reviewer';
      }

      // Build guidance
      const nextActions: string[] = [];
      const inProgressTasks = assignedTasks.filter((t) => t.status === 'in_progress');

      if (inProgressTasks.length > 0) {
        nextActions.push(`Continue working on: ${inProgressTasks[0]!.title}`);
        nextActions.push('Send progress updates with bus_send (type: coordination)');
        nextActions.push('Mark complete with task_complete when done');
      } else if (currentRole === 'orchestrator') {
        nextActions.push('Poll bus_messages for updates from workers');
        nextActions.push('Check bus_health for agent status');
        nextActions.push('Create new tasks with task_create');
      } else {
        nextActions.push('Check task_list for pending tasks to claim');
        nextActions.push('Claim a task with task_claim');
        nextActions.push('Send bus_heartbeat to stay active');
      }

      const guidance = {
        currentRole,
        clearContextTip:
          'When switching tasks: 1) Complete current task with task_complete, ' +
          '2) Send completion message via bus_send, 3) Clear your working memory, ' +
          '4) Claim new task with task_claim, 5) Read task description fresh',
        nextActions,
      };

      const output = {
        identity,
        status: {
          isRegistered,
          busMode,
        },
        assignedTasks: includeAssignedTasks !== false ? assignedTasks : undefined,
        guidance,
      };

      if (context.verbose) {
        logger.debug(` Agent ${agentId}: ${identity.name} (${currentRole})`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: List active agents
  server.registerTool(
    'bus_agents',
    {
      title: 'List Active Agents',
      description: 'Get a list of currently active agents connected to the event bus.',
      inputSchema: {
        maxAgeSeconds: z
          .number()
          .default(300)
          .describe('Consider agents active within this time window'),
      },
      outputSchema: {
        agents: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            worktree: z.string().optional(),
            session: z.string().optional(),
          })
        ),
        count: z.number(),
      },
    },
    async (args) => {
      const { maxAgeSeconds } = args as { maxAgeSeconds?: number };

      const projectId = await getProjectId(context.projectDir);
      const bus = await getEventBus(projectId);

      // Use maxAgeSeconds for full EventBus, InMemoryEventBus ignores it
      const agents = isRedisBus(bus)
        ? await bus.getActiveAgents(maxAgeSeconds ?? 300)
        : await bus.getActiveAgents();

      const output = {
        agents,
        count: agents.length,
      };

      if (context.verbose) {
        logger.debug(` Found ${agents.length} active agents`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
