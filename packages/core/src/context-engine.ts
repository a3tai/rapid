/**
 * Context Engine
 *
 * Enables agents to learn, store, and retrieve knowledge across sessions.
 * Supports multiple memory types: episodic, semantic, procedural, decision_trace.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './logger.js';

/**
 * Memory types for the context engine
 */
export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'decision_trace';

/**
 * Access control for knowledge sharing between agents
 */
export interface AccessControl {
  scope: 'private' | 'shared' | 'public';
  ownerAgentId: string;
  allowedAgents?: string[]; // for 'shared' scope only
}

/**
 * A single entry in the context store
 */
export interface ContextEntry {
  id: string;
  memoryType: MemoryType;
  key: string;
  value: unknown;
  embedding: number[] | undefined;
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    confidence: number;
    accessCount: number;
    lastAccessed: string;
    expiresAt: string | undefined;
    tags: string[];
    relatedKeys: string[];
    accessControl: AccessControl;
    source?: string; // e.g., task_id, analysis_result, etc.
  };
}

/**
 * Configuration for the context engine
 */
export interface ContextEngineConfig {
  projectDir: string;
  redisUrl?: string;
  vectorDbUrl?: string;
  enableEmbeddings?: boolean;
}

/**
 * Filter options for querying context
 */
export interface ContextFilter {
  memoryType?: MemoryType;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  minConfidence?: number;
  createdBy?: string;
  agentId?: string; // agent requesting the data
}

/**
 * Context Engine - Manages agent learning and knowledge storage
 *
 * Phase 1: Basic CRUD with in-memory/file storage
 * Phase 2: Add Redis persistence
 * Phase 3: Add semantic search with embeddings
 * Phase 4: Add decision trace capture
 * Phase 5: Add agent knowledge sharing
 */
export class ContextEngine {
  private entries: Map<string, ContextEntry> = new Map();
  private projectDir: string;
  private storageDir: string;
  private storageFile: string;

  constructor(config: ContextEngineConfig) {
    this.projectDir = config.projectDir;
    this.storageDir = join(this.projectDir, '.rapid', 'context');
    this.storageFile = join(this.storageDir, 'knowledge.json');

    logger.debug(`ContextEngine initialized for project: ${config.projectDir}`);
    this.loadFromFile();
  }

