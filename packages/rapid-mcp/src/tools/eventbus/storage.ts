/**
 * Event Bus Storage
 *
 * Manages event bus instances and connections to Redis or in-memory storage.
 */

import {
  EventBus,
  InMemoryEventBus,
  getRedisStatus,
  type EventBusConfig,
} from '@a3t/rapid-eventbus';
import type { EventBusInstance } from './types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('eventbus');

// Singleton event bus instance per project
const busInstances = new Map<string, EventBusInstance>();

/**
 * Get or create event bus for a project.
 * Connects to Redis if available, otherwise falls back to in-memory.
 */
export async function getEventBus(projectId: string): Promise<EventBusInstance> {
  let bus = busInstances.get(projectId);
  if (bus) {
    return bus;
  }

  // First check for REDIS_URL environment variable (for containerized MCP)
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const config: EventBusConfig = {
        redis: { url: redisUrl },
        projectId,
      };
      bus = new EventBus(config);
      await bus.connect();
      busInstances.set(projectId, bus);
      logger.info(`Connected to Redis at ${redisUrl}`);
      return bus;
    } catch (err) {
      logger.error(`Failed to connect to Redis at ${redisUrl}`, err);
    }
  }

  // Check if Redis is running locally (started by `rapid start`)
  try {
    const status = await getRedisStatus();

    if (status.running && status.url) {
      // Connect to Redis
      const config: EventBusConfig = {
        redis: { url: status.url },
        projectId,
      };
      bus = new EventBus(config);
      await bus.connect();
      busInstances.set(projectId, bus);
      logger.info(`Connected to Redis at ${status.url}`);
      return bus;
    }
  } catch {
    // Redis not available, fall back to in-memory
  }

  // Fall back to in-memory
  logger.info('Using in-memory event bus (no Redis available)');
  bus = new InMemoryEventBus();
  busInstances.set(projectId, bus);
  return bus;
}

/**
 * Check if the event bus is using Redis
 */
export function isRedisBus(bus: EventBusInstance): bus is EventBus {
  return bus instanceof EventBus;
}

/**
 * Get the bus mode string
 */
export function getBusMode(bus: EventBusInstance): 'redis' | 'in-memory' {
  return isRedisBus(bus) ? 'redis' : 'in-memory';
}
