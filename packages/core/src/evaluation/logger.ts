/**
 * Evaluation Logger
 *
 * Captures and stores agent interactions for prompt improvement and analysis.
 * Supports multiple storage backends (SQLite, Redis, file, memory).
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type {
  EvaluationLog,
  EvaluationLoggerConfig,
  EvaluationStorageConfig,
  ToolCallRecord,
  TokenUsage,
  CostBreakdown,
  EvaluationOutcome,
  EvaluationLogBuilder,
  PricingConfig,
  UserFeedback,
} from './types.js';
import { DEFAULT_PRICING as PRICING_CONFIGS } from './types.js';

/**
 * Storage backend interface
 */
interface StorageBackend {
  /** Store a log entry */
  store(log: EvaluationLog): Promise<void>;
  /** Retrieve a log by ID */
  get(id: string): Promise<EvaluationLog | null>;
  /** Query logs with filters */
  query(options: QueryOptions): Promise<EvaluationLog[]>;
  /** Count logs matching filters */
  count(options: QueryOptions): Promise<number>;
  /** Delete a log by ID */
  delete(id: string): Promise<boolean>;
  /** Clear all logs */
  clear(): Promise<void>;
  /** Close/cleanup resources */
  close(): Promise<void>;
}

interface QueryOptions {
  agentId?: string;
  sessionId?: string;
  persona?: string;
  taskId?: string;
  outcome?: EvaluationOutcome;
  promptVersion?: string;
  experimentVariant?: string;
  startDate?: Date;
  endDate?: Date;
  offset?: number;
  limit?: number;
}

/**
 * In-memory storage backend
 */
class MemoryStorage implements StorageBackend {
  private logs: Map<string, EvaluationLog> = new Map();
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  async store(log: EvaluationLog): Promise<void> {
    // Enforce size limit (FIFO eviction)
    if (this.logs.size >= this.maxSize) {
      const firstKey = this.logs.keys().next().value;
      if (firstKey) {
        this.logs.delete(firstKey);
      }
    }
    this.logs.set(log.id, log);
  }

  async get(id: string): Promise<EvaluationLog | null> {
    return this.logs.get(id) ?? null;
  }

  async query(options: QueryOptions): Promise<EvaluationLog[]> {
    let results = Array.from(this.logs.values());

    // Apply filters
    if (options.agentId) {
      results = results.filter((l) => l.agentId === options.agentId);
    }
    if (options.sessionId) {
      results = results.filter((l) => l.sessionId === options.sessionId);
    }
    if (options.persona) {
      results = results.filter((l) => l.persona === options.persona);
    }
    if (options.taskId) {
      results = results.filter((l) => l.taskId === options.taskId);
    }
    if (options.outcome) {
      results = results.filter((l) => l.outcome === options.outcome);
    }
    if (options.promptVersion) {
      results = results.filter((l) => l.promptVersion === options.promptVersion);
    }
    if (options.experimentVariant) {
      results = results.filter((l) => l.experimentVariant === options.experimentVariant);
    }
    if (options.startDate) {
      results = results.filter((l) => new Date(l.timestamp) >= options.startDate!);
    }
    if (options.endDate) {
      results = results.filter((l) => new Date(l.timestamp) <= options.endDate!);
    }

    // Sort by timestamp descending
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async count(options: QueryOptions): Promise<number> {
    const results = await this.query({ ...options, offset: 0, limit: Infinity });
    return results.length;
  }

  async delete(id: string): Promise<boolean> {
    return this.logs.delete(id);
  }

  async clear(): Promise<void> {
    this.logs.clear();
  }

  async close(): Promise<void> {
    // No cleanup needed
  }

  /** Get all logs (for export) */
  getAll(): EvaluationLog[] {
    return Array.from(this.logs.values());
  }
}

/**
 * File-based storage backend (JSONL format)
 */
class FileStorage implements StorageBackend {
  private dir: string;
  private indexFile: string;
  private index: Map<string, string> = new Map(); // id -> filename

  constructor(dir: string) {
    this.dir = dir;
    this.indexFile = join(dir, 'index.json');

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Load index if exists
    if (existsSync(this.indexFile)) {
      try {
        const data = JSON.parse(readFileSync(this.indexFile, 'utf-8'));
        this.index = new Map(Object.entries(data));
      } catch {
        // Start fresh if index is corrupted
        this.index = new Map();
      }
    }
  }

