/**
 * Task Dependency Resolution Engine
 *
 * Provides dependency tracking and resolution for task workflows.
 * Features:
 * - Dependency graph building
 * - Topological sorting for execution order
 * - Circular dependency detection
 * - Auto-triggering dependent tasks on completion
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerContext } from '../server.js';

// Task interface (matching tasks.ts)
interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  dependencies?: string[];
  [key: string]: unknown;
}

/**
 * Build a dependency graph from tasks
 */
function buildDependencyGraph(tasks: Task[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const task of tasks) {
    if (!graph.has(task.id)) {
      graph.set(task.id, new Set());
    }

    if (task.dependencies) {
      for (const dep of task.dependencies) {
        graph.get(task.id)!.add(dep);
      }
    }
  }

  return graph;
}

/**
 * Detect circular dependencies using DFS
 * Returns the cycle path if found, null otherwise
 */
function detectCircularDependency(
  graph: Map<string, Set<string>>,
  taskId: string
): string[] | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): string[] | null {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      } else if (recursionStack.has(neighbor)) {
        // Found cycle - return path from neighbor to current node
        const cycleStart = path.indexOf(neighbor);
        return [...path.slice(cycleStart), neighbor];
      }
    }

    path.pop();
    recursionStack.delete(node);
    return null;
  }

  return dfs(taskId);
}

/**
 * Topological sort using Kahn's algorithm
 * Returns tasks in execution order (dependencies first)
 */
function topologicalSort(tasks: Task[]): { sorted: Task[]; hasCycle: boolean } {
  const graph = buildDependencyGraph(tasks);
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Calculate in-degrees
  const inDegree = new Map<string, number>();
  for (const task of tasks) {
    inDegree.set(task.id, 0);
  }
  for (const [, deps] of graph) {
    for (const dep of deps) {
      if (inDegree.has(dep)) {
        // dep is depended on by this task, so the task has +1 in-degree
      }
    }
  }

  // Actually we need reverse logic - in-degree = how many tasks depend on me
  // For topological sort, we want tasks with no unmet dependencies first
  const dependencyCount = new Map<string, number>();
  for (const task of tasks) {
    const deps = graph.get(task.id) || new Set();
    dependencyCount.set(task.id, deps.size);
  }

  // Start with tasks that have no dependencies
  const queue: string[] = [];
  for (const [id, count] of dependencyCount) {
    if (count === 0) {
      queue.push(id);
    }
  }

  const sorted: Task[] = [];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    processed.add(current);

    const task = taskMap.get(current);
    if (task) {
      sorted.push(task);
    }

    // Find tasks that depend on this one
    for (const [id, deps] of graph) {
      if (deps.has(current) && !processed.has(id)) {
        // Remove this dependency
        const remaining = dependencyCount.get(id)! - 1;
        dependencyCount.set(id, remaining);
        if (remaining === 0) {
          queue.push(id);
        }
      }
    }
  }

  // Check if all tasks were processed (no cycle)
  const hasCycle = sorted.length !== tasks.length;

  return { sorted, hasCycle };
}

/**
 * Get tasks that are ready to execute (all dependencies met)
 */
function getReadyTasks(tasks: Task[]): Task[] {
  const completedIds = new Set(tasks.filter((t) => t.status === 'completed').map((t) => t.id));

  return tasks.filter((task) => {
    // Must be pending
    if (task.status !== 'pending') return false;

    // Check all dependencies are completed
    if (task.dependencies) {
      for (const depId of task.dependencies) {
        if (!completedIds.has(depId)) {
          return false;
        }
      }
    }

    return true;
  });
}

/**
 * Auto-detect implicit dependencies from task descriptions
 * Looks for keywords and cross-references to other tasks
 */
