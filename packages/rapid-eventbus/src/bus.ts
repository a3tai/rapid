/**
 * Event Bus Implementation
 *
 * Redis-backed event bus for inter-agent communication.
 * Uses Redis Streams for persistence and Pub/Sub for real-time delivery.
 */

import { Redis } from 'ioredis';
import type { Message, AgentInfo, MessageType, MessagePriority } from './messages.js';
import { MessageSchema, createMessage } from './messages.js';

/**
 * Event bus configuration
 */
export interface EventBusConfig {
  redis: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  prefix?: string;
  projectId: string;
  maxMessageAge?: number; // seconds, default 24 hours
  maxMessagesPerStream?: number; // default 10000
}

/**
 * Message cursor for pagination
 */
export interface MessageCursor {
  streamId: string;
  lastId: string;
}

/**
 * Event bus for inter-agent communication
 */
export class EventBus {
  private redis: Redis;
  private subscriber: Redis;
  private config: Required<EventBusConfig>;
  private messageHandlers: Set<(message: Message) => void> = new Set();
  private connected = false;

  constructor(config: EventBusConfig) {
    this.config = {
      redis: config.redis,
      prefix: config.prefix ?? 'rapid',
      projectId: config.projectId,
      maxMessageAge: config.maxMessageAge ?? 86400, // 24 hours
      maxMessagesPerStream: config.maxMessagesPerStream ?? 10000,
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
   * Get stream key for the project
   */
  private get streamKey(): string {
    return this.key(`events:${this.config.projectId}`);
  }

  /**
   * Get pub/sub channel for the project
   */
  private get channelKey(): string {
    return this.key(`realtime:${this.config.projectId}`);
  }

  /**
   * Get agents registry key
   */
  private get agentsKey(): string {
    return this.key(`agents:${this.config.projectId}`);
  }

  /**
   * Get cursor key for an agent
   */
  private cursorKey(agentId: string): string {
    return this.key(`cursor:${this.config.projectId}:${agentId}`);
  }

  /**
   * Connect to Redis and start listening
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    // Test connection
    await this.redis.ping();

    // Subscribe to real-time channel
    await this.subscriber.subscribe(this.channelKey);
    this.subscriber.on('message', (_channel: string, message: string) => {
      try {
        const parsed = JSON.parse(message);
        const validated = MessageSchema.parse(parsed);
        this.notifyHandlers(validated);
      } catch {
        // Ignore invalid messages
      }
    });

    this.connected = true;
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    await this.subscriber.unsubscribe(this.channelKey);
    this.subscriber.disconnect();
    this.redis.disconnect();
    this.connected = false;
  }

  /**
   * Register an agent with the event bus
   */
  async registerAgent(agent: AgentInfo): Promise<string> {
    // Add to agents registry (sorted set with timestamp as score)
    await this.redis.zadd(this.agentsKey, Date.now(), JSON.stringify(agent));

    return agent.id;
  }

  /**
   * Update agent heartbeat
   */
  async heartbeat(agentId: string): Promise<void> {
    // Update score (timestamp) in sorted set
    const members = await this.redis.zrangebyscore(this.agentsKey, '-inf', '+inf');
    for (const member of members) {
      try {
        const agent = JSON.parse(member) as AgentInfo;
        if (agent.id === agentId) {
          await this.redis.zadd(this.agentsKey, Date.now(), member);
          break;
        }
      } catch {
        // Skip invalid entries
      }
    }
  }

  /**
   * Get list of active agents
   */
  async getActiveAgents(maxAgeSeconds = 300): Promise<AgentInfo[]> {
    const cutoff = Date.now() - maxAgeSeconds * 1000;
    const members = await this.redis.zrangebyscore(this.agentsKey, cutoff, '+inf');

    const agents: AgentInfo[] = [];
    for (const member of members) {
      try {
        agents.push(JSON.parse(member) as AgentInfo);
      } catch {
        // Skip invalid entries
      }
    }

    return agents;
  }

  /**
   * Unregister an agent from the event bus
   */
  async unregisterAgent(agentId: string): Promise<boolean> {
    const members = await this.redis.zrangebyscore(this.agentsKey, '-inf', '+inf');
    for (const member of members) {
      try {
        const agent = JSON.parse(member) as AgentInfo;
        if (agent.id === agentId) {
          await this.redis.zrem(this.agentsKey, member);
          return true;
        }
      } catch {
        // Skip invalid entries
      }
    }
    return false;
  }

  /**
   * Send a message to the event bus
   */
  async sendMessage(
    type: MessageType,
    fromAgent: AgentInfo,
    payload: {
      title: string;
      content: string;
      context?: Message['payload']['context'];
      actionable?: boolean;
      ttl?: number;
    },
    options?: {
      toAgents?: string[];
      priority?: MessagePriority;
    }
  ): Promise<Message> {
    const message = createMessage(type, fromAgent, payload, options);

    // Add to stream for persistence
    await this.redis.xadd(
      this.streamKey,
      'MAXLEN',
      '~',
      this.config.maxMessagesPerStream.toString(),
      '*',
      'message',
      JSON.stringify(message)
    );

    // Publish for real-time delivery
    await this.redis.publish(this.channelKey, JSON.stringify(message));

    return message;
  }

  /**
   * Get messages since a cursor
   */
  async getMessages(options?: {
    since?: string; // Stream ID cursor
    types?: MessageType[];
    limit?: number;
    fromAgent?: string;
    forAgent?: string;
    excludeBroadcasts?: boolean;
    onlyActionable?: boolean;
  }): Promise<{ messages: Message[]; cursor: string; hasMore: boolean }> {
    const limit = options?.limit ?? 10;
    const since = options?.since ?? '0';

    // Read from stream
    const results = await this.redis.xread(
      'COUNT',
      (limit + 1).toString(),
      'STREAMS',
      this.streamKey,
      since
    );

    const messages: Message[] = [];
    let lastId = since;
    let hasMore = false;

    if (results) {
      for (const [, entries] of results) {
        for (const [id, fields] of entries) {
          if (messages.length >= limit) {
            hasMore = true;
            break;
          }

          lastId = id;
          // fields is an array like ['message', '<json>']
          const messageJson = fields[1];
          if (messageJson === undefined) continue;

          try {
            const parsed = JSON.parse(messageJson);
            const validated = MessageSchema.parse(parsed);

            // Apply filters
            if (options?.types && !options.types.includes(validated.type)) {
              continue;
            }
            if (options?.fromAgent && validated.fromAgent.id !== options.fromAgent) {
              continue;
            }

            // Agent-specific filtering: only include messages directed to this agent or broadcasts
            if (options?.forAgent) {
              if (validated.toAgents && !validated.toAgents.includes(options.forAgent)) {
                continue; // Skip messages not intended for this agent
              }
            }

            // Exclude broadcast messages (messages with no specific targets)
            if (options?.excludeBroadcasts && !validated.toAgents) {
              continue;
            }

            // Only include actionable messages
            if (options?.onlyActionable && !validated.payload.actionable) {
              continue;
            }

            messages.push(validated);
          } catch {
            // Skip invalid messages
          }
        }
      }
    }

    return { messages, cursor: lastId, hasMore };
  }

  /**
   * Get message history
   */
  async getHistory(options?: {
    hours?: number;
    types?: MessageType[];
    fromAgent?: string;
    limit?: number;
    forAgent?: string;
    excludeBroadcasts?: boolean;
    onlyActionable?: boolean;
  }): Promise<Message[]> {
    const hours = options?.hours ?? 1;
    const limit = options?.limit ?? 100;
    const cutoff = Date.now() - hours * 3600 * 1000;

    // Read all messages from stream
    const results = await this.redis.xrange(this.streamKey, '-', '+', 'COUNT', limit.toString());

    const messages: Message[] = [];

    for (const [, fields] of results) {
      // fields is an array like ['message', '<json>']
      const messageJson = fields[1];
      if (messageJson === undefined) continue;

      try {
        const parsed = JSON.parse(messageJson);
        const validated = MessageSchema.parse(parsed);

        // Check timestamp
        const messageTime = new Date(validated.timestamp).getTime();
        if (messageTime < cutoff) {
          continue;
        }

        // Apply filters
        if (options?.types && !options.types.includes(validated.type)) {
          continue;
        }
        if (options?.fromAgent && validated.fromAgent.id !== options.fromAgent) {
          continue;
        }

        // Agent-specific filtering: only include messages directed to this agent or broadcasts
        if (options?.forAgent) {
          if (validated.toAgents && !validated.toAgents.includes(options.forAgent)) {
            continue; // Skip messages not intended for this agent
          }
        }

        // Exclude broadcast messages (messages with no specific targets)
        if (options?.excludeBroadcasts && !validated.toAgents) {
          continue;
        }

        // Only include actionable messages
        if (options?.onlyActionable && !validated.payload.actionable) {
          continue;
        }

        messages.push(validated);
      } catch {
        // Skip invalid messages
      }
    }

    return messages;
  }

  /**
   * Save cursor for an agent
   */
  async saveCursor(agentId: string, cursor: string): Promise<void> {
    await this.redis.set(this.cursorKey(agentId), cursor);
  }

  /**
   * Get cursor for an agent
   */
  async getCursor(agentId: string): Promise<string | null> {
    return this.redis.get(this.cursorKey(agentId));
  }

  /**
   * Prune old messages
   */
  async pruneOldMessages(): Promise<number> {
    const cutoff = Date.now() - this.config.maxMessageAge * 1000;
    const cutoffId = `${cutoff}-0`;

    // Delete messages older than cutoff
    const deleted = await this.redis.xtrim(this.streamKey, 'MINID', cutoffId);
    return deleted;
  }

  /**
   * Subscribe to real-time messages
   */
  onMessage(handler: (message: Message) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Notify all handlers of a new message
   */
  private notifyHandlers(message: Message): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch {
        // Ignore handler errors
      }
    }
  }

  /**
   * Check if Redis is connected and healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get bus statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    messageCount: number;
    activeAgents: number;
    streamLength: number;
  }> {
    const healthy = await this.isHealthy();
    const agents = await this.getActiveAgents();
    const streamInfo = await this.redis.xlen(this.streamKey);

    return {
      connected: healthy,
      messageCount: streamInfo,
      activeAgents: agents.length,
      streamLength: streamInfo,
    };
  }

  /**
   * Wait for new messages (blocking read)
   * Uses Redis XREAD BLOCK for efficient waiting without polling.
   * Returns when a message arrives or timeout expires.
   *
   * @param cursor - Start reading from this position ('$' for only new messages)
   * @param timeoutMs - Max time to wait in milliseconds (0 = wait forever, default 30000)
   * @param options - Filter options for messages
   */
  async waitForMessage(
    cursor: string = '$',
    timeoutMs: number = 30000,
    options?: {
      types?: MessageType[];
      forAgent?: string;
      excludeBroadcasts?: boolean;
      onlyActionable?: boolean;
    }
  ): Promise<{ message: Message | null; cursor: string; timedOut: boolean }> {
    try {
      // Use XREAD BLOCK to wait for new messages
      const results = await this.redis.xread(
        'COUNT',
        1,
        'BLOCK',
        timeoutMs,
        'STREAMS',
        this.streamKey,
        cursor
      );

      if (!results) {
        // Timeout - no new messages
        return { message: null, cursor, timedOut: true };
      }

      // Parse the result
      for (const [, entries] of results) {
        for (const [id, fields] of entries) {
          const messageJson = fields[1];
          if (messageJson === undefined) continue;

          try {
            const parsed = JSON.parse(messageJson);
            const validated = MessageSchema.parse(parsed);

            // Apply filters
            if (options?.types && !options.types.includes(validated.type)) {
              // Message doesn't match filter, return cursor but no message
              return { message: null, cursor: id, timedOut: false };
            }

            // Agent-specific filtering
            if (options?.forAgent) {
              if (validated.toAgents && !validated.toAgents.includes(options.forAgent)) {
                return { message: null, cursor: id, timedOut: false };
              }
            }

            if (options?.excludeBroadcasts && !validated.toAgents) {
              return { message: null, cursor: id, timedOut: false };
            }

            if (options?.onlyActionable && !validated.payload.actionable) {
              return { message: null, cursor: id, timedOut: false };
            }

            return { message: validated, cursor: id, timedOut: false };
          } catch {
            // Skip invalid messages
            return { message: null, cursor: id, timedOut: false };
          }
        }
      }

      return { message: null, cursor, timedOut: true };
    } catch (error) {
      // Redis error - return as timeout
      console.error('[EventBus] waitForMessage error:', error);
      return { message: null, cursor, timedOut: true };
    }
  }
}

/**
 * Create an event bus instance
 */
export function createEventBus(config: EventBusConfig): EventBus {
  return new EventBus(config);
}

/**
 * Create an in-memory event bus for testing or when Redis is unavailable
 */
export class InMemoryEventBus {
  private messages: Message[] = [];
  private agents: Map<string, AgentInfo> = new Map();
  private handlers: Set<(message: Message) => void> = new Set();
  private cursors: Map<string, number> = new Map();

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async registerAgent(agent: AgentInfo): Promise<string> {
    this.agents.set(agent.id, agent);
    return agent.id;
  }

