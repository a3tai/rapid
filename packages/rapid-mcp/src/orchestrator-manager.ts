/**
 * Orchestrator Manager
 *
 * Logic for detecting active orchestrators and spawning new ones when needed.
 * Implements lazy orchestrator instantiation with race condition prevention.
 *
 * Reference: /workspace/.rapid/LAZY_ORCHESTRATOR_DESIGN.md
 */

import { randomUUID } from 'node:crypto';
import { EventBus, InMemoryEventBus } from '@a3t/rapid-eventbus';
import { createLogger } from './utils/logger.js';
import { getProjectId } from './utils/projectId.js';
import type { ServerContext } from './server.js';

const logger = createLogger('orchestrator-manager');

// Fixed worktree name for orchestrator singleton
const ORCHESTRATOR_WORKTREE = 'orchestrator-main';

// Lock TTL for race condition prevention (5 seconds)
const SPAWN_LOCK_TTL = 5;

// Heartbeat threshold for active detection (60 seconds)
const HEARTBEAT_THRESHOLD = 60;

/**
 * Task description for the orchestrator's infinite event loop
 */
const ORCHESTRATOR_TASK = `
You are the orchestrator agent running in infinite event loop mode.

## Your Mission
1. Register with the event bus using bus_register
2. Enter an infinite loop checking for messages and tasks
3. Use bus_wait for efficient blocking (60s timeout)
4. Process incoming messages and coordinate agents
5. Send heartbeat every 30 seconds to stay active
6. Handle task recovery from stale agents on timeout

## Event Loop Protocol

1. **Initialization**:
   - Call bus_register with agentName="orchestrator"
   - Send coordination message announcing readiness

2. **Main Loop** (infinite):
   - Call bus_wait with 60s timeout
   - If message received:
     - Process message (coordinate agents, create tasks, etc.)
     - Send bus_heartbeat
   - If timeout:
     - Send bus_heartbeat
     - Check for stale agents via bus_health
     - Run bus_recover_tasks if needed
   - Sleep 1 second, then loop again

3. **Never Exit**: Continue looping forever until explicitly stopped by system

When no messages arrive, continue waiting. Never exit.
`.trim();

/**
 * Get event bus instance for orchestrator detection
 */
async function getEventBus(
  projectId: string,
  projectDir: string
): Promise<EventBus | InMemoryEventBus> {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    try {
      const bus = new EventBus({
        redis: { url: redisUrl },
        projectId,
      });
      await bus.connect();
      return bus;
    } catch (err) {
      logger.error(`Failed to connect to Redis at ${redisUrl}`, err);
      // Fall through to in-memory
    }
  }

  // Fall back to in-memory (limited functionality)
  logger.warn('Using in-memory event bus - orchestrator detection may not work across processes');
  return new InMemoryEventBus();
}

/**
 * Check if an orchestrator is currently active
 */
async function hasActiveOrchestrator(
  bus: EventBus | InMemoryEventBus,
  threshold: number = HEARTBEAT_THRESHOLD
): Promise<boolean> {
  try {
    // Get active agents (within heartbeat threshold)
    const activeAgents =
      bus instanceof EventBus ? await bus.getActiveAgents(threshold) : await bus.getActiveAgents();

    // Check if any active agent is an orchestrator
    const hasOrchestrator = activeAgents.some((agent) => agent.name === 'orchestrator');

    logger.info(
      `[hasActiveOrchestrator] Found ${activeAgents.length} active agents, orchestrator: ${hasOrchestrator}`
    );

    return hasOrchestrator;
  } catch (err) {
    logger.error('[hasActiveOrchestrator] Failed to check for active orchestrators', err);
    return false; // Assume no orchestrator on error
  }
}

/**
 * Acquire a distributed lock using Redis
 * Returns true if lock acquired, false otherwise
 */
async function acquireSpawnLock(
  bus: EventBus | InMemoryEventBus,
  projectId: string
): Promise<boolean> {
  if (!(bus instanceof EventBus)) {
    // In-memory mode, no distributed locking needed
    return true;
  }

  try {
    const lockKey = `orchestrator-spawn-lock:${projectId}`;
    const lockValue = randomUUID();

    // Try to set lock with NX (only if not exists) and EX (expiry)
    // @ts-expect-error - Redis instance is private but we need it for locking
    const result = await bus.redis.set(lockKey, lockValue, 'EX', SPAWN_LOCK_TTL, 'NX');

    if (result === 'OK') {
      logger.info(`[acquireSpawnLock] Acquired spawn lock for ${projectId}`);
      return true;
    } else {
      logger.info(`[acquireSpawnLock] Failed to acquire lock - another spawn in progress`);
      return false;
    }
  } catch (err) {
    logger.error('[acquireSpawnLock] Failed to acquire lock', err);
    return false;
  }
}

