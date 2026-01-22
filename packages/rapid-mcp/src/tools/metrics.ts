/**
 * Task Metrics Collection and Reporting
 *
 * MCP tools for collecting, aggregating, and reporting metrics
 * about task coordination system performance.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

// Metric event types
type MetricEventType =
  | 'task_created'
  | 'task_claimed'
  | 'task_claim_failed'
  | 'task_progress'
  | 'task_completed'
  | 'task_failed'
  | 'task_timeout';

// Individual metric event
interface MetricEvent {
  timestamp: string;
  type: MetricEventType;
  taskId: string;
  agentId?: string;
  durationMs?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// Aggregated metrics
interface AggregatedMetrics {
  // Task counts
  tasksCreated: number;
  tasksClaimed: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksTimedOut: number;
  claimFailures: number;

  // Timing stats
  avgCompletionTimeMs: number;
  p50CompletionTimeMs: number;
  p95CompletionTimeMs: number;
  avgClaimTimeMs: number;

  // Rates
  claimSuccessRate: number;
  completionRate: number;
  timeoutRate: number;

  // By-agent breakdown
  byAgent: Record<
    string,
    {
      claimed: number;
      completed: number;
      failed: number;
      avgCompletionTimeMs: number;
    }
  >;

  // By-tag breakdown
  byTag: Record<
    string,
    {
      created: number;
      completed: number;
      avgCompletionTimeMs: number;
    }
  >;

  // Time range
  periodStart: string;
  periodEnd: string;
  eventCount: number;
}

// In-memory metrics store
const events: MetricEvent[] = [];
let metricsFilePath: string;

/**
 * Load metrics from disk
 */
async function loadMetrics(projectDir: string): Promise<void> {
  metricsFilePath = join(projectDir, '.rapid', 'metrics.json');
  try {
    const content = await readFile(metricsFilePath, 'utf-8');
    const loaded = JSON.parse(content) as MetricEvent[];
    events.push(...loaded);
  } catch {
    // File doesn't exist yet
  }
}

/**
 * Save metrics to disk
 */
async function saveMetrics(): Promise<void> {
  const dir = join(metricsFilePath, '..');
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // Directory may exist
  }
  // Keep only last 10000 events to prevent unbounded growth
  const toSave = events.slice(-10000);
  await writeFile(metricsFilePath, JSON.stringify(toSave, null, 2), 'utf-8');
}

/**
 * Record a metric event
 */
function recordEvent(event: Omit<MetricEvent, 'timestamp'>): void {
  events.push({
    ...event,
    timestamp: new Date().toISOString(),
  });
  // Async save, don't block
  saveMetrics().catch(() => {});
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, index)] ?? 0;
}

/**
 * Aggregate metrics for a time period
 */
