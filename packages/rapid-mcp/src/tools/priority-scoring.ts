/**
 * Task Priority Scoring Engine
 *
 * Implements dynamic priority recalculation based on multiple factors:
 * - Deadline pressure (overdue detection, time-to-deadline)
 * - Task age and urgency
 * - Dependency depth (blocking other tasks)
 * - Static priority baseline
 */

import { createLogger } from '../utils/logger.js';
import type { Task, TaskPriority } from './tasks/types.js';

const logger = createLogger('priority-scoring');

/**
 * Priority score breakdown for diagnostics
 */
export interface PriorityScoreBreakdown {
  basePriority: number;
  deadlinePressure: number;
  agingBonus: number;
  dependencyDepth: number;
  totalScore: number;
  factors: {
    isOverdue: boolean;
    daysUntilDeadline: number | null;
    hoursOld: number;
    blockingTaskCount: number;
  };
}

/**
 * Static priority levels converted to scores (0-3, where 0 is most urgent)
 */
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/**
 * Maximum bonus for each scoring component
 */
const SCORING_WEIGHTS = {
  BASE_PRIORITY: 25, // 0-75 points (0 for urgent, 75 for low)
  DEADLINE_PRESSURE: 100, // 0-100 points
  AGING_BONUS: 50, // 0-50 points (older = higher)
  DEPENDENCY_DEPTH: 30, // 0-30 points (more dependent tasks = higher)
};

/**
 * Deadline pressure thresholds
 */
const DEADLINE_THRESHOLDS = {
  OVERDUE: 1, // Points for overdue tasks
  CRITICAL: 1, // Hours: < 1 hour = 80 points
  URGENT: 8, // Hours: < 8 hours = 60 points
  HIGH: 24, // Hours: < 24 hours = 40 points
  NORMAL: Infinity, // Everything else = 20 points
};

/**
 * Calculate deadline pressure score based on time remaining
 *
 * @param deadline ISO8601 deadline string or undefined
 * @returns Score from 0-100, where 100 means task is overdue or critical
 */
export function calculateDeadlinePressure(deadline?: string): { score: number; daysRemaining: number | null } {
  if (!deadline) {
    return { score: 0, daysRemaining: null };
  }

  try {
    const now = Date.now();
    const deadlineTime = new Date(deadline).getTime();

    // Handle invalid date
    if (Number.isNaN(deadlineTime)) {
      return { score: 0, daysRemaining: null };
    }

    const timeRemaining = deadlineTime - now;
    const hoursRemaining = timeRemaining / (1000 * 60 * 60);
    const daysRemaining = hoursRemaining / 24;

    // Task is overdue
    if (timeRemaining < 0) {
      return { score: 100, daysRemaining };
    }

    // Critical: less than 1 hour remaining
    if (hoursRemaining < DEADLINE_THRESHOLDS.CRITICAL) {
      return { score: 85, daysRemaining };
    }

    // Urgent: less than 8 hours remaining
    if (hoursRemaining < DEADLINE_THRESHOLDS.URGENT) {
      return { score: 65, daysRemaining };
    }

    // High: less than 24 hours remaining
    if (hoursRemaining < DEADLINE_THRESHOLDS.HIGH) {
      return { score: 40, daysRemaining };
    }

    // Low deadline pressure for anything else
    return { score: 15, daysRemaining };
  } catch (error) {
    logger.warn(
      `Failed to parse deadline "${deadline}": ${error instanceof Error ? error.message : String(error)}`
    );
    return { score: 0, daysRemaining: null };
  }
}

/**
 * Calculate aging bonus based on task creation time
 * Older tasks get priority to prevent starvation
 *
 * @param createdAt ISO8601 creation timestamp
 * @returns Score from 0-50, where 50 means task is very old
 */
export function calculateAgingBonus(createdAt: string): { score: number; hoursOld: number } {
  try {
    const now = Date.now();
    const createdTime = new Date(createdAt).getTime();

    // Handle invalid date
    if (Number.isNaN(createdTime)) {
      return { score: 0, hoursOld: 0 };
    }

    const ageMs = now - createdTime;
    const hoursOld = ageMs / (1000 * 60 * 60);

    // 2 points per hour old, capped at 50
    const score = Math.min(hoursOld * 2, SCORING_WEIGHTS.AGING_BONUS);

    return { score, hoursOld };
  } catch (error) {
    logger.warn(
      `Failed to parse createdAt "${createdAt}": ${error instanceof Error ? error.message : String(error)}`
    );
    return { score: 0, hoursOld: 0 };
  }
}

/**
 * Calculate dependency depth bonus
 * Tasks that block other tasks get higher priority (critical path)
 *
 * @param taskId Task ID to check
 * @param allTasks All tasks in the system
 * @returns Score from 0-30, where 30 means task blocks many others
 */
export function calculateDependencyDepth(taskId: string, allTasks: Task[]): { score: number; blockingCount: number } {
  // Find all tasks that depend on this one
  const blockingCount = allTasks.filter((t) => t.dependencies?.includes(taskId)).length;

  // 10 points per blocking task, capped at 30
  const score = Math.min(blockingCount * 10, SCORING_WEIGHTS.DEPENDENCY_DEPTH);

  return { score, blockingCount };
}

/**
 * Calculate base priority score from static priority level
 *
 * @param priority Task priority level
 * @returns Score from 0-75, where 0 means urgent, 75 means low
 */
