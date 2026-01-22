/**
 * Event Bus Types
 *
 * Shared types and schemas for event bus tools.
 */

import { z } from 'zod';
import {
  EventBus,
  InMemoryEventBus,
  MessageType,
  MessagePriority,
  type AgentInfo,
} from '@a3t/rapid-eventbus';

// Re-export commonly used types from rapid-eventbus
export { EventBus, InMemoryEventBus, MessageType, MessagePriority };
export type { AgentInfo };

/**
 * Union type for both bus implementations
 */
export type EventBusInstance = EventBus | InMemoryEventBus;

/**
 * History options for message queries
 */
export interface HistoryOptions {
  hours: number;
  types?: z.infer<typeof MessageType>[];
  forAgent?: string;
  excludeBroadcasts?: boolean;
  onlyActionable?: boolean;
}

/**
 * Wait options for blocking message wait
 */
export interface WaitOptions {
  types?: z.infer<typeof MessageType>[];
  forAgent?: string;
  onlyActionable?: boolean;
}

/**
 * Agent report for health monitoring
 */
export interface AgentReport {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'stale';
  worktree?: string;
  messagesToday?: number;
  tasksAssigned?: number;
  tasksCompleted?: number;
}

/**
 * Task shape from .rapid/tasks.json
 */
export interface TaskRecord {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedTo?: string;
  updatedAt: string;
}
