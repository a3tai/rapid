/**
 * Load Balancer for Task Distribution
 *
 * MCP tools for distributing tasks across workers efficiently.
 * Supports round-robin, capability matching, and affinity-based assignment.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../server.js';

import { createLogger } from '../utils/logger.js';

const logger = createLogger('load_balancer');
// Worker load state
interface WorkerState {
  agentId: string;
  name: string;
  worktree?: string;
  capabilities: string[];
  currentTasks: number;
  maxTasks: number;
  lastAssignedAt?: string;
  totalCompleted: number;
  avgCompletionTimeMs: number;
  healthy: boolean;
}

// In-memory worker registry
const workers = new Map<string, WorkerState>();

// Round-robin index
let roundRobinIndex = 0;

/**
 * Get available workers (healthy with capacity)
 */
function getAvailableWorkers(): WorkerState[] {
  return Array.from(workers.values()).filter((w) => w.healthy && w.currentTasks < w.maxTasks);
}

/**
 * Filter workers by capabilities
 */
function filterByCapabilities(available: WorkerState[], required: string[]): WorkerState[] {
  if (required.length === 0) return available;
  return available.filter((w) => required.every((cap) => w.capabilities.includes(cap)));
}

/**
 * Score workers for task affinity
 * Higher score = better match
 */
function scoreWorker(
  worker: WorkerState,
  taskWorktree?: string,
  preferredCapabilities?: string[]
): number {
  let score = 0;

  // Base score: inverse of current load (0-100)
  const loadRatio = worker.currentTasks / worker.maxTasks;
  score += Math.round((1 - loadRatio) * 100);

  // Affinity: Same worktree bonus (+50)
  if (taskWorktree && worker.worktree === taskWorktree) {
    score += 50;
  }

  // Capability match bonus (+10 per matching preferred capability)
  if (preferredCapabilities) {
    for (const cap of preferredCapabilities) {
      if (worker.capabilities.includes(cap)) {
        score += 10;
      }
    }
  }

  // Performance bonus: faster workers get higher score (+0-30)
  if (worker.avgCompletionTimeMs > 0 && worker.totalCompleted > 0) {
    // Assume 5min is baseline, faster gets bonus
    const baselineMs = 5 * 60 * 1000;
    const speedRatio = Math.min(1, baselineMs / worker.avgCompletionTimeMs);
    score += Math.round(speedRatio * 30);
  }

  // Experience bonus: workers with more completions get slight bonus (+0-20)
  score += Math.min(20, worker.totalCompleted);

  return score;
}

/**
 * Select best worker using scoring
 */
