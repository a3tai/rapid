# Storage Adapter Architecture for Multi-Deployment Support

This document describes the pluggable storage system architecture for RAPID that enables flexible deployment across local development, self-hosted, cloud/SaaS, and freemium tiers.

## Executive Summary

The current RAPID storage uses a fragile JSON file-based approach (`tasks.json`, `knowledge.json`) that:
- Has no atomic operations
- No crash recovery
- No transactional support
- No sync capabilities for distributed deployments

This architecture introduces a **Storage Adapter** pattern that abstracts storage operations behind a unified interface, enabling:
- **Local tier**: SQLite for single-user development
- **Self-hosted tier**: PostgreSQL for team deployments
- **Cloud/SaaS tier**: Managed database (PostgreSQL/DynamoDB)
- **Freemium tier**: Local SQLite with optional cloud sync

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           RAPID Application Layer                                 │
│                                                                                   │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐│
│   │ Task Tools    │  │ Context Tools │  │ Metrics Tools │  │ Knowledge Tools    ││
│   └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └─────────┬─────────┘│
│           │                  │                  │                    │          │
│           └──────────────────┴──────────────────┴────────────────────┘          │
│                                      │                                          │
│                                      ▼                                          │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │                       Storage Adapter Interface                           │  │
│   │                                                                           │  │
│   │  interface StorageAdapter {                                               │  │
│   │    tasks: TaskStorage;                                                    │  │
│   │    knowledge: KnowledgeStorage;                                           │  │
│   │    metrics: MetricsStorage;                                               │  │
│   │    sync?: SyncAdapter;                                                    │  │
│   │  }                                                                        │  │
│   └─────────────────────────────────────┬────────────────────────────────────┘  │
│                                         │                                       │
└─────────────────────────────────────────┼───────────────────────────────────────┘
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  │                       │                       │
                  ▼                       ▼                       ▼
    ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
    │   SQLite Adapter    │  │  PostgreSQL Adapter │  │   Cloud Adapter     │
    │                     │  │                     │  │                     │
    │  - Local file       │  │  - Self-hosted      │  │  - AWS DynamoDB     │
    │  - Single-user      │  │  - Team deployment  │  │  - Supabase         │
    │  - Offline-first    │  │  - ACID compliant   │  │  - Neon.tech        │
    │  - WAL mode         │  │  - Full SQL         │  │  - Multi-tenant     │
    └─────────────────────┘  └─────────────────────┘  └─────────────────────┘
              │                                                  │
              │              ┌─────────────────────┐             │
              └──────────────│   Sync Adapter      │─────────────┘
                             │                     │
                             │  - Conflict resolve │
                             │  - Delta sync       │
                             │  - Offline queue    │
                             └─────────────────────┘
```

## Deployment Tiers

### Tier 1: Local Development (Free)

**Target**: Individual developers, hobby projects

| Feature | Implementation |
|---------|----------------|
| **Storage** | SQLite (better-sqlite3) |
| **Location** | `.rapid/rapid.db` |
| **Sync** | None (local only) |
| **Multi-user** | No |
| **Backup** | Manual file copy |

```yaml
# rapid.yaml
storage:
  backend: sqlite
  path: .rapid/rapid.db
  options:
    wal: true
    busyTimeout: 5000
    journal: WAL
```

### Tier 2: Self-Hosted Team (Open Source)

**Target**: Engineering teams, on-premise deployments

| Feature | Implementation |
|---------|----------------|
| **Storage** | PostgreSQL |
| **Location** | Self-hosted or managed |
| **Sync** | Native Postgres replication |
| **Multi-user** | Yes |
| **Backup** | pg_dump, point-in-time |

```yaml
# rapid.yaml
storage:
  backend: postgres
  connection: postgresql://user:pass@host:5432/rapid
  options:
    pool:
      min: 2
      max: 10
    ssl: true
```

### Tier 3: Cloud/SaaS (Paid)

**Target**: Enterprises, managed service

| Feature | Implementation |
|---------|----------------|
| **Storage** | Managed PostgreSQL (Neon/Supabase) or DynamoDB |
| **Location** | RAPID Cloud |
| **Sync** | Real-time replication |
| **Multi-user** | Yes, with RBAC |
| **Backup** | Automated daily |

```yaml
# rapid.yaml
storage:
  backend: cloud
  apiKey: ${RAPID_CLOUD_API_KEY}
  region: us-east-1
  workspace: my-team
```

### Tier 4: Freemium (Local + Cloud Sync)

**Target**: Individual developers who want cross-device sync

| Feature | Implementation |
|---------|----------------|
| **Storage** | SQLite (primary) + Cloud (sync) |
| **Location** | Local with cloud backup |
| **Sync** | Periodic delta sync |
| **Multi-user** | Single user, multiple devices |
| **Backup** | Cloud replicated |

```yaml
# rapid.yaml
storage:
  backend: sqlite
  path: .rapid/rapid.db
  sync:
    enabled: true
    provider: rapid-cloud
    apiKey: ${RAPID_SYNC_API_KEY}
    interval: 60  # sync every 60 seconds
