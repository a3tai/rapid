/**
 * Task Storage
 *
 * Manages task persistence using the pluggable StorageAdapter from @a3t/rapid-core.
 * Supports SQLite (default, with WAL for durability) and file-based storage.
 *
 * IMPORTANT: Only the MCP server and daemon should access storage directly.
 * Agents interact with tasks through MCP tools (task_create, task_update, etc.).
 */

import {
  createStorageAdapter,
  getDefaultStorageAdapter,
  type StorageAdapter,
  type Task as CoreTask,
  type TaskFilter,
  type TaskStatus,
} from '@a3t/rapid-core';
import type { Task } from './types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('tasks');

// Storage adapter singleton
let adapter: StorageAdapter | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Wait for storage to be ready
 * This allows tools to safely await initialization before accessing storage
 */
export async function ensureStorageReady(): Promise<void> {
  if (initialized && adapter) return;
  if (initPromise) {
    await initPromise;
    return;
  }
  throw new Error('Storage not initialized. Call initializeStorage() first.');
}

/**
 * Initialize task storage with project directory
 *
 * Uses SQLite with WAL by default for durability. Falls back to file-based
 * storage if SQLite initialization fails.
 */
export async function initializeStorage(projectDir: string): Promise<void> {
  if (initialized && adapter) return;
  if (initPromise) return initPromise;

  // Create a promise for the initialization
  initPromise = (async () => {
    // Check for environment variable overrides
    const backend = process.env.RAPID_STORAGE_BACKEND as 'sqlite' | 'file' | undefined;

    try {
      if (backend === 'file') {
        // Explicitly use file-based storage
        adapter = createStorageAdapter({
          backend: 'file',
          basePath: `${projectDir}/.rapid`,
        });
      } else {
        // Default to SQLite with WAL
        adapter = getDefaultStorageAdapter(`${projectDir}/.rapid`);
      }

      await adapter.initialize();
      const stats = await adapter.getStats();
      logger.info(`Storage initialized: ${stats.backend}, ${stats.taskCount} tasks`);
      initialized = true;
    } catch (error) {
      logger.error('Failed to initialize primary storage, falling back to file-based', error);

      // Fall back to file-based storage
      try {
        adapter = createStorageAdapter({
          backend: 'file',
          basePath: `${projectDir}/.rapid`,
        });
        await adapter.initialize();
        const stats = await adapter.getStats();
        logger.info(`Fallback storage initialized: ${stats.backend}, ${stats.taskCount} tasks`);
        initialized = true;
      } catch (fallbackError) {
        logger.error('Failed to initialize fallback storage', fallbackError);
        initPromise = null; // Reset so it can be retried
        throw fallbackError;
      }
    }
  })();

  return initPromise;
}

/**
 * Get the storage adapter instance
 */
export function getStorageAdapter(): StorageAdapter | null {
  return adapter;
}

/**
 * Check if storage is initialized
 */
export function isStorageInitialized(): boolean {
  return initialized && adapter !== null;
}

/**
 * Get the tasks Map (for backward compatibility)
 *
 * @deprecated Use queryTasks or getTask instead for better performance
 */
export function getTasksStore(): Map<string, Task> {
  // Return an empty Map if not initialized
  // This maintains backward compatibility but queries should use adapter directly
  return new Map();
}

/**
 * Get a task by ID
 */
export async function getTask(id: string): Promise<Task | undefined> {
  await ensureStorageReady();

  const task = await adapter!.getTask(id);
  return task ? (task as unknown as Task) : undefined;
}

/**
 * Synchronous get task (for backward compatibility)
 *
 * @deprecated Use async getTask instead
 */
export function getTaskSync(id: string): Task | undefined {
  logger.warn('getTaskSync is deprecated, use async getTask instead');
  // Cannot do sync operation with async adapter
  // Return undefined - callers should migrate to async
  return undefined;
}

/**
 * Set a task (creates or updates)
 */
export async function setTask(task: Task): Promise<void> {
  await ensureStorageReady();

  const existingTask = await adapter!.getTask(task.id);
  if (existingTask) {
    await adapter!.updateTask(
      task.id,
      task as unknown as Partial<CoreTask>,
      task.assignedTo || 'system'
    );
  } else {
    await adapter!.createTask(task as unknown as CoreTask, task.createdBy || 'system');
  }
}