function aggregateMetrics(sinceMs: number, filterTags?: string[]): AggregatedMetrics {
  const now = Date.now();
  const cutoff = now - sinceMs;
  const cutoffIso = new Date(cutoff).toISOString();

  // Filter events by time
  let filtered = events.filter((e) => new Date(e.timestamp).getTime() >= cutoff);

  // Filter by tags if specified
  if (filterTags && filterTags.length > 0) {
    filtered = filtered.filter((e) => e.tags?.some((t) => filterTags.includes(t)));
  }

  // Count by type
  const counts = {
    task_created: 0,
    task_claimed: 0,
    task_claim_failed: 0,
    task_progress: 0,
    task_completed: 0,
    task_failed: 0,
    task_timeout: 0,
  };

  // Completion times for percentiles
  const completionTimes: number[] = [];
  const claimTimes: number[] = [];

  // By-agent stats
  const byAgent: AggregatedMetrics['byAgent'] = {};
  const byAgentTimes: Record<string, number[]> = {};

  // By-tag stats
  const byTag: AggregatedMetrics['byTag'] = {};
  const byTagTimes: Record<string, number[]> = {};

  for (const event of filtered) {
    counts[event.type]++;

    // Track completion times
    if (event.type === 'task_completed' && event.durationMs !== undefined) {
      completionTimes.push(event.durationMs);

      // By agent
      if (event.agentId) {
        if (!byAgent[event.agentId]) {
          byAgent[event.agentId] = {
            claimed: 0,
            completed: 0,
            failed: 0,
            avgCompletionTimeMs: 0,
          };
          byAgentTimes[event.agentId] = [];
        }
        const agent = byAgent[event.agentId];
        if (agent) {
          agent.completed++;
          byAgentTimes[event.agentId]?.push(event.durationMs ?? 0);
        }
      }

      // By tag
      if (event.tags) {
        for (const tag of event.tags) {
          if (!byTag[tag]) {
            byTag[tag] = { created: 0, completed: 0, avgCompletionTimeMs: 0 };
            byTagTimes[tag] = [];
          }
          if (byTag[tag]) {
            byTag[tag].completed++;
            byTagTimes[tag]?.push(event.durationMs ?? 0);
          }
        }
      }
    }

    // Track claim times
    if (event.type === 'task_claimed' && event.durationMs !== undefined) {
      claimTimes.push(event.durationMs);
      if (event.agentId) {
        if (!byAgent[event.agentId]) {
          byAgent[event.agentId] = {
            claimed: 0,
            completed: 0,
            failed: 0,
            avgCompletionTimeMs: 0,
          };
          byAgentTimes[event.agentId] = [];
        }
        const agent = byAgent[event.agentId];
        if (agent) {
          agent.claimed++;
        }
      }
    }

    // Track failures
    if (event.type === 'task_failed' && event.agentId) {
      if (!byAgent[event.agentId]) {
        byAgent[event.agentId] = {
          claimed: 0,
          completed: 0,
          failed: 0,
          avgCompletionTimeMs: 0,
        };
        byAgentTimes[event.agentId] = [];
      }
      const agent = byAgent[event.agentId];
      if (agent) {
        agent.failed++;
      }
    }

    // Track creates by tag
    if (event.type === 'task_created' && event.tags) {
      for (const tag of event.tags) {
        if (!byTag[tag]) {
          byTag[tag] = { created: 0, completed: 0, avgCompletionTimeMs: 0 };
          byTagTimes[tag] = [];
        }
        if (byTag[tag]) {
          byTag[tag].created++;
        }
      }
    }
  }

  // Sort for percentiles
  completionTimes.sort((a, b) => a - b);
  claimTimes.sort((a, b) => a - b);

  // Calculate averages
  const avgCompletionTime =
    completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : 0;
  const avgClaimTime =
    claimTimes.length > 0 ? claimTimes.reduce((a, b) => a + b, 0) / claimTimes.length : 0;

  // Calculate per-agent averages
  for (const [agentId, times] of Object.entries(byAgentTimes)) {
    if (times.length > 0 && byAgent[agentId]) {
      byAgent[agentId].avgCompletionTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
    }
  }

  // Calculate per-tag averages
  for (const [tag, times] of Object.entries(byTagTimes)) {
    if (times.length > 0 && byTag[tag]) {
      byTag[tag].avgCompletionTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
    }
  }

  // Calculate rates
  const totalClaims = counts.task_claimed + counts.task_claim_failed;
  const totalCompleted = counts.task_completed + counts.task_failed;

  return {
    tasksCreated: counts.task_created,
    tasksClaimed: counts.task_claimed,
    tasksCompleted: counts.task_completed,
    tasksFailed: counts.task_failed,
    tasksTimedOut: counts.task_timeout,
    claimFailures: counts.task_claim_failed,

    avgCompletionTimeMs: Math.round(avgCompletionTime),
    p50CompletionTimeMs: Math.round(percentile(completionTimes, 50)),
    p95CompletionTimeMs: Math.round(percentile(completionTimes, 95)),
    avgClaimTimeMs: Math.round(avgClaimTime),

    claimSuccessRate: totalClaims > 0 ? counts.task_claimed / totalClaims : 1,
    completionRate: totalCompleted > 0 ? counts.task_completed / totalCompleted : 1,
    timeoutRate: counts.task_created > 0 ? counts.task_timeout / counts.task_created : 0,

    byAgent,
    byTag,

    periodStart: cutoffIso,
    periodEnd: new Date().toISOString(),
    eventCount: filtered.length,
  };
}

/**
 * Format metrics as Prometheus exposition format
 */