```

## Core Interfaces

### StorageAdapter

The main entry point for all storage operations.

```typescript
/**
 * Storage Adapter Interface
 *
 * All storage backends implement this interface, providing
 * a unified API for persistence operations.
 */
interface StorageAdapter {
  /** Unique identifier for this adapter type */
  readonly type: 'sqlite' | 'postgres' | 'cloud' | 'memory';

  /** Whether this adapter is connected and ready */
  readonly isConnected: boolean;

  /** Task storage operations */
  tasks: TaskStorage;

  /** Knowledge/context storage operations */
  knowledge: KnowledgeStorage;

  /** Metrics and cost tracking storage */
  metrics: MetricsStorage;

  /** Optional sync adapter for cloud sync */
  sync?: SyncAdapter;

  /** Initialize connection */
  connect(): Promise<void>;

  /** Close connection and cleanup */
  disconnect(): Promise<void>;

  /** Run database migrations */
  migrate(): Promise<MigrationResult>;

  /** Health check */
  healthCheck(): Promise<HealthStatus>;

  /** Transaction support */
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

interface MigrationResult {
  success: boolean;
  migrationsRun: string[];
  currentVersion: number;
}

interface HealthStatus {
  healthy: boolean;
  latencyMs: number;
  details?: Record<string, unknown>;
}

interface Transaction {
  tasks: TaskStorage;
  knowledge: KnowledgeStorage;
  metrics: MetricsStorage;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
```

### TaskStorage

Operations for task management.

```typescript
interface TaskStorage {
  /** Create a new task */
  create(task: CreateTaskInput): Promise<Task>;

  /** Get task by ID */
  get(id: string): Promise<Task | null>;

  /** Update a task */
  update(id: string, updates: UpdateTaskInput): Promise<Task>;

  /** Delete a task */
  delete(id: string): Promise<void>;

  /** List tasks with filters */
  list(filters: TaskFilters): Promise<Task[]>;

  /** Atomic claim operation */
  claim(id: string, agentId: string, capabilities: string[]): Promise<ClaimResult>;

  /** Update progress */
  progress(id: string, progress: number, message?: string): Promise<void>;

  /** Mark complete */
  complete(id: string, summary: string, result?: unknown): Promise<void>;

  /** Mark failed */
  fail(id: string, error: string, canRetry: boolean): Promise<void>;

  /** Find timed-out tasks */
  findTimedOut(options: TimeoutOptions): Promise<Task[]>;

  /** Batch operations for efficiency */
  batch: {
    create(tasks: CreateTaskInput[]): Promise<Task[]>;
    update(updates: BatchUpdate[]): Promise<void>;
    delete(ids: string[]): Promise<void>;
  };
}

interface TaskFilters {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  assignedTo?: string;
  createdBy?: string;
  tags?: string[];
  parentId?: string;
  since?: Date;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'priority';
  orderDir?: 'asc' | 'desc';
}

interface ClaimResult {
  success: boolean;
  task?: Task;
  reason?: 'not_found' | 'already_claimed' | 'capability_mismatch' | 'status_invalid';
}

interface TimeoutOptions {
  progressTimeoutSeconds: number;
  claimTimeoutSeconds: number;
}
```

### KnowledgeStorage

Operations for context engine knowledge persistence.

```typescript
interface KnowledgeStorage {
  /** Store knowledge entry */
  learn(entry: KnowledgeEntry): Promise<void>;

  /** Recall knowledge by key */
  recall(key: string, agentId?: string): Promise<KnowledgeEntry | null>;

  /** List knowledge entries */
  list(filters: KnowledgeFilters): Promise<KnowledgeEntry[]>;

  /** Search knowledge */
  search(query: string, options?: SearchOptions): Promise<KnowledgeEntry[]>;

  /** Remove knowledge */
  forget(key: string): Promise<void>;

  /** Consolidate old/low-confidence entries */
  consolidate(options: ConsolidateOptions): Promise<ConsolidateResult>;

  /** Share knowledge with agents */
  share(key: string, agentIds: string[]): Promise<void>;

  /** Get statistics */
  stats(): Promise<KnowledgeStats>;
}

interface KnowledgeEntry {
  key: string;
  value: unknown;
  memoryType: 'episodic' | 'semantic' | 'procedural' | 'decision_trace';
  confidence: number;
  scope: 'private' | 'shared' | 'public';
  agentId: string;
  tags?: string[];
  relatedKeys?: string[];
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface KnowledgeFilters {
  memoryType?: string;
  tags?: string[];
  minConfidence?: number;
  agentId?: string;
  scope?: string;
  limit?: number;
}

interface SearchOptions {
  fuzzy?: boolean;
  memoryType?: string;
  limit?: number;
}
```

### MetricsStorage

Operations for cost and performance tracking.

```typescript
interface MetricsStorage {
  /** Record a metric event */
  record(event: MetricEvent): Promise<void>;

  /** Get aggregated metrics */
  aggregate(options: AggregateOptions): Promise<AggregatedMetrics>;

