/**
 * Event Bus Tools
 *
 * MCP tools for inter-agent communication via the RAPID event bus.
 * Automatically connects to Redis when available (started via `rapid start`).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  EventBus,
  InMemoryEventBus,
  MessageType,
  MessagePriority,
  getRedisStatus,
  type AgentInfo,
  type EventBusConfig,
} from '@a3t/rapid-eventbus';
import type { ServerContext } from '../server.js';

// Singleton event bus instance per project
const busInstances = new Map<string, EventBus | InMemoryEventBus>();

/**
 * Get or create event bus for a project.
 * Connects to Redis if available, otherwise falls back to in-memory.
 */
async function getEventBus(projectId: string): Promise<EventBus | InMemoryEventBus> {
  let bus = busInstances.get(projectId);
  if (bus) {
    return bus;
  }

  // First check for REDIS_URL environment variable (for containerized MCP)
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const config: EventBusConfig = {
        redis: { url: redisUrl },
        projectId,
      };
      bus = new EventBus(config);
      await bus.connect();
      busInstances.set(projectId, bus);
      console.error(`[eventbus] Connected to Redis at ${redisUrl}`);
      return bus;
    } catch (err) {
      console.error(`[eventbus] Failed to connect to Redis at ${redisUrl}:`, err);
    }
  }

  // Check if Redis is running locally (started by `rapid start`)
  try {
    const status = await getRedisStatus();

    if (status.running && status.url) {
      // Connect to Redis
      const config: EventBusConfig = {
        redis: { url: status.url },
        projectId,
      };
      bus = new EventBus(config);
      await bus.connect();
      busInstances.set(projectId, bus);
      console.error(`[eventbus] Connected to Redis at ${status.url}`);
      return bus;
    }
  } catch {
    // Redis not available, fall back to in-memory
  }

  // Fall back to in-memory
  console.error('[eventbus] Using in-memory event bus (no Redis available)');
  bus = new InMemoryEventBus();
  busInstances.set(projectId, bus);
  return bus;
}

/**
 * Register event bus tools with the MCP server
 */
