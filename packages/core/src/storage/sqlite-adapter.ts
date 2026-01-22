/**
 * SQLite Storage Adapter
 *
 * Production-ready SQLite storage using better-sqlite3 with WAL mode.
 * Provides atomic operations, crash recovery, history tracking, and efficient queries.
 *
 * @module @a3t/rapid-core/storage
 */

import Database, { type Database as DatabaseType, type Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, statSync, copyFileSync } from 'fs';
import { dirname, join, basename } from 'path';
import type {
  StorageAdapter,
  StorageAdapterConfig,
  StorageTransaction,
  StorageStats,
  Task,
  TaskFilter,
  TaskQueryOptions,
  TaskSortOptions,
  TaskHistoryEntry,
  TaskChangeType,
  TaskStatus,
  PaginatedResult,
  PaginationOptions,
  LockOptions,
  MigrationResult,
  LegacyTask,
} from './types.js';

// ============================================================================
// Schema Definition
// ============================================================================

const SCHEMA_VERSION = 1;

const CREATE_TASKS_TABLE = `
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'normal',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    assigned_to TEXT,
    parent_id TEXT,
    tags TEXT,
    metadata TEXT,
    deadline TEXT,
    claimed_at TEXT,
    claim_deadline TEXT,
    last_progress_at TEXT,
    required_capabilities TEXT,
    estimated_duration INTEGER,
    dependencies TEXT,
    result TEXT,
    error_code TEXT,
    can_retry INTEGER,
    attempt_number INTEGER DEFAULT 1,
    requires_approval INTEGER,
    approval_type TEXT,
    approved_by TEXT,
    approved_at TEXT,
    approval_reason TEXT
  )
`;

const CREATE_HISTORY_TABLE = `
  CREATE TABLE IF NOT EXISTS task_history (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    change_type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    previous_values TEXT,
    new_values TEXT,
    message TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )
`;

const CREATE_METADATA_TABLE = `
  CREATE TABLE IF NOT EXISTS storage_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`;

const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
  CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
  CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
  CREATE INDEX IF NOT EXISTS idx_history_task ON task_history(task_id);
  CREATE INDEX IF NOT EXISTS idx_history_timestamp ON task_history(timestamp);
  CREATE INDEX IF NOT EXISTS idx_history_type ON task_history(change_type);