  /** Get cost summary */
  getCostSummary(options: CostSummaryOptions): Promise<CostSummary>;

  /** Get cost records */
  getCostRecords(filters: CostFilters): Promise<CostRecord[]>;

  /** Check agent budget */
  checkBudget(agentId: string): Promise<BudgetStatus>;

  /** Check session budget */
  checkSessionBudget(sessionId: string): Promise<BudgetStatus>;
}

interface MetricEvent {
  type: 'task_created' | 'task_claimed' | 'task_completed' | 'task_failed' | 'cost_incurred';
  taskId?: string;
  agentId?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

interface CostSummary {
  totalCost: number;
  costByModel: Record<string, number>;
  costByAgent: Record<string, number>;
  tokenUsage: {
    input: number;
    output: number;
    cache: number;
  };
  periodStart: Date;
  periodEnd: Date;
}

interface BudgetStatus {
  spent: number;
  limit: number;
  percentUsed: number;
  overBudget: boolean;
  warningLevel?: 'none' | 'approaching' | 'exceeded';
}
```

### SyncAdapter

Operations for cloud sync (freemium tier).

```typescript
interface SyncAdapter {
  /** Current sync status */
  readonly status: SyncStatus;

  /** Last sync timestamp */
  readonly lastSyncAt: Date | null;

  /** Start sync loop */
  start(interval: number): void;

  /** Stop sync loop */
  stop(): void;

  /** Force immediate sync */
  syncNow(): Promise<SyncResult>;

  /** Get pending changes */
  getPendingChanges(): Promise<PendingChange[]>;

  /** Resolve conflict manually */
  resolveConflict(id: string, resolution: 'local' | 'remote' | 'merge'): Promise<void>;

  /** Register change listener */
  onSync(callback: (result: SyncResult) => void): () => void;
}

type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline' | 'conflict';

interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: SyncConflict[];
  duration: number;
  error?: string;
}

interface SyncConflict {
  id: string;
  table: string;
  localVersion: unknown;
  remoteVersion: unknown;
  conflictType: 'update_update' | 'update_delete' | 'delete_update';
}

interface PendingChange {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: unknown;
  timestamp: Date;
}
```

## SQLite Implementation

### Schema Design

```sql
-- Version tracking for migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  checksum TEXT
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'pending_approval', 'in_progress', 'completed', 'blocked', 'cancelled')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL,
  assigned_to TEXT,
  parent_id TEXT REFERENCES tasks(id),
  tags TEXT, -- JSON array
  metadata TEXT, -- JSON object
  deadline TEXT,
  claimed_at TEXT,
  claim_deadline TEXT,
  last_progress_at TEXT,
  required_capabilities TEXT, -- JSON array
  estimated_duration INTEGER,
  dependencies TEXT, -- JSON array of task IDs
  result TEXT, -- JSON object
  error_code TEXT,
  can_retry INTEGER DEFAULT 1,
  attempt_number INTEGER DEFAULT 1,
  requires_approval INTEGER DEFAULT 0,
  approval_type TEXT,
  approved_by TEXT,
  approved_at TEXT,
  approval_reason TEXT,
  -- Sync fields
  sync_version INTEGER DEFAULT 1,
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'conflict')),
  deleted_at TEXT -- Soft delete for sync
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_sync ON tasks(sync_status) WHERE sync_status != 'synced';

-- Knowledge entries
CREATE TABLE IF NOT EXISTS knowledge (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL, -- JSON
  memory_type TEXT NOT NULL CHECK (memory_type IN ('episodic', 'semantic', 'procedural', 'decision_trace')),
  confidence REAL NOT NULL DEFAULT 0.8,
  scope TEXT NOT NULL DEFAULT 'public' CHECK (scope IN ('private', 'shared', 'public')),
  agent_id TEXT NOT NULL,
  tags TEXT, -- JSON array
  related_keys TEXT, -- JSON array
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Sync fields
  sync_version INTEGER DEFAULT 1,
  sync_status TEXT DEFAULT 'synced',
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_knowledge_memory_type ON knowledge(memory_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_agent_id ON knowledge(agent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_confidence ON knowledge(confidence);

-- Knowledge sharing (many-to-many)
CREATE TABLE IF NOT EXISTS knowledge_shares (
  knowledge_key TEXT REFERENCES knowledge(key) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  shared_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (knowledge_key, agent_id)
);

-- Metrics events
CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  task_id TEXT,
  agent_id TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost REAL,
  duration_ms INTEGER,
  metadata TEXT, -- JSON
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  -- Sync fields
  sync_version INTEGER DEFAULT 1,
  sync_status TEXT DEFAULT 'synced'
);

CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(type);
CREATE INDEX IF NOT EXISTS idx_metrics_agent_id ON metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);

-- Cost records (aggregated)
CREATE TABLE IF NOT EXISTS cost_records (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  session_id TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL,
  period TEXT NOT NULL, -- 'hourly', 'daily'
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cost_records_period ON cost_records(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_cost_records_agent ON cost_records(agent_id);

-- Sync queue for offline changes
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  data TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT,
  error TEXT
);

-- Triggers for automatic sync queue population
CREATE TRIGGER IF NOT EXISTS tasks_insert_sync
AFTER INSERT ON tasks
WHEN NEW.sync_status = 'pending'
BEGIN
  INSERT INTO sync_queue (table_name, record_id, operation, data)
  VALUES ('tasks', NEW.id, 'insert', json_object('id', NEW.id, 'title', NEW.title));
END;

CREATE TRIGGER IF NOT EXISTS tasks_update_sync
AFTER UPDATE ON tasks
WHEN NEW.sync_status = 'pending' AND OLD.sync_status = 'synced'
BEGIN
  INSERT INTO sync_queue (table_name, record_id, operation, data)
  VALUES ('tasks', NEW.id, 'update', json_object('id', NEW.id, 'changes', json_object()));
END;

-- FTS5 for knowledge search (optional, enables fuzzy search)
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  key,
  value,
  tags,
  content=knowledge,
  content_rowid=rowid
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge BEGIN
  INSERT INTO knowledge_fts(rowid, key, value, tags) VALUES (NEW.rowid, NEW.key, NEW.value, NEW.tags);
END;
CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, key, value, tags) VALUES ('delete', OLD.rowid, OLD.key, OLD.value, OLD.tags);
END;
CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, key, value, tags) VALUES ('delete', OLD.rowid, OLD.key, OLD.value, OLD.tags);
  INSERT INTO knowledge_fts(rowid, key, value, tags) VALUES (NEW.rowid, NEW.key, NEW.value, NEW.tags);
