/**
 * Lima Environment Provider (Deprecated)
 *
 * Runs agents inside Lima VM on macOS.
 * This provider is deprecated and will be removed in v2.0.
 */

import { randomUUID } from 'node:crypto';
import { execa } from 'execa';
import chalk from 'chalk';
import { BaseProvider } from './base.js';
import type {
  ProviderType,
  ProviderInitOptions,
  Session,
  EnvironmentHandle,
  ExecuteOptions,
  ExecuteResult,
} from '../types.js';

const LIMA_DEPRECATION_WARNING = chalk.yellow(
  '⚠️  Lima provider is deprecated and will be removed in RAPID v2.0.\n' +
    '   Use --local with sandbox mode instead: rapid dev --local\n' +
    '   See: https://getrapid.dev/docs/migration/lima-to-sandbox\n'
);

const RAPID_LIMA_INSTANCE = 'rapid';

// A process handle that can be killed
interface KillableProcess {
  kill: (signal?: NodeJS.Signals) => boolean;
}

export class LimaProvider extends BaseProvider {
  readonly type: ProviderType = 'lima';
  readonly name = 'Lima VM (Deprecated)';

  private processes: Map<string, KillableProcess> = new Map();
  private deprecationWarningShown = false;

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return false;
    }

    try {
      await execa('limactl', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  protected async doInitialize(_options: ProviderInitOptions): Promise<void> {
    this.showDeprecationWarning();
  }

  private showDeprecationWarning(): void {
    if (!this.deprecationWarningShown) {
      console.warn(LIMA_DEPRECATION_WARNING);
      this.deprecationWarningShown = true;
    }
  }

  async createEnvironment(session: Session): Promise<EnvironmentHandle> {
    this.showDeprecationWarning();

    const id = randomUUID();

    // Check if Lima instance is running
    const isRunning = await this.isInstanceRunning();

    if (!isRunning) {
      // Start the instance
      await this.startInstance(session.projectDir);
    }

    return {
      id,
      provider: 'lima',
    };
  }

  async stopEnvironment(handle: EnvironmentHandle): Promise<void> {
    // Stop any running exec process
    const process = this.processes.get(handle.id);
    if (process) {
      process.kill('SIGTERM');
      this.processes.delete(handle.id);
    }

    // Note: We don't stop the Lima instance itself
  }

  async execute(
    handle: EnvironmentHandle,
    command: string[],
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    this.ensureInitialized();

    const limaArgs = ['shell', RAPID_LIMA_INSTANCE, '--'];

    // Add working directory by prefixing with cd
    if (options.cwd) {
      limaArgs.push('cd', options.cwd, '&&');
    }

    limaArgs.push(...command);

    // Build environment string
    const envPrefix: string[] = [];
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        envPrefix.push(`${key}=${value}`);
      }
    }

    const fullCommand =
      envPrefix.length > 0
        ? ['env', ...envPrefix, ...limaArgs.slice(limaArgs.indexOf('--') + 1)]
        : limaArgs;

    try {
      const proc = execa('limactl', fullCommand, {
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
  }

  /**
   * Check if Lima instance is running
   */
  private async isInstanceRunning(): Promise<boolean> {
    try {
      const { stdout } = await execa('limactl', ['list', '--json', RAPID_LIMA_INSTANCE]);
      const instances = JSON.parse(stdout);
      return instances.some(
        (i: { name: string; status: string }) =>
          i.name === RAPID_LIMA_INSTANCE && i.status === 'Running'
      );
    } catch {
      return false;
    }
  }

  /**
   * Start the Lima instance
   */
  private async startInstance(_projectDir: string): Promise<void> {
    try {
      // Check if instance exists
      const { stdout } = await execa('limactl', ['list', '--json']);
      const instances = JSON.parse(stdout);
      const exists = instances.some((i: { name: string }) => i.name === RAPID_LIMA_INSTANCE);

      if (!exists) {
        throw new Error(
          `Lima instance '${RAPID_LIMA_INSTANCE}' does not exist. ` +
            'Run `rapid lima start` to create it.'
        );
      }

      // Start the instance
      await execa('limactl', ['start', RAPID_LIMA_INSTANCE], {
        stdio: 'inherit',
      });
    } catch (error) {
      throw new Error(
        `Failed to start Lima instance: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Stop the Lima instance
   */
  async stopInstance(): Promise<void> {
    try {
      await execa('limactl', ['stop', RAPID_LIMA_INSTANCE]);
    } catch {
      // Instance may not be running
    }
  }
}