  private getFilePath(log: EvaluationLog): string {
    const date = new Date(log.timestamp);
    const dateStr = date.toISOString().split('T')[0];
    return join(this.dir, `${dateStr}.jsonl`);
  }

  private saveIndex(): void {
    writeFileSync(this.indexFile, JSON.stringify(Object.fromEntries(this.index), null, 2));
  }

  async store(log: EvaluationLog): Promise<void> {
    const filePath = this.getFilePath(log);
    appendFileSync(filePath, JSON.stringify(log) + '\n');
    this.index.set(log.id, filePath);
    this.saveIndex();
  }

  async get(id: string): Promise<EvaluationLog | null> {
    const filePath = this.index.get(id);
    if (!filePath || !existsSync(filePath)) {
      return null;
    }

    const lines = readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const log = JSON.parse(line) as EvaluationLog;
        if (log.id === id) {
          return log;
        }
      } catch {
        // Skip malformed lines
      }
    }
    return null;
  }

  async query(options: QueryOptions): Promise<EvaluationLog[]> {
    const results: EvaluationLog[] = [];

    // Read all JSONL files in directory
    const files = existsSync(this.dir)
      ? readdirSync(this.dir)
          .filter((f) => f.endsWith('.jsonl'))
          .sort()
          .reverse()
      : [];

    for (const file of files) {
      const filePath = join(this.dir, file);
      const lines = readFileSync(filePath, 'utf-8').split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const log = JSON.parse(line) as EvaluationLog;

          // Apply filters
          if (options.agentId && log.agentId !== options.agentId) continue;
          if (options.sessionId && log.sessionId !== options.sessionId) continue;
          if (options.persona && log.persona !== options.persona) continue;
          if (options.taskId && log.taskId !== options.taskId) continue;
          if (options.outcome && log.outcome !== options.outcome) continue;
          if (options.promptVersion && log.promptVersion !== options.promptVersion) continue;
          if (options.experimentVariant && log.experimentVariant !== options.experimentVariant)
            continue;
          if (options.startDate && new Date(log.timestamp) < options.startDate) continue;
          if (options.endDate && new Date(log.timestamp) > options.endDate) continue;

          results.push(log);
        } catch {
          // Skip malformed lines
        }
      }

      // Early exit if we have enough results
      const limit = options.limit ?? 100;
      const offset = options.offset ?? 0;
      if (results.length >= offset + limit + 1000) {
        break;
      }
    }

    // Sort by timestamp descending
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async count(options: QueryOptions): Promise<number> {
    const results = await this.query({ ...options, offset: 0, limit: Infinity });
    return results.length;
  }

  async delete(id: string): Promise<boolean> {
    // File storage doesn't support efficient deletion
    // Mark as deleted in index
    const deleted = this.index.delete(id);
    this.saveIndex();
    return deleted;
  }

  async clear(): Promise<void> {
    // Remove all JSONL files
    if (existsSync(this.dir)) {
      const files = readdirSync(this.dir);
      for (const file of files) {
        unlinkSync(join(this.dir, file));
      }
    }
    this.index.clear();
  }

  async close(): Promise<void> {
    // No cleanup needed
  }
}

// Import file system functions for FileStorage
import { readdirSync, unlinkSync } from 'fs';

/**
 * Create storage backend based on configuration
 */
function createStorage(config: EvaluationStorageConfig): StorageBackend {
  switch (config.type) {
    case 'memory':
      return new MemoryStorage(config.memoryLimit);
    case 'file':
      if (!config.fileDir) {
        throw new Error('fileDir is required for file storage');
      }
      return new FileStorage(config.fileDir);
    case 'sqlite':
      // SQLite backend would require additional dependency
      // Fall back to file storage for now
      console.warn('SQLite storage not yet implemented, using file storage');
      return new FileStorage(config.sqlitePath ? dirname(config.sqlitePath) : './eval-logs');
    case 'redis':
      // Redis backend would integrate with existing Redis infrastructure
      console.warn('Redis storage not yet implemented, using memory storage');
      return new MemoryStorage(config.memoryLimit ?? 10000);
    default:
      return new MemoryStorage();
  }
}

