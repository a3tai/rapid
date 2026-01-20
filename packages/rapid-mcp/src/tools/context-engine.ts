/**
 * Context Engine MCP Tools
 *
 * Tools for agents to learn, recall, and search through stored knowledge.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ContextEngine, type MemoryType, type ContextFilter } from '@a3t/rapid-core';
import type { ServerContext } from '../server.js';

// In-memory engine instance (will be replaced with Redis in Phase 2)
let contextEngine: ContextEngine | null = null;

/**
 * Register context engine tools with MCP server
 */
export async function registerContextEngineTools(
  server: McpServer,
  context: ServerContext
): Promise<void> {
  // Initialize context engine
  if (!contextEngine) {
    const redisUrl = process.env.REDIS_URL;
    contextEngine = new ContextEngine({
      projectDir: context.projectDir,
      ...(redisUrl ? { redisUrl } : {}),
      enableEmbeddings: process.env.ENABLE_EMBEDDINGS === 'true',
    });
  }

  /**
   * Learn: Store new knowledge
   */
  server.registerTool(
    'context_learn',
    {
      title: 'Learn and Store Knowledge',
      description:
        'Store new knowledge in the context engine. Supports multiple memory types: episodic (experiences), semantic (facts), procedural (patterns), decision_trace (why decisions were made).',
      inputSchema: z.object({
        key: z.string().describe('Unique identifier for this knowledge'),
        value: z.unknown().describe('The knowledge content (string, object, array, etc)'),
        memoryType: z
          .enum(['episodic', 'semantic', 'procedural', 'decision_trace'])
          .default('semantic')
          .describe('Type of memory'),
        confidence: z.number().min(0).max(1).default(0.8).describe('Confidence level (0-1)'),
        tags: z.array(z.string()).optional().describe('Tags for organization'),
        relatedKeys: z.array(z.string()).optional().describe('Related knowledge keys'),
      }),
      outputSchema: z.object({
        id: z.string(),
        key: z.string(),
        memoryType: z.string(),
        stored: z.boolean(),
      }),
    },
    async (args) => {
      const entry = await contextEngine!.learn(args.key, args.value, args.memoryType, {
        confidence: args.confidence,
        ...(args.tags ? { tags: args.tags } : {}),
        ...(args.relatedKeys ? { relatedKeys: args.relatedKeys } : {}),
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: entry.id,
              key: entry.key,
              memoryType: entry.memoryType,
              stored: true,
            }),
          },
        ],
        structuredContent: {
          id: entry.id,
          key: entry.key,
          memoryType: entry.memoryType,
          stored: true,
        },
      };
    }
  );

  /**
   * Recall: Retrieve specific knowledge
   */
  server.registerTool(
    'context_recall',
    {
      title: 'Recall Knowledge',
      description: 'Retrieve previously stored knowledge by key',
      inputSchema: z.object({
        key: z.string().describe('Key of the knowledge to recall'),
      }),
      outputSchema: z.object({
        found: z.boolean(),
        key: z.string().optional(),
        value: z.unknown().optional(),
        memoryType: z.string().optional(),
        confidence: z.number().optional(),
      }),
    },
    async (args) => {
      const entry = await contextEngine!.recall(args.key);

      if (!entry) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ found: false }),
            },
          ],
          structuredContent: { found: false },
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              found: true,
              key: entry.key,
              value: entry.value,
              memoryType: entry.memoryType,
              confidence: entry.metadata.confidence,
            }),
          },
        ],
        structuredContent: {
          found: true,
          key: entry.key,
          value: entry.value,
          memoryType: entry.memoryType,
          confidence: entry.metadata.confidence,
        },
      };
    }
  );

  /**
   * List: Query stored knowledge
   */
  server.registerTool(
    'context_list',
    {
      title: 'List Knowledge Entries',
      description:
        'List stored knowledge entries with optional filtering by memory type, tags, or confidence',
      inputSchema: z.object({
        memoryType: z
          .enum(['episodic', 'semantic', 'procedural', 'decision_trace'])
          .optional()
          .describe('Filter by memory type'),
        tags: z.array(z.string()).optional().describe('Filter by tags (any match)'),
        minConfidence: z.number().min(0).max(1).optional().describe('Minimum confidence level'),
        limit: z.number().default(50).describe('Maximum results to return'),
      }),
      outputSchema: z.object({
        entries: z.array(
          z.object({
            key: z.string(),
            memoryType: z.string(),
            confidence: z.number(),
            tags: z.array(z.string()),
            createdAt: z.string(),
          })
        ),
        count: z.number(),
      }),
    },
    async (args) => {
      const filter: ContextFilter = {
        ...(args.memoryType ? { memoryType: args.memoryType as MemoryType } : {}),
        ...(args.tags ? { tags: args.tags } : {}),
        ...(args.minConfidence !== undefined ? { minConfidence: args.minConfidence } : {}),
      };

      const entries = await contextEngine!.list(filter);
      const limited = entries.slice(0, args.limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              entries: limited.map((e) => ({
                key: e.key,
                memoryType: e.memoryType,
                confidence: e.metadata.confidence,
                tags: e.metadata.tags,
                createdAt: e.metadata.createdAt,
              })),
              count: limited.length,
            }),
          },
        ],
        structuredContent: {
          entries: limited.map((e) => ({
            key: e.key,
            memoryType: e.memoryType,
            confidence: e.metadata.confidence,
            tags: e.metadata.tags,
            createdAt: e.metadata.createdAt,
          })),
          count: limited.length,
        },
      };
    }
  );

  /**
   * Search: Find knowledge by keyword
   */
  server.registerTool(
    'context_search',
    {
      title: 'Search Knowledge',
      description: 'Search for knowledge by keyword in keys and tags',
      inputSchema: z.object({
        query: z.string().describe('Search query'),
        memoryType: z
          .enum(['episodic', 'semantic', 'procedural', 'decision_trace'])
          .optional()
          .describe('Filter by memory type'),
        limit: z.number().default(20).describe('Maximum results'),
      }),
      outputSchema: z.object({
        results: z.array(z.object({ key: z.string(), memoryType: z.string() })),
        count: z.number(),
      }),
    },
    async (args) => {
      const results = await contextEngine!.search(args.query, {
        ...(args.memoryType ? { memoryType: args.memoryType as MemoryType } : {}),
        limit: args.limit,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              results: results.map((r) => ({
                key: r.key,
                memoryType: r.memoryType,
              })),
              count: results.length,
            }),
          },
        ],
        structuredContent: {
          results: results.map((r) => ({
            key: r.key,
            memoryType: r.memoryType,
          })),
          count: results.length,
        },
      };
    }
  );

  /**
   * Forget: Delete knowledge
   */
  server.registerTool(
    'context_forget',
    {
      title: 'Forget Knowledge',
      description: 'Remove stored knowledge by key',
      inputSchema: z.object({
        key: z.string().describe('Key of knowledge to delete'),
      }),
      outputSchema: z.object({
        deleted: z.boolean(),
        key: z.string(),
      }),
    },
    async (args) => {
      const deleted = await contextEngine!.forget(args.key);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              deleted,
              key: args.key,
            }),
          },
        ],
        structuredContent: {
          deleted,
          key: args.key,
        },
      };
    }
  );

  /**
   * Stats: Get context engine statistics
   */
  server.registerTool(
    'context_stats',
    {
      title: 'Get Context Statistics',
      description: 'Get statistics about stored context',
      inputSchema: z.object({}),
      outputSchema: z.object({
        totalEntries: z.number(),
        byMemoryType: z.object({
          episodic: z.number(),
          semantic: z.number(),
          procedural: z.number(),
          decision_trace: z.number(),
        }),
      }),
    },
    async () => {
      const stats = await contextEngine!.getStats();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(stats),
          },
        ],
        structuredContent: stats,
      };
    }
  );

  /**
   * Inject: Get relevant context for a task
   */
  server.registerTool(
    'context_inject',
    {
      title: 'Inject Relevant Context for Task',
      description: 'Get context entries relevant to a task based on keywords',
      inputSchema: z.object({
        keywords: z.array(z.string()).describe('Keywords to search for'),
        maxResults: z.number().default(10).describe('Maximum results to return'),
      }),
      outputSchema: z.object({
        entries: z.array(
          z.object({
            key: z.string(),
            value: z.unknown(),
            memoryType: z.string(),
            confidence: z.number(),
          })
        ),
        count: z.number(),
      }),
    },
    async (args) => {
      const entries = await contextEngine!.inject(args.keywords, args.maxResults);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              entries: entries.map((e) => ({
                key: e.key,
                value: e.value,
                memoryType: e.memoryType,
                confidence: e.metadata.confidence,
              })),
              count: entries.length,
            }),
          },
        ],
        structuredContent: {
          entries: entries.map((e) => ({
            key: e.key,
            value: e.value,
            memoryType: e.memoryType,
            confidence: e.metadata.confidence,
          })),
          count: entries.length,
        },
      };
    }
  );

  /**
   * Consolidate: Archive old, low-confidence entries
   */
  server.registerTool(
    'context_consolidate',
    {
      title: 'Consolidate Knowledge Store',
      description: 'Archive old, low-confidence entries to clean up the knowledge store',
      inputSchema: z.object({
        maxAgeInDays: z.number().default(30).describe('Maximum age in days'),
        minConfidence: z.number().default(0.5).describe('Minimum confidence score (0-1)'),
      }),
      outputSchema: z.object({
        archived: z.number(),
        kept: z.number(),
      }),
    },
    async (args) => {
      const result = await contextEngine!.consolidate({
        maxAge: args.maxAgeInDays,
        minConfidence: args.minConfidence,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
        structuredContent: result,
      };
    }
  );
}
