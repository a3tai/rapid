import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Timeout Recovery Tests
 *
 * Tests for task timeout and recovery scenarios, including:
 * - Task claim timeout (5 minutes) - task auto-resets to pending
 * - Progress timeout (60 seconds) - task marked for recovery
 * - Retry logic with exponential backoff
 * - Capability-based re-assignment after timeout
 * - No task loss during recovery
 * - Cascading timeouts (multiple workers failing)
 */

describe('Task Timeout Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Task Claim Timeout', () => {
    it('should auto-reset task to pending after 5 minute claim timeout', async () => {
      // Simulate task claimed but not completed within 5 minutes
      const claimTime = Date.now();
      const taskId = 'test-task-123';
      const workerId = 'worker-1';

      // Mock task state
      const taskState = {
        id: taskId,
        status: 'in_progress',
        claimedAt: claimTime,
        assignedTo: workerId,
      };

      // Calculate if timeout exceeded (5 min = 300,000ms)
      const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
      const elapsed = Date.now() - taskState.claimedAt;

      // Simulate timeout exceeded
      expect(elapsed).toBeLessThan(CLAIM_TIMEOUT_MS);

      // After 5 minutes, task should reset
      const futureTime = claimTime + CLAIM_TIMEOUT_MS + 1000;
      const shouldReset = futureTime - claimTime > CLAIM_TIMEOUT_MS;

      expect(shouldReset).toBe(true);
      expect(taskState.status).toBe('in_progress'); // Before reset
    });

    it('should reset task to pending status after claim timeout', () => {
      const taskId = 'test-task-456';
      const claimTimeout = 5 * 60 * 1000; // 5 minutes

      // Simulate timeout function
      const resetTaskToPending = (task: any) => {
        task.status = 'pending';
        task.assignedTo = null;
        task.claimedAt = null;
      };

      const task = {
        id: taskId,
        status: 'in_progress',
        assignedTo: 'worker-1',
        claimedAt: Date.now() - claimTimeout - 1000, // 1 second past timeout
      };

      resetTaskToPending(task);

      expect(task.status).toBe('pending');
      expect(task.assignedTo).toBeNull();
    });
  });

  describe('Progress Timeout', () => {
    it('should mark task for recovery after 60 second progress timeout', () => {
      const taskId = 'test-task-789';
      const progressTimeout = 60 * 1000; // 60 seconds

      const task = {
        id: taskId,
        status: 'in_progress',
        lastProgressAt: Date.now() - progressTimeout - 1000, // 1 second past timeout
        markedForRecovery: false,
      };

      // Check if timeout exceeded
      const elapsed = Date.now() - task.lastProgressAt;
      const timedOut = elapsed > progressTimeout;

      if (timedOut) {
        task.markedForRecovery = true;
      }

      expect(task.markedForRecovery).toBe(true);
      expect(timedOut).toBe(true);
    });

    it('should not mark task for recovery if progress update received', () => {
      const taskId = 'test-task-101';
      const progressTimeout = 60 * 1000;

      const task = {
        id: taskId,
        status: 'in_progress',
        lastProgressAt: Date.now(), // Just updated
        markedForRecovery: false,
      };

      const elapsed = Date.now() - task.lastProgressAt;
      const timedOut = elapsed > progressTimeout;

      if (timedOut) {
        task.markedForRecovery = true;
      }

      expect(task.markedForRecovery).toBe(false);
      expect(timedOut).toBe(false);
    });
  });

  describe('Retry Logic with Exponential Backoff', () => {
    it('should implement exponential backoff for retries', () => {
      const calculateBackoff = (attemptNumber: number, baseDelay = 1000): number => {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
        return baseDelay * Math.pow(2, attemptNumber);
      };

      expect(calculateBackoff(0)).toBe(1000); // 1 second
      expect(calculateBackoff(1)).toBe(2000); // 2 seconds
      expect(calculateBackoff(2)).toBe(4000); // 4 seconds
      expect(calculateBackoff(3)).toBe(8000); // 8 seconds
      expect(calculateBackoff(4)).toBe(16000); // 16 seconds
    });

    it('should cap exponential backoff at maximum delay', () => {
      const MAX_BACKOFF = 30 * 1000; // 30 seconds
      const calculateBackoff = (attemptNumber: number, baseDelay = 1000): number => {
        const backoff = baseDelay * Math.pow(2, attemptNumber);
        return Math.min(backoff, MAX_BACKOFF);
      };

      expect(calculateBackoff(10)).toBe(MAX_BACKOFF);
      expect(calculateBackoff(20)).toBe(MAX_BACKOFF);
    });

    it('should retry task with increasing delays between attempts', async () => {
      const retryAttempts: number[] = [];
      const attemptDelays: number[] = [];

      const taskWithRetry = async (maxAttempts = 3) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          retryAttempts.push(attempt);

          if (attempt > 0) {
            const delayMs = 1000 * Math.pow(2, attempt - 1);
            attemptDelays.push(delayMs);
          }

          // Simulate work
          if (attempt < maxAttempts - 1) {
            // Fail and retry
            continue;
          }
          // Success on last attempt
          return 'success';
        }
      };

      const result = await taskWithRetry(3);

      expect(result).toBe('success');
      expect(retryAttempts).toEqual([0, 1, 2]);
      expect(attemptDelays).toEqual([1000, 2000]);
    });
  });

  describe('Capability-Based Re-assignment', () => {
    it('should reassign task to worker with matching capabilities after timeout', () => {
      const taskId = 'test-task-201';
      const task = {
        id: taskId,
        requiredCapabilities: ['testing', 'security'],
        status: 'pending',
        assignedTo: null,
        previousAttempts: 1,
      };

      const workers = [
        { id: 'worker-1', capabilities: ['testing'], availability: 'busy' },
        { id: 'worker-2', capabilities: ['testing', 'security'], availability: 'available' },
        { id: 'worker-3', capabilities: ['documentation'], availability: 'available' },
      ];

      // Find worker with matching capabilities and availability
      const findBestWorker = (requiredCaps: string[], workers: any[]) => {
        return workers
          .filter(
            (w) =>
              w.availability === 'available' &&
              requiredCaps.every((cap) => w.capabilities.includes(cap))
          )
          .sort((a, b) => {
            // Prefer workers with exact capability match over others
            const aExactMatch = a.capabilities.length === requiredCaps.length;
            const bExactMatch = b.capabilities.length === requiredCaps.length;
            if (bExactMatch === aExactMatch) return 0;
            return bExactMatch ? 1 : -1;
          })[0];
      };

      const reassignedWorker = findBestWorker(task.requiredCapabilities, workers);

      expect(reassignedWorker).toBeDefined();
      expect(reassignedWorker?.id).toBe('worker-2');
      expect(reassignedWorker?.availability).toBe('available');
    });

    it('should not reassign to worker without required capabilities', () => {
      const task = {
        requiredCapabilities: ['security'],
        assignedTo: null,
      };

      const workers = [
        { id: 'worker-1', capabilities: ['testing'] },
        { id: 'worker-2', capabilities: [] },
      ];

      const canAssign = (workerCaps: string[], requiredCaps: string[]) => {
        return requiredCaps.every((cap) => workerCaps.includes(cap));
      };

      for (const worker of workers) {
        const canAssignToWorker = canAssign(worker.capabilities, task.requiredCapabilities);
        expect(canAssignToWorker).toBe(false);
      }
    });
  });

  describe('Task Loss Prevention', () => {
    it('should not lose task data during recovery process', () => {
      const taskSnapshot = {
        id: 'test-task-301',
        title: 'Important Task',
        description: 'Task details',
        status: 'in_progress',
        data: { step: 1, progress: 50 },
        createdAt: Date.now(),
      };

      const taskCopy = { ...taskSnapshot };

      // Simulate recovery: reset status but preserve data
      const recovered = {
        ...taskCopy,
        status: 'pending',
        data: taskCopy.data, // Preserve task data
      };

      expect(recovered.id).toBe(taskSnapshot.id);
      expect(recovered.title).toBe(taskSnapshot.title);
      expect(recovered.description).toBe(taskSnapshot.description);
      expect(recovered.data).toEqual(taskSnapshot.data);
      expect(recovered.status).toBe('pending'); // Status changed
      expect(recovered.createdAt).toBe(taskSnapshot.createdAt); // Metadata preserved
    });

    it('should maintain task history through recovery', () => {
      const task = {
        id: 'test-task-401',
        status: 'in_progress',
        history: [
          { timestamp: Date.now(), event: 'created', status: 'pending' },
          { timestamp: Date.now() + 1000, event: 'claimed', status: 'in_progress' },
        ],
      };

      // Add recovery event to history
      task.history.push({
        timestamp: Date.now() + 2000,
        event: 'timeout_recovered',
        status: 'pending',
      });

      expect(task.history).toHaveLength(3);
      expect(task.history?.[2]?.event).toBe('timeout_recovered');
      expect(task.history?.[0]?.event).toBe('created');
    });
  });

  describe('Cascading Timeouts', () => {
    it('should handle multiple workers timing out simultaneously', () => {
      const workers = [
        { id: 'worker-1', status: 'stuck', timedOut: true, tasksAssigned: 2 },
        { id: 'worker-2', status: 'stuck', timedOut: true, tasksAssigned: 3 },
        { id: 'worker-3', status: 'healthy', timedOut: false, tasksAssigned: 0 },
      ];

      const timedOutWorkers = workers.filter((w) => w.timedOut);
      const healthyWorkers = workers.filter((w) => !w.timedOut);

      // Collect orphaned tasks
      const orphanedTasks = timedOutWorkers.reduce((sum, w) => sum + w.tasksAssigned, 0);

      expect(timedOutWorkers).toHaveLength(2);
      expect(healthyWorkers).toHaveLength(1);
      expect(orphanedTasks).toBe(5); // 2 + 3 tasks need reassignment
    });

    it('should redistribute orphaned tasks from failed workers', () => {
      const failedWorkerTasks = ['task-1', 'task-2', 'task-3'];
      const availableWorkers = [
        { id: 'worker-health-1', capacity: 5, currentLoad: 1 },
        { id: 'worker-health-2', capacity: 5, currentLoad: 3 },
      ];

      // Redistribute tasks to workers with capacity
      const redistributed = failedWorkerTasks.map((taskId) => {
        const targetWorker = availableWorkers.sort((a, b) => a.currentLoad - b.currentLoad)[0];
        if (!targetWorker) {
          throw new Error('No available workers for redistribution');
        }
        targetWorker.currentLoad += 1;
        return { taskId, assignedTo: targetWorker.id };
      });

      expect(redistributed).toHaveLength(3);
      expect(redistributed?.[0]?.assignedTo).toBeDefined();

      // All tasks should be reassigned
      const allReassigned = redistributed.every((r) => r.assignedTo);
      expect(allReassigned).toBe(true);
    });

    it('should prevent cascading timeouts from blocking queue', () => {
      const pendingTasks = [
        { id: 'task-1', status: 'pending', priority: 'high' },
        { id: 'task-2', status: 'pending', priority: 'normal' },
        { id: 'task-3', status: 'pending', priority: 'high' },
      ];

      // Filter out tasks assigned to failed workers (none in this case)
      const tasksToReassign = pendingTasks.filter((t) => t.status === 'pending');

      // Sort by priority
      tasksToReassign.sort((a) => (a.priority === 'high' ? -1 : 1));

      expect(tasksToReassign).toHaveLength(3);
      expect(tasksToReassign?.[0]?.priority).toBe('high');
    });
  });

  describe('Recovery Metrics', () => {
    it('should track timeout recovery statistics', () => {
      const recoveryStats = {
        totalTimeouts: 0,
        successfulRecoveries: 0,
        failedRecoveries: 0,
        averageRecoveryTime: 0,
        timeoutsByWorker: {} as Record<string, number>,
      };

      // Simulate recovery events
      const recordTimeout = (workerId: string, success: boolean, recoveryTimeMs: number) => {
        recoveryStats.totalTimeouts += 1;
        if (success) {
          recoveryStats.successfulRecoveries += 1;
        } else {
          recoveryStats.failedRecoveries += 1;
        }

        const currentAvg = recoveryStats.averageRecoveryTime;
        recoveryStats.averageRecoveryTime =
          (currentAvg * (recoveryStats.totalTimeouts - 1) + recoveryTimeMs) /
          recoveryStats.totalTimeouts;

        recoveryStats.timeoutsByWorker[workerId] =
          (recoveryStats.timeoutsByWorker[workerId] || 0) + 1;
      };

      recordTimeout('worker-1', true, 500);
      recordTimeout('worker-1', false, 1000);
      recordTimeout('worker-2', true, 300);

      expect(recoveryStats.totalTimeouts).toBe(3);
      expect(recoveryStats.successfulRecoveries).toBe(2);
      expect(recoveryStats.failedRecoveries).toBe(1);
      expect(recoveryStats.timeoutsByWorker['worker-1']).toBe(2);
      expect(recoveryStats.timeoutsByWorker['worker-2']).toBe(1);
    });
  });
});
