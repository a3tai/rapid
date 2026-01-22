/**
 * Agent Logging Tools
 *
 * MCP tools for accessing and streaming agent output logs.
 * Uses Redis Streams for real-time log access.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';
import { createLogBuffer, type LogBuffer, type LogEntry } from '@a3t/rapid-eventbus';
import { getProjectId } from '../utils/projectId.js';

const logger = createLogger('logging');

// Singleton LogBuffer instance
let logBuffer: LogBuffer | null = null;

/**
 * Get or create the LogBuffer instance
 */
async function getLogBuffer(context: ServerContext): Promise<LogBuffer> {
  if (!logBuffer) {
    const projectId = await getProjectId(context.projectDir);
    // Check REDIS_URL first (Docker), then fall back to REDIS_HOST/PORT (local)
    const redisUrl = process.env.REDIS_URL;
    logBuffer = createLogBuffer({
      redis: redisUrl
        ? { url: redisUrl }
        : {
            host: process.env.REDIS_HOST ?? 'localhost',
            port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
          },
      projectId,
    });
    await logBuffer.connect();
  }
  return logBuffer;
}

/**
 * Register agent logging tools
 */
export function registerLoggingTools(server: McpServer, context: ServerContext): void {
  // Tool: agent_logs - Get logs for an agent
  server.tool(
    'agent_logs',
    'Get output logs for an agent. Returns recent log entries from Redis Streams.',
    {
      agentId: z.string().describe('Agent UUID to get logs for'),
      tail: z.number().optional().default(100).describe('Number of recent lines to return'),
      since: z.string().optional().describe('Stream cursor to get logs after (for pagination)'),
    },
    async ({ agentId, tail, since }) => {
      try {
        const buffer = await getLogBuffer(context);
        const { entries, cursor } = await buffer.getLogs(agentId, {
          tail: since ? undefined : tail,
          since,
          limit: tail,
        });

        const meta = await buffer.getMeta(agentId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  agentId,
                  personaName: meta?.personaName ?? 'unknown',
                  status: meta?.status ?? 'unknown',
                  lineCount: entries.length,
                  cursor,
                  logs: entries.map((e) => e.text).join('\n'),
                },
                null,
                2
              ),
            },
          ],
          structuredContent: {
            agentId,
            personaName: meta?.personaName ?? 'unknown',
            status: meta?.status ?? 'unknown',
            lineCount: entries.length,
            cursor,
            entries,
          },
        };
      } catch (error) {
        logger.error('Failed to get agent logs:', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
                agentId,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: agent_logs_list - List agents with logs
  server.tool(
    'agent_logs_list',
    'List all agents that have logs stored in Redis.',
    {
      maxAge: z
        .number()
        .optional()
        .default(86400)
        .describe('Max age in seconds to filter agents (default 24h)'),
    },
    async ({ maxAge }) => {
      try {
        const buffer = await getLogBuffer(context);
        const agentIds = await buffer.listAgents({ maxAgeSeconds: maxAge });

        // Get metadata for each agent
        const agents = await Promise.all(
          agentIds.map(async (agentId) => {
            const meta = await buffer.getMeta(agentId);
            return {
              agentId,
              personaName: meta?.personaName ?? 'unknown',
              status: meta?.status ?? 'unknown',
              startedAt: meta?.startedAt,
              task: meta?.task,
            };
          })
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ agents, count: agents.length }, null, 2),
            },
          ],
          structuredContent: {
            agents,
            count: agents.length,
          },
        };
      } catch (error) {
        logger.error('Failed to list agent logs:', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: agent_logs_wait - Wait for new log entries (blocking)
  server.tool(
    'agent_logs_wait',
    'Wait for new log entries from an agent. Blocks until new logs arrive or timeout.',
    {
      agentId: z.string().describe('Agent UUID to wait for logs from'),
      cursor: z
        .string()
        .optional()
        .default('$')
        .describe("Stream cursor to start from ('$' for only new logs)"),
      timeout: z.number().optional().default(30).describe('Timeout in seconds'),
    },
    async ({ agentId, cursor, timeout }) => {
      try {
        const buffer = await getLogBuffer(context);
        const { entries, cursor: newCursor, timedOut } = await buffer.waitForLogs(
          agentId,
          cursor,
          timeout * 1000
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  agentId,
                  timedOut,
                  lineCount: entries.length,
                  cursor: newCursor,
                  logs: entries.map((e) => e.text).join('\n'),
                },
                null,
                2
              ),
            },
          ],
          structuredContent: {
            agentId,
            timedOut,
            lineCount: entries.length,
            cursor: newCursor,
            entries,
          },
        };
      } catch (error) {
        logger.error('Failed to wait for agent logs:', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
                agentId,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: agent_logs_write - Write a log entry (for testing/debugging)
  server.tool(
    'agent_logs_write',
    'Write a log entry for an agent. Used for testing or manual log injection.',
    {
      agentId: z.string().describe('Agent UUID to write logs for'),
      text: z.string().describe('Log text to write'),
      stream: z.enum(['stdout', 'stderr']).optional().default('stdout').describe('Output stream'),
    },
    async ({ agentId, text, stream }) => {
      try {
        const buffer = await getLogBuffer(context);
        await buffer.write(agentId, text, stream);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, agentId, written: text.length }),
            },
          ],
          structuredContent: {
            success: true,
            agentId,
            written: text.length,
          },
        };
      } catch (error) {
        logger.error('Failed to write agent log:', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
                agentId,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: agent_logs_prune - Clean up old logs
  server.tool(
    'agent_logs_prune',
    'Remove old agent logs from Redis to free up space.',
    {
      maxAge: z
        .number()
        .optional()
        .default(86400)
        .describe('Max age in seconds - logs older than this will be removed'),
    },
    async ({ maxAge }) => {
      try {
        const buffer = await getLogBuffer(context);
        const pruned = await buffer.pruneOldLogs(maxAge);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ pruned, maxAge }),
            },
          ],
          structuredContent: {
            pruned,
            maxAge,
          },
        };
      } catch (error) {
        logger.error('Failed to prune agent logs:', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  logger.info('Registered agent logging tools');
}