  async heartbeat(_agentId: string): Promise<void> {}

  async getActiveAgents(): Promise<AgentInfo[]> {
    return Array.from(this.agents.values());
  }

  async unregisterAgent(agentId: string): Promise<boolean> {
    return this.agents.delete(agentId);
  }

  async sendMessage(
    type: MessageType,
    fromAgent: AgentInfo,
    payload: {
      title: string;
      content: string;
      context?: Message['payload']['context'];
      actionable?: boolean;
      ttl?: number;
    },
    options?: {
      toAgents?: string[];
      priority?: MessagePriority;
    }
  ): Promise<Message> {
    const message = createMessage(type, fromAgent, payload, options);
    this.messages.push(message);

    for (const handler of this.handlers) {
      try {
        handler(message);
      } catch {
        // Ignore handler errors
      }
    }

    return message;
  }

  async getMessages(options?: {
    since?: string;
    types?: MessageType[];
    limit?: number;
    forAgent?: string;
    excludeBroadcasts?: boolean;
    onlyActionable?: boolean;
  }): Promise<{ messages: Message[]; cursor: string; hasMore: boolean }> {
    const limit = options?.limit ?? 10;
    const sinceIndex = options?.since ? parseInt(options.since, 10) : 0;

    let filtered = this.messages.slice(sinceIndex);
    if (options?.types) {
      filtered = filtered.filter((m) => options.types!.includes(m.type));
    }

    // Agent-specific filtering: only include messages directed to this agent or broadcasts
    if (options?.forAgent) {
      filtered = filtered.filter((m) => !m.toAgents || m.toAgents.includes(options.forAgent!));
    }

    // Exclude broadcast messages (messages with no specific targets)
    if (options?.excludeBroadcasts) {
      filtered = filtered.filter((m) => m.toAgents);
    }

    // Only include actionable messages
    if (options?.onlyActionable) {
      filtered = filtered.filter((m) => m.payload.actionable);
    }

    const messages = filtered.slice(0, limit);
    const cursor = (sinceIndex + messages.length).toString();
    const hasMore = filtered.length > limit;

    return { messages, cursor, hasMore };
  }