/**
 * Create a new task
 */
export async function createTask(task: Task, changedBy?: string): Promise<Task> {
  await ensureStorageReady();

  const created = await adapter!.createTask(
    task as unknown as CoreTask,
    changedBy || task.createdBy || 'system'
  );
  return created as unknown as Task;
}

/**
 * Update a task
 */
export async function updateTask(
  id: string,
  updates: Partial<Task>,
  changedBy?: string
): Promise<Task | null> {
  await ensureStorageReady();

  const updated = await adapter!.updateTask(
    id,
    updates as unknown as Partial<CoreTask>,
    changedBy || 'system'
  );
  return updated ? (updated as unknown as Task) : null;
}

/**
 * Delete a task
 */
export async function deleteTask(id: string, changedBy?: string): Promise<boolean> {
  await ensureStorageReady();

  return adapter!.deleteTask(id, changedBy || 'system');
}

/**
 * Get all tasks as an array
 */
export async function getAllTasks(): Promise<Task[]> {
  await ensureStorageReady();

  const result = await adapter!.queryTasks({ limit: 10000 });
  return result.items as unknown as Task[];
}

/**
 * Save tasks to disk
 *
 * @deprecated No longer needed - StorageAdapter handles persistence automatically
 */
export async function saveTasks(): Promise<void> {
  // No-op: StorageAdapter handles persistence automatically
  // SQLite writes are durable with WAL mode
  // File adapter writes on each operation
}

/**
 * Filter tasks based on criteria
 */
export async function filterTasks(options: {
  status?: string;
  assignedTo?: string;
  createdBy?: string;
  parentId?: string;
  tags?: string[];
}): Promise<Task[]> {
  await ensureStorageReady();

  const filter: TaskFilter = {};
  if (options.status) filter.status = options.status as TaskStatus;
  if (options.assignedTo) filter.assignedTo = options.assignedTo;
  if (options.createdBy) filter.createdBy = options.createdBy;
  if (options.parentId) filter.parentId = options.parentId;
  if (options.tags && options.tags.length > 0) filter.tags = options.tags;

  const result = await adapter!.queryTasks({ filter, limit: 10000 });
  return result.items as unknown as Task[];
}

/**
 * Query tasks with pagination and sorting
 */
export async function queryTasks(options: {
  filter?: TaskFilter;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'deadline';
  sortOrder?: 'asc' | 'desc';
}): Promise<{ items: Task[]; total: number; hasMore: boolean }> {
  await ensureStorageReady();

  const result = await adapter!.queryTasks(options);
  return {
    items: result.items as unknown as Task[],
    total: result.total,
    hasMore: result.hasMore,
  };
}

/**
 * Get task history
 */
export async function getTaskHistory(
  taskId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ items: unknown[]; total: number; hasMore: boolean }> {
  await ensureStorageReady();

  return adapter!.getTaskHistory(taskId, options);
}

/**
 * Acquire a lock on a task for exclusive operations
 */
export async function lockTask(
  taskId: string,
  options?: { timeout?: number; owner?: string }
): Promise<boolean> {
  await ensureStorageReady();

  return adapter!.acquireLock(taskId, options);
}

/**
 * Release a lock on a task
 */
export async function unlockTask(taskId: string): Promise<void> {
  await ensureStorageReady();

  await adapter!.releaseLock(taskId);
}

/**
 * Close storage connection
 */
export async function closeStorage(): Promise<void> {
  if (adapter) {
    await adapter.close();
    adapter = null;
    initialized = false;
    logger.info('Storage closed');
  }
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<{
  backend: string;
  taskCount: number;
  historyCount: number;
  sizeBytes?: number;
}> {
  await ensureStorageReady();

  return adapter!.getStats();
}

/**
 * Migrate from legacy JSON file to new storage
 */
export async function migrateFromJson(jsonPath: string): Promise<{
  migrated: number;
  failed: number;
  errors: string[];
}> {
  await ensureStorageReady();

  return adapter!.migrateFromJson(jsonPath);
}