function selectBestWorker(
  available: WorkerState[],
  taskWorktree?: string,
  preferredCapabilities?: string[]
): WorkerState | null {
  if (available.length === 0) return null;

  // Score all workers
  const scored = available.map((w) => ({
    worker: w,
    score: scoreWorker(w, taskWorktree, preferredCapabilities),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const selected = scored[0];
  return selected ? selected.worker : null;
}

/**
 * Select worker using round-robin
 */
function selectRoundRobin(available: WorkerState[]): WorkerState | null {
  if (available.length === 0) return null;

  roundRobinIndex = roundRobinIndex % available.length;
  const selected = available[roundRobinIndex];
  roundRobinIndex = (roundRobinIndex + 1) % available.length;

  return selected ?? null;
}

/**
 * Register load balancer tools with the MCP server
 */
export function registerLoadBalancerTools(server: McpServer, context: ServerContext): void {
  // Tool: Register a worker
  server.registerTool(
    'lb_register_worker',
    {
      title: 'Register Worker',
      description: 'Register a worker agent with the load balancer.',
      inputSchema: {
        agentId: z.string().describe('Worker agent ID'),
        name: z.string().describe('Worker name'),
        worktree: z.string().optional().describe('Current worktree'),
        capabilities: z.array(z.string()).default([]).describe('Worker capabilities'),
        maxTasks: z.number().default(3).describe('Max concurrent tasks'),
      },
      outputSchema: {
        registered: z.boolean(),
        workerCount: z.number(),
      },
    },
    async (args) => {
      const {
        agentId,
        name,
        worktree,
        capabilities = [],
        maxTasks = 3,
      } = args as {
        agentId: string;
        name: string;
        worktree?: string;
        capabilities?: string[];
        maxTasks?: number;
      };

      const worker: WorkerState = {
        agentId,
        name,
        ...(worktree && { worktree }),
        capabilities,
        currentTasks: 0,
        maxTasks,
        totalCompleted: 0,
        avgCompletionTimeMs: 0,
        healthy: true,
      };
      workers.set(agentId, worker);

      if (context.verbose) {
        logger.error(
          `[lb_register_worker] Registered ${name} (${agentId}) with capabilities: ${capabilities.join(', ')}`
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              registered: true,
              workerCount: workers.size,
            }),
          },
        ],
        structuredContent: { registered: true, workerCount: workers.size },
      };
    }
  );

  // Tool: Unregister a worker
  server.registerTool(
    'lb_unregister_worker',
    {
      title: 'Unregister Worker',
      description: 'Remove a worker from the load balancer.',
      inputSchema: {
        agentId: z.string().describe('Worker agent ID to remove'),
      },
      outputSchema: {
        removed: z.boolean(),
        workerCount: z.number(),
      },
    },
    async (args) => {
      const { agentId } = args as { agentId: string };

      const removed = workers.delete(agentId);

      if (context.verbose) {
        logger.error(`[lb_unregister_worker] ${removed ? 'Removed' : 'Not found'}: ${agentId}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ removed, workerCount: workers.size }),
          },
        ],
        structuredContent: { removed, workerCount: workers.size },
      };
    }
  );

  // Tool: Select a worker for a task
  server.registerTool(
    'lb_select_worker',
    {
      title: 'Select Worker',
      description: 'Select the best available worker for a task based on load and capabilities.',
      inputSchema: {
        requiredCapabilities: z
          .array(z.string())
          .default([])
          .describe('Required capabilities for the task'),
        preferredCapabilities: z
          .array(z.string())
          .optional()
          .describe('Preferred capabilities (used for scoring)'),
        taskWorktree: z.string().optional().describe('Task worktree for affinity matching'),
        strategy: z
          .enum(['best', 'round-robin', 'least-loaded'])
          .default('best')
          .describe('Selection strategy'),
      },
      outputSchema: {
        worker: z
          .object({
            agentId: z.string(),
            name: z.string(),
            worktree: z.string().optional(),
            currentTasks: z.number(),
            score: z.number().optional(),
          })
          .nullable(),
        availableCount: z.number(),
        reason: z.string().optional(),
      },
    },
    async (args) => {
      const {
        requiredCapabilities = [],
        preferredCapabilities,
        taskWorktree,
        strategy = 'best',
      } = args as {
        requiredCapabilities?: string[];
        preferredCapabilities?: string[];
        taskWorktree?: string;
        strategy?: 'best' | 'round-robin' | 'least-loaded';
      };

      // Get available workers
      const available = getAvailableWorkers();

      if (available.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                worker: null,
                availableCount: 0,
                reason: 'No healthy workers with capacity',
              }),
            },
          ],
          structuredContent: {
            worker: null,
            availableCount: 0,
            reason: 'No healthy workers with capacity',
          },
        };
      }

      // Filter by required capabilities
      const qualified = filterByCapabilities(available, requiredCapabilities);

      if (qualified.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                worker: null,
                availableCount: available.length,
                reason: `No workers with capabilities: ${requiredCapabilities.join(', ')}`,
              }),
            },
          ],
          structuredContent: {
            worker: null,
            availableCount: available.length,
            reason: `No workers with capabilities: ${requiredCapabilities.join(', ')}`,
          },
        };
      }

      // Select based on strategy
      let selected: WorkerState | null = null;

      switch (strategy) {
        case 'round-robin':
          selected = selectRoundRobin(qualified);
          break;
        case 'least-loaded': {
          const sorted = [...qualified].sort((a, b) => a.currentTasks - b.currentTasks);
          selected = sorted[0] ?? null;
          break;
        }
        case 'best':
        default:
          selected = selectBestWorker(qualified, taskWorktree, preferredCapabilities);
      }

      if (!selected) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                worker: null,
                availableCount: qualified.length,
                reason: 'Selection failed',
              }),
            },
          ],
          structuredContent: {
            worker: null,
            availableCount: qualified.length,
            reason: 'Selection failed',
          },
        };
      }

      const score =
        strategy === 'best'
          ? scoreWorker(selected, taskWorktree, preferredCapabilities)
          : undefined;

      if (context.verbose) {
        logger.error(
          `[lb_select_worker] Selected ${selected.name} (${selected.agentId})${score !== undefined ? ` score=${score}` : ''}`
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              worker: {
                agentId: selected.agentId,
                name: selected.name,
                worktree: selected.worktree,
                currentTasks: selected.currentTasks,
                score,
              },
              availableCount: qualified.length,
            }),
          },
        ],
        structuredContent: {
          worker: {
            agentId: selected.agentId,
            name: selected.name,
            worktree: selected.worktree,
            currentTasks: selected.currentTasks,
            score,
          },
          availableCount: qualified.length,
        },
      };
    }
  );

  // Tool: Update worker task count
  server.registerTool(
    'lb_update_load',
    {
      title: 'Update Worker Load',
      description: 'Update the current task count for a worker.',
      inputSchema: {
        agentId: z.string().describe('Worker agent ID'),
        delta: z.number().describe('Change in task count (+1 or -1)'),
        completionTimeMs: z
          .number()
          .optional()
          .describe('Completion time if task finished (for averaging)'),
      },
      outputSchema: {
        updated: z.boolean(),
        currentTasks: z.number(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { agentId, delta, completionTimeMs } = args as {
        agentId: string;
        delta: number;
        completionTimeMs?: number;
      };

      const worker = workers.get(agentId);
      if (!worker) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                updated: false,
                currentTasks: 0,
                error: 'Worker not found',
              }),
            },
          ],
          structuredContent: {
            updated: false,
            currentTasks: 0,
            error: 'Worker not found',
          },
        };
      }

      worker.currentTasks = Math.max(0, worker.currentTasks + delta);

      // Track completion stats
      if (delta < 0 && completionTimeMs !== undefined) {
        worker.totalCompleted++;
        // Running average
        worker.avgCompletionTimeMs =
          (worker.avgCompletionTimeMs * (worker.totalCompleted - 1) + completionTimeMs) /
          worker.totalCompleted;
      }

      if (delta > 0) {
        worker.lastAssignedAt = new Date().toISOString();
      }

      if (context.verbose) {
        logger.error(`[lb_update_load] ${worker.name}: ${worker.currentTasks} tasks`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              updated: true,
              currentTasks: worker.currentTasks,
            }),
          },
        ],
        structuredContent: { updated: true, currentTasks: worker.currentTasks },
      };
    }
  );

  // Tool: Set worker health status
  server.registerTool(
    'lb_set_health',
    {
      title: 'Set Worker Health',
      description: 'Mark a worker as healthy or unhealthy.',
      inputSchema: {
        agentId: z.string().describe('Worker agent ID'),
        healthy: z.boolean().describe('Health status'),
      },
      outputSchema: {
        updated: z.boolean(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { agentId, healthy } = args as { agentId: string; healthy: boolean };

      const worker = workers.get(agentId);
      if (!worker) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ updated: false, error: 'Worker not found' }),
            },
          ],
          structuredContent: { updated: false, error: 'Worker not found' },
        };
      }

      worker.healthy = healthy;

      if (context.verbose) {
        logger.error(`[lb_set_health] ${worker.name}: ${healthy ? 'healthy' : 'unhealthy'}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ updated: true }) }],
        structuredContent: { updated: true },
      };
    }
  );

  // Tool: Get load balancer status
  server.registerTool(
    'lb_status',
    {
      title: 'Load Balancer Status',
      description: 'Get current load balancer status and worker stats.',
      inputSchema: {
        includeWorkerDetails: z
          .boolean()
          .default(true)
          .describe('Include individual worker details'),
      },
      outputSchema: {
        totalWorkers: z.number(),
        healthyWorkers: z.number(),
        totalCapacity: z.number(),
        currentLoad: z.number(),
        utilizationPercent: z.number(),
        workers: z
          .array(
            z.object({
              agentId: z.string(),
              name: z.string(),
              healthy: z.boolean(),
              currentTasks: z.number(),
              maxTasks: z.number(),
              totalCompleted: z.number(),
            })
          )
          .optional(),
      },
    },
    async (args) => {
      const { includeWorkerDetails = true } = args as {
        includeWorkerDetails?: boolean;
      };

      const allWorkers = Array.from(workers.values());
      const healthy = allWorkers.filter((w) => w.healthy);
      const totalCapacity = healthy.reduce((sum, w) => sum + w.maxTasks, 0);
      const currentLoad = allWorkers.reduce((sum, w) => sum + w.currentTasks, 0);
      const utilization = totalCapacity > 0 ? (currentLoad / totalCapacity) * 100 : 0;

      const output: {
        totalWorkers: number;
        healthyWorkers: number;
        totalCapacity: number;
        currentLoad: number;
        utilizationPercent: number;
        workers?: Array<{
          agentId: string;
          name: string;
          healthy: boolean;
          currentTasks: number;
          maxTasks: number;
          totalCompleted: number;
        }>;
      } = {
        totalWorkers: allWorkers.length,
        healthyWorkers: healthy.length,
        totalCapacity,
        currentLoad,
        utilizationPercent: Math.round(utilization * 10) / 10,
      };

      if (includeWorkerDetails) {
        output.workers = allWorkers.map((w) => ({
          agentId: w.agentId,
          name: w.name,
          healthy: w.healthy,
          currentTasks: w.currentTasks,
          maxTasks: w.maxTasks,
          totalCompleted: w.totalCompleted,
        }));
      }

      if (context.verbose) {
        logger.error(
          `[lb_status] ${healthy.length}/${allWorkers.length} workers, ${utilization.toFixed(1)}% utilized`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Rebalance overloaded workers
  server.registerTool(
    'lb_rebalance',
    {
      title: 'Rebalance Workers',
      description: 'Identify overloaded workers and suggest task reassignments.',
      inputSchema: {
        overloadThreshold: z
          .number()
          .default(0.9)
          .describe('Utilization threshold (0-1) considered overloaded'),
      },
      outputSchema: {
        overloadedWorkers: z.array(
          z.object({
            agentId: z.string(),
            name: z.string(),
            utilization: z.number(),
            excessTasks: z.number(),
          })
        ),
        underutilizedWorkers: z.array(
          z.object({
            agentId: z.string(),
            name: z.string(),
            availableCapacity: z.number(),
          })
        ),
        suggestedMoves: z.number(),
      },
    },
    async (args) => {
      const { overloadThreshold = 0.9 } = args as { overloadThreshold?: number };

      const allWorkers = Array.from(workers.values()).filter((w) => w.healthy);

      const overloaded = allWorkers
        .filter((w) => w.currentTasks / w.maxTasks > overloadThreshold)
        .map((w) => ({
          agentId: w.agentId,
          name: w.name,
          utilization: w.currentTasks / w.maxTasks,
          excessTasks: w.currentTasks - Math.floor(w.maxTasks * overloadThreshold),
        }));

      const underutilized = allWorkers
        .filter((w) => w.currentTasks / w.maxTasks < 0.5)
        .map((w) => ({
          agentId: w.agentId,
          name: w.name,
          availableCapacity: w.maxTasks - w.currentTasks,
        }));

      // Calculate possible moves
      const totalExcess = overloaded.reduce((sum, w) => sum + w.excessTasks, 0);
      const totalAvailable = underutilized.reduce((sum, w) => sum + w.availableCapacity, 0);
      const suggestedMoves = Math.min(totalExcess, totalAvailable);

      const output = {
        overloadedWorkers: overloaded,
        underutilizedWorkers: underutilized,
        suggestedMoves,
      };

      if (context.verbose) {
        logger.error(
          `[lb_rebalance] ${overloaded.length} overloaded, ${underutilized.length} available, ${suggestedMoves} moves suggested`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
