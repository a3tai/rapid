/**
 * rapid status - Show environment status
 */

import { Command } from 'commander';
import {
  loadConfig,
  checkAllAgents,
  logger,
  getContainerStatus,
  hasDevcontainerCli,
  hasDocker,
  loadDevcontainerConfig,
} from '@a3t/rapid-core';
import ora from 'ora';

export const statusCommand = new Command('status')
  .description('Show environment status')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const spinner = ora('Checking status...').start();

      // Load config
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found');
        if (options.json) {
          console.log(JSON.stringify({ configured: false }, null, 2));
        }
        process.exit(1);
      }

      const { config, filepath, rootDir } = loaded;

      // Check container status
      spinner.text = 'Checking container...';
      const containerStatus = await getContainerStatus(rootDir, config);
      const devcontainerConfig = await loadDevcontainerConfig(rootDir, config);
      const hasDevCli = await hasDevcontainerCli();
      const dockerRunning = await hasDocker();

      // Check agents
      spinner.text = 'Checking agents...';
      const agentStatuses = await checkAllAgents(config);

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify({
          configured: true,
          configPath: filepath,
          rootDir,
          defaultAgent: config.agents.default,
          container: {
            configured: !!devcontainerConfig,
            running: containerStatus.running,
            name: containerStatus.containerName,
            devcontainerCli: hasDevCli,
            docker: dockerRunning,
          },
          agents: agentStatuses,
        }, null, 2));
        return;
      }

      // Pretty output
      console.log();
      console.log(`  ${logger.brand('RAPID')} Status`);
      console.log(`  ${logger.dim('─'.repeat(24))}`);
      console.log();

      console.log(`  ${logger.dim('Config:')}      ${filepath}`);
      console.log(`  ${logger.dim('Root:')}        ${rootDir}`);
      console.log();

      // Container status
      console.log(`  ${logger.dim('Container:')}`);
      if (!devcontainerConfig) {
        console.log(`    ${logger.dim('○')} ${logger.dim('No devcontainer.json configured')}`);
      } else if (!dockerRunning) {
        console.log(`    ${logger.dim('○')} ${logger.dim('Docker not running')}`);
      } else if (!hasDevCli) {
        console.log(`    ${logger.dim('○')} ${logger.dim('devcontainer CLI not installed')}`);
      } else if (containerStatus.running) {
        console.log(`    ${logger.brand('●')} Running ${logger.dim(`(${containerStatus.containerName})`)}`);
      } else if (containerStatus.exists) {
        console.log(`    ${logger.dim('○')} Stopped ${logger.dim(`(${containerStatus.containerName})`)}`);
      } else {
        console.log(`    ${logger.dim('○')} Not started`);
      }
      console.log();

      // Agent status
      console.log(`  ${logger.dim('Agents:')}      ${logger.dim(`(default: ${config.agents.default})`)}`);
      agentStatuses.forEach((status) => {
        const isDefault = status.name === config.agents.default;
        const icon = status.available ? logger.brand('✓') : logger.dim('○');
        const name = isDefault ? logger.bold(status.name) : status.name;
        const version = status.version ? logger.dim(` (${status.version})`) : '';

        console.log(`    ${icon} ${name}${version}`);
      });

      console.log();

      // Quick actions
      if (!containerStatus.running && devcontainerConfig && dockerRunning && hasDevCli) {
        logger.info('Run `rapid start` to start the container');
      } else if (containerStatus.running) {
        logger.info('Run `rapid dev` to start coding');
      }
      console.log();

    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
