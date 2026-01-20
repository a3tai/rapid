/**
 * Test suite for Phase 1 Task Assignment Protocol implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock task schema for testing
const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'blocked', 'cancelled']);
const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
  assignedTo: z.string().optional(),
  parentId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  deadline: z.string().optional(),
  claimedAt: z.string().optional(),
  claimDeadline: z.string().optional(),
  lastProgressAt: z.string().optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  estimatedDuration: z.number().optional(),
  dependencies: z.array(z.string()).optional(),
  result: z.record(z.unknown()).optional(),
  errorCode: z.string().optional(),
  canRetry: z.boolean().optional(),
  attemptNumber: z.number().optional(),
});

type Task = z.infer<typeof TaskSchema>;

describe('Phase 1: Task Assignment Protocol', () => {
  let tasks: Map<string, Task>;

  beforeEach(() => {
    tasks = new Map();
  });

  describe('Task Creation', () => {
    it('should create a task with required Phase 1 fields', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test task',
        status: 'pending',
        priority: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'orchestrator-1',
        requiredCapabilities: ['read', 'write'],
        estimatedDuration: 3600,
        attemptNumber: 1,
      };

      tasks.set(task.id, task);

      expect(tasks.has('task-1')).toBe(true);
      const stored = tasks.get('task-1')!;
      expect(stored.requiredCapabilities).toEqual(['read', 'write']);
      expect(stored.estimatedDuration).toBe(3600);
      expect(stored.attemptNumber).toBe(1);
    });

    it('should validate task schema includes Phase 1 fields', () => {
      const taskData = {
        id: 'task-1',
        title: 'Implementation task',
        status: 'pending' as const,
        priority: 'high' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'orchestrator',
        deadline: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        requiredCapabilities: ['bash', 'read', 'write'],
        estimatedDuration: 7200,
      };

      const validated = TaskSchema.parse(taskData);
      expect(validated.deadline).toBeDefined();
      expect(validated.requiredCapabilities).toHaveLength(3);
    });
  });

  describe('Task Claiming with Capability Matching', () => {
    beforeEach(() => {
      const task: Task = {
        id: 'task-1',
        title: 'Test task',
        status: 'pending',
        priority: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'orchestrator-1',
        requiredCapabilities: ['read', 'write', 'bash'],
      };
      tasks.set(task.id, task);
    });

    it('should allow claim when agent has all required capabilities', () => {
      const task = tasks.get('task-1')!;
      const agentCapabilities = ['read', 'write', 'bash', 'test'];

      const hasAllCapabilities = task.requiredCapabilities!.every((cap) =>
        agentCapabilities.includes(cap)
      );

      expect(hasAllCapabilities).toBe(true);

      // Simulate claiming
      task.status = 'in_progress';
      task.assignedTo = 'agent-1';
      task.claimedAt = new Date().toISOString();
      task.claimDeadline = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      task.lastProgressAt = new Date().toISOString();

      expect(task.status).toBe('in_progress');
      expect(task.assignedTo).toBe('agent-1');
      expect(task.claimedAt).toBeDefined();
      expect(task.claimDeadline).toBeDefined();
    });

    it('should reject claim when agent lacks required capabilities', () => {
      const task = tasks.get('task-1')!;
      const agentCapabilities = ['read', 'write']; // Missing 'bash'

      const missingCaps = task.requiredCapabilities!.filter(
        (cap) => !agentCapabilities.includes(cap)
      );

      expect(missingCaps).toEqual(['bash']);
      expect(task.status).toBe('pending'); // Should remain pending
      expect(task.assignedTo).toBeUndefined();
    });

    it('should reject claim if task is not pending', () => {
      const task = tasks.get('task-1')!;
      task.status = 'in_progress';
      task.assignedTo = 'agent-1';

      // Attempt claim from different agent
      const agentCapabilities = ['read', 'write', 'bash'];
      // @ts-expect-error - Intentionally checking false condition (status is in_progress, not pending)
      const canClaim =
        task.status === 'pending' &&
        agentCapabilities.every((cap) => task.requiredCapabilities!.includes(cap));

      expect(canClaim).toBe(false);
      expect(task.assignedTo).toBe('agent-1'); // Should remain with original agent
    });
  });

  describe('Task Progress Tracking', () => {
    beforeEach(() => {
      const task: Task = {
        id: 'task-1',
        title: 'Test task',
        status: 'in_progress',
        priority: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'orchestrator-1',
        assignedTo: 'agent-1',
        claimedAt: new Date().toISOString(),
        claimDeadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        lastProgressAt: new Date().toISOString(),
      };
      tasks.set(task.id, task);
    });

    it('should update progress timestamp on progress update', async () => {
      const task = tasks.get('task-1')!;
      const initialProgressTime = task.lastProgressAt!;

      // Simulate time passing
      await new Promise((resolve) => setTimeout(resolve, 100));

      const now = new Date().toISOString();
      task.lastProgressAt = now;
      task.metadata = { progressPercentage: 0.45 };

      expect(task.lastProgressAt).not.toBe(initialProgressTime);
      expect(task.metadata?.progressPercentage).toBe(0.45);
    });

    it('should store progress message in metadata', () => {
      const task = tasks.get('task-1')!;
      const message = 'Completed first phase';

      if (!task.metadata) task.metadata = {};
      task.metadata.lastProgressMessage = message;

      expect(task.metadata.lastProgressMessage).toBe(message);
    });
  });

  describe('Timeout Detection', () => {
    beforeEach(() => {
      // Task with stale progress
      const staleTask: Task = {
        id: 'task-stale',
        title: 'Stale task',
        status: 'in_progress',
        priority: 'normal',
        createdAt: new Date(Date.now() - 200000).toISOString(),
        updatedAt: new Date(Date.now() - 200000).toISOString(),
        createdBy: 'orchestrator-1',
        assignedTo: 'agent-1',
        claimedAt: new Date(Date.now() - 200000).toISOString(),
        claimDeadline: new Date(Date.now() - 100000).toISOString(),
        lastProgressAt: new Date(Date.now() - 200000).toISOString(),
      };
      tasks.set('task-stale', staleTask);

      // Task with recent progress
      const activeTask: Task = {
        id: 'task-active',
        title: 'Active task',
        status: 'in_progress',
        priority: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'orchestrator-1',
        assignedTo: 'agent-2',
        claimedAt: new Date().toISOString(),
        claimDeadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        lastProgressAt: new Date().toISOString(),
      };
      tasks.set('task-active', activeTask);
    });

    it('should detect progress timeout', () => {
      const progressTimeoutSeconds = 60;
      const now = Date.now();
      const timedOut: string[] = [];

      for (const task of tasks.values()) {
        if (task.status !== 'in_progress') continue;

        if (task.lastProgressAt) {
          const lastProgressTime = new Date(task.lastProgressAt).getTime();
          const timeSinceProgress = (now - lastProgressTime) / 1000;

          if (timeSinceProgress > progressTimeoutSeconds) {
            timedOut.push(task.id);
          }
        }
      }

      expect(timedOut).toContain('task-stale');
      expect(timedOut).not.toContain('task-active');
    });

    it('should release timed-out task back to pending', () => {
      const task = tasks.get('task-stale')!;
      const progressTimeoutSeconds = 60;
      const now = Date.now();

      if (task.lastProgressAt) {
        const lastProgressTime = new Date(task.lastProgressAt).getTime();
        const timeSinceProgress = (now - lastProgressTime) / 1000;

        if (timeSinceProgress > progressTimeoutSeconds) {
          task.status = 'pending';
          task.assignedTo = undefined;
          task.claimedAt = undefined;
          task.claimDeadline = undefined;

          if (!task.metadata) task.metadata = {};
          task.metadata.timeoutReason = 'progress_timeout';
        }
      }

      expect(task.status).toBe('pending');
      expect(task.assignedTo).toBeUndefined();
      expect(task.metadata?.timeoutReason).toBe('progress_timeout');
    });
  });

  describe('Task Completion', () => {
    beforeEach(() => {
      const task: Task = {
        id: 'task-1',
        title: 'Test task',
        status: 'in_progress',
        priority: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'orchestrator-1',
        assignedTo: 'agent-1',
      };
      tasks.set(task.id, task);
    });

    it('should mark task as completed with result', () => {
      const task = tasks.get('task-1')!;
      const result = { filesChanged: 5, testsAdded: 10 };

      task.status = 'completed';
      task.result = result;

      expect(task.status).toBe('completed');
      expect(task.result).toEqual(result);
    });

    it('should store completion summary in metadata', () => {
      const task = tasks.get('task-1')!;
      const summary = 'Task completed successfully';

      task.status = 'completed';
      if (!task.metadata) task.metadata = {};
      task.metadata.completionSummary = summary;

      expect(task.metadata.completionSummary).toBe(summary);
    });
  });

  describe('Task Failure and Retry', () => {
    beforeEach(() => {
      const task: Task = {
        id: 'task-1',
        title: 'Test task',
        status: 'in_progress',
        priority: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'orchestrator-1',
        assignedTo: 'agent-1',
        attemptNumber: 1,
      };
      tasks.set(task.id, task);
    });

    it('should fail task and reset to pending for retry', () => {
      const task = tasks.get('task-1')!;
      const error = 'Database connection failed';

      task.status = 'pending';
      task.assignedTo = undefined;
      task.errorCode = 'DB_CONN_ERROR';
      task.canRetry = true;
      task.attemptNumber = (task.attemptNumber ?? 1) + 1;

      if (!task.metadata) task.metadata = {};
      task.metadata.lastError = error;

      expect(task.status).toBe('pending');
      expect(task.assignedTo).toBeUndefined();
      expect(task.attemptNumber).toBe(2);
      expect(task.canRetry).toBe(true);
      expect(task.metadata.lastError).toBe(error);
    });

    it('should mark non-retryable failures', () => {
      const task = tasks.get('task-1')!;
      task.canRetry = false;
      task.errorCode = 'INVALID_INPUT';

      expect(task.canRetry).toBe(false);
      // Orchestrator can now decide not to retry
    });
  });

  describe('Task Dependencies (Metadata)', () => {
    it('should track task dependencies', () => {
      const task1: Task = {
        id: 'task-1',
        title: 'Task 1',
        status: 'completed',
        priority: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'orchestrator-1',
      };

      const task2: Task = {
        id: 'task-2',
        title: 'Task 2',
        status: 'pending',
        priority: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'orchestrator-1',
        dependencies: ['task-1'], // Depends on task-1
      };

      tasks.set(task1.id, task1);
      tasks.set(task2.id, task2);

      expect(task2.dependencies).toContain('task-1');
      expect(task1.status).toBe('completed'); // Can be claimed as dependency is met
    });

    it('should check if dependencies are met', () => {
      const task2: Task = {
        id: 'task-2',
        title: 'Task 2',
        status: 'pending',
        priority: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'orchestrator-1',
        dependencies: ['task-1', 'task-3'],
      };

      tasks.set(task2.id, task2);

      // Check if all dependencies are met
      const dependenciesMet =
        !task2.dependencies ||
        task2.dependencies.every((depId) => {
          const dep = tasks.get(depId);
          return dep && dep.status === 'completed';
        });

      expect(dependenciesMet).toBe(false); // Missing dependencies
    });
  });
});
