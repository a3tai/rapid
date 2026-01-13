/**
 * Container management utilities
 * Uses devcontainer CLI for container lifecycle
 */

import { execa, ExecaError } from 'execa';
import which from 'which';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RapidConfig } from './types.js';

export interface ContainerStatus {
  exists: boolean;
  running: boolean;
  containerId?: string;
  containerName?: string;
}

export interface DevcontainerConfig {
  name?: string;
  image?: string;
  dockerFile?: string;
  build?: {
    dockerfile?: string;
    context?: string;
  };
  [key: string]: unknown;
}

/**
 * Check if devcontainer CLI is available
 */
export async function hasDevcontainerCli(): Promise<boolean> {
  try {
    await which('devcontainer');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker is available
 */
export async function hasDocker(): Promise<boolean> {
  try {
    await execa('docker', ['info'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the devcontainer.json path
 */
export function getDevcontainerPath(rootDir: string, config?: RapidConfig): string {
  const customPath = config?.container?.devcontainer;
  if (customPath) {
    return join(rootDir, customPath);
  }
  return join(rootDir, '.devcontainer', 'devcontainer.json');
}

/**
 * Load devcontainer.json
 */
export async function loadDevcontainerConfig(rootDir: string, config?: RapidConfig): Promise<DevcontainerConfig | null> {
  try {
    const configPath = getDevcontainerPath(rootDir, config);
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Get container name for a project
 */
export function getContainerName(rootDir: string, devcontainerConfig?: DevcontainerConfig): string {
  // Use devcontainer name if available, otherwise derive from directory
  const dirName = rootDir.split('/').pop() || 'rapid';
  const name = devcontainerConfig?.name || dirName;
  // Sanitize for Docker container name
  return `rapid-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * Check container status using devcontainer labels
 */
export async function getContainerStatus(rootDir: string, _config?: RapidConfig): Promise<ContainerStatus> {
  try {
    // Use devcontainer label to find the container (this is how devcontainer CLI tracks containers)
    const result = await execa('docker', [
      'ps', '-a',
      '--filter', `label=devcontainer.local_folder=${rootDir}`,
      '--format', '{{.ID}}\t{{.State}}\t{{.Names}}'
    ]);

    const lines = result.stdout.trim().split('\n').filter(Boolean);
    if (lines.length === 0) {
      return { exists: false, running: false };
    }

    const [containerId, state, name] = lines[0].split('\t');
    return {
      exists: true,
      running: state === 'running',
      containerId,
      containerName: name,
    };
  } catch {
    return { exists: false, running: false };
  }
}

/**
 * Start the dev container using devcontainer CLI
 */
export async function startContainer(
  rootDir: string,
  _config?: RapidConfig,
  options: { rebuild?: boolean; quiet?: boolean } = {}
): Promise<{ success: boolean; containerId?: string; error?: string }> {
  const hasDevCli = await hasDevcontainerCli();
  
  if (!hasDevCli) {
    return {
      success: false,
      error: 'devcontainer CLI not found. Install with: npm install -g @devcontainers/cli',
    };
  }

  const hasDockerRunning = await hasDocker();
  if (!hasDockerRunning) {
    return {
      success: false,
      error: 'Docker is not running. Please start Docker Desktop.',
    };
  }

  try {
    const args = ['up', '--workspace-folder', rootDir];
    
    if (options.rebuild) {
      args.push('--remove-existing-container');
    }

    const result = await execa('devcontainer', args, {
      stdio: options.quiet ? 'pipe' : 'inherit',
      cwd: rootDir,
    });

    // Parse the container ID from output
    // devcontainer up outputs JSON with containerId
    if (options.quiet && result.stdout) {
      try {
        const output = JSON.parse(result.stdout);
        return { success: true, containerId: output.containerId };
      } catch {
        return { success: true };
      }
    }

    return { success: true };
  } catch (error) {
    const execError = error as ExecaError;
    const stderr = typeof execError.stderr === 'string' ? execError.stderr : undefined;
    return {
      success: false,
      error: stderr || execError.message,
    };
  }
}

/**
 * Stop the dev container
 */
export async function stopContainer(
  rootDir: string,
  config?: RapidConfig,
  options: { remove?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  const status = await getContainerStatus(rootDir, config);
  
  if (!status.exists) {
    return { success: true }; // Nothing to stop
  }

  try {
    if (status.running) {
      await execa('docker', ['stop', status.containerId!]);
    }
    
    if (options.remove) {
      await execa('docker', ['rm', status.containerId!]);
    }

    return { success: true };
  } catch (error) {
    const execError = error as ExecaError;
    const stderr = typeof execError.stderr === 'string' ? execError.stderr : undefined;
    return {
      success: false,
      error: stderr || execError.message,
    };
  }
}

/**
 * Execute a command inside the dev container
 */
export async function execInContainer(
  rootDir: string,
  command: string[],
  _config?: RapidConfig,
  options: { interactive?: boolean; tty?: boolean; env?: Record<string, string> } = {}
): Promise<void> {
  const hasDevCli = await hasDevcontainerCli();
  
  if (!hasDevCli) {
    throw new Error('devcontainer CLI not found. Install with: npm install -g @devcontainers/cli');
  }

  const args = ['exec', '--workspace-folder', rootDir];
  
  // Add environment variables
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      args.push('--remote-env', `${key}=${value}`);
    }
  }

  // Add the command
  args.push(...command);

  await execa('devcontainer', args, {
    stdio: 'inherit',
    cwd: rootDir,
  });
}
