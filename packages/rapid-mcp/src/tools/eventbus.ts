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
  formatMessagesForInjection,
  getRedisStatus,
  type AgentInfo,
  type Message,
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

  // Check if Redis is running (started by `rapid start`)
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
      return bus;
    }
  } catch {
    // Redis not available, fall back to in-memory
  }

  // Fall back to in-memory
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
        'Get recent messages from the event bus. ' +
        'Returns messages from other agents for coordination.',
      inputSchema: {
        hours: z.number().default(1).describe('Get messages from the last N hours'),
        types: z.array(MessageType).optional().describe('Filter by message types'),
        limit: z.number().default(20).describe('Maximum number of messages'),
        format: z
          .enum(['json', 'inject'])
          .default('json')
          .describe('Output format: json or inject (formatted for context injection)'),
      },
      outputSchema: {
        messages: z.array(z.any()),
        count: z.number(),
        formatted: z.string().optional(),
      },
    },
    async (args) => {
      const { hours, types, limit, format } = args as {
        hours?: number;
        types?: z.infer<typeof MessageType>[];
        limit?: number;
        format?: 'json' | 'inject';
      };

      const bus = await getEventBus(projectId);
      const historyOptions: { hours: number; types?: z.infer<typeof MessageType>[] } = {
        hours: hours ?? 1,
      };
      if (types !== undefined) {
        historyOptions.types = types;
      }
      const messages = await bus.getHistory(historyOptions);

      const limited = messages.slice(0, limit ?? 20);

      const output: {
        messages: Message[];
        count: number;
        formatted?: string;
      } = {
        messages: limited,
        count: limited.length,
      };

      if (format === 'inject') {
        output.formatted = formatMessagesForInjection(limited);
      }

      if (context.verbose) {
        console.error(`[bus_messages] Retrieved ${limited.length} messages`);
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