function toPrometheus(metrics: AggregatedMetrics): string {
  const lines: string[] = [];
  const prefix = 'rapid_task';

  // Counters
  lines.push(`# HELP ${prefix}_created_total Total tasks created`);
  lines.push(`# TYPE ${prefix}_created_total counter`);
  lines.push(`${prefix}_created_total ${metrics.tasksCreated}`);

  lines.push(`# HELP ${prefix}_completed_total Total tasks completed`);
  lines.push(`# TYPE ${prefix}_completed_total counter`);
  lines.push(`${prefix}_completed_total ${metrics.tasksCompleted}`);

  lines.push(`# HELP ${prefix}_failed_total Total tasks failed`);
  lines.push(`# TYPE ${prefix}_failed_total counter`);
  lines.push(`${prefix}_failed_total ${metrics.tasksFailed}`);

  lines.push(`# HELP ${prefix}_timeout_total Total tasks timed out`);
  lines.push(`# TYPE ${prefix}_timeout_total counter`);
  lines.push(`${prefix}_timeout_total ${metrics.tasksTimedOut}`);

  // Gauges
  lines.push(`# HELP ${prefix}_completion_time_ms Task completion time`);
  lines.push(`# TYPE ${prefix}_completion_time_ms gauge`);
  lines.push(`${prefix}_completion_time_ms{quantile="0.5"} ${metrics.p50CompletionTimeMs}`);
  lines.push(`${prefix}_completion_time_ms{quantile="0.95"} ${metrics.p95CompletionTimeMs}`);
  lines.push(`${prefix}_completion_time_ms{quantile="avg"} ${metrics.avgCompletionTimeMs}`);

  lines.push(`# HELP ${prefix}_claim_success_rate Task claim success rate`);
  lines.push(`# TYPE ${prefix}_claim_success_rate gauge`);
  lines.push(`${prefix}_claim_success_rate ${metrics.claimSuccessRate.toFixed(4)}`);

  lines.push(`# HELP ${prefix}_completion_rate Task completion rate`);
  lines.push(`# TYPE ${prefix}_completion_rate gauge`);
  lines.push(`${prefix}_completion_rate ${metrics.completionRate.toFixed(4)}`);

  // Per-agent metrics
  for (const [agentId, stats] of Object.entries(metrics.byAgent)) {
    const labels = `agent="${agentId}"`;
    lines.push(`${prefix}_claimed_total{${labels}} ${stats.claimed}`);
    lines.push(`${prefix}_completed_total{${labels}} ${stats.completed}`);
    lines.push(`${prefix}_failed_total{${labels}} ${stats.failed}`);
  }

  return lines.join('\n');
}

/**
 * Register metrics tools with the MCP server
 */