function autoDetectDependencies(
  taskId: string,
  description: string | undefined,
  allTasks: Task[]
): string[] {
  if (!description) return [];

  const detectedDeps = new Set<string>();
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));

  // Keywords that indicate dependencies
  const dependencyKeywords = [
    'after',
    'before',
    'depends on',
    'blocked by',
    'requires',
    'needs',
    'wait for',
    'following',
    'once',
  ];

  const descLower = description.toLowerCase();

  // Check for explicit task references (task IDs or titles)
  for (const otherTask of allTasks) {
    if (otherTask.id === taskId) continue;

    // Check if description mentions the task ID
    if (description.includes(otherTask.id)) {
      // Check if mentioned in dependency context
      for (const keyword of dependencyKeywords) {
        const regex = new RegExp(`${keyword}[^.]*${otherTask.id.substring(0, 8)}`, 'i');
        if (regex.test(description)) {
          detectedDeps.add(otherTask.id);
          break;
        }
      }
    }

    // Check if description mentions the task title
    if (
      otherTask.title &&
      description.includes(otherTask.title) &&
      otherTask.title.length > 3
    ) {
      for (const keyword of dependencyKeywords) {
        const regex = new RegExp(
          `${keyword}[^.]*${otherTask.title.substring(0, Math.min(10, otherTask.title.length))}`,
          'i'
        );
        if (regex.test(description)) {
          detectedDeps.add(otherTask.id);
          break;
        }
      }
    }
  }

  // Pattern-based detection: check for common phrases
  // "fix ... bug in ..." could depend on issue/bug tasks
  const fixMatch = descLower.match(/fix.+(?:bug|issue|error).+in\s+(\w+)/i);
  if (fixMatch) {
    for (const task of allTasks) {
      if (task.id === taskId) continue;
      const titleLower = (task.title || '').toLowerCase();
      if (titleLower.includes('bug') || titleLower.includes('issue')) {
        detectedDeps.add(task.id);
      }
    }
  }

  // Remove any self-references
  detectedDeps.delete(taskId);

  return Array.from(detectedDeps);
}

/**
 * Get tasks that are blocked (have unmet dependencies)
 */
function getBlockedTasks(tasks: Task[]): Array<{ task: Task; unmetDependencies: string[] }> {
  const completedIds = new Set(tasks.filter((t) => t.status === 'completed').map((t) => t.id));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const blocked: Array<{ task: Task; unmetDependencies: string[] }> = [];

  for (const task of tasks) {
    if (task.status !== 'pending' && task.status !== 'blocked') continue;

    if (task.dependencies && task.dependencies.length > 0) {
      const unmet = task.dependencies.filter((d) => !completedIds.has(d));
      if (unmet.length > 0) {
        blocked.push({
          task,
          unmetDependencies: unmet.map((id) => {
            const dep = taskMap.get(id);
            return dep ? `${dep.title} (${id})` : id;
          }),
        });
      }
    }
  }

  return blocked;
}

/**
 * Register dependency resolution tools with the MCP server
 */
