/**
 * Redis Container Manager
 *
 * Automatically manages Redis in Docker for the event bus.
 * Makes multi-agent communication work out of the box.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const CONTAINER_NAME = 'rapid-redis';
const REDIS_IMAGE = 'redis:7-alpine';
const DEFAULT_PORT = 6379;

export interface RedisContainerConfig {
  port?: number;
  dataDir?: string;
  verbose?: boolean;
}

export interface RedisContainerStatus {
  running: boolean;
  containerId?: string | undefined;
  port?: number | undefined;
  url?: string | undefined;
}

/**
 * Check if Docker is available
 */
export async function hasDocker(): Promise<boolean> {
  try {
    await execAsync('docker --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Redis container status
 */
export async function getRedisStatus(): Promise<RedisContainerStatus> {
  try {
    const { stdout } = await execAsync(
      `docker inspect ${CONTAINER_NAME} --format '{{.State.Running}}|{{.Id}}|{{.NetworkSettings.Ports}}'`
    );
    const parts = stdout.trim().split('|');
    const running = parts[0];
    const containerId = parts[1] ?? '';
    const ports = parts[2] ?? '';

    if (running === 'true') {
      // Extract port from ports string like "6379/tcp -> 0.0.0.0:6379"
      const portMatch = ports.match(/(\d+)\/tcp/);
      const port = portMatch && portMatch[1] ? parseInt(portMatch[1], 10) : DEFAULT_PORT;

      return {
        running: true,
        containerId: containerId.slice(0, 12),
        port,
        url: `redis://localhost:${port}`,
      };
    }

    return { running: false, containerId: containerId ? containerId.slice(0, 12) : undefined };
  } catch {
    return { running: false };
  }
}

/**
 * Start Redis container
 */
export async function startRedis(config: RedisContainerConfig = {}): Promise<RedisContainerStatus> {
  const port = config.port ?? DEFAULT_PORT;

  // Check if already running
  const status = await getRedisStatus();
  if (status.running) {
    return status;
  }

  // Check if container exists but stopped
  if (status.containerId) {
    await execAsync(`docker start ${CONTAINER_NAME}`);
    // Wait for Redis to be ready
    await waitForRedis(port);
    return getRedisStatus();
  }

  // Pull image if needed (silently)
  try {
    await execAsync(`docker image inspect ${REDIS_IMAGE}`, { timeout: 5000 });
  } catch {
    // Image doesn't exist, pull it
    if (config.verbose) {
      console.log(`Pulling ${REDIS_IMAGE}...`);
    }
    await execAsync(`docker pull ${REDIS_IMAGE}`);
  }

  // Build run command
  const args = [
    'run',
    '-d',
    '--name',
    CONTAINER_NAME,
    '-p',
    `${port}:6379`,
    '--restart',
    'unless-stopped',
  ];

  // Add data volume for persistence
  if (config.dataDir) {
    args.push('-v', `${config.dataDir}:/data`);
  }

  args.push(REDIS_IMAGE);

  // Run container
  await execAsync(`docker ${args.join(' ')}`);

  // Wait for Redis to be ready
  await waitForRedis(port);

  return getRedisStatus();
}

/**
 * Stop Redis container
 */
export async function stopRedis(remove = false): Promise<void> {
  const status = await getRedisStatus();

  if (!status.containerId) {
    return; // Nothing to stop
  }

  if (status.running) {
    await execAsync(`docker stop ${CONTAINER_NAME}`);
  }

  if (remove) {
    await execAsync(`docker rm ${CONTAINER_NAME}`);
  }
}

/**
 * Wait for Redis to be ready
 */
async function waitForRedis(_port: number, timeoutMs = 10000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      // Try to connect using docker exec
      const { stdout } = await execAsync(`docker exec ${CONTAINER_NAME} redis-cli ping`, {
        timeout: 2000,
      });
      if (stdout.trim() === 'PONG') {
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Redis failed to start within timeout');
}

/**
 * Check Redis health
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`docker exec ${CONTAINER_NAME} redis-cli ping`, {
      timeout: 2000,
    });
    return stdout.trim() === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Get Redis connection URL
 */
export function getRedisUrl(port = DEFAULT_PORT): string {
  return `redis://localhost:${port}`;
}