`;

// ============================================================================
// SQLite Storage Adapter Implementation
// ============================================================================

export class SQLiteStorageAdapter implements StorageAdapter {
  private db: DatabaseType | null = null;
  private config: Required<StorageAdapterConfig>;
  private ready = false;
  private locks = new Map<string, { count: number; resolve: () => void }>();

  // Prepared statements cache
  private stmts: {
    getTask?: Statement;
    insertTask?: Statement;
    updateTask?: Statement;
    deleteTask?: Statement;
    insertHistory?: Statement;
    countTasks?: Statement;
    taskExists?: Statement;
  } = {};

  constructor(config: StorageAdapterConfig) {
    this.config = {
      path: config.path,
      wal: config.wal ?? true,
      syncWrites: config.syncWrites ?? false,
      maxHistoryPerTask: config.maxHistoryPerTask ?? 100,
      autoBackup: config.autoBackup ?? false,
      backupInterval: config.backupInterval ?? 3600000, // 1 hour
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.ready) return;

    // Ensure directory exists
    const dir = dirname(this.config.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Open database
    this.db = new Database(this.config.path);

    // Configure for performance and durability
    if (this.config.wal) {
      this.db.pragma('journal_mode = WAL');
    }
    if (this.config.syncWrites) {
      this.db.pragma('synchronous = FULL');
    } else {
      this.db.pragma('synchronous = NORMAL');
    }

    // Set busy timeout for concurrent access
    this.db.pragma('busy_timeout = 5000');

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Create tables and indexes
    this.db.exec(CREATE_TASKS_TABLE);
    this.db.exec(CREATE_HISTORY_TABLE);
    this.db.exec(CREATE_METADATA_TABLE);
    this.db.exec(CREATE_INDEXES);

    // Store schema version
    this.db.prepare(`
      INSERT OR REPLACE INTO storage_metadata (key, value) VALUES ('schema_version', ?)
    `).run(String(SCHEMA_VERSION));

    // Prepare frequently used statements
    this.prepareStatements();

    this.ready = true;
  }

  private prepareStatements(): void {
    if (!this.db) return;

    this.stmts.getTask = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    this.stmts.insertHistory = this.db.prepare(`
      INSERT INTO task_history (id, task_id, change_type, timestamp, changed_by, previous_values, new_values, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmts.countTasks = this.db.prepare('SELECT COUNT(*) as count FROM tasks');
    this.stmts.taskExists = this.db.prepare('SELECT 1 FROM tasks WHERE id = ? LIMIT 1');
  }

  async close(): Promise<void> {
    if (this.db) {
      // Checkpoint WAL before closing
      if (this.config.wal) {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      }
      this.db.close();
      this.db = null;
      this.stmts = {};
    }
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready && this.db !== null;
  }

  private ensureReady(): void {
    if (!this.isReady()) {
      throw new Error('SQLite storage adapter not initialized');
    }
  }

  // ============================================================================
  // Task CRUD Operations
  // ============================================================================

  async createTask(
    task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    changedBy: string
  ): Promise<Task> {
    this.ensureReady();

    const now = new Date().toISOString();
    const id = task.id || randomUUID();

    const fullTask: Task = {
      ...task,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const row = this.taskToRow(fullTask);

    this.db!.prepare(`
      INSERT INTO tasks (
        id, title, description, status, priority, created_at, updated_at, created_by,
        assigned_to, parent_id, tags, metadata, deadline, claimed_at, claim_deadline,
        last_progress_at, required_capabilities, estimated_duration, dependencies,
        result, error_code, can_retry, attempt_number, requires_approval, approval_type,
        approved_by, approved_at, approval_reason
      ) VALUES (
        @id, @title, @description, @status, @priority, @created_at, @updated_at, @created_by,
        @assigned_to, @parent_id, @tags, @metadata, @deadline, @claimed_at, @claim_deadline,
        @last_progress_at, @required_capabilities, @estimated_duration, @dependencies,
        @result, @error_code, @can_retry, @attempt_number, @requires_approval, @approval_type,
        @approved_by, @approved_at, @approval_reason
      )
    `).run(row);

    // Record history
    await this.recordHistory(id, 'created', changedBy, null, fullTask);

    return fullTask;
  }

  async getTask(id: string): Promise<Task | null> {
    this.ensureReady();

    const row = this.stmts.getTask!.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    return this.rowToTask(row);
  }

  async updateTask(
    id: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt'>>,
    changedBy: string
  ): Promise<Task | null> {
    this.ensureReady();

    const existing = await this.getTask(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updatedTask: Task = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    const row = this.taskToRow(updatedTask);

    this.db!.prepare(`
      UPDATE tasks SET
        title = @title,
        description = @description,
        status = @status,
        priority = @priority,
        updated_at = @updated_at,
        assigned_to = @assigned_to,
        parent_id = @parent_id,
        tags = @tags,
        metadata = @metadata,
        deadline = @deadline,
        claimed_at = @claimed_at,
        claim_deadline = @claim_deadline,
        last_progress_at = @last_progress_at,
        required_capabilities = @required_capabilities,
        estimated_duration = @estimated_duration,
        dependencies = @dependencies,
        result = @result,
        error_code = @error_code,
        can_retry = @can_retry,
        attempt_number = @attempt_number,
        requires_approval = @requires_approval,
        approval_type = @approval_type,
        approved_by = @approved_by,
        approved_at = @approved_at,
        approval_reason = @approval_reason
      WHERE id = @id
    `).run(row);

    // Determine change type for history
    let changeType: TaskChangeType = 'updated';
    if (updates.status && updates.status !== existing.status) {
      changeType = 'status_changed';
    } else if (updates.assignedTo !== undefined && updates.assignedTo !== existing.assignedTo) {
      changeType = updates.assignedTo ? 'assigned' : 'unassigned';
    }

    await this.recordHistory(id, changeType, changedBy, existing, updates);

    return updatedTask;
  }

  async deleteTask(id: string, changedBy: string): Promise<boolean> {
    this.ensureReady();

    const existing = await this.getTask(id);
    if (!existing) return false;

    // Record history before deleting
    await this.recordHistory(id, 'deleted', changedBy, existing, null);

    const result = this.db!.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  async queryTasks(options?: TaskQueryOptions): Promise<PaginatedResult<Task>> {
    this.ensureReady();

    const filter = options?.filter || {};
    const sort = options?.sort || { field: 'createdAt', direction: 'desc' };
    const pagination = options?.pagination || { offset: 0, limit: 100 };

    const { whereClause, params } = this.buildWhereClause(filter);
    const orderClause = this.buildOrderClause(sort);

    // Get total count
    const countSql = `SELECT COUNT(*) as count FROM tasks ${whereClause}`;
    const countResult = this.db!.prepare(countSql).get(...params) as { count: number };
    const total = countResult.count;

    // Get paginated results
    const offset = pagination.offset || 0;
    const limit = pagination.limit || 100;

    const sql = `SELECT * FROM tasks ${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
    const rows = this.db!.prepare(sql).all(...params, limit, offset) as Record<string, unknown>[];

    const items = rows.map(row => this.rowToTask(row));

    return {
      items,
      total,
      offset,
      limit,
      hasMore: offset + items.length < total,
    };
  }

  async getAllTasks(): Promise<Task[]> {
    this.ensureReady();

    const rows = this.db!.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map(row => this.rowToTask(row));
  }

  async countTasks(filter?: TaskFilter): Promise<number> {
    this.ensureReady();

    if (!filter) {
      const result = this.stmts.countTasks!.get() as { count: number };
      return result.count;
    }

    const { whereClause, params } = this.buildWhereClause(filter);
    const sql = `SELECT COUNT(*) as count FROM tasks ${whereClause}`;
    const result = this.db!.prepare(sql).get(...params) as { count: number };
    return result.count;
  }

  async taskExists(id: string): Promise<boolean> {
    this.ensureReady();

    const result = this.stmts.taskExists!.get(id);
    return result !== undefined;
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  async createTasks(
    tasks: Array<Omit<Task, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }>,
    changedBy: string
  ): Promise<Task[]> {
    this.ensureReady();

    const createdTasks: Task[] = [];

    const createMany = this.db!.transaction(() => {
      for (const task of tasks) {
        const now = new Date().toISOString();
        const id = task.id || randomUUID();

        const fullTask: Task = {
          ...task,
          id,
          createdAt: now,
          updatedAt: now,
        };

        const row = this.taskToRow(fullTask);

        this.db!.prepare(`
          INSERT INTO tasks (
            id, title, description, status, priority, created_at, updated_at, created_by,
            assigned_to, parent_id, tags, metadata, deadline, claimed_at, claim_deadline,
            last_progress_at, required_capabilities, estimated_duration, dependencies,
            result, error_code, can_retry, attempt_number, requires_approval, approval_type,
            approved_by, approved_at, approval_reason
          ) VALUES (
            @id, @title, @description, @status, @priority, @created_at, @updated_at, @created_by,
            @assigned_to, @parent_id, @tags, @metadata, @deadline, @claimed_at, @claim_deadline,
            @last_progress_at, @required_capabilities, @estimated_duration, @dependencies,
            @result, @error_code, @can_retry, @attempt_number, @requires_approval, @approval_type,
            @approved_by, @approved_at, @approval_reason
          )
        `).run(row);

        // Record history
        this.stmts.insertHistory!.run(
          randomUUID(),
          id,
          'created',
          now,
          changedBy,
          null,
          JSON.stringify(fullTask),
          null
        );

        createdTasks.push(fullTask);
      }
    });

    createMany();
    return createdTasks;
  }

  async updateTasks(
    updates: Array<{ id: string; updates: Partial<Omit<Task, 'id' | 'createdAt'>> }>,
    changedBy: string
  ): Promise<Array<Task | null>> {
    this.ensureReady();

    const results: Array<Task | null> = [];

    const updateMany = this.db!.transaction(() => {
      for (const { id, updates: taskUpdates } of updates) {
        const existing = this.stmts.getTask!.get(id) as Record<string, unknown> | undefined;
        if (!existing) {
          results.push(null);
          continue;
        }

        const existingTask = this.rowToTask(existing);
        const now = new Date().toISOString();
        const updatedTask: Task = {
          ...existingTask,
          ...taskUpdates,
          updatedAt: now,
        };

        const row = this.taskToRow(updatedTask);

        this.db!.prepare(`
          UPDATE tasks SET
            title = @title, description = @description, status = @status, priority = @priority,
            updated_at = @updated_at, assigned_to = @assigned_to, parent_id = @parent_id,
            tags = @tags, metadata = @metadata, deadline = @deadline, claimed_at = @claimed_at,
            claim_deadline = @claim_deadline, last_progress_at = @last_progress_at,
            required_capabilities = @required_capabilities, estimated_duration = @estimated_duration,
            dependencies = @dependencies, result = @result, error_code = @error_code,
            can_retry = @can_retry, attempt_number = @attempt_number,
            requires_approval = @requires_approval, approval_type = @approval_type,
            approved_by = @approved_by, approved_at = @approved_at, approval_reason = @approval_reason
          WHERE id = @id
        `).run(row);

        // Record history
        this.stmts.insertHistory!.run(
          randomUUID(),
          id,
          'updated',
          now,
          changedBy,
          JSON.stringify(existingTask),
          JSON.stringify(taskUpdates),
          null
        );

        results.push(updatedTask);
      }
    });

    updateMany();
    return results;
  }

  async deleteTasks(ids: string[], changedBy: string): Promise<number> {
    this.ensureReady();

    let deleted = 0;

    const deleteMany = this.db!.transaction(() => {
      for (const id of ids) {
        const existing = this.stmts.getTask!.get(id) as Record<string, unknown> | undefined;
        if (!existing) continue;

        const existingTask = this.rowToTask(existing);
        const now = new Date().toISOString();

        // Record history before deleting
        this.stmts.insertHistory!.run(
          randomUUID(),
          id,
          'deleted',
          now,
          changedBy,
          JSON.stringify(existingTask),
          null,
          null
        );

        const result = this.db!.prepare('DELETE FROM tasks WHERE id = ?').run(id);
        deleted += result.changes;
      }
    });

    deleteMany();
    return deleted;
  }

  // ============================================================================
  // History Operations
  // ============================================================================

  async getTaskHistory(
    taskId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<TaskHistoryEntry>> {
    this.ensureReady();

    const offset = options?.offset || 0;
    const limit = options?.limit || 50;

    const countResult = this.db!.prepare(
      'SELECT COUNT(*) as count FROM task_history WHERE task_id = ?'
    ).get(taskId) as { count: number };
    const total = countResult.count;

    const rows = this.db!.prepare(`
      SELECT * FROM task_history
      WHERE task_id = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(taskId, limit, offset) as Record<string, unknown>[];

    const items = rows.map(row => this.rowToHistoryEntry(row));

    return {
      items,
      total,
      offset,
      limit,
      hasMore: offset + items.length < total,
    };
  }

  async getRecentChanges(
    options?: PaginationOptions & { changeTypes?: TaskChangeType[] }
  ): Promise<PaginatedResult<TaskHistoryEntry>> {
    this.ensureReady();

    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    const changeTypes = options?.changeTypes;

    let whereClause = '';
    const params: unknown[] = [];

    if (changeTypes && changeTypes.length > 0) {
      const placeholders = changeTypes.map(() => '?').join(', ');
      whereClause = `WHERE change_type IN (${placeholders})`;
      params.push(...changeTypes);
    }

    const countSql = `SELECT COUNT(*) as count FROM task_history ${whereClause}`;
    const countResult = this.db!.prepare(countSql).get(...params) as { count: number };
    const total = countResult.count;

    const sql = `
      SELECT * FROM task_history
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;
    const rows = this.db!.prepare(sql).all(...params, limit, offset) as Record<string, unknown>[];

    const items = rows.map(row => this.rowToHistoryEntry(row));

    return {
      items,
      total,
      offset,
      limit,
      hasMore: offset + items.length < total,
    };
  }

  // ============================================================================
  // Transaction & Locking
  // ============================================================================

  async transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T> {
    this.ensureReady();

    let committed = false;
    let rolledBack = false;

    const tx: StorageTransaction = {
      commit: async () => {
        committed = true;
      },
      rollback: async () => {
        rolledBack = true;
      },
      isActive: () => !committed && !rolledBack,
    };

    const dbTx = this.db!.transaction(async () => {
      const result = await fn(tx);
      if (rolledBack) {
        throw new Error('Transaction rolled back');
      }
      return result;
    });

    try {
      return dbTx();
    } catch (error) {
      throw error;
    }
  }

  async acquireLock(taskId: string, options?: LockOptions): Promise<() => Promise<void>> {
    const timeout = options?.timeout ?? 5000;
    const startTime = Date.now();

    // Simple in-memory lock (for single-process scenarios)
    // For multi-process, you'd use SQLite advisory locks or a lock table
    while (this.locks.has(taskId)) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Lock timeout for task ${taskId}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.locks.set(taskId, { count: 1, resolve: () => {} });

    return async () => {
      this.locks.delete(taskId);
    };
  }

  // ============================================================================
  // Maintenance
  // ============================================================================

  async backup(path?: string): Promise<string> {
    this.ensureReady();

    const backupPath = path || join(
      dirname(this.config.path),
      `backup-${Date.now()}-${basename(this.config.path)}`
    );

    // Use SQLite's backup API
    this.db!.backup(backupPath);

    // Store backup timestamp
    this.db!.prepare(`
      INSERT OR REPLACE INTO storage_metadata (key, value) VALUES ('last_backup', ?)
    `).run(new Date().toISOString());

    return backupPath;
  }

  async restore(path: string): Promise<void> {
    if (!existsSync(path)) {
      throw new Error(`Backup file not found: ${path}`);
    }

    // Close current database
    await this.close();

    // Copy backup over current database
    copyFileSync(path, this.config.path);

    // Reinitialize
    await this.initialize();
  }

  async compact(): Promise<void> {
    this.ensureReady();

    // Vacuum to reclaim space
    this.db!.exec('VACUUM');

    // Checkpoint WAL
    if (this.config.wal) {
      this.db!.pragma('wal_checkpoint(TRUNCATE)');
    }

    // Prune old history entries if configured
    if (this.config.maxHistoryPerTask > 0) {
      this.db!.exec(`
        DELETE FROM task_history WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY timestamp DESC) as rn
            FROM task_history
          ) WHERE rn > ${this.config.maxHistoryPerTask}
        )
      `);
    }

    // Store compaction timestamp
    this.db!.prepare(`
      INSERT OR REPLACE INTO storage_metadata (key, value) VALUES ('last_compaction', ?)
    `).run(new Date().toISOString());
  }

  async getStats(): Promise<StorageStats> {
    this.ensureReady();

    // Total tasks
    const totalResult = this.db!.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number };

    // Tasks by status
    const statusRows = this.db!.prepare(`
      SELECT status, COUNT(*) as count FROM tasks GROUP BY status
    `).all() as Array<{ status: TaskStatus; count: number }>;

    const tasksByStatus: Record<TaskStatus, number> = {
      pending: 0,
      pending_approval: 0,
      in_progress: 0,
      completed: 0,
      blocked: 0,
      cancelled: 0,
    };

    for (const row of statusRows) {
      tasksByStatus[row.status] = row.count;
    }

    // Total history entries
    const historyResult = this.db!.prepare('SELECT COUNT(*) as count FROM task_history').get() as { count: number };

    // Storage size
    let sizeBytes = 0;
    if (existsSync(this.config.path)) {
      sizeBytes = statSync(this.config.path).size;
      // Add WAL and SHM files if they exist
      const walPath = `${this.config.path}-wal`;
      const shmPath = `${this.config.path}-shm`;
      if (existsSync(walPath)) sizeBytes += statSync(walPath).size;
      if (existsSync(shmPath)) sizeBytes += statSync(shmPath).size;
    }

    // Last backup and compaction
    const metaRows = this.db!.prepare(`
      SELECT key, value FROM storage_metadata WHERE key IN ('last_backup', 'last_compaction')
    `).all() as Array<{ key: string; value: string }>;

    const stats: StorageStats = {
      totalTasks: totalResult.count,
      tasksByStatus,
      totalHistoryEntries: historyResult.count,
      sizeBytes,
    };

    for (const row of metaRows) {
      if (row.key === 'last_backup') stats.lastBackup = new Date(row.value);
      if (row.key === 'last_compaction') stats.lastCompaction = new Date(row.value);
    }

    return stats;
  }

  // ============================================================================
  // Migration
  // ============================================================================

  /**
   * Migrate tasks from legacy JSON file
   */
  async migrateFromJson(jsonPath: string): Promise<MigrationResult> {
    this.ensureReady();

    const { readFileSync, renameSync } = await import('fs');
    const content = readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(content) as { tasks: LegacyTask[] };

    const result: MigrationResult = {
      tasksMigrated: 0,
      failures: [],
    };

    const migrate = this.db!.transaction(() => {
      for (const legacyTask of data.tasks) {
        try {
          const task: Task = {
            id: legacyTask.id,
            title: legacyTask.title,
            description: legacyTask.description,
            status: legacyTask.status as TaskStatus,
            priority: legacyTask.priority as Task['priority'],
            createdAt: legacyTask.createdAt,
            updatedAt: legacyTask.updatedAt,
            createdBy: legacyTask.createdBy,
            assignedTo: legacyTask.assignedTo,
            parentId: legacyTask.parentId,
            tags: legacyTask.tags,
            metadata: legacyTask.metadata,
            deadline: legacyTask.deadline,
            claimedAt: legacyTask.claimedAt,
            claimDeadline: legacyTask.claimDeadline,
            lastProgressAt: legacyTask.lastProgressAt,
            requiredCapabilities: legacyTask.requiredCapabilities,
            estimatedDuration: legacyTask.estimatedDuration,
            dependencies: legacyTask.dependencies,
            result: legacyTask.result,
            errorCode: legacyTask.errorCode,
            canRetry: legacyTask.canRetry,
            attemptNumber: legacyTask.attemptNumber,
            requiresApproval: legacyTask.requiresApproval,
            approvalType: legacyTask.approvalType as Task['approvalType'],
            approvedBy: legacyTask.approvedBy,
            approvedAt: legacyTask.approvedAt,
            approvalReason: legacyTask.approvalReason,
          };

          const row = this.taskToRow(task);

          this.db!.prepare(`
            INSERT OR REPLACE INTO tasks (
              id, title, description, status, priority, created_at, updated_at, created_by,
              assigned_to, parent_id, tags, metadata, deadline, claimed_at, claim_deadline,
              last_progress_at, required_capabilities, estimated_duration, dependencies,
              result, error_code, can_retry, attempt_number, requires_approval, approval_type,
              approved_by, approved_at, approval_reason
            ) VALUES (
              @id, @title, @description, @status, @priority, @created_at, @updated_at, @created_by,
              @assigned_to, @parent_id, @tags, @metadata, @deadline, @claimed_at, @claim_deadline,
              @last_progress_at, @required_capabilities, @estimated_duration, @dependencies,
              @result, @error_code, @can_retry, @attempt_number, @requires_approval, @approval_type,
              @approved_by, @approved_at, @approval_reason
            )
          `).run(row);

          result.tasksMigrated++;
        } catch (error) {
          result.failures.push({
            id: legacyTask.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    migrate();

    // Backup the original JSON file
    if (result.tasksMigrated > 0) {
      const backupPath = `${jsonPath}.migrated-${Date.now()}`;
      renameSync(jsonPath, backupPath);
      result.backupPath = backupPath;
    }

    return result;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private taskToRow(task: Task): Record<string, unknown> {
    return {
      id: task.id,
      title: task.title,
      description: task.description || null,
      status: task.status,
      priority: task.priority,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      created_by: task.createdBy,
      assigned_to: task.assignedTo || null,
      parent_id: task.parentId || null,
      tags: task.tags ? JSON.stringify(task.tags) : null,
      metadata: task.metadata ? JSON.stringify(task.metadata) : null,
      deadline: task.deadline || null,
      claimed_at: task.claimedAt || null,
      claim_deadline: task.claimDeadline || null,
      last_progress_at: task.lastProgressAt || null,
      required_capabilities: task.requiredCapabilities ? JSON.stringify(task.requiredCapabilities) : null,
      estimated_duration: task.estimatedDuration || null,
      dependencies: task.dependencies ? JSON.stringify(task.dependencies) : null,
      result: task.result ? JSON.stringify(task.result) : null,
      error_code: task.errorCode || null,
      can_retry: task.canRetry === undefined ? null : task.canRetry ? 1 : 0,
      attempt_number: task.attemptNumber || 1,
      requires_approval: task.requiresApproval === undefined ? null : task.requiresApproval ? 1 : 0,
      approval_type: task.approvalType || null,
      approved_by: task.approvedBy || null,
      approved_at: task.approvedAt || null,
      approval_reason: task.approvalReason || null,
    };
  }

  private rowToTask(row: Record<string, unknown>): Task {
    return {
      id: row.id as string,
      title: row.title as string,
      description: row.description as string | undefined,
      status: row.status as TaskStatus,
      priority: row.priority as Task['priority'],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      createdBy: row.created_by as string,
      assignedTo: row.assigned_to as string | undefined,
      parentId: row.parent_id as string | undefined,
      tags: row.tags ? JSON.parse(row.tags as string) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      deadline: row.deadline as string | undefined,
      claimedAt: row.claimed_at as string | undefined,
      claimDeadline: row.claim_deadline as string | undefined,
      lastProgressAt: row.last_progress_at as string | undefined,
      requiredCapabilities: row.required_capabilities
        ? JSON.parse(row.required_capabilities as string)
        : undefined,
      estimatedDuration: row.estimated_duration as number | undefined,
      dependencies: row.dependencies ? JSON.parse(row.dependencies as string) : undefined,
      result: row.result ? JSON.parse(row.result as string) : undefined,
      errorCode: row.error_code as string | undefined,
      canRetry: row.can_retry === null ? undefined : row.can_retry === 1,
      attemptNumber: row.attempt_number as number | undefined,
      requiresApproval: row.requires_approval === null ? undefined : row.requires_approval === 1,
      approvalType: row.approval_type as Task['approvalType'] | undefined,
      approvedBy: row.approved_by as string | undefined,
      approvedAt: row.approved_at as string | undefined,
      approvalReason: row.approval_reason as string | undefined,
    };
  }

  private rowToHistoryEntry(row: Record<string, unknown>): TaskHistoryEntry {
    return {
      id: row.id as string,
      taskId: row.task_id as string,
      changeType: row.change_type as TaskChangeType,
      timestamp: row.timestamp as string,
      changedBy: row.changed_by as string,
      previousValues: row.previous_values ? JSON.parse(row.previous_values as string) : undefined,
      newValues: row.new_values ? JSON.parse(row.new_values as string) : undefined,
      message: row.message as string | undefined,
    };
  }

  private async recordHistory(
    taskId: string,
    changeType: TaskChangeType,
    changedBy: string,
    previousTask: Task | null,
    newValues: Partial<Task> | Task | null
  ): Promise<void> {
    this.stmts.insertHistory!.run(
      randomUUID(),
      taskId,
      changeType,
      new Date().toISOString(),
      changedBy,
      previousTask ? JSON.stringify(previousTask) : null,
      newValues ? JSON.stringify(newValues) : null,
      null
    );
  }

  private buildWhereClause(filter: TaskFilter): { whereClause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        const placeholders = filter.status.map(() => '?').join(', ');
        conditions.push(`status IN (${placeholders})`);
        params.push(...filter.status);
      } else {
        conditions.push('status = ?');
        params.push(filter.status);
      }
    }

    if (filter.priority) {
      if (Array.isArray(filter.priority)) {
        const placeholders = filter.priority.map(() => '?').join(', ');
        conditions.push(`priority IN (${placeholders})`);
        params.push(...filter.priority);
      } else {
        conditions.push('priority = ?');
        params.push(filter.priority);
      }
    }

    if (filter.assignedTo !== undefined) {
      if (filter.assignedTo === null) {
        conditions.push('assigned_to IS NULL');
      } else {
        conditions.push('assigned_to = ?');
        params.push(filter.assignedTo);
      }
    }

    if (filter.createdBy) {
      conditions.push('created_by = ?');
      params.push(filter.createdBy);
    }

    if (filter.parentId !== undefined) {
      if (filter.parentId === null) {
        conditions.push('parent_id IS NULL');
      } else {
        conditions.push('parent_id = ?');
        params.push(filter.parentId);
      }
    }

    if (filter.tags && filter.tags.length > 0) {
      // Check if any of the tags match (using JSON)
      const tagConditions = filter.tags.map(() => `tags LIKE ?`).join(' OR ');
      conditions.push(`(${tagConditions})`);
      params.push(...filter.tags.map(tag => `%"${tag}"%`));
    }

    if (filter.createdAfter) {
      conditions.push('created_at >= ?');
      params.push(filter.createdAfter.toISOString());
    }

    if (filter.createdBefore) {
      conditions.push('created_at <= ?');
      params.push(filter.createdBefore.toISOString());
    }

    if (filter.updatedAfter) {
      conditions.push('updated_at >= ?');
      params.push(filter.updatedAfter.toISOString());
    }

    if (filter.deadlineBefore) {
      conditions.push('deadline IS NOT NULL AND deadline <= ?');
      params.push(filter.deadlineBefore.toISOString());
    }

    if (filter.requiredCapabilities && filter.requiredCapabilities.length > 0) {
      // All capabilities must match
      const capConditions = filter.requiredCapabilities.map(() => `required_capabilities LIKE ?`).join(' AND ');
      conditions.push(`(${capConditions})`);
      params.push(...filter.requiredCapabilities.map(cap => `%"${cap}"%`));
    }

    if (filter.canRetry !== undefined) {
      conditions.push('can_retry = ?');
      params.push(filter.canRetry ? 1 : 0);
    }

    if (filter.requiresApproval !== undefined) {
      conditions.push('requires_approval = ?');
      params.push(filter.requiresApproval ? 1 : 0);
    }

    if (filter.search) {
      conditions.push('(title LIKE ? OR description LIKE ?)');
      const searchPattern = `%${filter.search}%`;
      params.push(searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return { whereClause, params };
  }

  private buildOrderClause(sort: TaskSortOptions): string {
    const fieldMap: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      priority: 'priority',
      deadline: 'deadline',
      title: 'title',
    };

    const column = fieldMap[sort.field] || 'created_at';
    const direction = sort.direction.toUpperCase();

    // Handle priority ordering (urgent > high > normal > low)
    if (sort.field === 'priority') {
      return `ORDER BY CASE priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
        END ${direction}`;
    }

    return `ORDER BY ${column} ${direction}`;
  }
}