export function registerMetricsTools(server: McpServer, context: ServerContext): void {
const logger = createLogger('metrics');
  // Initialize metrics store
  loadMetrics(context.projectDir).catch((err) => logger.error('Failed to load metrics', err));

  // Tool: Record a metric event
  server.registerTool(
    'metrics_record',
    {
      title: 'Record Metric',
      description: 'Record a task-related metric event for tracking.',
      inputSchema: {
        type: z
          .enum([
            'task_created',
            'task_claimed',
            'task_claim_failed',
            'task_progress',
            'task_completed',
            'task_failed',
            'task_timeout',
          ])
          .describe('Type of metric event'),
        taskId: z.string().describe('Task ID'),
        agentId: z.string().optional().describe('Agent ID'),
        durationMs: z
          .number()
          .optional()
          .describe('Duration in milliseconds (for completion/claim events)'),
        tags: z.array(z.string()).optional().describe('Tags from the task'),
        metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
      },
      outputSchema: {
        recorded: z.boolean(),
        eventCount: z.number(),
      },
    },
    async (args) => {
      const { type, taskId, agentId, durationMs, tags, metadata } = args as {
        type: MetricEventType;
        taskId: string;
        agentId?: string;
        durationMs?: number;
        tags?: string[];
        metadata?: Record<string, unknown>;
      };

      const event: Omit<MetricEvent, 'timestamp'> = { type, taskId };
      if (agentId) event.agentId = agentId;
      if (durationMs !== undefined) event.durationMs = durationMs;
      if (tags) event.tags = tags;
      if (metadata) event.metadata = metadata;
      recordEvent(event);

      if (context.verbose) {
        logger.error(
          `[metrics_record] ${type} for task ${taskId}${durationMs ? ` (${durationMs}ms)` : ''}`
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ recorded: true, eventCount: events.length }),
          },
        ],
        structuredContent: { recorded: true, eventCount: events.length },
      };
    }
  );

  // Tool: Get aggregated metrics
  server.registerTool(
    'metrics_get',
    {
      title: 'Get Metrics',
      description: 'Get aggregated task metrics for monitoring and analysis.',
      inputSchema: {
        periodHours: z.number().default(24).describe('Time period in hours to aggregate'),
        tags: z.array(z.string()).optional().describe('Filter by task tags'),
        format: z.enum(['json', 'prometheus']).default('json').describe('Output format'),
      },
      outputSchema: z.union([
        z.object({
          metrics: z.record(z.unknown()),
          format: z.literal('json'),
        }),
        z.object({
          metrics: z.string(),
          format: z.literal('prometheus'),
        }),
      ]),
    },
    async (args) => {
      const {
        periodHours = 24,
        tags,
        format = 'json',
      } = args as {
        periodHours?: number;
        tags?: string[];
        format?: 'json' | 'prometheus';
      };

      const periodMs = periodHours * 60 * 60 * 1000;
      const metrics = aggregateMetrics(periodMs, tags);

      if (context.verbose) {
        logger.error(`[metrics_get] Aggregated ${metrics.eventCount} events over ${periodHours}h`);
      }

      if (format === 'prometheus') {
        const prometheusOutput = toPrometheus(metrics);
        return {
          content: [{ type: 'text', text: prometheusOutput }],
          structuredContent: { metrics: prometheusOutput, format: 'prometheus' },
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }],
        structuredContent: { metrics, format: 'json' },
      };
    }
  );

  // Tool: Get agent performance report
  server.registerTool(
    'metrics_agent_report',
    {
      title: 'Agent Performance Report',
      description: 'Get performance metrics for a specific agent or all agents.',
      inputSchema: {
        agentId: z.string().optional().describe('Filter by specific agent ID'),
        periodHours: z.number().default(24).describe('Time period in hours'),
        sortBy: z
          .enum(['completed', 'avgTime', 'successRate'])
          .default('completed')
          .describe('Sort agents by metric'),
      },
      outputSchema: {
        agents: z.array(
          z.object({
            agentId: z.string(),
            claimed: z.number(),
            completed: z.number(),
            failed: z.number(),
            avgCompletionTimeMs: z.number(),
            successRate: z.number(),
          })
        ),
        topPerformer: z.string().optional(),
        totalAgents: z.number(),
      },
    },
    async (args) => {
      const {
        agentId,
        periodHours = 24,
        sortBy = 'completed',
      } = args as {
        agentId?: string;
        periodHours?: number;
        sortBy?: 'completed' | 'avgTime' | 'successRate';
      };

      const periodMs = periodHours * 60 * 60 * 1000;
      const metrics = aggregateMetrics(periodMs);

      let agents = Object.entries(metrics.byAgent).map(([id, stats]) => ({
        agentId: id,
        ...stats,
        successRate: stats.claimed > 0 ? stats.completed / stats.claimed : 0,
      }));

      // Filter by agent if specified
      if (agentId) {
        agents = agents.filter((a) => a.agentId === agentId);
      }

      // Sort
      agents.sort((a, b) => {
        switch (sortBy) {
          case 'completed':
            return b.completed - a.completed;
          case 'avgTime':
            return a.avgCompletionTimeMs - b.avgCompletionTimeMs;
          case 'successRate':
            return b.successRate - a.successRate;
          default:
            return 0;
        }
      });

      const topPerformer = agents.length > 0 ? agents[0]?.agentId : undefined;

      const output = {
        agents,
        topPerformer,
        totalAgents: agents.length,
      };

      if (context.verbose) {
        logger.error(`[metrics_agent_report] ${agents.length} agents, top: ${topPerformer}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Reset metrics (for testing)
  server.registerTool(
    'metrics_reset',
    {
      title: 'Reset Metrics',
      description: 'Clear all recorded metrics (use for testing only).',
      inputSchema: {
        confirm: z.boolean().describe('Must be true to confirm reset'),
      },
      outputSchema: {
        reset: z.boolean(),
        clearedCount: z.number(),
      },
    },
    async (args) => {
      const { confirm } = args as { confirm: boolean };

      if (!confirm) {
        return {
          content: [{ type: 'text', text: 'Reset not confirmed. Set confirm=true.' }],
          structuredContent: { reset: false, clearedCount: 0 },
        };
      }

      const clearedCount = events.length;
      events.length = 0;
      await saveMetrics();

      if (context.verbose) {
        logger.error(`[metrics_reset] Cleared ${clearedCount} events`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ reset: true, clearedCount }) }],
        structuredContent: { reset: true, clearedCount },
      };
    }
  );
}
