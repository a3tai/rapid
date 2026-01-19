/**
 * Devcontainer Environment Provider
 *
 * Runs agents inside Docker devcontainers.
 */

import { randomUUID } from 'node:crypto';
import { execa } from 'execa';
import { BaseProvider } from './base.js';
import type {
  ProviderType,
  ProviderInitOptions,
  Session,
  EnvironmentHandle,
  ExecuteOptions,
  ExecuteResult,
} from '../types.js';

// A process handle that can be killed
interface KillableProcess {
  kill: (signal?: NodeJS.Signals) => boolean;
}

export class DevcontainerProvider extends BaseProvider {
  readonly type: ProviderType = 'devcontainer';
  readonly name = 'Devcontainer (Docker)';

  private containers: Map<string, string> = new Map(); // handleId -> containerId
  private processes: Map<string, KillableProcess> = new Map();

  async isAvailable(): Promise<boolean> {
    try {
      await execa('docker', ['version']);
      await execa('devcontainer', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  protected async doInitialize(_options: ProviderInitOptions): Promise<void> {
    // No specific initialization needed
  }

  async createEnvironment(session: Session): Promise<EnvironmentHandle> {
    const id = randomUUID();

    // Get container status
    const containerName = await this.getContainerName(session.projectDir);

    try {
      // Check if container is already running
      const { stdout } = await execa('docker', ['ps', '-q', '-f', `name=${containerName}`]);

      let containerId = stdout.trim();

      if (!containerId) {
        // Start the devcontainer
        await execa('devcontainer', ['up', '--workspace-folder', session.projectDir], {
          cwd: session.projectDir,
        });

        // Get container ID after start
        const { stdout: newId } = await execa('docker', [
          'ps',
          '-q',
          '-f',
          `name=${containerName}`,
        ]);
        containerId = newId.trim();

        if (!containerId) {
          throw new Error('Failed to start devcontainer');
        }
      }

      this.containers.set(id, containerId);

      return {
        id,
        provider: 'devcontainer',
        containerId,
      };
    } catch (error) {
      throw new Error(
        `Failed to create devcontainer environment: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async stopEnvironment(handle: EnvironmentHandle): Promise<void> {
    // Stop any running exec process
    const process = this.processes.get(handle.id);
    if (process) {
      process.kill('SIGTERM');
      this.processes.delete(handle.id);
    }

    // Note: We don't stop the container itself, just the exec session
    this.containers.delete(handle.id);
  }

  async execute(
    handle: EnvironmentHandle,
    command: string[],
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    this.ensureInitialized();

    const containerId = this.containers.get(handle.id) || handle.containerId;
    if (!containerId) {
      throw new Error('No container ID for handle');
    }

    const dockerArgs = ['exec'];

    // Add interactive/tty flags
    if (options.interactive || options.tty) {
      dockerArgs.push('-i');
    }
    if (options.tty) {
      dockerArgs.push('-t');
    }

    // Add working directory
    if (options.cwd) {
      dockerArgs.push('-w', options.cwd);
    }

    // Add environment variables
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        dockerArgs.push('-e', `${key}=${value}`);
      }
    }

    dockerArgs.push(containerId);
    dockerArgs.push(...command);

    try {
      const proc = execa('docker', dockerArgs, {
        stdin: options.stdin || 'inherit',
        stdout: options.stdout || 'inherit',
        stderr: options.stderr || 'inherit',
      });

      this.processes.set(handle.id, proc);
      const result = await proc;
      this.processes.delete(handle.id);

      const execResult: ExecuteResult = {
        exitCode: result.exitCode ?? 0,
      };
      if (typeof result.stdout === 'string') {
        execResult.stdout = result.stdout;
      }
      if (typeof result.stderr === 'string') {
        execResult.stderr = result.stderr;
      }
      return execResult;
    } catch (error: unknown) {
      this.processes.delete(handle.id);

      if (error && typeof error === 'object' && 'exitCode' in error) {
        const execaError = error as {
          exitCode?: number;
          stdout?: unknown;
          stderr?: unknown;
        };
        const errorResult: ExecuteResult = {
          exitCode: execaError.exitCode ?? 1,
        };
        if (typeof execaError.stdout === 'string') {
          errorResult.stdout = execaError.stdout;
        }
        if (typeof execaError.stderr === 'string') {
          errorResult.stderr = execaError.stderr;
        }
        return errorResult;
      }
      throw error;
    }
  }

  protected async doCleanup(): Promise<void> {
    // Stop all exec processes
    for (const [id, process] of this.processes.entries()) {
      process.kill('SIGTERM');
      this.processes.delete(id);
    }

    this.containers.clear();
  }

  /**
   * Get the container name for a project
   */
  private async getContainerName(projectDir: string): Promise<string> {
    // devcontainer CLI uses a hash of the workspace folder
    const { basename } = await import('node:path');
    const projectName = basename(projectDir);
    return `${projectName}_devcontainer`;
  }

  /**
   * Check if container is running
   */
  async isContainerRunning(projectDir: string): Promise<boolean> {
    const containerName = await this.getContainerName(projectDir);
    try {
      const { stdout } = await execa('docker', ['ps', '-q', '-f', `name=${containerName}`]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Stop the container
   */
  async stopContainer(projectDir: string): Promise<void> {
    const containerName = await this.getContainerName(projectDir);
    try {
      await execa('docker', ['stop', containerName]);
    } catch {
      // Container may not be running
    }
  }
}
