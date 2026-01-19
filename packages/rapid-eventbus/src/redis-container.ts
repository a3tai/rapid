/**
 * Redis Container Manager
 *
 * Automatically manages Redis in Docker for the event bus.
 * Makes multi-agent communication work out of the box.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, isAbsolute } from 'node:path';

const execFileAsync = promisify(execFile);

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
 * Validate port number to prevent injection
 */
function validatePort(port: number): number {
  const portNum = Math.floor(port);
  if (portNum < 1 || portNum > 65535 || !Number.isFinite(portNum)) {
    throw new Error(`Invalid port number: ${port}`);
  }
  return portNum;
}

/**
 * Validate and sanitize directory path
 */
function validatePath(path: string): string {
  // Resolve to absolute path and ensure it doesn't contain shell metacharacters
  const resolved = isAbsolute(path) ? path : resolve(path);
  // Check for dangerous characters that could be used for injection
  if (/[;&|`$(){}[\]<>!#*?]/.test(resolved)) {
    throw new Error(`Invalid characters in path: ${path}`);
  }
  return resolved;
}

/**
 * Check if Docker is available
 */
export async function hasDocker(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['--version']);
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
    const { stdout } = await execFileAsync('docker', [
      'inspect',
      CONTAINER_NAME,
      '--format',
      '{{.State.Running}}|{{.Id}}|{{.NetworkSettings.Ports}}',
    ]);
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
  const port = validatePort(config.port ?? DEFAULT_PORT);

  // Check if already running
  const status = await getRedisStatus();
  if (status.running) {
    return status;
  }

  // Check if container exists but stopped
  if (status.containerId) {
    await execFileAsync('docker', ['start', CONTAINER_NAME]);
    // Wait for Redis to be ready
    await waitForRedis(port);
    return getRedisStatus();
  }

  // Pull image if needed (silently)
  try {
    await execFileAsync('docker', ['image', 'inspect', REDIS_IMAGE], { timeout: 5000 });
  } catch {
    // Image doesn't exist, pull it
    if (config.verbose) {
      console.log(`Pulling ${REDIS_IMAGE}...`);
    }
    await execFileAsync('docker', ['pull', REDIS_IMAGE]);
  }

  // Build run command args (no string concatenation)
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
    const safeDir = validatePath(config.dataDir);
    args.push('-v', `${safeDir}:/data`);
  }

  args.push(REDIS_IMAGE);

  // Run container using execFile (safe from injection)
  await execFileAsync('docker', args);

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
    await execFileAsync('docker', ['stop', CONTAINER_NAME]);
  }

  if (remove) {
    await execFileAsync('docker', ['rm', CONTAINER_NAME]);
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
      const { stdout } = await execFileAsync(
        'docker',
        ['exec', CONTAINER_NAME, 'redis-cli', 'ping'],
        { timeout: 2000 }
      );
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
    const { stdout } = await execFileAsync(
      'docker',
      ['exec', CONTAINER_NAME, 'redis-cli', 'ping'],
      { timeout: 2000 }
    );
    return stdout.trim() === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Get Redis connection URL
 */
export function getRedisUrl(port = DEFAULT_PORT): string {
  return `redis://localhost:${validatePort(port)}`;
}
