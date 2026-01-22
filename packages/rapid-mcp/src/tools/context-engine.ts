/**
 * Context Engine MCP Tools
 *
 * Tools for agents to learn, recall, and search through stored knowledge.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ContextEngine, type MemoryType, type ContextFilter } from '@a3t/rapid-core';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

// @ts-ignore - logger available for future debug logging
const logger = createLogger('context-engine');

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
        agentId: z.string().optional().describe('Agent ID creating this knowledge'),
        scope: z
          .enum(['private', 'shared', 'public'])
          .default('public')
          .optional()
          .describe('Access scope: private (owner only), shared (specific agents), public (all)'),
        source: z.string().optional().describe('Source of knowledge (e.g., task_id, analysis_result)'),
      }),
      outputSchema: z.object({
        id: z.string(),
        key: z.string(),
        memoryType: z.string(),
        scope: z.string(),
        stored: z.boolean(),
      }),
    },
    async (args) => {
      const entry = await contextEngine!.learn(args.key, args.value, args.memoryType, {
        confidence: args.confidence,
        ...(args.tags ? { tags: args.tags } : {}),
        ...(args.relatedKeys ? { relatedKeys: args.relatedKeys } : {}),
        ...(args.agentId ? { createdBy: args.agentId } : {}),
        ...(args.scope ? { scope: args.scope } : {}),
        ...(args.source ? { source: args.source } : {}),
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: entry.id,
              key: entry.key,
              memoryType: entry.memoryType,
              scope: entry.metadata?.accessControl?.scope ?? 'public',
              stored: true,
            }),
          },
        ],
        structuredContent: {
          id: entry.id,
          key: entry.key,
          memoryType: entry.memoryType,
          scope: entry.metadata?.accessControl?.scope ?? 'public',
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
        agentId: z.string().optional().describe('Agent ID requesting the knowledge (for access control)'),
      }),
      outputSchema: z.object({
        found: z.boolean(),
        key: z.string().optional(),
        value: z.unknown().optional(),
        memoryType: z.string().optional(),
        confidence: z.number().optional(),
        scope: z.string().optional(),
      }),
    },
    async (args) => {
      const entry = await contextEngine!.recall(args.key, args.agentId);

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
              confidence: entry.metadata?.confidence ?? 0.8,
              scope: entry.metadata?.accessControl?.scope ?? 'public',
            }),
          },
        ],
        structuredContent: {
          found: true,
          key: entry.key,
          value: entry.value,
          memoryType: entry.memoryType,
          confidence: entry.metadata?.confidence ?? 0.8,
          scope: entry.metadata?.accessControl?.scope ?? 'public',
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
            value: z.unknown(),
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
                value: e.value,
                memoryType: e.memoryType,
                confidence: e.metadata?.confidence ?? 0.8,
                tags: e.metadata?.tags ?? [],
                createdAt: e.metadata?.createdAt ?? new Date().toISOString(),
              })),
              count: limited.length,
            }),
          },
        ],
        structuredContent: {
          entries: limited.map((e) => ({
            key: e.key,
            value: e.value,
            memoryType: e.memoryType,
            confidence: e.metadata?.confidence ?? 0.8,
            tags: e.metadata?.tags ?? [],
            createdAt: e.metadata?.createdAt ?? new Date().toISOString(),
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

  /**
   * Share: Share knowledge with specific agents
   */
  server.registerTool(
    'context_share',
    {
      title: 'Share Knowledge with Agents',
      description: 'Share knowledge with specific agents for cross-session collaboration',
      inputSchema: z.object({
        key: z.string().describe('Key of knowledge to share'),
        agentIds: z.array(z.string()).describe('List of agent IDs to share with'),
        replace: z.boolean().default(false).optional().describe('Replace scope if not already shared'),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        key: z.string(),
        sharedWith: z.array(z.string()).optional(),
      }),
    },
    async (args) => {
      const entry = await contextEngine!.share(args.key, args.agentIds, { replace: args.replace });

      if (!entry) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, key: args.key }),
            },
          ],
          structuredContent: { success: false, key: args.key },
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              key: entry.key,
              sharedWith: entry.metadata.accessControl.allowedAgents,
            }),
          },
        ],
        structuredContent: {
          success: true,
          key: entry.key,
          sharedWith: entry.metadata.accessControl.allowedAgents,
        },
      };
    }
  );

  /**
   * Make Public: Make knowledge accessible to all agents
   */
  server.registerTool(
    'context_make_public',
    {
      title: 'Make Knowledge Public',
      description: 'Make knowledge accessible to all agents and the system',
      inputSchema: z.object({
        key: z.string().describe('Key of knowledge to make public'),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        key: z.string(),
        scope: z.string().optional(),
      }),
    },
    async (args) => {
      const entry = await contextEngine!.makePublic(args.key);

      if (!entry) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, key: args.key }),
            },
          ],
          structuredContent: { success: false, key: args.key },
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              key: entry.key,
              scope: entry.metadata?.accessControl?.scope ?? 'public',
            }),
          },
        ],
        structuredContent: {
          success: true,
          key: entry.key,
          scope: entry.metadata?.accessControl?.scope ?? 'public',
        },
      };
    }
  );

  /**
   * Make Private: Make knowledge private to owner only
   */
  server.registerTool(
    'context_make_private',
    {
      title: 'Make Knowledge Private',
      description: 'Make knowledge private, accessible only to the owner agent',
      inputSchema: z.object({
        key: z.string().describe('Key of knowledge to make private'),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        key: z.string(),
        scope: z.string().optional(),
      }),
    },
    async (args) => {
      const entry = await contextEngine!.makePrivate(args.key);

      if (!entry) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, key: args.key }),
            },
          ],
          structuredContent: { success: false, key: args.key },
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              key: entry.key,
              scope: entry.metadata?.accessControl?.scope ?? 'public',
            }),
          },
        ],
        structuredContent: {
          success: true,
          key: entry.key,
          scope: entry.metadata?.accessControl?.scope ?? 'public',
        },
      };
    }
  );

  /**
   * Get Agent Knowledge: Get all knowledge created by an agent
   */
  server.registerTool(
    'context_get_agent_knowledge',
    {
      title: 'Get Agent Knowledge',
      description: 'Retrieve all knowledge created by a specific agent',
      inputSchema: z.object({
        agentId: z.string().describe('The agent ID to get knowledge for'),
        limit: z.number().default(50).describe('Maximum results to return'),
      }),
      outputSchema: z.object({
        entries: z.array(
          z.object({
            key: z.string(),
            memoryType: z.string(),
            scope: z.string(),
            confidence: z.number(),
          })
        ),
        count: z.number(),
      }),
    },
    async (args) => {
      const entries = await contextEngine!.getAgentKnowledge(args.agentId);
      const limited = entries.slice(0, args.limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              entries: limited.map((e) => ({
                key: e.key,
                memoryType: e.memoryType,
                scope: e.metadata?.accessControl?.scope ?? 'public',
                confidence: e.metadata.confidence,
              })),
              count: limited.length,
            }),
          },
        ],
        structuredContent: {
          entries: limited.map((e) => ({
            key: e.key,
            memoryType: e.memoryType,
            scope: e.metadata?.accessControl?.scope ?? 'public',
            confidence: e.metadata.confidence,
          })),
          count: limited.length,
        },
      };
    }
  );

  /**
   * Learn from Task Execution: Capture lessons learned from task completion/failure
   */
  server.registerTool(
    'context_learn_from_task',
    {
      title: 'Learn from Task Execution',
      description:
        'Capture lessons learned from task execution. Automatically categorizes as discovery, pattern, or bug fix based on outcome.',
      inputSchema: z.object({
        taskId: z.string().describe('ID of the task that completed'),
        taskTitle: z.string().describe('Title of the task'),
        outcome: z.enum(['success', 'failure', 'partial']).describe('Task outcome'),
        summary: z.string().describe('Summary of what was learned'),
        details: z.unknown().optional().describe('Detailed findings (object/array/string)'),
        agentId: z.string().describe('Agent ID that completed the task'),
        tags: z.array(z.string()).optional().describe('Additional tags for categorization'),
        confidence: z.number().min(0).max(1).default(0.85).describe('Confidence in this learning'),
        scope: z
          .enum(['private', 'shared', 'public'])
          .default('public')
          .optional()
          .describe('Whether to make this learning public for other agents'),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        entryId: z.string(),
        key: z.string(),
        memoryType: z.string(),
      }),
    },
    async (args) => {
      // Determine memory type based on outcome
      let memoryType: 'semantic' | 'episodic' | 'procedural' | 'decision_trace' = 'semantic';
      if (args.outcome === 'failure') {
        memoryType = 'decision_trace'; // Why did it fail?
      } else if (args.outcome === 'success' && args.summary.includes('pattern')) {
        memoryType = 'procedural'; // It's a pattern we found
      } else if (args.outcome === 'partial') {
        memoryType = 'episodic'; // An experience/episode
      }

      // Generate a unique key
      const key = `task_learning_${args.taskId}_${Date.now()}`;

      // Auto-categorize tags
      const autoTags = [
        `task_${args.outcome}`,
        `agent_${args.agentId.replace(/[^a-z0-9]/gi, '_')}`,
        ...((args.tags && args.tags.length > 0) ? args.tags : []),
      ];

      // Create the learning entry
      const entry = await contextEngine!.learn(key, {
        taskId: args.taskId,
        taskTitle: args.taskTitle,
        outcome: args.outcome,
        summary: args.summary,
        details: args.details,
        timestamp: new Date().toISOString(),
      }, memoryType, {
        confidence: args.confidence,
        tags: autoTags,
        createdBy: args.agentId,
        scope: args.scope,
        source: `task_completion:${args.taskId}`,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              entryId: entry.id,
              key: entry.key,
              memoryType: entry.memoryType,
            }),
          },
        ],
        structuredContent: {
          success: true,
          entryId: entry.id,
          key: entry.key,
          memoryType: entry.memoryType,
        },
      };
    }
  );
}
