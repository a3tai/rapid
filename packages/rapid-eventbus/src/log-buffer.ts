/**
 * Log Buffer Implementation
 *
 * Redis-backed log storage for agent output streaming.
 * Uses Redis Streams for persistence and Pub/Sub for real-time delivery.
 */

import { Redis } from 'ioredis';
import { createWriteStream, type WriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  agentId: string;
  stream: 'stdout' | 'stderr';
  text: string;
}

/**
 * Log buffer configuration
 */
export interface LogBufferConfig {
  redis: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  prefix?: string;
  projectId: string;
  maxLogEntries?: number; // Max entries per agent, default 10000
  maxLogAge?: number; // Max age in seconds, default 24 hours
  filePath?: string; // Optional file path for backup
}

/**
 * Agent log metadata
 */
export interface AgentLogMeta {
  agentId: string;
  personaName: string;
  task?: string;
  startedAt: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  exitCode?: number;
}

/**
 * Internal config type with all required fields
 */
interface LogBufferInternalConfig {
  redis: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  prefix: string;
  projectId: string;
  maxLogEntries: number;
  maxLogAge: number;
  filePath: string | null;
}

/**
 * Parse Redis stream fields into a Map
 */
function parseStreamFields(fields: string[]): Map<string, string> {
  const fieldMap = new Map<string, string>();
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];
    if (key !== undefined && value !== undefined) {
      fieldMap.set(key, value);
    }
  }
  return fieldMap;
}

/**
 * Parse stream value to 'stdout' | 'stderr'
 */
function parseStreamType(value: string | undefined): 'stdout' | 'stderr' {
  return value === 'stderr' ? 'stderr' : 'stdout';
}

/**
 * Log buffer for agent output
 */
export class LogBuffer {
  private redis: Redis;
  private subscriber: Redis;
  private config: LogBufferInternalConfig;
  private fileStream: WriteStream | null = null;
  private handlers: Map<string, Set<(entry: LogEntry) => void>> = new Map();
  private connected = false;

  constructor(config: LogBufferConfig) {
    this.config = {
      redis: config.redis,
      prefix: config.prefix ?? 'rapid',
      projectId: config.projectId,
      maxLogEntries: config.maxLogEntries ?? 10000,
      maxLogAge: config.maxLogAge ?? 86400,
      filePath: config.filePath ?? null,
    };

    // Create Redis connections
    if (config.redis.url) {
      this.redis = new Redis(config.redis.url);
      this.subscriber = new Redis(config.redis.url);
    } else {
      const redisOptions: {
        host: string;
        port: number;
        db: number;
        password?: string;
      } = {
        host: config.redis.host ?? 'localhost',
        port: config.redis.port ?? 6379,
        db: config.redis.db ?? 0,
      };
      if (config.redis.password) {
        redisOptions.password = config.redis.password;
      }
      this.redis = new Redis(redisOptions);
      this.subscriber = new Redis(redisOptions);
    }
  }

  /**
   * Get Redis key with prefix
   */
  private key(suffix: string): string {
    return `${this.config.prefix}:${suffix}`;
  }

  /**
   * Get log stream key for an agent
   */
  private logStreamKey(agentId: string): string {
    return this.key(`logs:${this.config.projectId}:${agentId}`);
  }

  /**
   * Get log metadata key for an agent
   */
  private logMetaKey(agentId: string): string {
    return this.key(`logs:${this.config.projectId}:${agentId}:meta`);
  }

  /**
   * Get pub/sub channel for an agent's logs
   */
  private logChannelKey(agentId: string): string {
    return this.key(`logs:${this.config.projectId}:${agentId}:stream`);
  }

  /**
   * Get agents log index key
   */
  private get agentsLogIndexKey(): string {
    return this.key(`logs:${this.config.projectId}:agents`);
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    await this.redis.ping();
    this.connected = true;
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    // Close file stream if open
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }

    // Unsubscribe from all channels
    for (const agentId of this.handlers.keys()) {
      await this.subscriber.unsubscribe(this.logChannelKey(agentId));
    }
    this.handlers.clear();

