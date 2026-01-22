/**
 * Agent Logs Tools
 *
 * MCP tools for accessing and managing agent output logs via Redis Streams.
 * Provides real-time log streaming, retrieval, and cleanup capabilities.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Redis } from 'ioredis';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('agent-logs');

// Singleton Redis instance for log streaming
let redisClient: Redis | null = null;

/**
 * Get or create Redis client for agent logs
 */
async function getRedisClient(): Promise<Redis> {
  if (redisClient && redisClient.status === 'ready') {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 20,
    lazyConnect: true,
    retryStrategy: (times) => {
      // Exponential backoff up to 3 seconds
      return Math.min(times * 50, 3000);
    },
  });

  await redisClient.connect();
  logger.info(`Connected to Redis for agent logs at ${redisUrl}`);

  return redisClient;
}

/**
 * Register agent logs tools with the MCP server
 */
export function registerAgentLogsTools(server: McpServer, context: ServerContext): void {
  // Tool: Get agent logs
  server.registerTool(
    'agent_logs',
    {
      title: 'Get Agent Logs',
      description:
        'Get output logs for an agent. Returns recent log entries from Redis Streams.',
      inputSchema: {
        agentId: z.string().describe('Agent UUID to get logs for'),
        tail: z.number().default(100).describe('Number of recent lines to return'),
        since: z
          .string()
          .optional()
          .describe('Stream cursor to get logs after (for pagination)'),
      },
      outputSchema: {
        agentId: z.string(),
        logs: z.array(
          z.object({
            id: z.string().describe('Stream entry ID'),
            timestamp: z.string(),
            stream: z.enum(['stdout', 'stderr']),
            text: z.string(),
          })
        ),
        cursor: z.string().describe('Cursor for next page'),
        hasMore: z.boolean(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { agentId, tail = 100, since } = args as {
        agentId: string;
        tail?: number;
        since?: string;
      };

      try {
        const redis = await getRedisClient();
        const streamKey = `agent:${agentId}:logs`;

        // Check if stream exists
        const exists = await redis.exists(streamKey);
        if (!exists) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  agentId,
                  logs: [],
                  cursor: '0-0',
                  hasMore: false,
                  error: `No logs found for agent ${agentId}`,
                }),
              },
            ],
            structuredContent: {
              agentId,
              logs: [],
              cursor: '0-0',
              hasMore: false,
              error: `No logs found for agent ${agentId}`,
            },
          };
        }

        // Read logs from stream
        const start = since || '-';
        const end = '+';
        const entries = await redis.xrevrange(streamKey, end, start, 'COUNT', tail);

        const logs = entries.reverse().map(([id, fields]) => {
          const fieldMap: Record<string, string> = {};
          for (let i = 0; i < fields.length; i += 2) {
            fieldMap[fields[i] as string] = fields[i + 1] as string;
          }

          return {
            id,
            timestamp: new Date(parseInt(id.split('-')[0]!)).toISOString(),
            stream: (fieldMap.stream || 'stdout') as 'stdout' | 'stderr',
            text: fieldMap.text || '',
          };
        });

        const cursor = logs.length > 0 ? logs[logs.length - 1]!.id : '0-0';

        const result = {
          agentId,
          logs,
          cursor,
          hasMore: entries.length === tail,
        };

        if (context.verbose) {
          logger.info(`[agent_logs] Retrieved ${logs.length} log entries for ${agentId}`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error(`[agent_logs] Error reading logs for ${agentId}`, err);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error, agentId }),
            },
          ],
          structuredContent: {
            agentId,
            logs: [],
            cursor: '0-0',
            hasMore: false,
            error,
          },
        };
      }
    }
  );

  // Tool: List agents with logs
  server.registerTool(
    'agent_logs_list',
    {
      title: 'List Agents with Logs',
      description: 'List all agents that have logs stored in Redis.',
      inputSchema: {
        maxAge: z
          .number()
          .default(86400)
          .describe('Max age in seconds to filter agents (default 24h)'),
      },
      outputSchema: {
        agents: z.array(
          z.object({
            agentId: z.string(),
            streamKey: z.string(),
            entryCount: z.number(),
            lastEntry: z.string().optional(),
          })
        ),
        count: z.number(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { maxAge = 86400 } = args as { maxAge?: number };

      try {
        const redis = await getRedisClient();

        // Find all agent log streams
        const keys = await redis.keys('agent:*:logs');

        const agents = [];
        const cutoffTime = Date.now() - maxAge * 1000;

        for (const key of keys) {
          const agentId = key.split(':')[1];
          if (!agentId) continue;

          // Get stream info
          const entries = await redis.xrevrange(key, '+', '-', 'COUNT', 1);

          if (entries.length > 0) {
            const lastEntryId = entries[0]![0] as string;
            const lastEntryTime = parseInt(lastEntryId.split('-')[0]!);

            if (lastEntryTime >= cutoffTime) {
              const count = await redis.xlen(key);
              agents.push({
                agentId,
                streamKey: key,
                entryCount: count,
                lastEntry: new Date(lastEntryTime).toISOString(),
              });
            }
          }
        }

        const result = {
          agents,
          count: agents.length,
        };

        if (context.verbose) {
          logger.info(`[agent_logs_list] Found ${agents.length} agents with logs`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error(`[agent_logs_list] Error listing agents`, err);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error }),
            },
          ],
          structuredContent: {
            agents: [],
            count: 0,
            error,
          },
        };
      }
    }
  );

  // Tool: Wait for new logs (blocking read)
  server.registerTool(
    'agent_logs_wait',
    {
      title: 'Wait for New Logs',
      description:
        'Wait for new log entries from an agent. Blocks until new logs arrive or timeout.',
      inputSchema: {
        agentId: z.string().describe('Agent UUID to wait for logs from'),
        cursor: z
          .string()
          .default('$')
          .describe("Stream cursor to start from ('$' for only new logs)"),
        timeout: z.number().default(30).describe('Timeout in seconds'),
      },
      outputSchema: {
        agentId: z.string(),
        logs: z.array(
          z.object({
            id: z.string(),
            timestamp: z.string(),
            stream: z.enum(['stdout', 'stderr']),
            text: z.string(),
          })
        ),
        cursor: z.string(),
        timedOut: z.boolean(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { agentId, cursor = '$', timeout = 30 } = args as {
        agentId: string;
        cursor?: string;
        timeout?: number;
      };

      try {
        const redis = await getRedisClient();
        const streamKey = `agent:${agentId}:logs`;

        // Block until new entries arrive
        const result = await redis.xread(
          'BLOCK',
          timeout * 1000,
          'STREAMS',
          streamKey,
          cursor
        );

        if (!result || result.length === 0) {
          // Timeout - no new logs
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  agentId,
                  logs: [],
                  cursor,
                  timedOut: true,
                }),
              },
            ],
            structuredContent: {
              agentId,
              logs: [],
              cursor,
              timedOut: true,
            },
          };
        }

        // Parse entries
        const [, entries] = result[0] as [string, Array<[string, string[]]>];
        const logs = entries.map(([id, fields]) => {
          const fieldMap: Record<string, string> = {};
          for (let i = 0; i < fields.length; i += 2) {
            fieldMap[fields[i] as string] = fields[i + 1] as string;
          }

          return {
            id,
            timestamp: new Date(parseInt(id.split('-')[0]!)).toISOString(),
            stream: (fieldMap.stream || 'stdout') as 'stdout' | 'stderr',
            text: fieldMap.text || '',
          };
        });

        const newCursor = logs.length > 0 ? logs[logs.length - 1]!.id : cursor;

        const output = {
          agentId,
          logs,
          cursor: newCursor,
          timedOut: false,
        };

        if (context.verbose) {
          logger.info(`[agent_logs_wait] Received ${logs.length} new log entries for ${agentId}`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error(`[agent_logs_wait] Error waiting for logs from ${agentId}`, err);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error, agentId }),
            },
          ],
          structuredContent: {
            agentId,
            logs: [],
            cursor,
            timedOut: false,
            error,
          },
        };
      }
    }
  );

  // Tool: Write log entry (for testing or manual injection)
  server.registerTool(
    'agent_logs_write',
    {
      title: 'Write Agent Log',
      description: 'Write a log entry for an agent. Used for testing or manual log injection.',
      inputSchema: {
        agentId: z.string().describe('Agent UUID to write logs for'),
        text: z.string().describe('Log text to write'),
        stream: z
          .enum(['stdout', 'stderr'])
          .default('stdout')
          .describe('Output stream'),
      },
      outputSchema: {
        agentId: z.string(),
        entryId: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { agentId, text, stream = 'stdout' } = args as {
        agentId: string;
        text: string;
        stream?: 'stdout' | 'stderr';
      };

      try {
        const redis = await getRedisClient();
        const streamKey = `agent:${agentId}:logs`;

        const entryId = await redis.xadd(streamKey, '*', 'stream', stream, 'text', text);

        const result = {
          agentId,
          entryId,
          success: true,
        };

        if (context.verbose) {
          logger.info(`[agent_logs_write] Wrote log entry ${entryId} for ${agentId}`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error(`[agent_logs_write] Error writing log for ${agentId}`, err);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error, agentId }),
            },
          ],
          structuredContent: {
            agentId,
            entryId: '',
            success: false,
            error,
          },
        };
      }
    }
  );

  // Tool: Prune old logs
  server.registerTool(
    'agent_logs_prune',
    {
      title: 'Prune Old Agent Logs',
      description: 'Remove old agent logs from Redis to free up space.',
      inputSchema: {
        maxAge: z
          .number()
          .default(86400)
          .describe('Max age in seconds - logs older than this will be removed'),
      },
      outputSchema: {
        removed: z.number(),
        freed: z.number().describe('Approximate bytes freed'),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { maxAge = 86400 } = args as { maxAge?: number };

      try {
        const redis = await getRedisClient();
        const cutoffTime = Date.now() - maxAge * 1000;
        const cutoffId = `${cutoffTime}-0`;

        // Find all agent log streams
        const keys = await redis.keys('agent:*:logs');

        let removed = 0;
        let freed = 0;

        for (const key of keys) {
          // Get stream length before pruning
          const beforeLen = await redis.xlen(key);

          // Trim stream to remove old entries
          await redis.xtrim(key, 'MINID', cutoffId);

          // Get stream length after pruning
          const afterLen = await redis.xlen(key);

          removed += beforeLen - afterLen;
          freed += (beforeLen - afterLen) * 100; // Rough estimate: 100 bytes per entry
        }

        const result = {
          removed,
          freed,
        };

        if (context.verbose) {
          logger.info(`[agent_logs_prune] Removed ${removed} old log entries`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error(`[agent_logs_prune] Error pruning logs`, err);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error }),
            },
          ],
          structuredContent: {
            removed: 0,
            freed: 0,
            error,
          },
        };
      }
    }
  );
}