END;
```

### SQLite Adapter Implementation

```typescript
import Database from 'better-sqlite3';
import type { StorageAdapter, TaskStorage, KnowledgeStorage, MetricsStorage, Transaction } from './types.js';

export class SQLiteAdapter implements StorageAdapter {
  readonly type = 'sqlite' as const;
  private db: Database.Database | null = null;

  constructor(private readonly path: string, private readonly options: SQLiteOptions = {}) {}

  get isConnected(): boolean {
    return this.db !== null;
  }

  get tasks(): TaskStorage {
    return new SQLiteTaskStorage(this.getDb());
  }

  get knowledge(): KnowledgeStorage {
    return new SQLiteKnowledgeStorage(this.getDb());
  }

  get metrics(): MetricsStorage {
    return new SQLiteMetricsStorage(this.getDb());
  }

  async connect(): Promise<void> {
    this.db = new Database(this.path, {
      readonly: false,
      fileMustExist: false,
    });

    // Enable WAL mode for better concurrency
    if (this.options.wal !== false) {
      this.db.pragma('journal_mode = WAL');
    }

    // Set busy timeout
    this.db.pragma(`busy_timeout = ${this.options.busyTimeout ?? 5000}`);

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Run migrations
    await this.migrate();
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async migrate(): Promise<MigrationResult> {
    const db = this.getDb();
    const migrations = this.getMigrations();
    const currentVersion = this.getCurrentVersion(db);
    const migrationsRun: string[] = [];

    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        db.exec(migration.sql);
        db.prepare('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)')
          .run(migration.version, migration.checksum);
        migrationsRun.push(migration.name);
      }
    }

    return {
      success: true,
      migrationsRun,
      currentVersion: migrations.length > 0 ? migrations[migrations.length - 1].version : 0,
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const db = this.getDb();
      db.prepare('SELECT 1').get();
      return {
        healthy: true,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      db.exec('BEGIN IMMEDIATE');

      try {
        const tx: Transaction = {
          tasks: new SQLiteTaskStorage(db),
          knowledge: new SQLiteKnowledgeStorage(db),
          metrics: new SQLiteMetricsStorage(db),
          commit: async () => db.exec('COMMIT'),
          rollback: async () => db.exec('ROLLBACK'),
        };

        fn(tx)
          .then((result) => {
            db.exec('COMMIT');
            resolve(result);
          })
          .catch((error) => {
            db.exec('ROLLBACK');
            reject(error);
          });
      } catch (error) {
        db.exec('ROLLBACK');
        reject(error);
      }
    });
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  private getCurrentVersion(db: Database.Database): number {
    try {
      const row = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as { version: number } | undefined;
      return row?.version ?? 0;
    } catch {
      return 0;
    }
  }

  private getMigrations(): Migration[] {
    return [
      {
        version: 1,
        name: 'initial_schema',
        sql: INITIAL_SCHEMA_SQL,
        checksum: 'abc123',
      },
      // Add more migrations as needed
    ];
  }
}

interface SQLiteOptions {
  wal?: boolean;
  busyTimeout?: number;
}

interface Migration {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}
```

### Task Claim with Atomic Locking

```typescript
class SQLiteTaskStorage implements TaskStorage {
  constructor(private readonly db: Database.Database) {}