    this.subscriber.disconnect();
    this.redis.disconnect();
    this.connected = false;
  }

  /**
   * Initialize log buffer for an agent
   */
  async initAgent(meta: AgentLogMeta): Promise<void> {
    // Store metadata
    await this.redis.hset(this.logMetaKey(meta.agentId), {
      agentId: meta.agentId,
      personaName: meta.personaName,
      task: meta.task ?? '',
      startedAt: meta.startedAt,
      status: meta.status,
    });

    // Add to agents index
    await this.redis.zadd(this.agentsLogIndexKey, Date.now(), meta.agentId);

    // Initialize file stream if path provided
    if (this.config.filePath) {
      await mkdir(dirname(this.config.filePath), { recursive: true });
      this.fileStream = createWriteStream(this.config.filePath, { flags: 'a' });
    }
  }

  /**
   * Update agent status
   */
  async updateStatus(
    agentId: string,
    status: AgentLogMeta['status'],
    exitCode?: number
  ): Promise<void> {
    const updates: Record<string, string | number> = { status };
    if (exitCode !== undefined) {
      updates.exitCode = exitCode;
    }
    await this.redis.hset(this.logMetaKey(agentId), updates);
  }

  /**
   * Write a log entry
   */
  async write(
    agentId: string,
    text: string,
    stream: 'stdout' | 'stderr' = 'stdout'
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      agentId,
      stream,
      text,
    };

    // Add to Redis Stream
    await this.redis.xadd(
      this.logStreamKey(agentId),
      'MAXLEN',
      '~',
      this.config.maxLogEntries.toString(),
      '*',
      'timestamp',
      entry.timestamp,
      'stream',
      entry.stream,
      'text',
      entry.text
    );

    // Publish for real-time subscribers
    await this.redis.publish(this.logChannelKey(agentId), JSON.stringify(entry));

    // Write to file if configured
    if (this.fileStream) {
      this.fileStream.write(text);
    }
  }

  /**
   * Write multiple lines
   */
  async writeLines(
    agentId: string,
    lines: string[],
    stream: 'stdout' | 'stderr' = 'stdout'
  ): Promise<void> {
    const pipeline = this.redis.pipeline();
    const timestamp = new Date().toISOString();

    for (const text of lines) {
      if (!text.trim()) continue;

      pipeline.xadd(
        this.logStreamKey(agentId),
        'MAXLEN',
        '~',
        this.config.maxLogEntries.toString(),
        '*',
        'timestamp',
        timestamp,
        'stream',
        stream,
        'text',
        text
      );

      const entry: LogEntry = { timestamp, agentId, stream, text };
      pipeline.publish(this.logChannelKey(agentId), JSON.stringify(entry));
    }

    await pipeline.exec();

    // Write to file if configured
    if (this.fileStream) {
      this.fileStream.write(lines.join('\n') + '\n');
    }
  }

  /**
   * Get log entries for an agent
   */
  async getLogs(
    agentId: string,
    options?: {
      tail?: number; // Get last N entries
      since?: string; // Stream ID to start from
      limit?: number; // Max entries to return
    }
  ): Promise<{ entries: LogEntry[]; cursor: string }> {
    const limit = options?.limit ?? options?.tail ?? 100;

    let entries: LogEntry[] = [];
    let cursor = '0';

    if (options?.tail) {
      // Get last N entries using XREVRANGE
      const results = await this.redis.xrevrange(
        this.logStreamKey(agentId),
        '+',
        '-',
        'COUNT',
        limit.toString()
      );

      entries = results.reverse().map(([id, fields]) => {
        const fieldMap = parseStreamFields(fields);
        cursor = id;
        return {
          timestamp: fieldMap.get('timestamp') ?? new Date().toISOString(),
          agentId,
          stream: parseStreamType(fieldMap.get('stream')),
          text: fieldMap.get('text') ?? '',
        };
      });
    } else {
      // Get entries since cursor
      const since = options?.since ?? '0';
      const results = await this.redis.xrange(
        this.logStreamKey(agentId),
        since === '0' ? '-' : `(${since}`,
        '+',
        'COUNT',
        limit.toString()
      );

      entries = results.map(([id, fields]) => {
        const fieldMap = parseStreamFields(fields);
        cursor = id;
        return {
          timestamp: fieldMap.get('timestamp') ?? new Date().toISOString(),
          agentId,
          stream: parseStreamType(fieldMap.get('stream')),
          text: fieldMap.get('text') ?? '',
        };
      });
    }

    return { entries, cursor };
  }

  /**
   * Get agent metadata
   */
  async getMeta(agentId: string): Promise<AgentLogMeta | null> {
    const meta = await this.redis.hgetall(this.logMetaKey(agentId));
    if (!meta || !meta.agentId || !meta.personaName || !meta.startedAt || !meta.status) {
      return null;
    }

    const result: AgentLogMeta = {
      agentId: meta.agentId,
      personaName: meta.personaName,
      startedAt: meta.startedAt,
      status: meta.status as AgentLogMeta['status'],
    };

    if (meta.task) {
      result.task = meta.task;
    }

    if (meta.exitCode) {
      result.exitCode = parseInt(meta.exitCode, 10);
    }

    return result;
  }

  /**
   * List all agents with logs
   */
  async listAgents(options?: { maxAgeSeconds?: number }): Promise<string[]> {
    const maxAge = options?.maxAgeSeconds ?? 86400;
    const minScore = maxAge > 0 ? Date.now() - maxAge * 1000 : 0;

    const agents = await this.redis.zrangebyscore(
      this.agentsLogIndexKey,
      minScore.toString(),
      '+inf'
    );

    return agents;
  }

  /**
   * Subscribe to real-time log updates for an agent
   */
  async subscribe(
    agentId: string,
    handler: (entry: LogEntry) => void
  ): Promise<() => Promise<void>> {
    const channel = this.logChannelKey(agentId);

    // Track handlers
    if (!this.handlers.has(agentId)) {
      this.handlers.set(agentId, new Set());

      // Subscribe to channel
      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', (ch: string, message: string) => {
        if (ch !== channel) return;
        try {
          const entry = JSON.parse(message) as LogEntry;
          const handlers = this.handlers.get(agentId);
          if (handlers) {
            for (const h of handlers) {
              try {
                h(entry);
              } catch {
                // Ignore handler errors
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      });
    }

    this.handlers.get(agentId)!.add(handler);

    // Return unsubscribe function
    return async () => {
      const handlers = this.handlers.get(agentId);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(agentId);
          await this.subscriber.unsubscribe(channel);
        }
      }
    };
  }

  /**
   * Wait for new log entries (blocking read)
   */
  async waitForLogs(
    agentId: string,
    cursor: string = '$',
    timeoutMs: number = 30000
  ): Promise<{ entries: LogEntry[]; cursor: string; timedOut: boolean }> {
    try {
      const results = await this.redis.xread(
        'COUNT',
        100,
        'BLOCK',
        timeoutMs,
        'STREAMS',
        this.logStreamKey(agentId),
        cursor
      );

      if (!results) {
        return { entries: [], cursor, timedOut: true };
      }

      const entries: LogEntry[] = [];
      let newCursor = cursor;

      for (const [, streamEntries] of results) {
        for (const [id, fields] of streamEntries) {
          const fieldMap = parseStreamFields(fields);
          newCursor = id;
          entries.push({
            timestamp: fieldMap.get('timestamp') ?? new Date().toISOString(),
            agentId,
            stream: parseStreamType(fieldMap.get('stream')),
            text: fieldMap.get('text') ?? '',
          });
        }
      }

      return { entries, cursor: newCursor, timedOut: false };
    } catch {
      return { entries: [], cursor, timedOut: true };
    }
  }

  /**
   * Delete logs for an agent
   */
  async deleteLogs(agentId: string): Promise<void> {
    await this.redis.del(this.logStreamKey(agentId));
    await this.redis.del(this.logMetaKey(agentId));
    await this.redis.zrem(this.agentsLogIndexKey, agentId);
  }

  /**
   * Prune old logs
   */
  async pruneOldLogs(maxAgeSeconds?: number): Promise<number> {
    const maxAge = maxAgeSeconds ?? this.config.maxLogAge;
    const cutoff = Date.now() - maxAge * 1000;

    // Get agents older than cutoff
    const oldAgents = await this.redis.zrangebyscore(
      this.agentsLogIndexKey,
      '0',
      cutoff.toString()
    );

    // Delete their logs
    for (const agentId of oldAgents) {
      await this.deleteLogs(agentId);
    }

    return oldAgents.length;
  }

  /**
   * Check if Redis is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

/**
 * Create a log buffer instance
 */
export function createLogBuffer(config: LogBufferConfig): LogBuffer {
  return new LogBuffer(config);
}
