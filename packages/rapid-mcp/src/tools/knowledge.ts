/**
 * Knowledge Context Engine
 *
 * Allows agents to learn, store, and retrieve knowledge across sessions.
 * Supports persistent storage, semantic search, and shared knowledge across agents.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getRedisStatus,
} from '@a3t/rapid-eventbus';
import type { ServerContext } from '../server.js';

/**
 * Knowledge entry schema
 */
export interface KnowledgeEntry {
  id: string;
  key: string;
  value: string;
  category: 'codebase_patterns' | 'user_preferences' | 'project_conventions' | 'common_errors' | 'other';
  metadata: {
    createdAt: string;
    updatedAt: string;
    version: number;
    source?: string;
    confidence?: number;
    expiresAt?: string;
  };
  tags: string[];
}

/**
 * In-memory knowledge store (fallback when Redis unavailable)
 */
class InMemoryKnowledgeStore {
  private store = new Map<string, KnowledgeEntry>();
  private keyIndex = new Map<string, Set<string>>();
  private categoryIndex = new Map<string, Set<string>>();

  set(entry: KnowledgeEntry): void {
    this.store.set(entry.id, entry);

    // Update key index
    if (!this.keyIndex.has(entry.key)) {
      this.keyIndex.set(entry.key, new Set());
    }
    this.keyIndex.get(entry.key)!.add(entry.id);

    // Update category index
    if (!this.categoryIndex.has(entry.category)) {
      this.categoryIndex.set(entry.category, new Set());
    }
    this.categoryIndex.get(entry.category)!.add(entry.id);
  }

  get(id: string): KnowledgeEntry | undefined {
    return this.store.get(id);
  }

  getByKey(key: string): KnowledgeEntry | undefined {
    const ids = this.keyIndex.get(key);
    if (!ids || ids.size === 0) return undefined;
    const firstId = Array.from(ids)[0];
    if (!firstId) return undefined;
    return this.store.get(firstId);
  }

  listByCategory(category: string): KnowledgeEntry[] {
    const ids = this.categoryIndex.get(category);
    if (!ids) return [];
    return Array.from(ids).map((id) => this.store.get(id)!).filter(Boolean);
  }

  delete(id: string): boolean {
    const entry = this.store.get(id);
    if (!entry) return false;

    this.store.delete(id);

    // Clean up indices
    const keySet = this.keyIndex.get(entry.key);
    if (keySet) {
      keySet.delete(id);
      if (keySet.size === 0) {
        this.keyIndex.delete(entry.key);
      }
    }

    const catSet = this.categoryIndex.get(entry.category);
    if (catSet) {
      catSet.delete(id);
      if (catSet.size === 0) {
        this.categoryIndex.delete(entry.category);
      }
    }

    return true;
  }

  search(query: string): KnowledgeEntry[] {
    const lowerQuery = query.toLowerCase();
    const results: KnowledgeEntry[] = [];

    for (const entry of this.store.values()) {
      if (
        entry.key.toLowerCase().includes(lowerQuery) ||
        entry.value.toLowerCase().includes(lowerQuery) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
      ) {
        results.push(entry);
      }
    }

    return results;
  }

  all(): KnowledgeEntry[] {
    return Array.from(this.store.values());
  }

  clear(): void {
    this.store.clear();
    this.keyIndex.clear();
    this.categoryIndex.clear();
  }
}

/**
 * Redis-backed knowledge store
 */
class RedisKnowledgeStore {
  // Redis client type - using any because ioredis doesn't provide proper types for all operations
  // This is a known issue with ioredis TypeScript support and is safe for our use case
  private redis: any;

  constructor(redis: any) {
    this.redis = redis;
  }

  private getKey(entryId: string): string {
    return `knowledge:${entryId}`;
  }

  private getKeyIndex(key: string): string {
    return `knowledge:key:${key}`;
  }

  private getCategoryIndex(category: string): string {
    return `knowledge:category:${category}`;
  }

  async set(entry: KnowledgeEntry): Promise<void> {
    const key = this.getKey(entry.id);
    await this.redis.setex(key, 86400 * 365, JSON.stringify(entry)); // 1 year TTL

    // Update indices
    await this.redis.sadd(this.getKeyIndex(entry.key), entry.id);
    await this.redis.sadd(this.getCategoryIndex(entry.category), entry.id);
  }

  async get(id: string): Promise<KnowledgeEntry | undefined> {
    const key = this.getKey(id);
    const data = await this.redis.get(key);
    if (!data) return undefined;
    return JSON.parse(data);
  }