export function registerDependencyTools(server: McpServer, context: ServerContext): void {
  const tasksFilePath = join(context.projectDir, '.rapid', 'tasks.json');

  /**
   * Load tasks from disk
   */
  async function loadTasks(): Promise<Task[]> {
    try {
      const content = await readFile(tasksFilePath, 'utf-8');
      return JSON.parse(content) as Task[];
    } catch {
      return [];
    }
  }

  /**
   * Save tasks to disk
   */
  async function saveTasks(tasks: Task[]): Promise<void> {
    await writeFile(tasksFilePath, JSON.stringify(tasks, null, 2), 'utf-8');
  }

  // Tool: Validate dependencies
  server.registerTool(
    'task_validate_dependencies',
    {
      title: 'Validate Task Dependencies',
      description:
        'Check task dependencies for issues like circular dependencies, ' +
        'missing dependencies, or invalid references. Run this before starting a workflow.',
      inputSchema: {
        taskIds: z
          .array(z.string())
          .optional()
          .describe('Specific task IDs to validate (default: all tasks)'),
      },
      outputSchema: {
        valid: z.boolean(),
        issues: z.array(
          z.object({
            taskId: z.string(),
            taskTitle: z.string(),
            issue: z.string(),
            severity: z.enum(['error', 'warning']),
          })
        ),
        graph: z.object({
          nodes: z.number(),
          edges: z.number(),
        }),
      },
    },
    async (args) => {
      const { taskIds } = args as { taskIds?: string[] };

      const allTasks = await loadTasks();
      const tasks = taskIds ? allTasks.filter((t) => taskIds.includes(t.id)) : allTasks;

      const taskMap = new Map(allTasks.map((t) => [t.id, t]));
      const graph = buildDependencyGraph(tasks);

      const issues: Array<{
        taskId: string;
        taskTitle: string;
        issue: string;
        severity: 'error' | 'warning';
      }> = [];

      // Check each task
      for (const task of tasks) {
        // Check for circular dependencies
        const cycle = detectCircularDependency(graph, task.id);
        if (cycle) {
          issues.push({
            taskId: task.id,
            taskTitle: task.title,
            issue: `Circular dependency detected: ${cycle.join(' → ')}`,
            severity: 'error',
          });
        }

        // Check for missing dependencies
        if (task.dependencies) {
          for (const depId of task.dependencies) {
            if (!taskMap.has(depId)) {
              issues.push({
                taskId: task.id,
                taskTitle: task.title,
                issue: `Missing dependency: ${depId}`,
                severity: 'error',
              });
            }
          }
        }

        // Check for self-dependency
        if (task.dependencies?.includes(task.id)) {
          issues.push({
            taskId: task.id,
            taskTitle: task.title,
            issue: 'Task depends on itself',
            severity: 'error',
          });
        }
      }

      // Count edges
      let edgeCount = 0;
      for (const deps of graph.values()) {
        edgeCount += deps.size;
      }

      const output = {
        valid: issues.filter((i) => i.severity === 'error').length === 0,
        issues,
        graph: {
          nodes: graph.size,
          edges: edgeCount,
        },
      };

      if (context.verbose) {
        console.error(
          `[task_validate_dependencies] Validated ${tasks.length} tasks, ${issues.length} issues found`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Get execution order
  server.registerTool(
    'task_execution_order',
    {
      title: 'Get Task Execution Order',
      description:
        'Get the optimal execution order for tasks based on dependencies. ' +
        'Uses topological sorting to ensure dependencies are completed first.',
      inputSchema: {
        taskIds: z
          .array(z.string())
          .optional()
          .describe('Specific task IDs to order (default: all pending tasks)'),
        includeCompleted: z
          .boolean()
          .default(false)
          .describe('Include completed tasks in the order'),
      },
      outputSchema: {
        order: z.array(
          z.object({
            position: z.number(),
            taskId: z.string(),
            title: z.string(),
            status: z.string(),
            dependsOn: z.array(z.string()),
          })
        ),
        hasCycle: z.boolean(),
        readyToExecute: z.array(z.string()).describe('Task IDs ready to start now'),
      },
    },
    async (args) => {
      const { taskIds, includeCompleted } = args as {
        taskIds?: string[];
        includeCompleted?: boolean;
      };

      let tasks = await loadTasks();

      // Filter by IDs if provided
      if (taskIds) {
        tasks = tasks.filter((t) => taskIds.includes(t.id));
      }

      // Filter out completed if not requested
      if (!includeCompleted) {
        tasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
      }

      const { sorted, hasCycle } = topologicalSort(tasks);
      const ready = getReadyTasks(tasks);

      const order = sorted.map((task, index) => ({
        position: index + 1,
        taskId: task.id,
        title: task.title,
        status: task.status,
        dependsOn: task.dependencies || [],
      }));

      const output = {
        order,
        hasCycle,
        readyToExecute: ready.map((t) => t.id),
      };

      if (context.verbose) {
        console.error(
          `[task_execution_order] Ordered ${sorted.length} tasks, ${ready.length} ready`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Get ready tasks
  server.registerTool(
    'task_get_ready',
    {
      title: 'Get Ready Tasks',
      description:
        'Get tasks that are ready to execute (all dependencies completed). ' +
        'Use this to find work that can be claimed immediately.',
      inputSchema: {
        tags: z.array(z.string()).optional().describe('Filter by tags'),
        priority: z
          .enum(['low', 'normal', 'high', 'urgent'])
          .optional()
          .describe('Filter by minimum priority'),
      },
      outputSchema: {
        ready: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            priority: z.string(),
            tags: z.array(z.string()).optional(),
          })
        ),
        blocked: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            waitingFor: z.array(z.string()),
          })
        ),
        summary: z.object({
          readyCount: z.number(),
          blockedCount: z.number(),
          totalPending: z.number(),
        }),
      },
    },
    async (args) => {
      const { tags, priority } = args as {
        tags?: string[];
        priority?: string;
      };

      const tasks = await loadTasks();
      let ready = getReadyTasks(tasks);
      const blocked = getBlockedTasks(tasks);

      // Filter by tags
      if (tags && tags.length > 0) {
        ready = ready.filter(
          (t) => t.tags && tags.some((tag) => (t.tags as string[]).includes(tag))
        );
      }

      // Filter by priority
      if (priority) {
        const priorityOrder = ['low', 'normal', 'high', 'urgent'];
        const minIndex = priorityOrder.indexOf(priority);
        ready = ready.filter((t) => {
          const taskPriority = (t.priority as string) || 'normal';
          return priorityOrder.indexOf(taskPriority) >= minIndex;
        });
      }

      const output = {
        ready: ready.map((t) => ({
          id: t.id,
          title: t.title,
          priority: (t.priority as string) || 'normal',
          tags: t.tags as string[] | undefined,
        })),
        blocked: blocked.map((b) => ({
          id: b.task.id,
          title: b.task.title,
          waitingFor: b.unmetDependencies,
        })),
        summary: {
          readyCount: ready.length,
          blockedCount: blocked.length,
          totalPending: tasks.filter((t) => t.status === 'pending').length,
        },
      };

      if (context.verbose) {
        console.error(`[task_get_ready] Found ${ready.length} ready, ${blocked.length} blocked`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Add dependency
  server.registerTool(
    'task_add_dependency',
    {
      title: 'Add Task Dependency',
      description:
        'Add a dependency between tasks. The dependent task will not be claimable ' +
        'until the dependency is completed.',
      inputSchema: {
        taskId: z.string().describe('Task that depends on another'),
        dependsOn: z.string().describe('Task ID that must complete first'),
        validateCircular: z
          .boolean()
          .default(true)
          .describe('Check for circular dependencies before adding'),
      },
      outputSchema: {
        success: z.boolean(),
        taskId: z.string(),
        dependencies: z.array(z.string()),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { taskId, dependsOn, validateCircular } = args as {
        taskId: string;
        dependsOn: string;
        validateCircular?: boolean;
      };

      const tasks = await loadTasks();
      const taskIndex = tasks.findIndex((t) => t.id === taskId);

      if (taskIndex === -1) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: false, taskId, dependencies: [], error: 'Task not found' },
                null,
                2
              ),
            },
          ],
        };
      }

      // Check dependency exists
      if (!tasks.find((t) => t.id === dependsOn)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: false, taskId, dependencies: [], error: 'Dependency task not found' },
                null,
                2
              ),
            },
          ],
        };
      }

      const task = tasks[taskIndex]!;

      // Check for circular dependency
      if (validateCircular !== false) {
        const testTask: Task = {
          ...task,
          dependencies: [...(task.dependencies || []), dependsOn],
        };
        const testTasks: Task[] = [
          ...tasks.slice(0, taskIndex),
          testTask,
          ...tasks.slice(taskIndex + 1),
        ];
        const graph = buildDependencyGraph(testTasks);
        const cycle = detectCircularDependency(graph, taskId);

        if (cycle) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    taskId,
                    dependencies: task.dependencies || [],
                    error: `Would create circular dependency: ${cycle.join(' → ')}`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
      }

      // Add dependency
      if (!task.dependencies) {
        task.dependencies = [];
      }
      if (!task.dependencies.includes(dependsOn)) {
        task.dependencies.push(dependsOn);
        task.updatedAt = new Date().toISOString();
        await saveTasks(tasks);
      }

      const output = {
        success: true,
        taskId,
        dependencies: task.dependencies!,
      };

      if (context.verbose) {
        console.error(`[task_add_dependency] Added dependency: ${taskId} → ${dependsOn}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Remove dependency
  server.registerTool(
    'task_remove_dependency',
    {
      title: 'Remove Task Dependency',
      description: 'Remove a dependency from a task.',
      inputSchema: {
        taskId: z.string().describe('Task to remove dependency from'),
        dependsOn: z.string().describe('Dependency task ID to remove'),
      },
      outputSchema: {
        success: z.boolean(),
        taskId: z.string(),
        dependencies: z.array(z.string()),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { taskId, dependsOn } = args as { taskId: string; dependsOn: string };

      const tasks = await loadTasks();
      const taskIndex = tasks.findIndex((t) => t.id === taskId);

      if (taskIndex === -1) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: false, taskId, dependencies: [], error: 'Task not found' },
                null,
                2
              ),
            },
          ],
        };
      }

      const task = tasks[taskIndex]!;

      if (task.dependencies) {
        const index = task.dependencies.indexOf(dependsOn);
        if (index > -1) {
          task.dependencies.splice(index, 1);
          task.updatedAt = new Date().toISOString();
          await saveTasks(tasks);
        }
      }

      const output = {
        success: true,
        taskId,
        dependencies: task.dependencies || [],
      };

      if (context.verbose) {
        console.error(`[task_remove_dependency] Removed dependency: ${taskId} → ${dependsOn}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Auto-unblock dependent tasks
  server.registerTool(
    'task_check_unblock',
    {
      title: 'Check and Unblock Tasks',
      description:
        'Check if any blocked tasks can be unblocked now that dependencies are complete. ' +
        'Call this after completing a task to trigger dependent work.',
      inputSchema: {
        completedTaskId: z.string().describe('ID of the task that was just completed'),
        notifyReady: z.boolean().default(true).describe('Return list of tasks now ready to claim'),
      },
      outputSchema: {
        unblocked: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            nowReady: z.boolean(),
          })
        ),
        stillBlocked: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            remainingDeps: z.array(z.string()),
          })
        ),
      },
    },
    async (args) => {
      const { completedTaskId, notifyReady: _notifyReady } = args as {
        completedTaskId: string;
        notifyReady?: boolean;
      };

      const tasks = await loadTasks();
      const completedTask = tasks.find((t) => t.id === completedTaskId);

      if (!completedTask) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ unblocked: [], stillBlocked: [] }, null, 2),
            },
          ],
        };
      }

      const completedIds = new Set(tasks.filter((t) => t.status === 'completed').map((t) => t.id));

      // Find tasks that depended on the completed task
      const dependents = tasks.filter(
        (t) => t.dependencies?.includes(completedTaskId) && t.status !== 'completed'
      );

      const unblocked: Array<{ id: string; title: string; nowReady: boolean }> = [];
      const stillBlocked: Array<{ id: string; title: string; remainingDeps: string[] }> = [];

      for (const task of dependents) {
        const remainingDeps = (task.dependencies || []).filter((d) => !completedIds.has(d));

        if (remainingDeps.length === 0) {
          unblocked.push({
            id: task.id,
            title: task.title,
            nowReady: task.status === 'pending',
          });
        } else {
          stillBlocked.push({
            id: task.id,
            title: task.title,
            remainingDeps,
          });
        }
      }

      const output = {
        unblocked,
        stillBlocked,
      };

      if (context.verbose) {
        console.error(
          `[task_check_unblock] Completion of ${completedTaskId} unblocked ${unblocked.length} tasks`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Auto-detect implicit dependencies
  server.registerTool(
    'task_detect_dependencies',
    {
      title: 'Detect Implicit Dependencies',
      description:
        'Auto-detect implicit dependencies from a task description. ' +
        'Scans for keywords and cross-references to suggest which other tasks this task may depend on.',
      inputSchema: {
        taskId: z.string().describe('Task ID to analyze'),
        autoApply: z
          .boolean()
          .default(false)
          .describe('Automatically apply detected dependencies to the task'),
      },
      outputSchema: {
        taskId: z.string(),
        detectedDependencies: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            status: z.string(),
          })
        ),
        confidence: z.enum(['high', 'medium', 'low']),
        message: z.string(),
        applied: z.boolean().optional(),
      },
    },
    async (args) => {
      const { taskId, autoApply } = args as {
        taskId: string;
        autoApply?: boolean;
      };

      const tasks = await loadTasks();
      const task = tasks.find((t) => t.id === taskId);

      if (!task) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  taskId,
                  detectedDependencies: [],
                  confidence: 'low',
                  message: 'Task not found',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const detectedIds = autoDetectDependencies(taskId, task.description, tasks);
      const detected = detectedIds
        .map((id) => tasks.find((t) => t.id === id))
        .filter((t): t is Task => t !== undefined)
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
        }));

      // Estimate confidence based on number and clarity of matches
      let confidence: 'high' | 'medium' | 'low' = 'low';
      if (detectedIds.length >= 2) {
        confidence = 'high';
      } else if (detectedIds.length === 1) {
        confidence = 'medium';
      }

      let applied = false;
      if (autoApply && detectedIds.length > 0) {
        // Apply detected dependencies
        if (!task.dependencies) {
          task.dependencies = [];
        }
        for (const depId of detectedIds) {
          if (!task.dependencies.includes(depId)) {
            task.dependencies.push(depId);
          }
        }
        task.updatedAt = new Date().toISOString();
        await saveTasks(tasks);
        applied = true;
      }

      const output = {
        taskId,
        detectedDependencies: detected,
        confidence,
        message:
          detected.length > 0
            ? `Detected ${detected.length} implicit dependencies (${confidence} confidence)`
            : 'No implicit dependencies detected',
        ...(applied && { applied }),
      };

      if (context.verbose) {
        console.error(
          `[task_detect_dependencies] Found ${detected.length} dependencies for task ${taskId}`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