/**
 * Calculate cost from token usage
 */
export function calculateCost(
  tokens: TokenUsage,
  model: string,
  pricing: PricingConfig[] = PRICING_CONFIGS
): CostBreakdown {
  // Find matching pricing tier
  const tier =
    pricing.find((p) => model.toLowerCase().includes(p.modelPattern.toLowerCase())) ??
    pricing.find((p) => p.tier === 'sonnet') ??
    pricing[0];

  if (!tier) {
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      pricingTier: 'unknown',
    };
  }

  const inputCost = (tokens.inputTokens * tier.inputPer1M) / 1_000_000;
  const outputCost = (tokens.outputTokens * tier.outputPer1M) / 1_000_000;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    pricingTier: tier.tier,
  };
}

/**
 * Builder implementation for creating evaluation logs
 */
class EvaluationLogBuilderImpl implements EvaluationLogBuilder {
  private log: Partial<EvaluationLog>;
  private startTime: number;

  constructor() {
    this.log = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      toolCalls: [],
      contextIncluded: [],
      tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      cost: { inputCost: 0, outputCost: 0, totalCost: 0, pricingTier: 'unknown' },
      latencyMs: 0,
      outcome: 'unknown',
      responseContent: '',
      systemPrompt: '',
      userMessage: '',
      model: 'unknown',
    };
    this.startTime = Date.now();
  }

  setSession(sessionId: string, agentId: string, persona: string): this {
    this.log.sessionId = sessionId;
    this.log.agentId = agentId;
    this.log.persona = persona;
    return this;
  }

  setTask(taskId: string): this {
    this.log.taskId = taskId;
    return this;
  }

  setPrompt(systemPrompt: string, userMessage: string): this {
    this.log.systemPrompt = systemPrompt;
    this.log.userMessage = userMessage;
    return this;
  }

  addContext(contextPath: string): this {
    this.log.contextIncluded?.push(contextPath);
    return this;
  }

  setResponse(content: string, thinkingContent?: string): this {
    this.log.responseContent = content;
    if (thinkingContent) {
      this.log.thinkingContent = thinkingContent;
    }
    return this;
  }

  addToolCall(toolCall: ToolCallRecord): this {
    this.log.toolCalls?.push(toolCall);
    return this;
  }

  setOutcome(outcome: EvaluationOutcome, errorMessage?: string): this {
    this.log.outcome = outcome;
    if (errorMessage) {
      this.log.errorMessage = errorMessage;
    }
    return this;
  }

  setMetrics(tokens: TokenUsage, latencyMs: number, cost: CostBreakdown): this {
    this.log.tokens = tokens;
    this.log.latencyMs = latencyMs;
    this.log.cost = cost;
    return this;
  }

  setModel(model: string, stopReason?: string): this {
    this.log.model = model;
    if (stopReason) {
      this.log.stopReason = stopReason;
    }
    return this;
  }

  setPromptVersion(version: string, variant?: string): this {
    this.log.promptVersion = version;
    if (variant) {
      this.log.experimentVariant = variant;
    }
    return this;
  }

  addMetadata(key: string, value: unknown): this {
    if (!this.log.metadata) {
      this.log.metadata = {};
    }
    this.log.metadata[key] = value;
    return this;
  }

  build(): EvaluationLog {
    // Calculate latency if not set
    if (this.log.latencyMs === 0) {
      this.log.latencyMs = Date.now() - this.startTime;
    }

    // Ensure all required fields are present
    if (!this.log.sessionId || !this.log.agentId || !this.log.persona) {
      throw new Error('Session info (sessionId, agentId, persona) is required');
    }

    return this.log as EvaluationLog;
  }
}

/**
 * Main Evaluation Logger class
 */
export class EvaluationLogger {
  private storage: StorageBackend;
  private config: EvaluationLoggerConfig;
  private activeBuilders: Map<string, EvaluationLogBuilderImpl> = new Map();

  constructor(config: EvaluationLoggerConfig) {
    this.config = {
      captureThinking: true,
      captureToolDetails: true,
      maxResponseLength: 50000,
      maxThinkingLength: 20000,
      captureHistory: false,
      samplingRate: 1.0,
      ...config,
    };
    this.storage = createStorage(config.storage);
  }