  async getHistory(options?: {
    hours?: number;
    types?: MessageType[];
    forAgent?: string;
    excludeBroadcasts?: boolean;
    onlyActionable?: boolean;
  }): Promise<Message[]> {
    const hours = options?.hours ?? 1;
    const cutoff = Date.now() - hours * 3600 * 1000;

    let filtered = this.messages.filter((m) => new Date(m.timestamp).getTime() >= cutoff);

    if (options?.types) {
      filtered = filtered.filter((m) => options.types!.includes(m.type));
    }

    // Agent-specific filtering: only include messages directed to this agent or broadcasts
    if (options?.forAgent) {
      filtered = filtered.filter((m) => !m.toAgents || m.toAgents.includes(options.forAgent!));
    }

    // Exclude broadcast messages (messages with no specific targets)
    if (options?.excludeBroadcasts) {
      filtered = filtered.filter((m) => m.toAgents);
    }

    // Only include actionable messages
    if (options?.onlyActionable) {
      filtered = filtered.filter((m) => m.payload.actionable);
    }

    return filtered;
  }

  async saveCursor(agentId: string, cursor: string): Promise<void> {
    this.cursors.set(agentId, parseInt(cursor, 10));
  }

  async getCursor(agentId: string): Promise<string | null> {
    const cursor = this.cursors.get(agentId);
    return cursor !== undefined ? cursor.toString() : null;
  }

  onMessage(handler: (message: Message) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async getStats(): Promise<{
    connected: boolean;
    messageCount: number;
    activeAgents: number;
    streamLength: number;
  }> {
    return {
      connected: true,
      messageCount: this.messages.length,
      activeAgents: this.agents.size,
      streamLength: this.messages.length,
    };
  }
}