/**
 * Spawn a new orchestrator agent
 */
async function spawnOrchestrator(
  context: ServerContext,
  projectId: string
): Promise<{ success: boolean; agentId?: string; error?: string }> {
  try {
    logger.info(`[spawnOrchestrator] Spawning orchestrator for project ${projectId}`);

    // Import the spawn function from personas module
    const { spawnPersona } = await import('./tools/personas.js');

    // Call spawnPersona with orchestrator configuration
    const result = await spawnPersona(context, {
      name: 'orchestrator',
      task: ORCHESTRATOR_TASK,
      background: true,
      connectToBus: true,
      worktree: ORCHESTRATOR_WORKTREE,
    });

    if (result.error) {
      logger.error(`[spawnOrchestrator] Failed to spawn: ${result.error}`);
      return {
        success: false,
        error: result.error,
      };
    }

    logger.info(
      `[spawnOrchestrator] Successfully spawned orchestrator with agentId ${result.agentId} in worktree ${ORCHESTRATOR_WORKTREE}`
    );

    return {
      success: true,
      agentId: result.agentId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[spawnOrchestrator] Failed to spawn orchestrator: ${errorMsg}`, err);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Sleep for a duration (used for retry logic)
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensure an orchestrator is running, spawning one if needed
 *
 * This function checks for active orchestrators and spawns a new one
 * if none are found. It uses a distributed Redis lock to prevent
 * race conditions when multiple messages arrive simultaneously.
 *
 * @param context - Server context with project directory
 * @returns Promise that resolves when check is complete
 */
export async function ensureOrchestratorRunning(context: ServerContext): Promise<void> {
  try {
    const projectId = await getProjectId(context.projectDir);
    const bus = await getEventBus(projectId, context.projectDir);

    // Check if orchestrator is already active
    const hasOrchestrator = await hasActiveOrchestrator(bus);

    if (hasOrchestrator) {
      logger.info('[ensureOrchestratorRunning] Orchestrator is already active');
      return;
    }

    logger.info('[ensureOrchestratorRunning] No active orchestrator found, attempting to spawn');

    // Try to acquire spawn lock to prevent race conditions
    const lockAcquired = await acquireSpawnLock(bus, projectId);

    if (!lockAcquired) {
      // Another spawn is in progress, wait and recheck
      logger.info('[ensureOrchestratorRunning] Another spawn in progress, waiting...');
      await sleep(1000);

      // Recheck if orchestrator is now active
      const recheckOrchestrator = await hasActiveOrchestrator(bus);
      if (recheckOrchestrator) {
        logger.info('[ensureOrchestratorRunning] Orchestrator spawned by another process');
        return;
      }

      // Still no orchestrator, try again (recursive call)
      logger.warn('[ensureOrchestratorRunning] Lock not acquired, retrying...');
      return ensureOrchestratorRunning(context);
    }

    // We have the lock, spawn orchestrator
    const result = await spawnOrchestrator(context, projectId);

    if (result.success) {
      logger.info(
        `[ensureOrchestratorRunning] Successfully spawned orchestrator: ${result.agentId}`
      );
    } else {
      logger.error(
        `[ensureOrchestratorRunning] Failed to spawn orchestrator: ${result.error}`,
        result.error
      );
    }

    // Cleanup: disconnect from bus
    if (bus instanceof EventBus) {
      await bus.disconnect();
    }
  } catch (err) {
    logger.error('[ensureOrchestratorRunning] Unexpected error', err);
  }
}

/**
 * Get the task description for the orchestrator
 * Exposed for testing and debugging
 */
export function getOrchestratorTask(): string {
  return ORCHESTRATOR_TASK;
}

/**
 * Get the orchestrator worktree name
 * Exposed for testing and debugging
 */
export function getOrchestratorWorktree(): string {
  return ORCHESTRATOR_WORKTREE;
}