  /**
   * Load context entries from file storage
   */
  private loadFromFile(): void {
    try {
      if (existsSync(this.storageFile)) {
        const content = readFileSync(this.storageFile, 'utf-8');
        const data: ContextEntry[] = JSON.parse(content);

        for (const entry of data) {
          this.entries.set(entry.key, entry);
        }

        logger.debug(`Loaded ${data.length} context entries from ${this.storageFile}`);
      }
    } catch (error) {
      logger.warn(
        `Failed to load context from file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Persist entries to file storage
   */
  private async saveToFile(): Promise<void> {
    try {
      // Create directory if it doesn't exist
      if (!existsSync(this.storageDir)) {
        mkdirSync(this.storageDir, { recursive: true });
      }

      const entries = Array.from(this.entries.values());
      writeFileSync(this.storageFile, JSON.stringify(entries, null, 2), 'utf-8');
      logger.debug(`Persisted ${entries.length} context entries to ${this.storageFile}`);
    } catch (error) {
      logger.error(
        `Failed to save context to file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Learn new knowledge with optional access control
   */
  async learn(
    key: string,
    value: unknown,
    memoryType: MemoryType = 'semantic',
    metadata?: {
      confidence?: number;
      tags?: string[];
      relatedKeys?: string[];
      expiresAt?: string;
      createdBy?: string;
      scope?: 'private' | 'shared' | 'public';
      allowedAgents?: string[];
      source?: string;
    }
  ): Promise<ContextEntry> {
    const agentId = metadata?.createdBy ?? 'system';

    const entry: ContextEntry = {
      id: randomUUID(),
      memoryType,
      key,
      value,
      embedding: undefined,
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: agentId,
        confidence: metadata?.confidence ?? 0.8,
        accessCount: 0,
        lastAccessed: new Date().toISOString(),
        tags: metadata?.tags ?? [],
        relatedKeys: metadata?.relatedKeys ?? [],
        expiresAt: metadata?.expiresAt as string | undefined,
        accessControl: {
          scope: metadata?.scope ?? 'public',
          ownerAgentId: agentId,
          ...(metadata?.allowedAgents ? { allowedAgents: metadata.allowedAgents } : {}),
        },
        ...(metadata?.source ? { source: metadata.source } : {}),
      },
    };

    this.entries.set(key, entry);
    logger.debug(`Learned: ${memoryType}/${key} by ${agentId}`);

    // Persist to file
    await this.saveToFile();

    return entry;
  }

  /**
   * Check if an agent has access to a knowledge entry
   */
  private canAccess(entry: ContextEntry, agentId?: string): boolean {
    const ac = entry.metadata.accessControl;

    if (ac.scope === 'public') {
      return true;
    }

    if (!agentId) {
      return false;
    }

    if (ac.scope === 'private') {
      return ac.ownerAgentId === agentId;
    }

    if (ac.scope === 'shared') {
      return ac.ownerAgentId === agentId || (ac.allowedAgents?.includes(agentId) ?? false);
    }

    return false;
  }

  /**
   * Recall specific knowledge by key with optional access control
   */
  async recall(key: string, agentId?: string): Promise<ContextEntry | null> {
    const entry = this.entries.get(key);

    if (entry) {
      if (!this.canAccess(entry, agentId)) {
        logger.warn(`Access denied: agent ${agentId} cannot recall ${key}`);
        return null;
      }

      entry.metadata.accessCount++;
      entry.metadata.lastAccessed = new Date().toISOString();
      logger.debug(`Recalled: ${entry.memoryType}/${key} by ${agentId ?? 'system'}`);
    }

    return entry ?? null;
  }

  /**
   * List all context entries with optional filtering and access control
   */
  async list(filter?: ContextFilter): Promise<ContextEntry[]> {
    let results = Array.from(this.entries.values());

    // Apply access control
    results = results.filter((e) => this.canAccess(e, filter?.agentId));

    if (filter?.memoryType) {
      results = results.filter((e) => e.memoryType === filter.memoryType);
    }

    if (filter?.createdBy) {
      results = results.filter((e) => e.metadata.createdBy === filter.createdBy);
    }

    if (filter?.tags && filter.tags.length > 0) {
      results = results.filter((e) => filter.tags!.some((tag) => e.metadata.tags.includes(tag)));
    }

    if (filter?.createdAfter) {
      results = results.filter((e) => new Date(e.metadata.createdAt) > filter.createdAfter!);
    }

    if (filter?.createdBefore) {
      results = results.filter((e) => new Date(e.metadata.createdAt) < filter.createdBefore!);
    }

    if (filter?.minConfidence !== undefined) {
      results = results.filter((e) => e.metadata.confidence >= filter.minConfidence!);
    }

    logger.debug(`Listed ${results.length} context entries (${filter?.agentId ?? 'system'})`);

    return results;
  }

  /**
   * Forget (remove) knowledge by key
   */
  async forget(key: string): Promise<boolean> {
    const existed = this.entries.has(key);

    if (existed) {
      this.entries.delete(key);
      logger.debug(`Forgot: ${key}`);

      // Persist to file
      await this.saveToFile();
    }

    return existed;
  }

  /**
   * Update knowledge (replaces value, preserves metadata)
   */
  async update(
    key: string,
    value: unknown,
    metadata?: Partial<ContextEntry['metadata']>
  ): Promise<ContextEntry | null> {
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    entry.value = value;
    entry.metadata.updatedAt = new Date().toISOString();

    if (metadata) {
      entry.metadata = {
        ...entry.metadata,
        ...metadata,
      };
    }

    logger.debug(`Updated: ${entry.memoryType}/${key}`);

    // Persist to file
    await this.saveToFile();

    return entry;
  }

  /**
   * Share knowledge with specific agents
   */
  async share(
    key: string,
    agentIds: string[],
    options?: { replace?: boolean }
  ): Promise<ContextEntry | null> {
    const entry = this.entries.get(key);

    if (!entry) {
      logger.warn(`Cannot share: knowledge entry not found: ${key}`);
      return null;
    }

    if (entry.metadata.accessControl.scope !== 'shared') {
      if (!options?.replace) {
        logger.warn(`Cannot share: entry is not in 'shared' scope`);
        return null;
      }
      entry.metadata.accessControl.scope = 'shared';
    }

    entry.metadata.accessControl.allowedAgents = agentIds;
    entry.metadata.updatedAt = new Date().toISOString();

    logger.debug(`Shared ${key} with agents: ${agentIds.join(', ')}`);
    await this.saveToFile();

    return entry;
  }

  /**
   * Make knowledge public (accessible to all agents)
   */
  async makePublic(key: string): Promise<ContextEntry | null> {
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    entry.metadata.accessControl.scope = 'public';
    entry.metadata.updatedAt = new Date().toISOString();

    logger.debug(`Made public: ${key}`);
    await this.saveToFile();

    return entry;
  }

  /**
   * Make knowledge private (only accessible to owner)
   */
  async makePrivate(key: string): Promise<ContextEntry | null> {
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    entry.metadata.accessControl.scope = 'private';
    entry.metadata.updatedAt = new Date().toISOString();

    logger.debug(`Made private: ${key}`);
    await this.saveToFile();

    return entry;
  }

  /**
   * Get all knowledge created by specific agent
   */
  async getAgentKnowledge(agentId: string): Promise<ContextEntry[]> {
    return Array.from(this.entries.values()).filter((e) => e.metadata.createdBy === agentId);
  }

  /**
   * Search for context entries (Phase 2: semantic search with embeddings)
   * Currently returns entries matching tags/keys
   */
  async search(
    query: string,
    _options?: { memoryType?: MemoryType; limit?: number; agentId?: string }
  ): Promise<ContextEntry[]> {
    // Phase 1: Simple substring matching in keys and tags
    let results = Array.from(this.entries.values()).filter(
      (e) => e.key.includes(query) || e.metadata.tags.some((t) => t.includes(query))
    );

    // Apply access control if agentId provided
    if (_options?.agentId) {
      results = results.filter((e) => this.canAccess(e, _options.agentId));
    }

    // Apply limit if provided
    if (_options?.limit) {
      results = results.slice(0, _options.limit);
    }

    logger.debug(`Search for "${query}" found ${results.length} results`);

    return results;
  }

  /**
   * Get statistics about stored context
   */
  async getStats(): Promise<{
    totalEntries: number;
    byMemoryType: Record<MemoryType, number>;
    oldestEntry: string | null;
    mostAccessed: string | null;
  }> {
    const entries = Array.from(this.entries.values());
    const byMemoryType: Record<MemoryType, number> = {
      episodic: 0,
      semantic: 0,
      procedural: 0,
      decision_trace: 0,
    };

    for (const entry of entries) {
      byMemoryType[entry.memoryType]++;
    }

    const oldest = entries.length
      ? entries.reduce((a, b) =>
          new Date(a.metadata.createdAt) < new Date(b.metadata.createdAt) ? a : b
        )
      : null;

    const mostAccessed = entries.length
      ? entries.reduce((a, b) => (a.metadata.accessCount > b.metadata.accessCount ? a : b))
      : null;

    return {
      totalEntries: entries.length,
      byMemoryType,
      oldestEntry: oldest?.key ?? null,
      mostAccessed: mostAccessed?.key ?? null,
    };
  }

  /**
   * Inject relevant context for a task (filters by keywords/tags)
   * Useful for providing agents with relevant knowledge at task start
   */
  async inject(taskKeywords: string[], maxResults: number = 10): Promise<ContextEntry[]> {
    let results: ContextEntry[] = [];

    // Search for each keyword and collect results
    for (const keyword of taskKeywords) {
      const found = await this.search(keyword, { limit: maxResults });
      results = results.concat(found);
    }

    // Deduplicate by key and sort by confidence
    const unique = new Map<string, ContextEntry>();
    for (const entry of results) {
      if (!unique.has(entry.key)) {
        unique.set(entry.key, entry);
      }
    }

    const sorted = Array.from(unique.values())
      .sort((a, b) => b.metadata.confidence - a.metadata.confidence)
      .slice(0, maxResults);

    logger.debug(`Injected ${sorted.length} relevant context entries for task`);

    return sorted;
  }

  /**
   * Consolidate knowledge (move older, low-confidence entries)
   * Useful for cleaning up context store before archiving
   */
  async consolidate(options?: {
    maxAge?: number; // days
    minConfidence?: number;
  }): Promise<{ archived: number; kept: number }> {
    const now = new Date();
    const maxAge = options?.maxAge ?? 30; // default 30 days
    const minConfidence = options?.minConfidence ?? 0.5;

    let archived = 0;
    let kept = 0;

    for (const [key, entry] of this.entries) {
      const age =
        (now.getTime() - new Date(entry.metadata.createdAt).getTime()) / (1000 * 60 * 60 * 24);

      // Archive old, low-confidence entries
      if (age > maxAge && entry.metadata.confidence < minConfidence) {
        this.entries.delete(key);
        archived++;
      } else {
        kept++;
      }
    }

    if (archived > 0) {
      await this.saveToFile();
    }

    logger.debug(`Consolidation: archived ${archived} entries, kept ${kept}`);

    return { archived, kept };
  }

  /**
   * Clear all context (use with caution)
   */
  async clear(): Promise<void> {
    this.entries.clear();
    logger.warn('ContextEngine cleared all entries');
    await this.saveToFile();
  }

  /**
   * Export all context as JSON (for backup/transfer)
   */
  async export(): Promise<ContextEntry[]> {
    return Array.from(this.entries.values());
  }

  /**
   * Import context from JSON
   */
  async import(entries: ContextEntry[]): Promise<number> {
    let imported = 0;

    for (const entry of entries) {
      this.entries.set(entry.key, entry);
      imported++;
    }

    logger.debug(`Imported ${imported} context entries`);

    return imported;
  }
}

/**
 * Create a new context engine
 */
export function createContextEngine(config: ContextEngineConfig): ContextEngine {
  return new ContextEngine(config);
}