  async claim(id: string, agentId: string, capabilities: string[]): Promise<ClaimResult> {
    // Use a transaction with exclusive lock for atomicity
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET
        status = 'in_progress',
        assigned_to = @agentId,
        claimed_at = datetime('now'),
        claim_deadline = datetime('now', '+5 minutes'),
        last_progress_at = datetime('now'),
        updated_at = datetime('now'),
        sync_status = 'pending'
      WHERE id = @id
        AND status = 'pending'
        AND (
          required_capabilities IS NULL
          OR json_array_length(required_capabilities) = 0
          OR (
            SELECT COUNT(*) FROM json_each(required_capabilities)
            WHERE value NOT IN (SELECT value FROM json_each(@capabilities))
          ) = 0
        )
    `);

    const result = stmt.run({
      id,
      agentId,
      capabilities: JSON.stringify(capabilities),
    });

    if (result.changes === 0) {
      // Determine why the claim failed
      const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;

      if (!task) {
        return { success: false, reason: 'not_found' };
      }

      if (task.status !== 'pending') {
        return { success: false, reason: task.status === 'in_progress' ? 'already_claimed' : 'status_invalid', task };
      }

      return { success: false, reason: 'capability_mismatch', task };
    }

    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
    return { success: true, task };
  }
}
```

## PostgreSQL Implementation

### Schema Differences

```sql
-- PostgreSQL-specific schema additions

-- Use UUID type natively
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Use JSONB for better indexing
ALTER TABLE tasks ALTER COLUMN tags TYPE JSONB USING tags::jsonb;
ALTER TABLE tasks ALTER COLUMN metadata TYPE JSONB USING metadata::jsonb;
ALTER TABLE tasks ALTER COLUMN required_capabilities TYPE JSONB USING required_capabilities::jsonb;
ALTER TABLE tasks ALTER COLUMN dependencies TYPE JSONB USING dependencies::jsonb;
ALTER TABLE tasks ALTER COLUMN result TYPE JSONB USING result::jsonb;

-- GIN indexes for JSON queries
CREATE INDEX idx_tasks_tags ON tasks USING GIN (tags);
CREATE INDEX idx_tasks_metadata ON tasks USING GIN (metadata);

-- Full-text search (native PostgreSQL)
CREATE INDEX idx_knowledge_search ON knowledge USING GIN (to_tsvector('english', value::text));

-- Row-level security for multi-tenant
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_tenant_isolation ON tasks
  USING (workspace_id = current_setting('app.workspace_id')::uuid);

-- Concurrent claim with advisory lock
CREATE OR REPLACE FUNCTION claim_task(
  p_task_id UUID,
  p_agent_id TEXT,
  p_capabilities JSONB
) RETURNS JSONB AS $$
DECLARE
  v_task JSONB;
BEGIN
  -- Acquire advisory lock on task ID
  PERFORM pg_advisory_xact_lock(hashtext(p_task_id::text));

  -- Attempt claim
  UPDATE tasks
  SET
    status = 'in_progress',
    assigned_to = p_agent_id,
    claimed_at = NOW(),
    claim_deadline = NOW() + INTERVAL '5 minutes',
    last_progress_at = NOW(),
    updated_at = NOW()
  WHERE id = p_task_id
    AND status = 'pending'
    AND (
      required_capabilities IS NULL
      OR required_capabilities = '[]'::jsonb
      OR required_capabilities <@ p_capabilities
    )
  RETURNING to_jsonb(tasks.*) INTO v_task;

  IF v_task IS NULL THEN
    SELECT to_jsonb(tasks.*) INTO v_task
    FROM tasks WHERE id = p_task_id;

    RETURN jsonb_build_object(
      'success', false,
      'task', v_task,
      'reason', CASE
        WHEN v_task IS NULL THEN 'not_found'
        WHEN (v_task->>'status') != 'pending' THEN 'status_invalid'
        ELSE 'capability_mismatch'
      END
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'task', v_task);
END;
$$ LANGUAGE plpgsql;
```

## Sync Architecture (Freemium Tier)

### Conflict Resolution

```typescript
/**
 * Sync conflict resolution strategy
 */
interface ConflictResolver {
  /**
   * Resolve a sync conflict between local and remote versions
   */
  resolve(conflict: SyncConflict): Promise<ConflictResolution>;
}

type ConflictResolution =
  | { action: 'keep_local'; reason: string }
  | { action: 'keep_remote'; reason: string }
  | { action: 'merge'; mergedData: unknown; reason: string }
  | { action: 'manual'; message: string };

/**
 * Default conflict resolver using last-write-wins with semantic awareness
 */
class DefaultConflictResolver implements ConflictResolver {
  async resolve(conflict: SyncConflict): Promise<ConflictResolution> {
    const { table, localVersion, remoteVersion, conflictType } = conflict;

    switch (conflictType) {
      case 'update_update':
        return this.resolveUpdateUpdate(table, localVersion, remoteVersion);

      case 'update_delete':
        // Prefer update over delete (data preservation)
        return { action: 'keep_local', reason: 'Preserving local update over remote delete' };

      case 'delete_update':
        // Remote update wins over local delete
        return { action: 'keep_remote', reason: 'Remote update takes precedence' };

      default:
        return { action: 'manual', message: 'Unknown conflict type requires manual resolution' };
    }
  }

  private resolveUpdateUpdate(
    table: string,
    local: unknown,
    remote: unknown
  ): ConflictResolution {
    // For tasks: merge based on field-level timestamps if available
    if (table === 'tasks') {
      return this.mergeTaskUpdates(local as Task, remote as Task);
    }

    // For knowledge: keep higher confidence or more recent
    if (table === 'knowledge') {
      return this.mergeKnowledgeUpdates(local as KnowledgeEntry, remote as KnowledgeEntry);
    }

    // Default: last-write-wins based on updated_at
    const localTime = new Date((local as { updated_at: string }).updated_at).getTime();
    const remoteTime = new Date((remote as { updated_at: string }).updated_at).getTime();

    if (localTime >= remoteTime) {
      return { action: 'keep_local', reason: 'Local version is newer' };
    }
    return { action: 'keep_remote', reason: 'Remote version is newer' };
  }

  private mergeTaskUpdates(local: Task, remote: Task): ConflictResolution {
    // If status changed differently, prefer the "most progressed" state
    const statusOrder = ['pending', 'pending_approval', 'in_progress', 'completed', 'cancelled'];
    const localStatusIdx = statusOrder.indexOf(local.status);
    const remoteStatusIdx = statusOrder.indexOf(remote.status);

    if (localStatusIdx !== remoteStatusIdx) {
      // Keep the more progressed state
      if (localStatusIdx > remoteStatusIdx) {
        return { action: 'keep_local', reason: 'Local task is more progressed' };
      }
      return { action: 'keep_remote', reason: 'Remote task is more progressed' };
    }

    // Merge: combine metadata, keep latest other fields
    const merged: Task = {
      ...remote,
      metadata: { ...(remote.metadata ?? {}), ...(local.metadata ?? {}) },
      updated_at: new Date().toISOString(),
    };

    return {
      action: 'merge',
      mergedData: merged,
      reason: 'Merged task updates preserving both local and remote changes',
    };
  }

  private mergeKnowledgeUpdates(
    local: KnowledgeEntry,
    remote: KnowledgeEntry
  ): ConflictResolution {
    // Keep higher confidence version
    if (local.confidence !== remote.confidence) {
      if (local.confidence > remote.confidence) {
        return { action: 'keep_local', reason: 'Local has higher confidence' };
      }
      return { action: 'keep_remote', reason: 'Remote has higher confidence' };
    }

    // Same confidence: merge tags and keep latest value
    const mergedTags = [...new Set([...(local.tags ?? []), ...(remote.tags ?? [])])];
    const merged: KnowledgeEntry = {
      ...remote,
      tags: mergedTags,
      updated_at: new Date(),
    };

    return {
      action: 'merge',
      mergedData: merged,
      reason: 'Merged knowledge entries with combined tags',
    };
  }
}
```

### Delta Sync Protocol

```typescript
/**
 * Delta sync implementation for efficient cloud synchronization
 */
class DeltaSyncAdapter implements SyncAdapter {
  private syncInterval: NodeJS.Timer | null = null;
  private _status: SyncStatus = 'idle';
  private _lastSyncAt: Date | null = null;
  private callbacks: ((result: SyncResult) => void)[] = [];

  constructor(
    private readonly localDb: SQLiteAdapter,
    private readonly cloudClient: CloudSyncClient,
    private readonly resolver: ConflictResolver = new DefaultConflictResolver()
  ) {}

  get status(): SyncStatus {
    return this._status;
  }

  get lastSyncAt(): Date | null {
    return this._lastSyncAt;
  }

  start(intervalMs: number): void {
    if (this.syncInterval) return;

    // Initial sync
    this.syncNow().catch(console.error);

    // Periodic sync
    this.syncInterval = setInterval(() => {
      this.syncNow().catch(console.error);
    }, intervalMs);
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async syncNow(): Promise<SyncResult> {
    if (this._status === 'syncing') {
      return { success: false, uploaded: 0, downloaded: 0, conflicts: [], duration: 0, error: 'Sync already in progress' };
    }

    this._status = 'syncing';
    const startTime = Date.now();

    try {
      // 1. Get local changes since last sync
      const localChanges = await this.getLocalChanges();

      // 2. Get remote changes since last sync
      const remoteChanges = await this.cloudClient.getChanges(this._lastSyncAt);

      // 3. Detect conflicts
      const conflicts = this.detectConflicts(localChanges, remoteChanges);

      // 4. Resolve conflicts
      for (const conflict of conflicts) {
        const resolution = await this.resolver.resolve(conflict);
        await this.applyResolution(conflict, resolution);
      }

      // 5. Upload local changes
      const uploaded = await this.uploadChanges(localChanges);

      // 6. Download remote changes
      const downloaded = await this.downloadChanges(remoteChanges);

      // 7. Mark sync complete
      await this.markSynced();

      this._lastSyncAt = new Date();
      this._status = conflicts.length > 0 ? 'conflict' : 'idle';

      const result: SyncResult = {
        success: true,
        uploaded,
        downloaded,
        conflicts,
        duration: Date.now() - startTime,
      };

      this.notifyCallbacks(result);
      return result;

    } catch (error) {
      this._status = 'error';
      const result: SyncResult = {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: [],
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
      this.notifyCallbacks(result);
      return result;
    }
  }

  async getPendingChanges(): Promise<PendingChange[]> {
    const db = (this.localDb as any).getDb();
    return db.prepare(`
      SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at
    `).all();
  }

  async resolveConflict(
    id: string,
    resolution: 'local' | 'remote' | 'merge'
  ): Promise<void> {
    // Implementation depends on conflict storage
  }

  onSync(callback: (result: SyncResult) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx >= 0) this.callbacks.splice(idx, 1);
    };
  }

  private async getLocalChanges(): Promise<PendingChange[]> {
    return this.getPendingChanges();
  }

  private detectConflicts(
    local: PendingChange[],
    remote: RemoteChange[]
  ): SyncConflict[] {
    const conflicts: SyncConflict[] = [];
    const localByKey = new Map(local.map(c => [`${c.table_name}:${c.record_id}`, c]));

    for (const remoteChange of remote) {
      const key = `${remoteChange.table}:${remoteChange.id}`;
      const localChange = localByKey.get(key);

      if (localChange) {
        conflicts.push({
          id: remoteChange.id,
          table: remoteChange.table,
          localVersion: localChange.data,
          remoteVersion: remoteChange.data,
          conflictType: this.getConflictType(localChange.operation, remoteChange.operation),
        });
      }
    }

    return conflicts;
  }

  private getConflictType(
    localOp: string,
    remoteOp: string
  ): SyncConflict['conflictType'] {
    if (localOp === 'update' && remoteOp === 'update') return 'update_update';
    if (localOp === 'update' && remoteOp === 'delete') return 'update_delete';
    if (localOp === 'delete' && remoteOp === 'update') return 'delete_update';
    return 'update_update'; // Default
  }

  private async uploadChanges(changes: PendingChange[]): Promise<number> {
    let count = 0;
    for (const change of changes) {
      await this.cloudClient.push(change);
      count++;
    }
    return count;
  }

  private async downloadChanges(changes: RemoteChange[]): Promise<number> {
    let count = 0;
    for (const change of changes) {
      await this.applyRemoteChange(change);
      count++;
    }
    return count;
  }

  private async applyResolution(
    conflict: SyncConflict,
    resolution: ConflictResolution
  ): Promise<void> {
    // Apply the resolution to both local and remote
  }

  private async applyRemoteChange(change: RemoteChange): Promise<void> {
    // Apply change to local database
  }

  private async markSynced(): Promise<void> {
    const db = (this.localDb as any).getDb();
    db.prepare(`UPDATE sync_queue SET synced_at = datetime('now') WHERE synced_at IS NULL`).run();
  }

  private notifyCallbacks(result: SyncResult): void {
    for (const cb of this.callbacks) {
      try { cb(result); } catch { /* ignore callback errors */ }
    }
  }
}
```

## Factory Pattern

```typescript
/**
 * Storage adapter factory - creates the appropriate adapter based on configuration
 */
export async function createStorageAdapter(config: StorageConfig): Promise<StorageAdapter> {
  switch (config.backend) {
    case 'sqlite':
      return createSQLiteAdapter(config);

    case 'postgres':
      return createPostgresAdapter(config);

    case 'cloud':
      return createCloudAdapter(config);

    case 'memory':
      return new InMemoryAdapter();

    default:
      throw new Error(`Unknown storage backend: ${config.backend}`);
  }
}

async function createSQLiteAdapter(config: StorageConfig): Promise<StorageAdapter> {
  const adapter = new SQLiteAdapter(config.path ?? '.rapid/rapid.db', config.options);
  await adapter.connect();

  // Add sync if configured
  if (config.sync?.enabled) {
    const cloudClient = new CloudSyncClient(config.sync);
    adapter.sync = new DeltaSyncAdapter(adapter, cloudClient);

    if (config.sync.autoStart !== false) {
      adapter.sync.start(config.sync.interval ?? 60000);
    }
  }

  return adapter;
}

async function createPostgresAdapter(config: StorageConfig): Promise<StorageAdapter> {
  const adapter = new PostgresAdapter(config.connection!, config.options);
  await adapter.connect();
  return adapter;
}

async function createCloudAdapter(config: StorageConfig): Promise<StorageAdapter> {
  const adapter = new CloudAdapter(config.apiKey!, config.region!, config.workspace!);
  await adapter.connect();
  return adapter;
}

/**
 * Storage configuration schema
 */
interface StorageConfig {
  backend: 'sqlite' | 'postgres' | 'cloud' | 'memory';
  path?: string;
  connection?: string;
  apiKey?: string;
  region?: string;
  workspace?: string;
  options?: {
    wal?: boolean;
    busyTimeout?: number;
    pool?: { min?: number; max?: number };
    ssl?: boolean;
  };
  sync?: {
    enabled: boolean;
    provider: 'rapid-cloud';
    apiKey: string;
    interval?: number;
    autoStart?: boolean;
  };
}
```

## Migration from JSON Files

```typescript
/**
 * Migration utility to move from tasks.json to SQLite
 */
export async function migrateFromJsonFiles(
  projectDir: string,
  adapter: StorageAdapter
): Promise<MigrationReport> {
  const report: MigrationReport = {
    tasks: { migrated: 0, failed: 0, errors: [] },
    knowledge: { migrated: 0, failed: 0, errors: [] },
    startedAt: new Date(),
    completedAt: null,
  };

  // Migrate tasks
  const tasksPath = join(projectDir, '.rapid', 'tasks.json');
  try {
    const tasksJson = await readFile(tasksPath, 'utf-8');
    const tasks = JSON.parse(tasksJson) as Task[];

    for (const task of tasks) {
      try {
        await adapter.tasks.create(task);
        report.tasks.migrated++;
      } catch (error) {
        report.tasks.failed++;
        report.tasks.errors.push({
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  // Migrate knowledge
  const knowledgePath = join(projectDir, '.rapid', 'context', 'knowledge.json');
  try {
    const knowledgeJson = await readFile(knowledgePath, 'utf-8');
    const entries = JSON.parse(knowledgeJson) as KnowledgeEntry[];

    for (const entry of entries) {
      try {
        await adapter.knowledge.learn(entry);
        report.knowledge.migrated++;
      } catch (error) {
        report.knowledge.failed++;
        report.knowledge.errors.push({
          key: entry.key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  report.completedAt = new Date();
  return report;
}

interface MigrationReport {
  tasks: {
    migrated: number;
    failed: number;
    errors: Array<{ taskId: string; error: string }>;
  };
  knowledge: {
    migrated: number;
    failed: number;
    errors: Array<{ key: string; error: string }>;
  };
  startedAt: Date;
  completedAt: Date | null;
}
```

## File Structure

```
packages/storage/
├── src/
│   ├── index.ts                # Main exports
│   ├── factory.ts              # createStorageAdapter factory
│   ├── types.ts                # All interfaces
│   │
│   ├── adapters/
│   │   ├── sqlite/
│   │   │   ├── adapter.ts      # SQLiteAdapter implementation
│   │   │   ├── tasks.ts        # SQLiteTaskStorage
│   │   │   ├── knowledge.ts    # SQLiteKnowledgeStorage
│   │   │   ├── metrics.ts      # SQLiteMetricsStorage
│   │   │   └── migrations/     # SQL migration files
│   │   │       ├── 001_initial.sql
│   │   │       ├── 002_indexes.sql
│   │   │       └── 003_fts.sql
│   │   │
│   │   ├── postgres/
│   │   │   ├── adapter.ts      # PostgresAdapter implementation
│   │   │   ├── tasks.ts
│   │   │   ├── knowledge.ts
│   │   │   ├── metrics.ts
│   │   │   └── migrations/
│   │   │
│   │   ├── cloud/
│   │   │   ├── adapter.ts      # CloudAdapter implementation
│   │   │   └── client.ts       # Cloud API client
│   │   │
│   │   └── memory/
│   │       └── adapter.ts      # InMemoryAdapter for testing
│   │
│   ├── sync/
│   │   ├── delta-sync.ts       # DeltaSyncAdapter
│   │   ├── conflict.ts         # Conflict resolution
│   │   └── queue.ts            # Offline change queue
│   │
│   ├── migration/
│   │   └── json-to-sqlite.ts   # Migration utilities
│   │
│   └── utils/
│       ├── logger.ts
│       └── crypto.ts           # Encryption for sync
│
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

## Implementation Plan

### Phase 1: Core SQLite Adapter (Week 1)

1. Create `@rapid/storage` package structure
2. Implement SQLiteAdapter with basic operations
3. Implement TaskStorage interface
4. Add schema migrations framework
5. Write unit tests

### Phase 2: Full SQLite Features (Week 2)

1. Implement KnowledgeStorage with FTS
2. Implement MetricsStorage
3. Add transaction support
4. Migrate rapid-mcp task tools to use adapter
5. Add integration tests

### Phase 3: PostgreSQL Support (Week 3)

1. Implement PostgresAdapter
2. Add connection pooling
3. Implement row-level security
4. Add multi-tenant support
5. Write PostgreSQL-specific tests

### Phase 4: Sync Layer (Week 4)

1. Implement DeltaSyncAdapter
2. Add conflict resolution
3. Build cloud sync client
4. Add offline queue
5. End-to-end sync tests

### Phase 5: Migration & Documentation (Week 5)

1. Create migration tool
2. Update rapid-mcp to use adapters
3. Write documentation
4. Performance benchmarks
5. Release @rapid/storage v1.0

## Conclusion

This storage adapter architecture provides RAPID with:

- **Flexibility**: Support for SQLite, PostgreSQL, and cloud backends
- **Reliability**: Atomic operations, transactions, and crash recovery
- **Scalability**: From single-user to enterprise deployments
- **Sync**: Optional cloud synchronization for the freemium tier
- **Migration Path**: Smooth transition from JSON files

The phased implementation allows for incremental delivery while maintaining backward compatibility with existing deployments.
