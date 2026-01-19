/**
 * Local Environment Provider
 *
 * Runs agents directly on the host with optional sandbox isolation.
 */

import { randomUUID } from 'node:crypto';
import { execa } from 'execa';
import type { SandboxManager } from '@a3t/rapid-runtime';
import { createSandboxManager } from '@a3t/rapid-runtime';
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

export class LocalProvider extends BaseProvider {
  readonly type: ProviderType = 'local';
  readonly name = 'Local (Host + Sandbox)';

  private processes: Map<string, KillableProcess> = new Map();
  private sandboxManagers: Map<string, SandboxManager> = new Map();

  async isAvailable(): Promise<boolean> {
    // Local provider is always available
    return true;
  }

  protected async doInitialize(_options: ProviderInitOptions): Promise<void> {
    // No initialization needed for local provider
  }

  async createEnvironment(session: Session): Promise<EnvironmentHandle> {
    const id = randomUUID();

    // Create sandbox manager if sandbox config is provided
    if (session.sandboxConfig?.enabled) {
      const managerOpts: { cwd: string; verbose?: boolean } = {
        cwd: session.projectDir,
      };
      if (this.options.verbose !== undefined) {
        managerOpts.verbose = this.options.verbose;
      }
      const sandboxManager = createSandboxManager(session.sandboxConfig, managerOpts);
      await sandboxManager.initialize();
      this.sandboxManagers.set(id, sandboxManager);
    }

    return {
      id,
      provider: 'local',
    };
  }

  async stopEnvironment(handle: EnvironmentHandle): Promise<void> {
    // Stop any running process
    const proc = this.processes.get(handle.id);
    if (proc) {
      proc.kill('SIGTERM');
      this.processes.delete(handle.id);
    }

    // Shutdown sandbox manager
    const sandboxManager = this.sandboxManagers.get(handle.id);
    if (sandboxManager) {
      await sandboxManager.shutdown();
      this.sandboxManagers.delete(handle.id);
    }
  }

  async execute(
    handle: EnvironmentHandle,
    command: string[],
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    this.ensureInitialized();

    if (command.length === 0) {
      return { exitCode: 1, stderr: 'No command provided' };
    }

    const sandboxManager = this.sandboxManagers.get(handle.id);

    // Build env object
    const envObj: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        envObj[key] = value;
      }
    }
    if (options.env) {
      Object.assign(envObj, options.env);
    }

    try {
      let exitCode: number;
      let stdout: string | undefined;
      let stderr: string | undefined;

      if (sandboxManager) {
        // Wrap command with sandbox
        const wrapResult = await sandboxManager.wrapCommand(command.join(' '));

        if (!wrapResult.success || !wrapResult.wrappedCommand) {
          const errorResult: ExecuteResult = { exitCode: 1 };
          if (wrapResult.error) {
            errorResult.stderr = wrapResult.error;
          }
          return errorResult;
        }

        // Add sandbox environment variables
        if (wrapResult.env) {
          Object.assign(envObj, wrapResult.env);
        }

        const proc = execa(wrapResult.wrappedCommand, {
          stdin: options.stdin || 'inherit',
          stdout: options.stdout || 'inherit',
          stderr: options.stderr || 'inherit',
          env: envObj,
          shell: true,
          ...(options.cwd ? { cwd: options.cwd } : {}),
        });
        this.processes.set(handle.id, proc);
        const result = await proc;
        this.processes.delete(handle.id);

        exitCode = result.exitCode ?? 0;
        if (typeof result.stdout === 'string') {
          stdout = result.stdout;
        }
        if (typeof result.stderr === 'string') {
          stderr = result.stderr;
        }
      } else {
        // Direct execution
        const [cmd, ...args] = command;
        if (!cmd) {
          return { exitCode: 1, stderr: 'No command provided' };
        }

        const proc = execa(cmd, args, {
          stdin: options.stdin || 'inherit',
          stdout: options.stdout || 'inherit',
          stderr: options.stderr || 'inherit',
          env: envObj,
          ...(options.cwd ? { cwd: options.cwd } : {}),
        });
        this.processes.set(handle.id, proc);
        const result = await proc;
        this.processes.delete(handle.id);

        exitCode = result.exitCode ?? 0;
        if (typeof result.stdout === 'string') {
          stdout = result.stdout;
        }
        if (typeof result.stderr === 'string') {
          stderr = result.stderr;
        }
      }

      const execResult: ExecuteResult = { exitCode };
      if (stdout !== undefined) {
        execResult.stdout = stdout;
      }
      if (stderr !== undefined) {
        execResult.stderr = stderr;
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
    // Stop all processes
    for (const [id, proc] of this.processes.entries()) {
      proc.kill('SIGTERM');
      this.processes.delete(id);
    }

    // Shutdown all sandbox managers
    for (const [id, manager] of this.sandboxManagers.entries()) {
      await manager.shutdown();
      this.sandboxManagers.delete(id);
    }
  }
}
