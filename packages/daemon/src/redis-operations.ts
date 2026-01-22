/**
 * Redis Operations for Daemon
 *
 * Handles Redis-based agent cleanup, task recovery, and data queries.
 */

import type { Redis } from 'ioredis';
import type { SessionManager } from './session-manager.js';
import type { DaemonConfig } from './types.js';

/**
 * Context required for Redis operations
 */
export interface RedisContext {
  redis: Redis | null;
  sessionManager: SessionManager;
  config: DaemonConfig;
}

/**
 * Agent data structure returned from Redis
 */
export interface AgentData {
  id: string;
  name: string;
  worktree?: string;
  session?: string;
  lastSeen?: number;
}

/**
 * Task data structure returned from Redis
 */
export interface TaskData {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

/**
 * Cleanup stale agents from Redis registry
 * Agents without heartbeat for 2+ minutes are checked against Docker
 * and removed if their containers are no longer running
 */
export async function cleanupStaleAgents(ctx: RedisContext): Promise<void> {
  if (!ctx.redis) return;

  const now = Date.now();
  const staleThreshold = 120000; // 2 minutes - more forgiving for long Claude iterations

  try {
    // Get all agents from the active sorted set
    const agents = await ctx.redis.zrangebyscore(
      'rapid:agents:active',
      '-inf',
      '+inf',
      'WITHSCORES'
    );

    for (let i = 0; i < agents.length; i += 2) {
      const agentId = agents[i];
      const scoreStr = agents[i + 1];
      if (!agentId || !scoreStr) continue;

      const lastSeen = parseInt(scoreStr, 10);

      if (now - lastSeen > staleThreshold) {
        // Agent is stale - check if session/container is still running
        const session = ctx.sessionManager.getSession(agentId);

        if (session && session.state === 'running') {
          // Container still running but no heartbeat - update timestamp
          await ctx.redis.zadd('rapid:agents:active', String(now), agentId);
          if (ctx.config.verbose) {
            console.log(`[cleanup] Agent ${agentId} is stale but container running, refreshed timestamp`);
          }
        } else {
          // Container stopped or doesn't exist - clean up registry
          await ctx.redis.zrem('rapid:agents:active', agentId);
          await ctx.redis.del(`rapid:agents:${agentId}`);

          // Also clean from app-specific sorted set
          const appAgents = await ctx.redis.zrangebyscore('rapid:agents:app', '-inf', '+inf');
          for (const entry of appAgents) {
            try {
              const parsed = JSON.parse(entry);
              if (parsed.id === agentId) {
                await ctx.redis.zrem('rapid:agents:app', entry);
              }
            } catch {
              // Skip invalid entries
            }
          }

          if (ctx.config.verbose) {
            console.log(`[cleanup] Removed stale agent ${agentId} from registry`);
          }
        }
      }
    }
  } catch (err) {
    if (ctx.config.verbose) {
      console.error('Error during stale agent cleanup:', err);
    }
  }
}

/**
 * Recover orphaned tasks from dead agents
 * Tasks assigned to agents that are no longer active are unassigned
 * so they can be claimed by other workers
 */
export async function recoverOrphanedTasks(ctx: RedisContext): Promise<void> {
  if (!ctx.redis) return;

  try {
    // Get all in-progress tasks
    const taskKeys = await ctx.redis.keys('rapid:*:tasks');

    for (const key of taskKeys) {
      const tasks = await ctx.redis.hgetall(key);

      for (const [taskId, taskData] of Object.entries(tasks)) {
        try {
          const task = JSON.parse(String(taskData));

          // Only check tasks that are in_progress and assigned
          if (task.status !== 'in_progress' || !task.assignedTo) {
            continue;
          }

          // Check if the assigned agent is still active
          const agentScore = await ctx.redis.zscore('rapid:agents:active', task.assignedTo);
          const now = Date.now();
          const staleThreshold = 120000; // 2 minutes - more forgiving for long Claude iterations

          // Agent is dead if no score or score is too old
          const agentIsDead = !agentScore || (now - parseFloat(agentScore)) > staleThreshold;

          if (agentIsDead) {
            // Unassign the task so it can be claimed by another agent
            const updatedTask = {
              ...task,
              status: 'pending',
              assignedTo: null,
              notes: `Auto-unassigned from dead agent ${task.assignedTo} at ${new Date().toISOString()}`,
              updatedAt: new Date().toISOString(),
            };

            await ctx.redis.hset(key, taskId, JSON.stringify(updatedTask));

            // Publish recovery event
            await ctx.redis.publish('rapid:events', JSON.stringify({
              type: 'task_recovered',
              taskId,
              title: task.title,
              previousAgent: task.assignedTo,
              message: `Task unassigned from dead agent, ready for claiming`,
              timestamp: new Date().toISOString(),
            }));

            if (ctx.config.verbose) {
              console.log(`[recovery] Unassigned task ${taskId} from dead agent ${task.assignedTo}`);
            }
          }
        } catch {
          // Skip invalid task entries
        }
      }
    }
  } catch (err) {
    if (ctx.config.verbose) {
      console.error('Error during task recovery:', err);
    }
  }
}

/**
 * Get active agents from Redis event bus
 * Agents are stored in sorted sets like rapid:agents:app, rapid:agents:cli
 * with score = timestamp and value = JSON
 */
export async function getAgentsFromRedis(
  ctx: RedisContext,
  maxAgeSeconds: number
): Promise<AgentData[]> {
  if (!ctx.redis) return [];

  try {
    // Get all agent sorted set keys
    const keys = await ctx.redis.keys('rapid:agents:*');
    const agents: AgentData[] = [];

    const now = Date.now();
    // If maxAgeSeconds <= 0, get all agents (no time filter)
    const cutoff = maxAgeSeconds > 0 ? now - (maxAgeSeconds * 1000) : 0;
    const minScore = maxAgeSeconds > 0 ? String(cutoff) : '-inf';

    for (const key of keys) {
      // Get all entries from the sorted set with scores (timestamps)
      const entries = await ctx.redis.zrangebyscore(key, minScore, '+inf', 'WITHSCORES');

      // Entries come as [value, score, value, score, ...]
      for (let i = 0; i < entries.length; i += 2) {
        const value = entries[i];
        const score = Number(entries[i + 1]);

        if (!value) continue;

        try {
          const parsed = JSON.parse(value);
          agents.push({
            id: parsed.id || `agent-${score}`,
            name: parsed.name || 'unknown',
            worktree: parsed.worktree,
            session: parsed.session,
            lastSeen: score,
          });
        } catch {
          // Skip invalid JSON entries
        }
      }
    }

    // Sort by lastSeen descending (most recent first)
    agents.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

    return agents;
  } catch (err) {
    if (ctx.config.verbose) {
      console.error('Error getting agents from Redis:', err);
    }
    return [];
  }
}

/**
 * Get tasks from Redis
 */
export async function getTasksFromRedis(
  ctx: RedisContext,
  statusFilter?: string
): Promise<TaskData[]> {
  if (!ctx.redis) return [];

  try {
    // Get all project task keys
    const keys = await ctx.redis.keys('rapid:*:tasks');
    const tasks: TaskData[] = [];

    for (const key of keys) {
      const taskData = await ctx.redis.hgetall(key);
      for (const [taskId, data] of Object.entries(taskData)) {
        try {
          const parsed = JSON.parse(String(data));
          // Filter by status if specified
          if (statusFilter && parsed.status !== statusFilter) {
            continue;
          }
          tasks.push({
            id: taskId,
            title: parsed.title || 'Untitled',
            description: parsed.description,
            status: parsed.status || 'pending',
            priority: parsed.priority || 'normal',
            assignedTo: parsed.assignedTo,
            createdAt: parsed.createdAt || new Date().toISOString(),
            updatedAt: parsed.updatedAt || parsed.createdAt || new Date().toISOString(),
            tags: parsed.tags,
          });
        } catch {
          // Skip invalid entries
        }
      }
    }

    // Sort by updatedAt descending
    tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return tasks;
  } catch (err) {
    if (ctx.config.verbose) {
      console.error('Error getting tasks from Redis:', err);
    }
    return [];
  }
}

/**
 * Clean up agent from Redis when stopping
 */
export async function cleanupAgentFromRedis(
  redis: Redis,
  agentId: string,
  verbose: boolean
): Promise<void> {
  await redis.zrem('rapid:agents:active', agentId);
  await redis.del(`rapid:agents:${agentId}`);

  // Clean from app-specific sorted set
  const appAgents = await redis.zrangebyscore('rapid:agents:app', '-inf', '+inf');
  for (const entry of appAgents) {
    try {
      const parsed = JSON.parse(entry);
      if (parsed.id === agentId) {
        await redis.zrem('rapid:agents:app', entry);
      }
    } catch {
      // Skip invalid entries
    }
  }

  if (verbose) {
    console.log(`[agent.stop] Cleaned up agent ${agentId} from Redis`);
  }
}

/**
 * Pre-register agent in Redis before container creation
 */
export async function preRegisterAgent(
  redis: Redis,
  sessionId: string,
  persona: string,
  task: string,
  verbose: boolean
): Promise<void> {
  const agentData = {
    id: sessionId,
    name: persona,
    status: 'starting',
    type: persona,
    registeredAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
    task: task.slice(0, 200),
  };
  await redis.hset(`rapid:agents:${sessionId}`, agentData);
  await redis.zadd('rapid:agents:active', Date.now(), sessionId);
  // Also add to the app-specific sorted set for bus_agents compatibility
  await redis.zadd(
    'rapid:agents:app',
    Date.now(),
    JSON.stringify({ id: sessionId, name: persona, status: 'starting' })
  );
  if (verbose) {
    console.log(`[agent.spawn] Pre-registered agent ${sessionId} in Redis`);
  }
}