  /**
   * Start a new evaluation log for an interaction
   */
  startLog(sessionId: string, agentId: string, persona: string): EvaluationLogBuilder {
    const builder = new EvaluationLogBuilderImpl();
    builder.setSession(sessionId, agentId, persona);

    // Add default tags
    if (this.config.defaultTags) {
      for (const [key, value] of Object.entries(this.config.defaultTags)) {
        builder.addMetadata(key, value);
      }
    }

    // Track active builder
    const id = `${sessionId}:${agentId}`;
    this.activeBuilders.set(id, builder);

    return builder;
  }

  /**
   * Complete and store an evaluation log
   */
  async completeLog(builder: EvaluationLogBuilder): Promise<EvaluationLog> {
    const log = builder.build();

    // Apply truncation
    if (this.config.maxResponseLength && log.responseContent.length > this.config.maxResponseLength) {
      log.responseContent =
        log.responseContent.substring(0, this.config.maxResponseLength) + '... [truncated]';
    }
    if (
      this.config.maxThinkingLength &&
      log.thinkingContent &&
      log.thinkingContent.length > this.config.maxThinkingLength
    ) {
      log.thinkingContent =
        log.thinkingContent.substring(0, this.config.maxThinkingLength) + '... [truncated]';
    }

    // Apply sampling
    if (this.config.samplingRate && this.config.samplingRate < 1.0) {
      if (Math.random() > this.config.samplingRate) {
        // Skip storing but still return the log
        return log;
      }
    }

    // Store the log
    await this.storage.store(log);

    // Clean up active builder
    const id = `${log.sessionId}:${log.agentId}`;
    this.activeBuilders.delete(id);

    return log;
  }

  /**
   * Log an interaction directly (convenience method)
   */
  async log(log: EvaluationLog): Promise<void> {
    await this.storage.store(log);
  }

  /**
   * Get a log by ID
   */
  async get(id: string): Promise<EvaluationLog | null> {
    return this.storage.get(id);
  }

  /**
   * Query logs
   */
  async query(options: QueryOptions): Promise<EvaluationLog[]> {
    return this.storage.query(options);
  }

  /**
   * Count logs matching filters
   */
  async count(options: QueryOptions): Promise<number> {
    return this.storage.count(options);
  }

  /**
   * Get logs by session
   */
  async getBySession(sessionId: string): Promise<EvaluationLog[]> {
    return this.query({ sessionId });
  }

  /**
   * Get logs by agent
   */
  async getByAgent(agentId: string, limit = 100): Promise<EvaluationLog[]> {
    return this.query({ agentId, limit });
  }

  /**
   * Get logs by prompt version (for A/B testing)
   */
  async getByPromptVersion(promptVersion: string): Promise<EvaluationLog[]> {
    return this.query({ promptVersion });
  }

  /**
   * Add user feedback to an existing log
   */
  async addFeedback(logId: string, feedback: UserFeedback): Promise<boolean> {
    const log = await this.get(logId);
    if (!log) {
      return false;
    }

    log.userFeedback = feedback;

    // Update outcome if feedback indicates failure
    if (feedback.taskCompleted === false && log.outcome !== 'failure') {
      log.outcome = 'failure';
    } else if (feedback.taskCompleted === true && log.outcome === 'unknown') {
      log.outcome = 'success';
    }

    await this.storage.store(log);
    return true;
  }

  /**
   * Delete a log
   */
  async delete(id: string): Promise<boolean> {
    return this.storage.delete(id);
  }

  /**
   * Clear all logs
   */
  async clear(): Promise<void> {
    await this.storage.clear();
  }

  /**
   * Close the logger and cleanup resources
   */
  async close(): Promise<void> {
    await this.storage.close();
  }
}

/**
 * Create an evaluation logger instance
 */
export function createEvaluationLogger(config: EvaluationLoggerConfig): EvaluationLogger {
  return new EvaluationLogger(config);
}

/**
 * Create a log builder for manual construction
 */
export function createLogBuilder(): EvaluationLogBuilder {
  return new EvaluationLogBuilderImpl();
}
