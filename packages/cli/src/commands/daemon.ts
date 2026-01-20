/**
 * rapid daemon - Manage background daemon
 */

import { Command } from 'commander';
import { logger } from '@a3t/rapid-core';
import ora from 'ora';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_SOCKET_PATH = join(homedir(), '.rapid', 'rapid.sock');

export const daemonCommand = new Command('daemon')
  .description('Manage RAPID background daemon')
  .addCommand(
    new Command('start')
      .description('Start the daemon')
      .option('--verbose', 'Enable verbose logging')
      .option('--http-port <port>', 'Enable HTTP API on specified port')
      .action(async (options) => {
        try {
          const spinner = ora('Starting daemon...').start();

          const { isDaemonRunning } = await import('@a3t/rapid-daemon');

          // Check if already running
          if (await isDaemonRunning()) {
            spinner.info('Daemon is already running');
            return;
          }

          // Fork daemon process
          const { spawn } = await import('node:child_process');
          const { fileURLToPath } = await import('node:url');
          const { dirname } = await import('node:path');

          // Get path to daemon bin
          const daemonBin = join(
            dirname(fileURLToPath(import.meta.url)),
            '..',
            '..',
            'node_modules',
            '@a3t',
            'rapid-daemon',
            'dist',
            'bin.js'
          );

          const args = ['foreground'];
          if (options.verbose) args.push('--verbose');
          if (options.httpPort) args.push('--http-port', options.httpPort);

          const child = spawn(process.execPath, [daemonBin, ...args], {
            detached: true,
            stdio: 'ignore',
          });

          child.unref();

          // Wait for daemon to be ready
          await new Promise((resolve) => setTimeout(resolve, 1000));

          if (await isDaemonRunning()) {
            spinner.succeed(`Daemon started (PID: ${child.pid})`);
          } else {
            spinner.fail('Daemon failed to start');
            process.exit(1);
          }
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('stop').description('Stop the daemon').action(async () => {
      try {
        const spinner = ora('Stopping daemon...').start();

        const { getDaemonPid } = await import('@a3t/rapid-daemon');

        const pid = await getDaemonPid();

        if (!pid) {
          spinner.info('Daemon is not running');
          return;
        }

        try {
          process.kill(pid, 'SIGTERM');
          spinner.succeed(`Daemon stopped (PID: ${pid})`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
            spinner.info('Daemon is not running (stale PID file)');
          } else {
            throw error;
          }
        }
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    })
  )
  .addCommand(
    new Command('status')
      .description('Show daemon status')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          const { isDaemonRunning, getDaemonPid } = await import('@a3t/rapid-daemon');

          const running = await isDaemonRunning();
          const pid = await getDaemonPid();

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  running,
                  pid,
                  socketPath: DEFAULT_SOCKET_PATH,
                },
                null,
                2
              )
            );
            return;
          }

          console.log();
          console.log(`  ${logger.brand('RAPID')} Daemon Status`);
          console.log(`  ${logger.dim('─'.repeat(28))}`);
          console.log();

          if (running && pid) {
            console.log(`    ✓ ${logger.brand('Running')}`);
            console.log(`    ${logger.dim('PID:')}     ${pid}`);
            console.log(`    ${logger.dim('Socket:')}  ${DEFAULT_SOCKET_PATH}`);
          } else if (pid) {
            console.log(`    ○ ${logger.dim('Stopped')} (stale PID file)`);
          } else {
            console.log(`    ○ ${logger.dim('Stopped')}`);
          }

          console.log();
          console.log(`  ${logger.brand('Quick Actions')}`);
          console.log(`  ${logger.dim('─'.repeat(20))}`);
          if (running) {
            console.log(`    • rapid daemon stop      ${logger.dim('Stop the daemon')}`);
            console.log(`    • rapid daemon restart   ${logger.dim('Restart the daemon')}`);
          } else {
            console.log(`    • rapid daemon start     ${logger.dim('Start the daemon')}`);
            console.log(`    • rapid start            ${logger.dim('Start full environment')}`);
          }
          console.log();
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('restart').description('Restart the daemon').action(async () => {
      try {
        const { isDaemonRunning, getDaemonPid } = await import('@a3t/rapid-daemon');
        const { spawn } = await import('node:child_process');
        const { fileURLToPath } = await import('node:url');
        const { dirname } = await import('node:path');

        const spinner = ora('Restarting daemon...').start();

        // Stop if running
        const pid = await getDaemonPid();
        if (pid) {
          try {
            process.kill(pid, 'SIGTERM');
            // Wait for shutdown
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch {
            // Process may not exist
          }
        }

        // Start daemon
        const daemonBin = join(
          dirname(fileURLToPath(import.meta.url)),
          '..',
          '..',
          'node_modules',
          '@a3t',
          'rapid-daemon',
          'dist',
          'bin.js'
        );

        const child = spawn(process.execPath, [daemonBin, 'foreground'], {
          detached: true,
          stdio: 'ignore',
        });

        child.unref();

        // Wait for daemon to be ready
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (await isDaemonRunning()) {
          spinner.succeed(`Daemon restarted (PID: ${child.pid})`);
        } else {
          spinner.fail('Daemon failed to restart');
          process.exit(1);
        }
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    })
  );
