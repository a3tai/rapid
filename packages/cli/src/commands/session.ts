/**
 * rapid session - Manage daemon sessions
 */

import { Command } from 'commander';
import { logger } from '@a3t/rapid-core';
import ora from 'ora';

export const sessionCommand = new Command('session')
  .description('Manage agent sessions')
  .addCommand(
    new Command('list')
      .alias('ls')
      .description('List all sessions')
      .option('--json', 'Output as JSON')
      .option('--running', 'Only show running sessions')
      .action(async (options) => {
        try {
          const spinner = ora('Fetching sessions...').start();

          const { isDaemonRunning } = await import('@a3t/rapid-daemon');
          const { DaemonClient } = await import('../client/daemon-client.js');

          if (!(await isDaemonRunning())) {
            spinner.fail('Daemon is not running');
            logger.info('Run `rapid daemon start` to start the daemon');
            process.exit(1);
          }

          const client = new DaemonClient();
          await client.connect();

          const sessions = await client.listSessions();
          await client.disconnect();

          spinner.stop();

          const filtered = options.running
            ? sessions.filter((s: { state: string }) => s.state === 'running')
            : sessions;

          if (options.json) {
            console.log(JSON.stringify(filtered, null, 2));
            return;
          }

          console.log();
          console.log(`  ${logger.brand('RAPID')} Sessions`);
          console.log(`  ${logger.dim('─'.repeat(28))}`);
          console.log();

          if (filtered.length === 0) {
            console.log(`  ${logger.dim('No sessions')}`);
          } else {
            for (const session of filtered) {
              const stateIcon =
                session.state === 'running'
                  ? logger.brand('●')
                  : session.state === 'error'
                    ? '✕'
                    : logger.dim('○');

              console.log(`  ${stateIcon} ${session.name}`);
              console.log(`    ${logger.dim('ID:')}       ${session.id.slice(0, 8)}`);
              console.log(`    ${logger.dim('Agent:')}    ${session.agent}`);
              console.log(`    ${logger.dim('Provider:')} ${session.provider}`);
              console.log(`    ${logger.dim('State:')}    ${session.state}`);

              if (session.pid) {
                console.log(`    ${logger.dim('PID:')}      ${session.pid}`);
              }

              if (session.error) {
                console.log(`    ${logger.dim('Error:')}    ${session.error}`);
              }

              console.log();
            }
          }

          console.log();
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('stop')
      .alias('kill')
      .description('Stop a session')
      .argument('<session-id>', 'Session ID or name')
      .action(async (sessionId: string) => {
        try {
          const spinner = ora('Stopping session...').start();

          const { isDaemonRunning } = await import('@a3t/rapid-daemon');
          const { DaemonClient } = await import('../client/daemon-client.js');

          if (!(await isDaemonRunning())) {
            spinner.fail('Daemon is not running');
            process.exit(1);
          }

          const client = new DaemonClient();
          await client.connect();

          try {
            const session = await client.stopSession(sessionId);
            spinner.succeed(`Session ${session.name} stopped`);
          } catch (error) {
            spinner.fail('Failed to stop session');
            logger.error(error instanceof Error ? error.message : String(error));
          }

          await client.disconnect();
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('attach')
      .description('Attach to a running session')
      .argument('<session-id>', 'Session ID or name')
      .action(async (sessionId: string) => {
        try {
          const { isDaemonRunning } = await import('@a3t/rapid-daemon');
          const { DaemonClient } = await import('../client/daemon-client.js');

          if (!(await isDaemonRunning())) {
            logger.error('Daemon is not running');
            logger.info('Run `rapid daemon start` to start the daemon');
            process.exit(1);
          }

          const client = new DaemonClient();
          await client.connect();

          const session = await client.getSession(sessionId);

          if (!session) {
            logger.error(`Session not found: ${sessionId}`);
            await client.disconnect();
            process.exit(1);
          }

          if (session.state !== 'running') {
            logger.error(`Session is not running (state: ${session.state})`);
            await client.disconnect();
            process.exit(1);
          }

          // TODO: Implement PTY attach
          logger.info('Session attach is not yet implemented');
          logger.info(`Session ${session.name} is running with PID ${session.pid}`);

          await client.disconnect();
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('info')
      .description('Show session details')
      .argument('<session-id>', 'Session ID or name')
      .option('--json', 'Output as JSON')
      .action(async (sessionId: string, options) => {
        try {
          const spinner = ora('Fetching session...').start();

          const { isDaemonRunning } = await import('@a3t/rapid-daemon');
          const { DaemonClient } = await import('../client/daemon-client.js');

          if (!(await isDaemonRunning())) {
            spinner.fail('Daemon is not running');
            process.exit(1);
          }

          const client = new DaemonClient();
          await client.connect();

          const session = await client.getSession(sessionId);
          await client.disconnect();

          spinner.stop();

          if (!session) {
            logger.error(`Session not found: ${sessionId}`);
            process.exit(1);
          }

          if (options.json) {
            console.log(JSON.stringify(session, null, 2));
            return;
          }

          console.log();
          console.log(`  ${logger.brand('RAPID')} Session: ${session.name}`);
          console.log(`  ${logger.dim('─'.repeat(28))}`);
          console.log();

          console.log(`  ${logger.dim('ID:')}         ${session.id}`);
          console.log(`  ${logger.dim('Name:')}       ${session.name}`);
          console.log(`  ${logger.dim('Agent:')}      ${session.agent}`);
          console.log(`  ${logger.dim('Provider:')}   ${session.provider}`);
          console.log(`  ${logger.dim('State:')}      ${session.state}`);
          console.log(`  ${logger.dim('Project:')}    ${session.projectDir}`);

          if (session.pid) {
            console.log(`  ${logger.dim('PID:')}        ${session.pid}`);
          }

          console.log(
            `  ${logger.dim('Created:')}    ${new Date(session.createdAt).toLocaleString()}`
          );

          if (session.startedAt) {
            console.log(
              `  ${logger.dim('Started:')}    ${new Date(session.startedAt).toLocaleString()}`
            );
          }

          if (session.stoppedAt) {
            console.log(
              `  ${logger.dim('Stopped:')}    ${new Date(session.stoppedAt).toLocaleString()}`
            );
          }

          if (session.error) {
            console.log(`  ${logger.dim('Error:')}      ${session.error}`);
          }

          console.log();
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  );