export function calculateBasePriority(priority: TaskPriority): number {
  const priorityIndex = PRIORITY_ORDER[priority];
  return priorityIndex * SCORING_WEIGHTS.BASE_PRIORITY;
}

/**
 * Calculate overall priority score
 * Higher scores mean higher priority (more urgent)
 *
 * @param task Task to score
 * @param allTasks All tasks (for dependency calculation)
 * @returns Total priority score and breakdown
 */
export function calculatePriorityScore(task: Task, allTasks: Task[]): PriorityScoreBreakdown {
  // Calculate component scores
  const basePriority = calculateBasePriority(task.priority);
  const { score: deadlinePressure, daysRemaining } = calculateDeadlinePressure(task.deadline);
  const { score: agingBonus, hoursOld } = calculateAgingBonus(task.createdAt);
  const { score: dependencyDepth, blockingCount } = calculateDependencyDepth(task.id, allTasks);

  // Total score: inverse base (lower base = higher total), plus bonuses
  // Formula: (100 - basePriority) + deadlinePressure + agingBonus + dependencyDepth
  const totalScore = 100 - basePriority + deadlinePressure + agingBonus + dependencyDepth;

  return {
    basePriority,
    deadlinePressure,
    agingBonus,
    dependencyDepth,
    totalScore,
    factors: {
      isOverdue: daysRemaining !== null && daysRemaining < 0,
      daysUntilDeadline: daysRemaining,
      hoursOld,
      blockingTaskCount: blockingCount,
    },
  };
}

/**
 * Sort tasks by dynamic priority
 *
 * @param tasks Tasks to sort
 * @returns Tasks sorted by priority (highest score first = most urgent)
 */
export function sortByDynamicPriority(tasks: Task[]): Task[] {
  const scored = tasks.map((task) => ({
    task,
    score: calculatePriorityScore(task, tasks),
  }));

  // Sort by total score descending (higher = more urgent)
  scored.sort((a, b) => {
    // Primary: total score (descending)
    if (b.score.totalScore !== a.score.totalScore) {
      return b.score.totalScore - a.score.totalScore;
    }

    // Secondary: creation time (older first)
    return new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime();
  });

  return scored.map((s) => s.task);
}

/**
 * Find overdue tasks that need immediate attention
 *
 * @param tasks Tasks to check
 * @returns Array of overdue tasks with their pressure score
 */
export function findOverdueTasks(
  tasks: Task[]
): Array<{
  task: Task;
  score: PriorityScoreBreakdown;
}> {
  return tasks
    .map((task) => ({
      task,
      score: calculatePriorityScore(task, tasks),
    }))
    .filter((item) => item.score.factors.isOverdue)
    .sort((a, b) => b.score.totalScore - a.score.totalScore);
}

/**
 * Find critical path tasks (blocking many others)
 *
 * @param tasks Tasks to analyze
 * @param minBlocking Minimum number of tasks blocked to consider critical
 * @returns Array of critical path tasks
 */
export function findCriticalPathTasks(tasks: Task[], minBlocking: number = 2): Task[] {
  return tasks.filter((task) => {
    const blockingCount = tasks.filter((t) => t.dependencies?.includes(task.id)).length;
    return blockingCount >= minBlocking && (task.status === 'pending' || task.status === 'in_progress');
  });
}

/**
 * Detect priority inversion scenarios
 * Returns low-priority tasks that are older than high-priority tasks
 *
 * @param tasks Tasks to check
 * @returns Array of inverted task pairs (low-priority but older)
 */
export function detectPriorityInversion(
  tasks: Task[]
): Array<{
  lowPriorityTask: Task;
  highPriorityTask: Task;
  ageDifference: number;
}> {
  const inversions: Array<{
    lowPriorityTask: Task;
    highPriorityTask: Task;
    ageDifference: number;
  }> = [];

  for (let i = 0; i < tasks.length; i++) {
    const lowPri = tasks[i];
    if (!lowPri || !['pending', 'in_progress'].includes(lowPri.status)) continue;

    for (let j = i + 1; j < tasks.length; j++) {
      const highPri = tasks[j];
      if (!highPri || !['pending', 'in_progress'].includes(highPri.status)) continue;

      // Check if priorities are inverted (lower-priority task is older)
      const lowPriOrder = PRIORITY_ORDER[lowPri.priority];
      const highPriOrder = PRIORITY_ORDER[highPri.priority];

      if (lowPriOrder > highPriOrder) {
        // lowPri has lower static priority
        const lowPriTime = new Date(lowPri.createdAt).getTime();
        const highPriTime = new Date(highPri.createdAt).getTime();

        if (lowPriTime < highPriTime) {
          // And it's older - inversion!
          inversions.push({
            lowPriorityTask: lowPri,
            highPriorityTask: highPri,
            ageDifference: highPriTime - lowPriTime,
          });
        }
      }
    }
  }

  return inversions;
}

/**
 * Log priority analysis for debugging
 *
 * @param task Task to analyze
 * @param allTasks All tasks for context
 */
export function logPriorityAnalysis(task: Task, allTasks: Task[]): void {
  const score = calculatePriorityScore(task, allTasks);

  logger.debug(`Priority Analysis: ${task.title} (${task.id})`, {
    staticPriority: task.priority,
    basePriority: score.basePriority,
    components: {
      deadlinePressure: score.deadlinePressure,
      agingBonus: score.agingBonus,
      dependencyDepth: score.dependencyDepth,
    },
    totalScore: score.totalScore,
    factors: score.factors,
  });
}
