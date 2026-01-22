/**
 * Tests for Priority Scoring Engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Task } from '../tasks.js';
import {
  calculateDeadlinePressure,
  calculateAgingBonus,
  calculateDependencyDepth,
  calculateBasePriority,
  calculatePriorityScore,
  sortByDynamicPriority,
  findOverdueTasks,
  findCriticalPathTasks,
  detectPriorityInversion,
} from '../priority-scoring.js';

// Helper to create test tasks
function createTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: 'task-1',
    title: 'Test Task',
    description: 'A test task',
    status: 'pending',
    priority: 'normal',
    createdAt: now,
    updatedAt: now,
    createdBy: 'test',
    ...overrides,
  };
}

describe('Priority Scoring', () => {
  describe('calculateDeadlinePressure', () => {
    it('should return 100 for overdue tasks', () => {
      const pastDeadline = new Date(Date.now() - 1000 * 60).toISOString(); // 1 minute ago
      const result = calculateDeadlinePressure(pastDeadline);

      expect(result.score).toBe(100);
      expect(result.daysRemaining).toBeLessThan(0);
    });

    it('should return 85 for critical deadline (< 1 hour)', () => {
      const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes from now
      const result = calculateDeadlinePressure(soon);

      expect(result.score).toBe(85);
    });

    it('should return 65 for urgent deadline (< 8 hours)', () => {
      const deadline = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours from now
      const result = calculateDeadlinePressure(deadline);

      expect(result.score).toBe(65);
    });

    it('should return 40 for high deadline (< 24 hours)', () => {
      const deadline = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12 hours from now
      const result = calculateDeadlinePressure(deadline);

      expect(result.score).toBe(40);
    });

    it('should return 15 for low deadline pressure (> 24 hours)', () => {
      const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days from now
      const result = calculateDeadlinePressure(deadline);

      expect(result.score).toBe(15);
    });

    it('should return 0 for no deadline', () => {
      const result = calculateDeadlinePressure(undefined);

      expect(result.score).toBe(0);
      expect(result.daysRemaining).toBeNull();
    });

    it('should handle invalid deadline gracefully', () => {
      const result = calculateDeadlinePressure('invalid-date');

      expect(result.score).toBe(0);
      expect(result.daysRemaining).toBeNull();
    });
  });

  describe('calculateAgingBonus', () => {
    it('should return 0 for newly created tasks', () => {
      const now = new Date().toISOString();
      const result = calculateAgingBonus(now);

      expect(result.score).toBeLessThanOrEqual(1); // Allow rounding
      expect(result.hoursOld).toBeLessThanOrEqual(0.1);
    });

    it('should return appropriate bonus for old tasks', () => {
      // 10 hours old should be 20 points
      const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
      const result = calculateAgingBonus(tenHoursAgo);

      expect(result.score).toBe(20);
      expect(result.hoursOld).toBe(10);
    });

    it('should cap bonus at 50 points', () => {
      // 30 hours old would normally be 60, but should cap at 50
      const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
      const result = calculateAgingBonus(thirtyHoursAgo);

      expect(result.score).toBe(50);
    });

    it('should handle invalid date gracefully', () => {
      const result = calculateAgingBonus('invalid-date');

      expect(result.score).toBe(0);
      expect(result.hoursOld).toBe(0);
    });
  });

  describe('calculateDependencyDepth', () => {
    it('should return 0 for tasks with no dependents', () => {
      const task = createTask({ id: 'task-1' });
      const tasks = [task];

      const result = calculateDependencyDepth('task-1', tasks);

      expect(result.score).toBe(0);
      expect(result.blockingCount).toBe(0);
    });

    it('should count tasks blocked by this task', () => {
      const task1 = createTask({ id: 'task-1' });
      const task2 = createTask({ id: 'task-2', dependencies: ['task-1'] });
      const task3 = createTask({ id: 'task-3', dependencies: ['task-1'] });
      const task4 = createTask({ id: 'task-4', dependencies: ['task-1'] });
      const tasks = [task1, task2, task3, task4];

      const result = calculateDependencyDepth('task-1', tasks);

      expect(result.blockingCount).toBe(3);
      expect(result.score).toBe(30); // 3 * 10, capped
    });

    it('should cap score at 30', () => {
      const task1 = createTask({ id: 'task-1' });
      const dependentTasks = Array(10)
        .fill(null)
        .map((_, i) => createTask({ id: `task-${i + 2}`, dependencies: ['task-1'] }));
      const tasks = [task1, ...dependentTasks];

      const result = calculateDependencyDepth('task-1', tasks);

      expect(result.blockingCount).toBe(10);
      expect(result.score).toBe(30); // Capped
    });
  });

  describe('calculateBasePriority', () => {
    it('should return 0 for urgent priority', () => {
      expect(calculateBasePriority('urgent')).toBe(0);
    });

    it('should return 25 for high priority', () => {
      expect(calculateBasePriority('high')).toBe(25);
    });

    it('should return 50 for normal priority', () => {
      expect(calculateBasePriority('normal')).toBe(50);
    });

    it('should return 75 for low priority', () => {
      expect(calculateBasePriority('low')).toBe(75);
    });
  });

  describe('calculatePriorityScore', () => {
    it('should combine all scoring components correctly', () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(); // 5 hours ago
      const deadline = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(); // 3 hours from now

      const task = createTask({
        id: 'task-1',
        priority: 'normal',
        createdAt,
        deadline,
      });

      const score = calculatePriorityScore(task, [task]);

      // Expected components:
      // basePriority: 50 (normal)
      // deadlinePressure: 65 (3 hours = urgent)
      // agingBonus: 10 (5 hours old)
      // dependencyDepth: 0 (no dependents)
      // totalScore: 100 - 50 + 65 + 10 + 0 = 125

      expect(score.basePriority).toBe(50);
      expect(score.deadlinePressure).toBe(65);
      expect(score.agingBonus).toBe(10);
      expect(score.dependencyDepth).toBe(0);
      expect(score.totalScore).toBe(125);
    });

    it('should flag overdue tasks', () => {
      const deadline = new Date(Date.now() - 1000).toISOString(); // 1 second ago
      const task = createTask({ deadline });

      const score = calculatePriorityScore(task, [task]);

      expect(score.factors.isOverdue).toBe(true);
      expect(score.factors.daysUntilDeadline).toBeLessThan(0);
    });
  });

  describe('sortByDynamicPriority', () => {
    it('should sort tasks by priority score descending', () => {
      const task1 = createTask({
        id: 'task-1',
        priority: 'urgent',
        createdAt: new Date().toISOString(),
      });
      const task2 = createTask({
        id: 'task-2',
        priority: 'high',
        createdAt: new Date().toISOString(),
      });
      const task3 = createTask({
        id: 'task-3',
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      const sorted = sortByDynamicPriority([task3, task1, task2]);

      // Should be sorted by priority: urgent > high > normal
      expect(sorted[0].id).toBe('task-1'); // urgent
      expect(sorted[1].id).toBe('task-2'); // high
      expect(sorted[2].id).toBe('task-3'); // normal
    });

    it('should maintain creation time order for same priority', () => {
      const task1 = createTask({
        id: 'task-1',
        priority: 'normal',
        createdAt: new Date(Date.now() - 100).toISOString(),
      });
      const task2 = createTask({
        id: 'task-2',
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      const sorted = sortByDynamicPriority([task2, task1]);

      // task1 is older, so should come first even if created later
      expect(sorted[0].id).toBe('task-1');
      expect(sorted[1].id).toBe('task-2');
    });
  });

  describe('findOverdueTasks', () => {
    it('should find tasks past their deadline', () => {
      const overdueDeadline = new Date(Date.now() - 1000).toISOString();
      const futureDeadline = new Date(Date.now() + 1000).toISOString();

      const task1 = createTask({ id: 'task-1', deadline: overdueDeadline });
      const task2 = createTask({ id: 'task-2', deadline: futureDeadline });
      const task3 = createTask({ id: 'task-3' }); // No deadline

      const overdue = findOverdueTasks([task1, task2, task3]);

      expect(overdue).toHaveLength(1);
      expect(overdue[0].task.id).toBe('task-1');
    });
  });

  describe('findCriticalPathTasks', () => {
    it('should find tasks blocking multiple others', () => {
      const task1 = createTask({ id: 'task-1' });
      const task2 = createTask({ id: 'task-2', dependencies: ['task-1'] });
      const task3 = createTask({ id: 'task-3', dependencies: ['task-1'] });
      const task4 = createTask({ id: 'task-4', dependencies: ['task-1'] });

      const critical = findCriticalPathTasks([task1, task2, task3, task4], 2);

      expect(critical).toHaveLength(1);
      expect(critical[0].id).toBe('task-1');
    });

    it('should filter out completed tasks', () => {
      const task1 = createTask({ id: 'task-1', status: 'completed' });
      const task2 = createTask({ id: 'task-2', dependencies: ['task-1'] });

      const critical = findCriticalPathTasks([task1, task2], 1);

      expect(critical).toHaveLength(0);
    });
  });

  describe('detectPriorityInversion', () => {
    it('should detect low-priority tasks older than high-priority tasks', () => {
      const oldLowTask = createTask({
        id: 'task-1',
        priority: 'low',
        createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
      });
      const newHighTask = createTask({
        id: 'task-2',
        priority: 'high',
        createdAt: new Date().toISOString(),
      });

      const inversions = detectPriorityInversion([oldLowTask, newHighTask]);

      expect(inversions).toHaveLength(1);
      expect(inversions[0].lowPriorityTask.id).toBe('task-1');
      expect(inversions[0].highPriorityTask.id).toBe('task-2');
    });

    it('should not detect inversion for same priority', () => {
      const task1 = createTask({
        id: 'task-1',
        priority: 'normal',
        createdAt: new Date(Date.now() - 1000).toISOString(),
      });
      const task2 = createTask({
        id: 'task-2',
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      const inversions = detectPriorityInversion([task1, task2]);

      expect(inversions).toHaveLength(0);
    });

    it('should not detect inversion for correct priority order', () => {
      const oldHighTask = createTask({
        id: 'task-1',
        priority: 'high',
        createdAt: new Date(Date.now() - 1000).toISOString(),
      });
      const newLowTask = createTask({
        id: 'task-2',
        priority: 'low',
        createdAt: new Date().toISOString(),
      });

      const inversions = detectPriorityInversion([oldHighTask, newLowTask]);

      expect(inversions).toHaveLength(0);
    });
  });
});