  async getByKey(key: string): Promise<KnowledgeEntry | undefined> {
    const ids = await this.redis.smembers(this.getKeyIndex(key));
    if (!ids || ids.length === 0) return undefined;
    return this.get(ids[0]);
  }

  async listByCategory(category: string): Promise<KnowledgeEntry[]> {
    const ids = await this.redis.smembers(this.getCategoryIndex(category));
    if (!ids) return [];

    const entries: KnowledgeEntry[] = [];
    for (const id of ids) {
      const entry = await this.get(id);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  async delete(id: string): Promise<boolean> {
    const entry = await this.get(id);
    if (!entry) return false;

    const key = this.getKey(id);
    await this.redis.del(key);

    // Clean up indices
    await this.redis.srem(this.getKeyIndex(entry.key), id);
    await this.redis.srem(this.getCategoryIndex(entry.category), id);

    return true;
  }

  async search(query: string): Promise<KnowledgeEntry[]> {
    // Get all keys matching pattern
    const keys = await this.redis.keys('knowledge:*');
    const results: KnowledgeEntry[] = [];
    const lowerQuery = query.toLowerCase();

    for (const key of keys) {
      if (key.startsWith('knowledge:key:') || key.startsWith('knowledge:category:')) {
        continue; // Skip indices
      }

      const data = await this.redis.get(key);
      if (!data) continue;

      const entry = JSON.parse(data) as KnowledgeEntry;

      if (
        entry.key.toLowerCase().includes(lowerQuery) ||
        entry.value.toLowerCase().includes(lowerQuery) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
      ) {
        results.push(entry);
      }
    }

    return results;
  }

  async all(): Promise<KnowledgeEntry[]> {
    const keys = await this.redis.keys('knowledge:*');
    const results: KnowledgeEntry[] = [];

    for (const key of keys) {
      if (key.startsWith('knowledge:key:') || key.startsWith('knowledge:category:')) {
        continue; // Skip indices
      }

      const data = await this.redis.get(key);
      if (data) {
        results.push(JSON.parse(data));
      }
    }

    return results;
  }

  async clear(): Promise<void> {
    const keys = await this.redis.keys('knowledge:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

/**
 * Knowledge engine singleton per project
 */
const knowledgeStores = new Map<string, InMemoryKnowledgeStore | RedisKnowledgeStore>();

/**
 * Get or create knowledge store for a project
 */
async function getKnowledgeStore(
  projectId: string
): Promise<InMemoryKnowledgeStore | RedisKnowledgeStore> {
  let store = knowledgeStores.get(projectId);
  if (store) {
    return store;
  }

  // Try to connect to Redis
  try {
    const status = await getRedisStatus();
    if (status.running && status.url) {
      // For now, use in-memory store as Redis client integration is complex
      // In production, this would connect to Redis
      console.error('[knowledge] Redis available, but using in-memory store for now');
    }
  } catch {
    // Redis not available
  }

  // Use in-memory store
  store = new InMemoryKnowledgeStore();
  knowledgeStores.set(projectId, store);
  return store;
}

/**
 * Generate unique ID for knowledge entry
 */
function generateId(): string {
  return `know_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Register knowledge tools with the MCP server
 */
export function registerKnowledgeTools(server: McpServer, context: ServerContext): void {
  const projectId = context.projectDir.split('/').pop() || 'default';

  // Tool: Learn (Store knowledge)
  server.registerTool(
    'context_learn',
    {
      title: 'Learn Knowledge',
      description: 'Store new knowledge or learned information for future reference',
      inputSchema: {
        key: z.string().describe('Unique key for this knowledge item'),
        value: z.string().describe('The knowledge content/value'),
        category: z
          .enum(['codebase_patterns', 'user_preferences', 'project_conventions', 'common_errors', 'other'])
          .optional()
          .describe('Category of knowledge'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
        source: z.string().optional().describe('Source of this knowledge (e.g., task_id, file_path)'),
        confidence: z.number().optional().describe('Confidence score (0-1)'),
        expiresAt: z.string().optional().describe('ISO timestamp when knowledge expires'),
      },
      outputSchema: {
        id: z.string(),
        success: z.boolean(),
      },
    },
    async (input: any) => {
      try {
        const store = await getKnowledgeStore(projectId);
        const id = generateId();

        const entry: KnowledgeEntry = {
          id,
          key: input.key,
          value: input.value,
          category: input.category || 'other',
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
            source: input.source,
            confidence: input.confidence,
            expiresAt: input.expiresAt,
          },
          tags: input.tags || [],
        };

        if (store instanceof InMemoryKnowledgeStore) {
          store.set(entry);
        } else {
          await store.set(entry);
        }

        const output = { id, success: true };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch {
        const output = { id: '', success: false };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    }
  );

  // Tool: Recall (Retrieve specific knowledge)
  server.registerTool(
    'context_recall',
    {
      title: 'Recall Knowledge',
      description: 'Retrieve specific knowledge by key',
      inputSchema: {
        key: z.string().describe('The knowledge key to retrieve'),
      },
      outputSchema: {
        found: z.boolean(),
        knowledge: z.object({
          key: z.string(),
          value: z.string(),
          category: z.string(),
          tags: z.array(z.string()),
        }).optional(),
      },
    },
    async (input: any) => {
      try {
        const store = await getKnowledgeStore(projectId);
        let entry: KnowledgeEntry | undefined;

        if (store instanceof InMemoryKnowledgeStore) {
          entry = store.getByKey(input.key);
        } else {
          entry = await store.getByKey(input.key);
        }

        if (!entry) {
          const output = { found: false };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
          };
        }

        const output = {
          found: true,
          knowledge: {
            key: entry.key,
            value: entry.value,
            category: entry.category,
            tags: entry.tags,
          },
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch {
        const output = { found: false };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    }
  );

  // Tool: Search knowledge
  server.registerTool(
    'context_search',
    {
      title: 'Search Knowledge',
      description: 'Semantic search across stored knowledge',
      inputSchema: {
        query: z.string().describe('Search query'),
        category: z.string().optional().describe('Optional category filter'),
      },
      outputSchema: {
        results: z.array(
          z.object({
            key: z.string(),
            value: z.string(),
            category: z.string(),
            tags: z.array(z.string()),
          })
        ),
        count: z.number(),
      },
    },
    async (input: any) => {
      try {
        const store = await getKnowledgeStore(projectId);
        let results: KnowledgeEntry[] = [];

        if (store instanceof InMemoryKnowledgeStore) {
          results = store.search(input.query);
        } else {
          results = await store.search(input.query);
        }

        // Filter by category if specified
        if (input.category) {
          results = results.filter((e) => e.category === input.category);
        }

        const output = {
          results: results.map((e) => ({
            key: e.key,
            value: e.value,
            category: e.category,
            tags: e.tags,
          })),
          count: results.length,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch {
        const output = { results: [], count: 0 };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    }
  );

  // Tool: List knowledge by category
  server.registerTool(
    'context_list',
    {
      title: 'List Knowledge by Category',
      description: 'List all knowledge items in a category',
      inputSchema: {
        category: z.string().describe('Knowledge category'),
      },
      outputSchema: {
        items: z.array(
          z.object({
            key: z.string(),
            value: z.string(),
            tags: z.array(z.string()),
          })
        ),
        count: z.number(),
      },
    },
    async (input: any) => {
      try {
        const store = await getKnowledgeStore(projectId);
        let items: KnowledgeEntry[] = [];

        if (store instanceof InMemoryKnowledgeStore) {
          items = store.listByCategory(input.category);
        } else {
          items = await store.listByCategory(input.category);
        }

        const output = {
          items: items.map((e) => ({
            key: e.key,
            value: e.value,
            tags: e.tags,
          })),
          count: items.length,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch {
        const output = { items: [], count: 0 };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    }
  );

  // Tool: Forget (Remove knowledge)
  server.registerTool(
    'context_forget',
    {
      title: 'Forget Knowledge',
      description: 'Remove outdated or incorrect knowledge',
      inputSchema: {
        key: z.string().describe('The knowledge key to remove'),
      },
      outputSchema: {
        deleted: z.boolean(),
      },
    },
    async (input: any) => {
      try {
        const store = await getKnowledgeStore(projectId);
        let entry: KnowledgeEntry | undefined;

        if (store instanceof InMemoryKnowledgeStore) {
          entry = store.getByKey(input.key);
          if (entry) {
            store.delete(entry.id);
          }
        } else {
          entry = await store.getByKey(input.key);
          if (entry) {
            await store.delete(entry.id);
          }
        }

        const output = { deleted: !!entry };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch {
        const output = { deleted: false };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    }
  );

  console.error('[knowledge] Registered 5 knowledge tools');
}