export function registerEventBusTools(server: McpServer, context: ServerContext): void {
  // Get project ID from config or directory
  const projectId = context.projectDir.split('/').pop() || 'default';

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

      const agentId = `${agentName}-${Date.now()}`;
      const agent: AgentInfo = {
        id: agentId,
        name: agentName,
        worktree,
        session,
      };

      const bus = await getEventBus(projectId);
      await bus.registerAgent(agent);

      // Determine mode
      const mode = bus instanceof EventBus ? 'redis' : 'in-memory';

      const output = {
        agentId,
        projectId,
        registeredAt: new Date().toISOString(),
        mode,
      };

      if (context.verbose) {
        console.error(`[bus_register] Registered agent: ${agentName} (${agentId}) [${mode}]`);
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

      const bus = await getEventBus(projectId);
      const busMode = bus instanceof EventBus ? 'redis' : 'in-memory';

      // Find agent in registry
      const allAgents =
        bus instanceof EventBus
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
          const tasks = JSON.parse(content) as Array<{
            id: string;
            title: string;
            status: string;
            priority: string;
            assignedTo?: string;
          }>;
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
        nextActions.push(`Continue working on: ${inProgressTasks[0].title}`);
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
        console.error(`[bus_whoami] Agent ${agentId}: ${identity.name} (${currentRole})`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Send message
  server.registerTool(
    'bus_send',
    {
      title: 'Send Message',
      description:
        'Send a message to other agents via the event bus. ' +
        'Use for sharing discoveries, errors, completions, questions, and coordination.',
      inputSchema: {
        type: MessageType.describe('Type of message to send'),
        agentId: z.string().describe('Your agent ID from bus_register'),
        agentName: z.string().describe('Your agent name'),
        worktree: z.string().optional().describe('Your worktree/branch'),
        title: z.string().describe('Short summary of the message'),
        content: z.string().describe('Detailed message content'),
        priority: MessagePriority.default('normal').describe('Message priority'),
        toAgents: z.array(z.string()).optional().describe('Target agent IDs (null = broadcast)'),
        context: z
          .object({
            file: z.string().optional(),
            line: z.number().optional(),
            function: z.string().optional(),
            error: z.string().optional(),
            code: z.string().optional(),
          })
          .optional()
          .describe('Additional context about the message'),
        actionable: z
          .boolean()
          .default(false)
          .describe('Whether this requires action from recipients'),
      },
      outputSchema: {
        messageId: z.string(),
        timestamp: z.string(),
        delivered: z.boolean(),
      },
    },
    async (args) => {
      const {
        type,
        agentId,
        agentName,
        worktree,
        title,
        content,
        priority,
        toAgents,
        context: msgContext,
        actionable,
      } = args as {
        type: z.infer<typeof MessageType>;
        agentId: string;
        agentName: string;
        worktree?: string;
        title: string;
        content: string;
        priority?: z.infer<typeof MessagePriority>;
        toAgents?: string[];
        context?: {
          file?: string;
          line?: number;
          function?: string;
          error?: string;
          code?: string;
        };
        actionable?: boolean;
      };

      const bus = await getEventBus(projectId);
      const fromAgent: AgentInfo = { id: agentId, name: agentName, worktree };

      const sendOptions: { toAgents?: string[]; priority?: z.infer<typeof MessagePriority> } = {};
      if (toAgents !== undefined) {
        sendOptions.toAgents = toAgents;
      }
      if (priority !== undefined) {
        sendOptions.priority = priority;
      }

      const message = await bus.sendMessage(
        type,
        fromAgent,
        {
          title,
          content,
          context: msgContext,
          actionable: actionable ?? false,
        },
        sendOptions
      );

      const output = {
        messageId: message.id,
        timestamp: message.timestamp,
        delivered: true,
      };

      if (context.verbose) {
        console.error(`[bus_send] Sent ${type} message: ${title}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Get messages
  server.registerTool(
    'bus_messages',
    {
      title: 'Get Messages',
      description:
        'Get recent messages from the event bus. Use brief=true to save context. ' +
        'Use since parameter for efficient polling (only get new messages).',
      inputSchema: {
        limit: z.number().default(5).describe('Maximum messages to return (default: 5, max: 20)'),
        since: z.string().optional().describe('ISO timestamp - only return messages after this time'),
        types: z.array(MessageType).optional().describe('Filter by message types'),
        brief: z.boolean().default(true).describe('Return summaries only (saves context)'),
        maxContentLength: z.number().default(200).describe('Truncate content to this length'),
      },
      outputSchema: {
        messages: z.array(z.any()),
        count: z.number(),
        hasMore: z.boolean(),
        newestTimestamp: z.string().optional(),
      },
    },
    async (args) => {
      const { limit, since, types, brief, maxContentLength } = args as {
        limit?: number;
        since?: string;
        types?: z.infer<typeof MessageType>[];
        brief?: boolean;
        maxContentLength?: number;
      };

      const bus = await getEventBus(projectId);
      const historyOptions: { hours: number; types?: z.infer<typeof MessageType>[] } = {
        hours: 1, // Always get last hour, filter by 'since' if provided
      };
      if (types !== undefined) {
        historyOptions.types = types;
      }
      let messages = await bus.getHistory(historyOptions);

      // Filter by 'since' timestamp if provided
      if (since) {
        const sinceDate = new Date(since).getTime();
        messages = messages.filter((m) => new Date(m.timestamp).getTime() > sinceDate);
      }

      // Limit results (cap at 20 to prevent context overload)
      const effectiveLimit = Math.min(limit ?? 5, 20);
      const hasMore = messages.length > effectiveLimit;
      const limited = messages.slice(0, effectiveLimit);

      // Get newest timestamp for next poll
      const firstMessage = limited[0];
      const newestTimestamp = firstMessage ? firstMessage.timestamp : undefined;

      // Transform messages based on brief mode
      const maxLen = maxContentLength ?? 200;
      const transformedMessages = limited.map((m) => {
        if (brief) {
          // Brief mode: just essential info
          return {
            id: m.id,
            time: m.timestamp,
            type: m.type,
            from: m.fromAgent.name,
            title: m.payload.title,
            preview: m.payload.content.length > maxLen
              ? m.payload.content.slice(0, maxLen) + '...'
              : m.payload.content,
            actionable: m.payload.actionable,
          };
        } else {
          // Full mode: truncate content if needed
          return {
            ...m,
            payload: {
              ...m.payload,
              content: m.payload.content.length > maxLen * 2
                ? m.payload.content.slice(0, maxLen * 2) + '...'
                : m.payload.content,
            },
          };
        }
      });

      const output = {
        messages: transformedMessages,
        count: transformedMessages.length,
        hasMore,
        newestTimestamp,
      };

      if (context.verbose) {
        console.error(`[bus_messages] Retrieved ${limited.length} messages (brief=${brief})`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Poll for new messages (efficient polling with cursor)
  server.registerTool(
    'bus_poll',
    {
      title: 'Poll New Messages',
      description:
        'Efficiently poll for new messages since last check. Returns only new messages. ' +
        'Pass the returned cursor to subsequent calls for continuous polling.',
      inputSchema: {
        cursor: z.string().optional().describe('Timestamp cursor from previous poll'),
        limit: z.number().default(5).describe('Max messages per poll (default: 5)'),
      },
      outputSchema: {
        messages: z.array(z.any()),
        count: z.number(),
        cursor: z.string(),
        hasNew: z.boolean(),
      },
    },
    async (args) => {
      const { cursor, limit } = args as { cursor?: string; limit?: number };

      const bus = await getEventBus(projectId);
      let messages = await bus.getHistory({ hours: 1 });

      // Filter to only messages after cursor
      if (cursor) {
        const cursorTime = new Date(cursor).getTime();
        messages = messages.filter((m) => new Date(m.timestamp).getTime() > cursorTime);
      }

      const effectiveLimit = Math.min(limit ?? 5, 10);
      const limited = messages.slice(0, effectiveLimit);

      // Brief format only for polling
      const briefMessages = limited.map((m) => ({
        type: m.type,
        from: m.fromAgent.name,
        title: m.payload.title,
        preview: m.payload.content.slice(0, 100) + (m.payload.content.length > 100 ? '...' : ''),
        actionable: m.payload.actionable,
      }));

      // New cursor is newest message time, or current time if no messages
      const newestMessage = limited[0];
      const newCursor = newestMessage ? newestMessage.timestamp : new Date().toISOString();

      const output = {
        messages: briefMessages,
        count: briefMessages.length,
        cursor: newCursor,
        hasNew: briefMessages.length > 0,
      };

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

      const bus = await getEventBus(projectId);

      // Use maxAgeSeconds for full EventBus, InMemoryEventBus ignores it
      const agents =
        bus instanceof EventBus
          ? await bus.getActiveAgents(maxAgeSeconds ?? 300)
          : await bus.getActiveAgents();

      const output = {
        agents,
        count: agents.length,
      };

      if (context.verbose) {
        console.error(`[bus_agents] Found ${agents.length} active agents`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

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
      const bus = await getEventBus(projectId);
      const stats = await bus.getStats();
      const mode = bus instanceof EventBus ? 'redis' : 'in-memory';

      const output = {
        projectId,
        mode,
        ...stats,
      };

      if (context.verbose) {
        console.error(
          `[bus_status] Bus status: ${stats.messageCount} messages, ${stats.activeAgents} agents [${mode}]`
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

      const bus = await getEventBus(projectId);
      await bus.heartbeat(agentId);

      const output = {
        success: true,
        agentId,
        timestamp: new Date().toISOString(),
        nextHeartbeatIn: 30, // Recommend 30 second intervals
      };

      if (context.verbose) {
        console.error(`[bus_heartbeat] Heartbeat from agent: ${agentId}`);
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
        cleanupStale: z
          .boolean()
          .default(false)
          .describe('Remove stale agents from the registry'),
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

      const bus = await getEventBus(projectId);
      const threshold = staleThresholdSeconds ?? 60;

      // Get active agents (within threshold)
      const activeAgents =
        bus instanceof EventBus
          ? await bus.getActiveAgents(threshold)
          : await bus.getActiveAgents();

      // Get all agents to find stale ones (use very large window)
      const allAgents =
        bus instanceof EventBus
          ? await bus.getActiveAgents(86400) // 24 hours
          : await bus.getActiveAgents();

      // Find stale agents (in allAgents but not in activeAgents)
      const activeIds = new Set(activeAgents.map((a) => a.id));
      const staleAgents = allAgents.filter((a) => !activeIds.has(a.id));

      let cleanedUp = 0;

      // Cleanup stale agents if requested (only works with Redis EventBus)
      if (cleanupStale && bus instanceof EventBus && staleAgents.length > 0) {
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
          worktree: a.worktree,
        })),
      };

      if (includeStale) {
        output.staleAgents = staleAgents.map((a) => ({
          id: a.id,
          name: a.name,
          worktree: a.worktree,
        }));
      }

      if (cleanupStale) {
        output.cleanedUp = cleanedUp;
      }

      if (context.verbose) {
        console.error(
          `[bus_health] Health check: ${activeAgents.length} active, ${staleAgents.length} stale`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

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
        notifyBus: z
          .boolean()
          .default(true)
          .describe('Send recovery notification to event bus'),
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

      const bus = await getEventBus(projectId);
      const threshold = staleThresholdSeconds ?? 120;
      const isDryRun = dryRun ?? false;
      const shouldNotify = notifyBus ?? true;

      // Get active vs stale agents
      const activeAgents =
        bus instanceof EventBus
          ? await bus.getActiveAgents(threshold)
          : await bus.getActiveAgents();
      const allAgents =
        bus instanceof EventBus
          ? await bus.getActiveAgents(86400)
          : await bus.getActiveAgents();

      const activeIds = new Set(activeAgents.map((a) => a.id));
      const staleAgentList = allAgents.filter((a) => !activeIds.has(a.id));
      const staleAgentIds = staleAgentList.map((a) => a.id);

      // Load tasks from .rapid/tasks.json
      const tasksFilePath = `${context.projectDir}/.rapid/tasks.json`;
      let tasks: Array<{
        id: string;
        title: string;
        status: string;
        assignedTo?: string;
        updatedAt: string;
      }> = [];

      try {
        const { readFile } = await import('node:fs/promises');
        const content = await readFile(tasksFilePath, 'utf-8');
        tasks = JSON.parse(content);
      } catch {
        // No tasks file or couldn't read
      }

      // Find tasks assigned to stale agents that are in_progress
      const tasksToRecover = tasks.filter(
        (t) =>
          t.status === 'in_progress' &&
          t.assignedTo &&
          staleAgentIds.includes(t.assignedTo)
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
          task.assignedTo = undefined;
          task.updatedAt = new Date().toISOString();
        }

        // Save updated tasks
        try {
          const { writeFile } = await import('node:fs/promises');
          await writeFile(tasksFilePath, JSON.stringify(tasks, null, 2), 'utf-8');
        } catch (err) {
          console.error('[bus_recover_tasks] Failed to save tasks:', err);
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
          content: `Recovered ${recoveredTasks.length} task(s) from stale agents:\n` +
            recoveredTasks.map((t) => `- ${t.title} (${t.taskId}) from ${t.previousAgent}`).join('\n') +
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
        console.error(
          `[bus_recover_tasks] Recovered ${recoveredTasks.length} tasks from ${staleAgentIds.length} stale agents`
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
        includeMessageCounts: z
          .boolean()
          .default(true)
          .describe('Include message count per agent'),
        includeTaskSummary: z
          .boolean()
          .default(true)
          .describe('Include task summary per agent'),
        staleThresholdSeconds: z
          .number()
          .default(60)
          .describe('Seconds for stale detection'),
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

      const bus = await getEventBus(projectId);
      const threshold = staleThresholdSeconds ?? 60;
      const degradedThreshold = threshold * 2; // 2x threshold = degraded

      // Get agents at different thresholds
      const healthyAgents =
        bus instanceof EventBus
          ? await bus.getActiveAgents(threshold)
          : await bus.getActiveAgents();
      const degradedAgentsAll =
        bus instanceof EventBus
          ? await bus.getActiveAgents(degradedThreshold)
          : await bus.getActiveAgents();
      const allAgents =
        bus instanceof EventBus
          ? await bus.getActiveAgents(86400)
          : await bus.getActiveAgents();

      const healthyIds = new Set(healthyAgents.map((a) => a.id));
      const degradedIds = new Set(degradedAgentsAll.map((a) => a.id));

      // Classify agents
      const agentReports: Array<{
        id: string;
        name: string;
        status: 'healthy' | 'degraded' | 'stale';
        worktree?: string;
        messagesToday?: number;
        tasksAssigned?: number;
        tasksCompleted?: number;
      }> = [];

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

        const report: typeof agentReports[number] = {
          id: agent.id,
          name: agent.name,
          status,
          worktree: agent.worktree,
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
            const tasks = JSON.parse(content) as Array<{
              assignedTo?: string;
              status: string;
            }>;
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
        recommendations.push(`${staleCount} stale agent(s) detected. Consider running bus_recover_tasks.`);
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
        console.error(
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
