/**
 * Task Management Tools
 *
 * MCP tools for managing tasks across agents. Agents can create,
 * update, and track tasks, enabling coordination and progress tracking.
 *
 * This module is organized into focused sub-modules:
 * - types.ts: Shared types and schemas
 * - storage.ts: Task persistence and in-memory storage
 * - crud.ts: CRUD operations (task_create, task_list, task_get, task_update, task_delete)
 * - lifecycle.ts: Lifecycle management (task_claim, task_progress, task_complete, task_fail, task_detect_timeouts)
 * - approval.ts: Human-in-the-loop approval (task_approve, task_reject)
 * - priority.ts: Dynamic priority scoring (task_recalculate_priorities, task_find_overdue, etc.)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../../server.js';
import { initializeStorage } from './storage.js';
import { registerCrudTools } from './crud.js';
import { registerLifecycleTools } from './lifecycle.js';
import { registerApprovalTools } from './approval.js';
import { registerPriorityTools } from './priority.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('tasks');

// Re-export types for external consumers
export {
  TaskSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type TaskUpdateInput,
  type TaskFilterOptions,
} from './types.js';

// Re-export storage utilities
export {
  getTask,
  createTask,
  updateTask,
  deleteTask,
  getAllTasks,
  filterTasks,
  queryTasks,
  getTaskHistory,
  lockTask,
  unlockTask,
  closeStorage,
  getStorageStats,
  migrateFromJson,
  initializeStorage,
  ensureStorageReady,
  getStorageAdapter,
  isStorageInitialized,
  // Deprecated exports for backward compatibility
  saveTasks,
  setTask,
} from './storage.js';

/**
 * Register all task management tools with the MCP server
 */
export function registerTaskTools(server: McpServer, context: ServerContext): void {
  // Initialize task store
  initializeStorage(context.projectDir).catch((err) => logger.error('Failed to load tasks', err));

  // Register all tool groups
  registerCrudTools(server, context);
  registerLifecycleTools(server, context);
  registerApprovalTools(server, context);
  registerPriorityTools(server, context);
}
