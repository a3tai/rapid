/**
 * Task Storage Types
 *
 * Defines the interfaces and types for durable task storage in RAPID.
 * These types enable atomic operations, crash recovery, history tracking,
 * efficient queries, and concurrent access handling.
 *
 * @module @a3t/rapid-core/storage
 */

import { z } from 'zod';

// ============================================================================
// Task Status & Priority Schemas
// ============================================================================

/**
 * Task status values
 */
export const TaskStatusSchema = z.enum([
  'pending',
  'pending_approval',
  'in_progress',
  'completed',
  'blocked',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Task priority values
 */
export const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

// ============================================================================
// Task Entity Schema
// ============================================================================

/**
 * Task entity schema with all fields for durable storage
 */
export const TaskSchema = z.object({
  /** Unique task identifier (UUID) */
  id: z.string().uuid(),

  /** Task title */
  title: z.string().min(1),

  /** Detailed description */
  description: z.string().optional(),

  /** Current task status */
  status: TaskStatusSchema,

  /** Task priority level */
  priority: TaskPrioritySchema,

  /** ISO8601 creation timestamp */
  createdAt: z.string().datetime(),

  /** ISO8601 last update timestamp */
  updatedAt: z.string().datetime(),

  /** Agent ID or name that created the task */
  createdBy: z.string(),

  /** Agent ID or name assigned to the task */
  assignedTo: z.string().optional(),

  /** Parent task ID for subtasks */
  parentId: z.string().uuid().optional(),

  /** Tags for categorization */
  tags: z.array(z.string()).optional(),

  /** Arbitrary metadata */
  metadata: z.record(z.unknown()).optional(),

  // Phase 1: Task Assignment Protocol fields
  /** ISO8601 deadline for task completion */
  deadline: z.string().datetime().optional(),

  /** ISO8601 timestamp when task was claimed */
  claimedAt: z.string().datetime().optional(),

  /** ISO8601 deadline for starting progress after claim */
  claimDeadline: z.string().datetime().optional(),

  /** ISO8601 timestamp of last progress update */
  lastProgressAt: z.string().datetime().optional(),

  /** Required agent capabilities */
  requiredCapabilities: z.array(z.string()).optional(),

  /** Estimated duration in seconds */
  estimatedDuration: z.number().positive().optional(),

  /** Task IDs that must complete first */
  dependencies: z.array(z.string().uuid()).optional(),

  /** Result data on completion */
  result: z.record(z.unknown()).optional(),

  /** Error code if failed */
  errorCode: z.string().optional(),

  /** Whether task can be retried */
  canRetry: z.boolean().optional(),

  /** Current attempt number */
  attemptNumber: z.number().int().positive().optional(),

  // Human-in-the-Loop Approval fields
  /** Whether task needs human approval */
  requiresApproval: z.boolean().optional(),

  /** When approval is needed */
  approvalType: z.enum(['before_claim', 'before_commit', 'before_deploy']).optional(),

  /** User/agent who approved */
  approvedBy: z.string().optional(),

  /** ISO8601 approval timestamp */
  approvedAt: z.string().datetime().optional(),

  /** Reason why approval is required */
  approvalReason: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

// ============================================================================
// Task History Schema
// ============================================================================

/**
 * Types of changes tracked in task history
 */
export const TaskChangeTypeSchema = z.enum([
  'created',
  'updated',
  'status_changed',
  'assigned',
  'unassigned',
  'claimed',
  'progress',
  'completed',
  'failed',
  'approved',
  'rejected',
  'deleted',
]);
export type TaskChangeType = z.infer<typeof TaskChangeTypeSchema>;

/**
 * Task history entry schema
 */
export const TaskHistoryEntrySchema = z.object({
  /** History entry ID */
  id: z.string().uuid(),

  /** Task ID this history belongs to */
  taskId: z.string().uuid(),

  /** Type of change */
  changeType: TaskChangeTypeSchema,

  /** ISO8601 timestamp of the change */
  timestamp: z.string().datetime(),

  /** Agent or user who made the change */
  changedBy: z.string(),

  /** Previous values (for updates) */
  previousValues: z.record(z.unknown()).optional(),

  /** New values (for updates) */
  newValues: z.record(z.unknown()).optional(),

  /** Optional message describing the change */
  message: z.string().optional(),
});

export type TaskHistoryEntry = z.infer<typeof TaskHistoryEntrySchema>;

// ============================================================================
// Query & Filter Types
// ============================================================================

/**
 * Task filter options for queries
 */
export interface TaskFilter {
  /** Filter by status */
  status?: TaskStatus | TaskStatus[];

  /** Filter by assigned agent */
  assignedTo?: string;

  /** Filter by creator */
  createdBy?: string;

  /** Filter by parent task (subtasks) */
  parentId?: string | null;

  /** Filter by tags (any match) */
  tags?: string[];

  /** Filter by priority */
  priority?: TaskPriority | TaskPriority[];

  /** Filter tasks created after this date */
  createdAfter?: Date;

  /** Filter tasks created before this date */
  createdBefore?: Date;

  /** Filter tasks updated after this date */
  updatedAfter?: Date;

  /** Filter tasks with deadline before this date */
  deadlineBefore?: Date;

  /** Filter by required capabilities (all must match) */
  requiredCapabilities?: string[];

  /** Only include tasks that can be retried */
  canRetry?: boolean;

  /** Filter by approval status */
  requiresApproval?: boolean;

  /** Search in title and description */
  search?: string;
}

/**
 * Sort options for task queries
 */
export interface TaskSortOptions {
  /** Field to sort by */
  field: 'createdAt' | 'updatedAt' | 'priority' | 'deadline' | 'title';

  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * Pagination options for queries
 */
export interface PaginationOptions {
  /** Number of items to skip */
  offset?: number;

  /** Maximum number of items to return */
  limit?: number;
}

/**
 * Query options combining filter, sort, and pagination
 */
export interface TaskQueryOptions {
  filter?: TaskFilter;
  sort?: TaskSortOptions;
  pagination?: PaginationOptions;
}

/**
 * Result of a paginated query
 */
export interface PaginatedResult<T> {
  /** The items for this page */
  items: T[];

  /** Total count of all matching items */
  total: number;

  /** Current offset */
  offset: number;

  /** Current limit */
  limit: number;

  /** Whether there are more items */
  hasMore: boolean;
}

// ============================================================================
// Storage Adapter Interface
// ============================================================================

/**
 * Storage transaction interface for atomic operations
 */
export interface StorageTransaction {
  /** Commit the transaction */
  commit(): Promise<void>;

  /** Rollback the transaction */
  rollback(): Promise<void>;

  /** Check if transaction is still active */
  isActive(): boolean;
}

/**
 * Lock options for concurrent access
 */
export interface LockOptions {
  /** Lock timeout in milliseconds */
  timeout?: number;

  /** Type of lock */
  type?: 'shared' | 'exclusive';
}

/**
 * Storage adapter events
 */
export interface StorageAdapterEvents {
  /** Emitted when a task is created */
  taskCreated: (task: Task) => void;

  /** Emitted when a task is updated */
  taskUpdated: (task: Task, previousTask: Task) => void;

  /** Emitted when a task is deleted */
  taskDeleted: (taskId: string) => void;

  /** Emitted when storage is initialized */
  initialized: () => void;

  /** Emitted on storage error */
  error: (error: Error) => void;
}

/**
 * Storage adapter configuration
 */
export interface StorageAdapterConfig {
  /** Path to the storage directory or file */
  path: string;

  /** Enable write-ahead logging (for file adapter) */
  wal?: boolean;

  /** Sync writes to disk immediately */
  syncWrites?: boolean;

  /** Maximum history entries per task (0 = unlimited) */
  maxHistoryPerTask?: number;

  /** Enable automatic backups */
  autoBackup?: boolean;

  /** Backup interval in milliseconds */
  backupInterval?: number;
}

/**
 * Storage adapter interface
 *
 * Provides atomic, durable task storage with history tracking,
 * efficient queries, and concurrent access handling.
 */
export interface StorageAdapter {
  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Initialize the storage adapter
   * Creates necessary files/tables and loads existing data
   */
  initialize(): Promise<void>;

  /**
   * Close the storage adapter and release resources
   */
  close(): Promise<void>;

  /**
   * Check if the adapter is initialized and ready
   */
  isReady(): boolean;

  // ============================================================================
  // Task CRUD Operations
  // ============================================================================

  /**
   * Create a new task
   * @param task The task to create (id will be generated if not provided)
   * @param changedBy The agent/user creating the task
   * @returns The created task with generated fields
   */
  createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, changedBy: string): Promise<Task>;

  /**
   * Get a task by ID
   * @param id The task ID
   * @returns The task or null if not found
   */
  getTask(id: string): Promise<Task | null>;

  /**
   * Update an existing task
   * @param id The task ID to update
   * @param updates Partial task data to update
   * @param changedBy The agent/user making the change
   * @returns The updated task or null if not found
   */
  updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>, changedBy: string): Promise<Task | null>;

  /**
   * Delete a task
   * @param id The task ID to delete
   * @param changedBy The agent/user deleting the task
   * @returns True if deleted, false if not found
   */
  deleteTask(id: string, changedBy: string): Promise<boolean>;

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Query tasks with filtering, sorting, and pagination
   * @param options Query options
   * @returns Paginated result of tasks
   */
  queryTasks(options?: TaskQueryOptions): Promise<PaginatedResult<Task>>;

  /**
   * Get all tasks (convenience method)
   * @returns All tasks
   */
  getAllTasks(): Promise<Task[]>;

  /**
   * Count tasks matching a filter
   * @param filter Optional filter
   * @returns Count of matching tasks
   */
  countTasks(filter?: TaskFilter): Promise<number>;

  /**
   * Check if a task exists
   * @param id The task ID
   * @returns True if exists
   */
  taskExists(id: string): Promise<boolean>;

  // ============================================================================
  // Batch Operations
  // ============================================================================

  /**
   * Create multiple tasks atomically
   * @param tasks Tasks to create
   * @param changedBy The agent/user creating the tasks
   * @returns Created tasks
   */
  createTasks(tasks: Array<Omit<Task, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }>, changedBy: string): Promise<Task[]>;

  /**
   * Update multiple tasks atomically
   * @param updates Array of { id, updates } pairs
   * @param changedBy The agent/user making the changes
   * @returns Updated tasks (null for tasks not found)
   */
  updateTasks(updates: Array<{ id: string; updates: Partial<Omit<Task, 'id' | 'createdAt'>> }>, changedBy: string): Promise<Array<Task | null>>;

  /**
   * Delete multiple tasks atomically
   * @param ids Task IDs to delete
   * @param changedBy The agent/user deleting the tasks
   * @returns Number of tasks deleted
   */
  deleteTasks(ids: string[], changedBy: string): Promise<number>;

  // ============================================================================
  // History Operations
  // ============================================================================

  /**
   * Get history for a task
   * @param taskId The task ID
   * @param options Optional pagination
   * @returns Paginated history entries
   */
  getTaskHistory(taskId: string, options?: PaginationOptions): Promise<PaginatedResult<TaskHistoryEntry>>;

  /**
   * Get recent changes across all tasks
   * @param options Optional pagination and filter by change type
   * @returns Paginated history entries
   */
  getRecentChanges(options?: PaginationOptions & { changeTypes?: TaskChangeType[] }): Promise<PaginatedResult<TaskHistoryEntry>>;

  // ============================================================================
  // Transaction & Locking
  // ============================================================================

  /**
   * Execute a function within a transaction
   * @param fn Function to execute
   * @returns Result of the function
   */
  transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>;

  /**
   * Acquire a lock on a task
   * @param taskId Task ID to lock
   * @param options Lock options
   * @returns Lock release function
   */
  acquireLock(taskId: string, options?: LockOptions): Promise<() => Promise<void>>;

  // ============================================================================
  // Maintenance
  // ============================================================================

  /**
   * Create a backup of the storage
   * @param path Optional backup path
   * @returns Path to the backup
   */
  backup(path?: string): Promise<string>;

  /**
   * Restore from a backup
   * @param path Backup path
   */
  restore(path: string): Promise<void>;

  /**
   * Compact the storage (vacuum for SQLite, consolidate WAL for file)
   */
  compact(): Promise<void>;

  /**
   * Get storage statistics
   */
  getStats(): Promise<StorageStats>;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  /** Total number of tasks */
  totalTasks: number;

  /** Tasks by status */
  tasksByStatus: Record<TaskStatus, number>;

  /** Total history entries */
  totalHistoryEntries: number;

  /** Storage size in bytes */
  sizeBytes: number;

  /** Last backup timestamp */
  lastBackup?: Date;

  /** Last compaction timestamp */
  lastCompaction?: Date;
}

// ============================================================================
// Migration Types
// ============================================================================

/**
 * Legacy task format (from tasks.json)
 */
export interface LegacyTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  assignedTo?: string;
  parentId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  deadline?: string;
  claimedAt?: string;
  claimDeadline?: string;
  lastProgressAt?: string;
  requiredCapabilities?: string[];
  estimatedDuration?: number;
  dependencies?: string[];
  result?: Record<string, unknown>;
  errorCode?: string;
  canRetry?: boolean;
  attemptNumber?: number;
  requiresApproval?: boolean;
  approvalType?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalReason?: string;
}

/**
 * Migration result
 */
export interface MigrationResult {
  /** Number of tasks migrated */
  tasksMigrated: number;

  /** Tasks that failed to migrate */
  failures: Array<{ id: string; error: string }>;

  /** Backup path of the original file */
  backupPath?: string;
}
