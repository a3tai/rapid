/**
 * rapid dev - Launch AI coding session
 */

import { Command } from 'commander';
import {
  loadConfig,
  getDefaultAgent,
  getAgent,
  checkAgentAvailable,
  launchAgent,
  logger,
} from '@a3t/rapid-core';
import ora from 'ora';

export const devCommand = new Command('dev')
  .description('Launch AI coding session')
  .option('-a, --agent <name>', 'Agent to use')
  .option('--list', 'List available agents without launching')
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

      // Check if agent CLI is available
      spinner.start(`Checking ${agentName} CLI...`);
      const status = await checkAgentAvailable(agent);
      
      if (!status.available) {
        spinner.fail(`${agentName} CLI not found`);
        if (agent.installCmd) {
          logger.info(`Install with: ${agent.installCmd}`);
        }
        process.exit(1);
      }
      
      spinner.succeed(`${agentName} ready ${status.version ? logger.dim(`(${status.version})`) : ''}`);

      // Launch the agent
      logger.blank();
      logger.info(`Launching ${logger.brand(agentName)}...`);
      logger.dim(`Working directory: ${rootDir}`);
      logger.blank();

      await launchAgent(agent, {
        cwd: rootDir,
        stdio: 'inherit',
      });

    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

function listAgents(config: { agents: { default: string; available: Record<string, unknown> } }): void {
  logger.header('Available Agents');
  
  Object.keys(config.agents.available).forEach((name) => {
    const isDefault = name === config.agents.default;
    console.log(`  ${isDefault ? logger.brand('*') : ' '} ${name}${isDefault ? logger.dim(' (default)') : ''}`);
  });
  
  logger.blank();
  logger.dim('Use --agent <name> to select a specific agent');
}
