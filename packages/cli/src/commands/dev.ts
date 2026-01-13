/**
 * rapid dev - Launch AI coding session inside the dev container
 */

import { Command } from 'commander';
import {
  loadConfig,
  getDefaultAgent,
  getAgent,
  checkAgentAvailable,
  logger,
  getContainerStatus,
  startContainer,
  execInContainer,
  hasDevcontainerCli,
} from '@a3t/rapid-core';
import ora from 'ora';

export const devCommand = new Command('dev')
  .description('Launch AI coding session in the dev container')
  .option('-a, --agent <name>', 'Agent to use')
  .option('--list', 'List available agents without launching')
  .option('--local', 'Run locally instead of in container (not recommended)')
  .option('--no-start', 'Do not auto-start container if stopped')
  .action(async (options) => {
    try {
      // Load config
      const spinner = ora('Loading configuration...').start();
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found. Run `rapid init` first.');
        process.exit(1);
      }

      const { config, rootDir } = loaded;
      spinner.succeed('Configuration loaded');

      // List mode
      if (options.list) {
        listAgents(config);
        return;
      }

      // Get the agent to use
      const agentName = options.agent || config.agents.default;
      const agent = getAgent(config, agentName);

      if (!agent) {
        logger.error(`Agent "${agentName}" not found in configuration`);
        logger.info('Available agents:');
        Object.keys(config.agents.available).forEach((name) => {
          const isDefault = name === config.agents.default;
          console.log(`  ${isDefault ? '* ' : '  '}${name}${isDefault ? ' (default)' : ''}`);
        });
        process.exit(1);
      }

      // Check if running locally (not recommended)
      if (options.local) {
        logger.warn('Running locally instead of in container');
        logger.dim('This bypasses the isolated dev environment');
        logger.blank();
        await runLocally(agent, agentName, rootDir);
        return;
      }

      // Check for devcontainer CLI
      const hasDevCli = await hasDevcontainerCli();
      if (!hasDevCli) {
        logger.error('devcontainer CLI not found');
        logger.info('Install with: npm install -g @devcontainers/cli');
        logger.blank();
        logger.info('Or use --local to run without container (not recommended)');
        process.exit(1);
      }

      // Check container status
      spinner.start('Checking container status...');
      const status = await getContainerStatus(rootDir, config);

      if (!status.running) {
        if (options.start === false) {
          spinner.fail('Container not running. Use `rapid start` first.');
          process.exit(1);
        }

        // Auto-start the container
        spinner.text = 'Starting container...';
        spinner.stopAndPersist({ symbol: '🐳', text: 'Starting container...' });

        const result = await startContainer(rootDir, config, { quiet: false });
        if (!result.success) {
          logger.blank();
          logger.error('Failed to start container');
          logger.error(result.error || 'Unknown error');
          process.exit(1);
        }
        logger.blank();
      } else {
        spinner.succeed(`Container running (${status.containerName})`);
      }

      // Launch the agent inside the container
      logger.blank();
      logger.info(`Launching ${logger.brand(agentName)} in container...`);
      logger.blank();

      const agentArgs = [agent.cli, ...(agent.args || [])];
      
      await execInContainer(rootDir, agentArgs, config, {
        interactive: true,
        tty: true,
      });

    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Run agent locally (fallback, not recommended)
 */
async function runLocally(
  agent: { cli: string; args?: string[] },
  agentName: string,
  rootDir: string
): Promise<void> {
  const { execa } = await import('execa');

  // Check if agent CLI is available locally
  const status = await checkAgentAvailable(agent);
  if (!status.available) {
    logger.error(`${agentName} CLI not found locally`);
    process.exit(1);
  }

  logger.info(`Launching ${logger.brand(agentName)}...`);
  logger.dim(`Working directory: ${rootDir}`);
  logger.blank();

  await execa(agent.cli, agent.args || [], {
    cwd: rootDir,
    stdio: 'inherit',
  });
}

function listAgents(config: { agents: { default: string; available: Record<string, unknown> } }): void {
  logger.header('Available Agents');

  Object.keys(config.agents.available).forEach((name) => {
    const isDefault = name === config.agents.default;
    console.log(`  ${isDefault ? logger.brand('*') : ' '} ${name}${isDefault ? logger.dim(' (default)') : ''}`);
  });

  logger.blank();
  logger.dim('Use --agent <name> to select a specific agent');
}
