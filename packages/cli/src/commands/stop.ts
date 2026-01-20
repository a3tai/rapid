/**
 * rapid stop - Stop all RAPID services
 *
 * Stops the RAPID services stack:
 * - Event bus (Redis)
 * - MCP Server
 * - Gateway (LiteLLM)
 * - Daemon
 * - Dev container
 */

import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, logger, getContainerStatus, stopContainer } from '@a3t/rapid-core';
import ora from 'ora';
import { execa } from 'execa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find the docker directory containing docker-compose.yml
 */
function findDockerDir(): string | null {
  const possiblePaths = [
    join(__dirname, '..', '..', '..', '..', '..', 'docker'),
    join(__dirname, '..', '..', '..', '..', 'docker'),
    join(__dirname, '..', '..', '..', 'docker'),
    join(process.cwd(), 'docker'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(join(p, 'docker-compose.yml'))) {
      return p;
    }
  }

  return null;
}

/**
 * Get docker compose command (v2 or v1)
 */
async function getDockerComposeCmd(): Promise<string[]> {
  try {
    await execa('docker', ['compose', 'version']);
    return ['docker', 'compose'];
  } catch {
    return ['docker-compose'];
  }
}

/**
 * Stop RAPID services using docker compose
 */
async function stopServices(
  dockerDir: string,
  options: { remove?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const composeCmd = await getDockerComposeCmd();
  const composeFile = join(dockerDir, 'docker-compose.yml');

  const args = [...composeCmd.slice(1), '-f', composeFile, 'down'];

  if (options.remove) {
    args.push('-v', '--rmi', 'local');
  }

  const cmd = composeCmd[0];
  if (!cmd) {
    return { success: false, error: 'No docker compose command found' };
  }

  try {
    await execa(cmd, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        COMPOSE_PROJECT_NAME: 'rapid-services',
      },
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if any RAPID services are running
 */
async function getRunningServices(): Promise<string[]> {
  try {
    const { stdout } = await execa('docker', [
      'ps',
      '--format',
      '{{.Names}}',
      '--filter',
      'name=rapid-',
    ]);
    return stdout.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Clean up agent worktrees
 */
async function pruneWorktrees(projectDir: string): Promise<{ cleaned: number; failed: number }> {
  try {
    // List all worktrees
    const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], {
      cwd: projectDir,
      reject: false,
    });

    const worktrees = stdout
      .split('\n')
      .filter(Boolean)
      .filter((line) => line.startsWith('worktree'))
      .map((line) => {
        const parts = line.split(' ');
        return parts[1];
      });

    let cleaned = 0;
    let failed = 0;

    for (const worktree of worktrees) {
      // Skip main worktree
      if (worktree.includes('.git') || !worktree.includes('.worktrees')) {
        continue;
      }

      try {
        // Check if branch is merged to main
        const { exitCode } = await execa('git', ['branch', '--merged', 'main', '-q'], {
          cwd: projectDir,
          reject: false,
          stdio: 'pipe',
        });

        if (exitCode === 0) {
          // Branch is merged, safe to remove
          await execa('git', ['worktree', 'remove', worktree], {
            cwd: projectDir,
            reject: false,
          });
          cleaned++;
        }
      } catch {
        failed++;
      }
    }

    return { cleaned, failed };
  } catch {
    return { cleaned: 0, failed: 0 };
  }
}

export const stopCommand = new Command('stop')
  .description('Stop all RAPID services (container, event bus, gateway)')
  .option('--remove', 'Remove containers and volumes after stopping', false)
  .option('--services-only', 'Only stop services, not the dev container')
  .option('--prune-worktrees', 'Automatically clean up merged agent worktrees', false)
  .action(async (options: { remove?: boolean; servicesOnly?: boolean; pruneWorktrees?: boolean }) => {
    const spinner = ora('Stopping RAPID environment...').start();

    try {
      // Load config
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found');
        process.exit(1);
      }

      const { config, rootDir } = loaded;
      const servicesStopped: string[] = [];

      // ─────────────────────────────────────────────────────────────
      // Clean up worktrees if requested
      // ─────────────────────────────────────────────────────────────
      if (options.pruneWorktrees) {
        spinner.text = 'Cleaning up agent worktrees...';
        const pruneResult = await pruneWorktrees(rootDir);
        if (pruneResult.cleaned > 0) {
          servicesStopped.push(`Agent Worktrees (cleaned: ${pruneResult.cleaned})`);
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Stop Dev Container first
      // ─────────────────────────────────────────────────────────────
      if (!options.servicesOnly) {
        spinner.text = 'Checking container status...';
        const status = await getContainerStatus(rootDir, config);

        if (status.exists && status.running) {
          spinner.text = 'Stopping dev container...';
          const result = await stopContainer(rootDir, config, { remove: options.remove });

          if (result.success) {
            servicesStopped.push('Dev Container');
          } else {
            logger.warn(`Failed to stop container: ${result.error}`);
          }
        } else if (status.exists && options.remove) {
          await stopContainer(rootDir, config, { remove: true });
          servicesStopped.push('Dev Container (removed)');
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Stop RAPID Services Stack
      // ─────────────────────────────────────────────────────────────
      const dockerDir = findDockerDir();

      if (dockerDir) {
        // Check if any services are running
        const runningServices = await getRunningServices();

        if (runningServices.length > 0) {
          spinner.text = 'Stopping RAPID services...';
          spinner.stopAndPersist({ symbol: '🛑', text: 'Stopping RAPID services...' });

          const result = await stopServices(dockerDir, { remove: options.remove });

          if (result.success) {
            if (runningServices.includes('rapid-redis')) servicesStopped.push('Event Bus');
            if (runningServices.includes('rapid-mcp')) servicesStopped.push('MCP Server');
            if (runningServices.includes('rapid-gateway')) servicesStopped.push('Gateway');
            if (runningServices.includes('rapid-daemon')) servicesStopped.push('Daemon');
          } else {
            logger.warn(`Failed to stop services: ${result.error}`);
          }
        }
      } else {
        // Fall back to stopping standalone Redis
        spinner.text = 'Checking event bus...';
        const { getRedisStatus, stopRedis } = await import('@a3t/rapid-eventbus');
        const redisStatus = await getRedisStatus();

        if (redisStatus.running || redisStatus.containerId) {
          spinner.text = 'Stopping event bus...';
          await stopRedis(options.remove);
          servicesStopped.push(options.remove ? 'Event Bus (removed)' : 'Event Bus');
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Summary
      // ─────────────────────────────────────────────────────────────
      spinner.stop();

      if (servicesStopped.length > 0) {
        logger.blank();
        logger.success('RAPID environment stopped');
        logger.blank();

        console.log(`  ${logger.dim('Stopped:')}`);
        for (const service of servicesStopped) {
          console.log(`    ${logger.dim('•')} ${service}`);
        }

        if (!options.remove) {
          logger.blank();
          console.log(`  ${logger.dim('Data preserved. Use --remove to delete all data.')}`);
        }

        logger.blank();
      } else {
        logger.blank();
        logger.info('No services were running');
        logger.blank();
      }
    } catch (error) {
      spinner.fail('Failed to stop environment');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
