/**
 * SQLite Storage Backend for Evaluation Logs
 *
 * Production-ready SQLite storage using better-sqlite3 for fast,
 * reliable evaluation log persistence with proper indexing and querying.
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { EvaluationLog, EvaluationOutcome } from './types.js';

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
 * SQLite-backed storage for evaluation logs
 */
export class SQLiteEvaluationStorage {
  private db: DatabaseType | null = null;
  private dbPath: string;
  private ready = false;

  constructor(dbPath: string = './eval-logs.db') {
    this.dbPath = dbPath;
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    if (this.ready) return;

    // Ensure directory exists
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Open database
    this.db = new Database(this.dbPath);

    // Configure for performance and durability
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('foreign_keys = ON');

    // Create tables
    this.createTables();

    this.ready = true;
  }

  /**
   * Create database schema
   */
  private createTables(): void {
    if (!this.db) return;

    // Main evaluation logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evaluation_logs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        persona TEXT NOT NULL,
        task_id TEXT,
        timestamp TEXT NOT NULL,
        model TEXT NOT NULL,
        system_prompt TEXT,
        user_message TEXT,
        response_content TEXT,
        thinking_content TEXT,
        outcome TEXT NOT NULL,
        error_message TEXT,
        error_type TEXT,
        error_stack TEXT,
        latency_ms INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cache_creation_tokens INTEGER,
        cache_read_tokens INTEGER,
        input_cost REAL NOT NULL,
        output_cost REAL NOT NULL,
        total_cost REAL NOT NULL,
        pricing_tier TEXT NOT NULL,
        prompt_version TEXT,
        experiment_variant TEXT,
        stop_reason TEXT,
        context_included TEXT,
        tool_calls TEXT,
        metadata TEXT,
        user_feedback TEXT,
        project_id TEXT,
        git_branch TEXT,
        git_commit TEXT,
        environment TEXT
      )
    `);

    // Create indexes for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_eval_session_id ON evaluation_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_eval_agent_id ON evaluation_logs(agent_id);
      CREATE INDEX IF NOT EXISTS idx_eval_persona ON evaluation_logs(persona);
      CREATE INDEX IF NOT EXISTS idx_eval_task_id ON evaluation_logs(task_id);
      CREATE INDEX IF NOT EXISTS idx_eval_outcome ON evaluation_logs(outcome);
      CREATE INDEX IF NOT EXISTS idx_eval_timestamp ON evaluation_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_eval_prompt_version ON evaluation_logs(prompt_version);
      CREATE INDEX IF NOT EXISTS idx_eval_experiment ON evaluation_logs(experiment_variant);
      CREATE INDEX IF NOT EXISTS idx_eval_cost ON evaluation_logs(total_cost);
      CREATE INDEX IF NOT EXISTS idx_eval_latency ON evaluation_logs(latency_ms)
    `);
  }

  /**
   * Store an evaluation log
   */
  async store(log: EvaluationLog): Promise<void> {
    this.ensureReady();

    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO evaluation_logs (
        id, session_id, agent_id, persona, task_id, timestamp, model,
        system_prompt, user_message, response_content, thinking_content,
        outcome, error_message, error_type, error_stack,
        latency_ms, input_tokens, output_tokens, total_tokens,
        cache_creation_tokens, cache_read_tokens,
        input_cost, output_cost, total_cost, pricing_tier,
        prompt_version, experiment_variant, stop_reason,
        context_included, tool_calls, metadata, user_feedback,
        project_id, git_branch, git_commit, environment
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    stmt.run(
      log.id,
      log.sessionId,
      log.agentId,
      log.persona,
      log.taskId || null,
      log.timestamp,
      log.model,
      log.systemPrompt || null,
      log.userMessage || null,
      log.responseContent,
      log.thinkingContent || null,
      log.outcome,
      log.errorMessage || null,
      log.errorType || null,
      log.errorStack || null,
      log.latencyMs,
      log.tokens.inputTokens,
      log.tokens.outputTokens,
      log.tokens.totalTokens,
      log.tokens.cacheCreationTokens || null,
      log.tokens.cacheReadTokens || null,
      log.cost.inputCost,
      log.cost.outputCost,
      log.cost.totalCost,
      log.cost.pricingTier,
      log.promptVersion || null,
      log.experimentVariant || null,
      log.stopReason || null,
      log.contextIncluded ? JSON.stringify(log.contextIncluded) : null,
      log.toolCalls ? JSON.stringify(log.toolCalls) : null,
      log.metadata ? JSON.stringify(log.metadata) : null,
      log.userFeedback ? JSON.stringify(log.userFeedback) : null,
      log.projectId || null,
      log.gitBranch || null,
      log.gitCommit || null,
      log.environment || null
    );
  }

  /**
   * Retrieve a log by ID
   */
  async get(id: string): Promise<EvaluationLog | null> {
    this.ensureReady();

    const stmt = this.db!.prepare('SELECT * FROM evaluation_logs WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToLog(row);
  }

  /**
   * Query logs with filters
   */
  async query(options: QueryOptions): Promise<EvaluationLog[]> {
    this.ensureReady();

    const { whereClause, params } = this.buildWhereClause(options);
    const sql = `
      SELECT * FROM evaluation_logs
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;

    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const stmt = this.db!.prepare(sql);
    const rows = stmt.all(...params, limit, offset) as Record<string, unknown>[];

    return rows.map((row) => this.rowToLog(row));
  }

  /**
   * Count logs matching filters
   */
  async count(options: QueryOptions): Promise<number> {
    this.ensureReady();

    const { whereClause, params } = this.buildWhereClause(options);
    const sql = `SELECT COUNT(*) as count FROM evaluation_logs ${whereClause}`;

    const stmt = this.db!.prepare(sql);
    const result = stmt.get(...params) as { count: number };

    return result.count;
  }

  /**
   * Delete a log by ID
   */
  async delete(id: string): Promise<boolean> {
    this.ensureReady();

    const stmt = this.db!.prepare('DELETE FROM evaluation_logs WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
  }

  /**
   * Clear all logs
   */
  async clear(): Promise<void> {
    this.ensureReady();

    this.db!.exec('DELETE FROM evaluation_logs');
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    if (this.db) {
      // Checkpoint WAL before closing
      this.db.pragma('wal_checkpoint(TRUNCATE)');
      this.db.close();
      this.db = null;
    }
    this.ready = false;
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalLogs: number;
    totalCost: number;
    averageLatency: number;
    successRate: number;
  }> {
    this.ensureReady();

    const stmt = this.db!.prepare(`
      SELECT
        COUNT(*) as total_logs,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(AVG(latency_ms), 0) as avg_latency,
        COALESCE(
          SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0),
          0
        ) as success_rate
      FROM evaluation_logs
    `);

    const result = stmt.get() as {
      total_logs: number;
      total_cost: number;
      avg_latency: number;
      success_rate: number;
    };

    return {
      totalLogs: result.total_logs,
      totalCost: result.total_cost,
      averageLatency: result.avg_latency,
      successRate: result.success_rate,
    };
  }

  /**
   * Export logs to JSONL format
   */
  async exportToJSONL(): Promise<string> {
    this.ensureReady();

    const stmt = this.db!.prepare('SELECT * FROM evaluation_logs ORDER BY timestamp DESC');
    const rows = stmt.all() as Record<string, unknown>[];

    const lines = rows.map((row) => {
      const log = this.rowToLog(row);
      return JSON.stringify(log);
    });

    return lines.join('\n');
  }

  /**
   * Ensure database is ready
   */
  private ensureReady(): void {
    if (!this.ready || !this.db) {
      throw new Error('SQLite evaluation storage not initialized. Call initialize() first.');
    }
  }

  /**
   * Build WHERE clause for filtering
   */
  private buildWhereClause(options: QueryOptions): { whereClause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.agentId) {
      conditions.push('agent_id = ?');
      params.push(options.agentId);
    }
    if (options.sessionId) {
      conditions.push('session_id = ?');
      params.push(options.sessionId);
    }
    if (options.persona) {
      conditions.push('persona = ?');
      params.push(options.persona);
    }
    if (options.taskId) {
      conditions.push('task_id = ?');
      params.push(options.taskId);
    }
    if (options.outcome) {
      conditions.push('outcome = ?');
      params.push(options.outcome);
    }
    if (options.promptVersion) {
      conditions.push('prompt_version = ?');
      params.push(options.promptVersion);
    }
    if (options.experimentVariant) {
      conditions.push('experiment_variant = ?');
      params.push(options.experimentVariant);
    }
    if (options.startDate) {
      conditions.push('timestamp >= ?');
      params.push(options.startDate.toISOString());
    }
    if (options.endDate) {
      conditions.push('timestamp <= ?');
      params.push(options.endDate.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  /**
   * Convert database row to EvaluationLog
   */
  private rowToLog(row: Record<string, unknown>): EvaluationLog {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      agentId: row.agent_id as string,
      persona: row.persona as string,
      taskId: (row.task_id as string | null) || undefined,
      timestamp: row.timestamp as string,
      systemPrompt: (row.system_prompt as string | null) || '',
      userMessage: (row.user_message as string | null) || '',
      responseContent: row.response_content as string,
      thinkingContent: (row.thinking_content as string | null) || undefined,
      contextIncluded: row.context_included
        ? JSON.parse(row.context_included as string)
        : [],
      model: row.model as string,
      stopReason: (row.stop_reason as string | null) || undefined,
      outcome: row.outcome as EvaluationOutcome,
      errorMessage: (row.error_message as string | null) || undefined,
      errorType: (row.error_type as string | null) || undefined,
      errorStack: (row.error_stack as string | null) || undefined,
      tokens: {
        inputTokens: row.input_tokens as number,
        outputTokens: row.output_tokens as number,
        totalTokens: row.total_tokens as number,
        cacheCreationTokens: (row.cache_creation_tokens as number | null) || undefined,
        cacheReadTokens: (row.cache_read_tokens as number | null) || undefined,
      },
      latencyMs: row.latency_ms as number,
      cost: {
        inputCost: row.input_cost as number,
        outputCost: row.output_cost as number,
        totalCost: row.total_cost as number,
        pricingTier: row.pricing_tier as string,
      },
      promptVersion: (row.prompt_version as string | null) || undefined,
      experimentVariant: (row.experiment_variant as string | null) || undefined,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls as string) : [],
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      userFeedback: row.user_feedback
        ? JSON.parse(row.user_feedback as string)
        : undefined,
      projectId: (row.project_id as string | null) || undefined,
      gitBranch: (row.git_branch as string | null) || undefined,
      gitCommit: (row.git_commit as string | null) || undefined,
      environment: (row.environment as string | null) || undefined,
    };
  }
}
