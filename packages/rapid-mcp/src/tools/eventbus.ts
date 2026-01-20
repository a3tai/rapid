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
}
