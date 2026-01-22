/**
 * Task Types
 *
 * Shared types and schemas for task management tools.
 */

import { z } from 'zod';

// Task status enum
export const TaskStatusSchema = z.enum([
  'pending',
  'pending_approval',
  'in_progress',
  'completed',
  'blocked',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// Task priority enum
export const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

// Task schema - includes Phase 1 Task Assignment Protocol fields
// Note: Use .nullish() for fields that may be null from SQLite storage
export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(), // Agent ID or name
  assignedTo: z.string().nullish(), // Agent ID or name
  parentId: z.string().nullish(), // For subtasks
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  // Phase 1: Task Assignment Protocol fields
  deadline: z.string().nullish(), // ISO8601 timestamp when task must complete
  claimedAt: z.string().nullish(), // When task was claimed
  claimDeadline: z.string().nullish(), // 5-min timeout from claim for starting progress
  lastProgressAt: z.string().nullish(), // When last progress update was sent
  requiredCapabilities: z.array(z.string()).optional(), // Capabilities agent must have
  estimatedDuration: z.number().nullish(), // Seconds
  dependencies: z.array(z.string()).optional(), // Task IDs that must complete first
  result: z.record(z.unknown()).optional(), // Result data on completion
  errorCode: z.string().nullish(), // Error code if failed
  canRetry: z.boolean().nullish(), // Whether task can be retried
  attemptNumber: z.number().nullish(), // Current attempt number
  // Human-in-the-Loop Approval fields
  requiresApproval: z.boolean().nullish(), // Whether task needs human approval
  approvalType: z.enum(['before_claim', 'before_commit', 'before_deploy']).nullish(), // When approval is needed
  approvedBy: z.string().nullish(), // User/agent who approved
  approvedAt: z.string().nullish(), // When approved (ISO8601)
  approvalReason: z.string().nullish(), // Why approval is required
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * Task update input type
 */
export interface TaskUpdateInput {
  id: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  deadline?: string | null;
  requiredCapabilities?: string[];
  estimatedDuration?: number;
  dependencies?: string[];
}

/**
 * Task filter options
 */
export interface TaskFilterOptions {
  status?: TaskStatus;
  assignedTo?: string;
  createdBy?: string;
  parentId?: string;
  tags?: string[];
}
