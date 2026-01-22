/**
 * Event Bus Messaging Tools
 *
 * Tools for sending and receiving messages between agents.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../../server.js';
import { getProjectId } from '../../utils/projectId.js';
import { createLogger } from '../../utils/logger.js';
import { MAX_EVENT_BUS_TIMEOUT } from '../../constants.js';
import { getEventBus, isRedisBus } from './storage.js';
import { MessageType, MessagePriority, type AgentInfo, type HistoryOptions, type WaitOptions } from './types.js';

const logger = createLogger('eventbus');

/**
 * Register messaging tools with the MCP server
 */
export function registerMessagingTools(server: McpServer, context: ServerContext): void {
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

      const projectId = await getProjectId(context.projectDir);
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
        logger.debug(` Sent ${type} message: ${title}`);
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
        'Use since parameter for efficient polling (only get new messages). ' +
        'Use forAgent to filter messages addressed to a specific agent.',
      inputSchema: {
        limit: z.number().default(5).describe('Maximum messages to return (default: 5, max: 20)'),
        since: z
          .string()
          .optional()
          .describe('ISO timestamp - only return messages after this time'),
        types: z.array(MessageType).optional().describe('Filter by message types'),
        brief: z.boolean().default(true).describe('Return summaries only (saves context)'),
        maxContentLength: z.number().default(200).describe('Truncate content to this length'),
        forAgent: z
          .string()
          .optional()
          .describe(
            'Only return messages addressed to this agent ID (includes broadcasts unless excludeBroadcasts=true)'
          ),
        excludeBroadcasts: z
          .boolean()
          .default(false)
          .describe('When forAgent is set, exclude broadcast messages (messages with no toAgents)'),
        onlyActionable: z
          .boolean()
          .default(false)
          .describe('Only return messages that require action'),
      },
      outputSchema: {
        messages: z.array(z.any()),
        count: z.number(),
        hasMore: z.boolean(),
        newestTimestamp: z.string().optional(),
      },
    },
    async (args) => {
      const {
        limit,
        since,
        types,
        brief,
        maxContentLength,
        forAgent,
        excludeBroadcasts,
        onlyActionable,
      } = args as {
        limit?: number;
        since?: string;
        types?: z.infer<typeof MessageType>[];
        brief?: boolean;
        maxContentLength?: number;
        forAgent?: string;
        excludeBroadcasts?: boolean;
        onlyActionable?: boolean;
      };

      const projectId = await getProjectId(context.projectDir);
      const bus = await getEventBus(projectId);
      const historyOptions: HistoryOptions = {
        hours: 1, // Always get last hour, filter by 'since' if provided
      };
      if (types !== undefined) {
        historyOptions.types = types;
      }
      if (forAgent !== undefined) {
        historyOptions.forAgent = forAgent;
        if (excludeBroadcasts !== undefined) {
          historyOptions.excludeBroadcasts = excludeBroadcasts;
        }
      }
      if (onlyActionable !== undefined) {
        historyOptions.onlyActionable = onlyActionable;
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
            preview:
              m.payload.content.length > maxLen
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
              content:
                m.payload.content.length > maxLen * 2
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
        logger.debug(` Retrieved ${limited.length} messages (brief=${brief})`);
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
        'Pass the returned cursor to subsequent calls for continuous polling. ' +
        'Use forAgent to only receive messages addressed to you.',
      inputSchema: {
        cursor: z.string().optional().describe('Timestamp cursor from previous poll'),
        limit: z.number().default(5).describe('Max messages per poll (default: 5)'),
        forAgent: z.string().optional().describe('Only return messages addressed to this agent ID'),
        excludeBroadcasts: z
          .boolean()
          .default(false)
          .describe('Exclude broadcast messages when forAgent is set'),
        onlyActionable: z
          .boolean()
          .default(false)
          .describe('Only return messages requiring action'),
      },
      outputSchema: {
        messages: z.array(z.any()),
        count: z.number(),
        cursor: z.string(),
        hasNew: z.boolean(),
      },
    },
    async (args) => {
      const { cursor, limit, forAgent, excludeBroadcasts, onlyActionable } = args as {
        cursor?: string;
        limit?: number;
        forAgent?: string;
        excludeBroadcasts?: boolean;
        onlyActionable?: boolean;
      };

      const projectId = await getProjectId(context.projectDir);
      const bus = await getEventBus(projectId);
      const historyOptions: HistoryOptions = { hours: 1 };

      if (forAgent !== undefined) {
        historyOptions.forAgent = forAgent;
        if (excludeBroadcasts !== undefined) {
          historyOptions.excludeBroadcasts = excludeBroadcasts;
        }
      }
      if (onlyActionable !== undefined) {
        historyOptions.onlyActionable = onlyActionable;
      }

      let messages = await bus.getHistory(historyOptions);

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
        toAgents: m.toAgents,
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

  // Tool: Wait for new messages (blocking)
  server.registerTool(
    'bus_wait',
    {
      title: 'Wait for Message',
      description:
        'Efficiently wait for new messages using Redis blocking read. ' +
        'This is more efficient than polling and saves tokens. ' +
        'Returns when a message arrives or timeout expires. ' +
        'Use this instead of repeated bus_poll calls when idle.',
      inputSchema: {
        cursor: z
          .string()
          .default('$')
          .describe("Stream cursor ('$' for only new messages, or cursor from previous call)"),
        timeoutSeconds: z
          .number()
          .default(30)
          .describe('Max seconds to wait (0 = forever, default: 30, max: 60)'),
        forAgent: z.string().optional().describe('Only return messages addressed to this agent'),
        types: z.array(MessageType).optional().describe('Filter by message types'),
        onlyActionable: z.boolean().default(false).describe('Only return actionable messages'),
      },
      outputSchema: {
        message: z.any().nullable().describe('The received message, or null if timed out'),
        cursor: z.string().describe('Cursor for next wait call'),
        timedOut: z.boolean().describe('True if no message received within timeout'),
        mode: z.string().describe('Bus mode (redis or in-memory)'),
      },
    },
    async (args) => {
      const { cursor, timeoutSeconds, forAgent, types, onlyActionable } = args as {
        cursor?: string;
        timeoutSeconds?: number;
        forAgent?: string;
        types?: z.infer<typeof MessageType>[];
        onlyActionable?: boolean;
      };

      const projectId = await getProjectId(context.projectDir);
      const bus = await getEventBus(projectId);

      // Only Redis EventBus supports blocking wait
      if (!isRedisBus(bus)) {
        // Fall back to polling for in-memory bus
        const historyOptions: HistoryOptions = { hours: 1 };

        if (types) historyOptions.types = types;
        if (forAgent) historyOptions.forAgent = forAgent;
        if (onlyActionable) historyOptions.onlyActionable = onlyActionable;

        const messages = await bus.getHistory(historyOptions);
        const newestMessage = messages[0];

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                message: newestMessage || null,
                cursor: cursor || '$',
                timedOut: !newestMessage,
                mode: 'in-memory (polling fallback)',
              }),
            },
          ],
          structuredContent: {
            message: newestMessage || null,
            cursor: cursor || '$',
            timedOut: !newestMessage,
            mode: 'in-memory',
          },
        };
      }

      // Cap timeout to prevent very long waits
      const effectiveTimeout = Math.min(Math.max((timeoutSeconds ?? 30) * 1000, 1000), MAX_EVENT_BUS_TIMEOUT);

      // Build options object, only including defined values
      const waitOptions: WaitOptions = {};
      if (types) waitOptions.types = types;
      if (forAgent) waitOptions.forAgent = forAgent;
      if (onlyActionable !== undefined) waitOptions.onlyActionable = onlyActionable;

      const result = await bus.waitForMessage(cursor || '$', effectiveTimeout, waitOptions);

      if (context.verbose) {
        logger.debug(
          `[bus_wait] ${result.timedOut ? 'Timed out' : 'Got message'} (cursor: ${result.cursor})`
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: result.message,
              cursor: result.cursor,
              timedOut: result.timedOut,
              mode: 'redis',
            }),
          },
        ],
        structuredContent: {
          message: result.message,
          cursor: result.cursor,
          timedOut: result.timedOut,
          mode: 'redis',
        },
      };
    }
  );
}
