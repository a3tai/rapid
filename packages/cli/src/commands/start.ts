/**
 * rapid start - Start the development container
 */

import { Command } from 'commander';
import {
  loadConfig,
  logger,
  hasDevcontainerCli,
  hasDocker,
  loadDevcontainerConfig,
  getContainerStatus,
  startContainer,
} from '@a3t/rapid-core';
import ora from 'ora';

export const startCommand = new Command('start')
  .description('Start the development container')
  .option('--rebuild', 'Force rebuild the container', false)
  .option('--no-cache', 'Build without Docker cache', false)
  .action(async (options) => {
    const spinner = ora('Starting development environment...').start();

    try {
      // Load config
      spinner.text = 'Loading configuration...';
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found. Run `rapid init` first.');
        process.exit(1);
      }

      const { config, rootDir } = loaded;

      // Check for devcontainer CLI
      spinner.text = 'Checking devcontainer CLI...';
      const hasDevCli = await hasDevcontainerCli();
      if (!hasDevCli) {
        spinner.fail('devcontainer CLI not found');
        logger.blank();
        logger.info('Install with:');
        console.log('  npm install -g @devcontainers/cli');
        logger.blank();
        process.exit(1);
      }

      // Check Docker
      spinner.text = 'Checking Docker...';
      const dockerAvailable = await hasDocker();
      if (!dockerAvailable) {
        spinner.fail('Docker is not running');
        logger.info('Please start Docker Desktop and try again.');
        process.exit(1);
      }

      // Check for devcontainer.json
      spinner.text = 'Checking devcontainer configuration...';
      const devcontainerConfig = await loadDevcontainerConfig(rootDir, config);
      if (!devcontainerConfig) {
        spinner.fail('No devcontainer.json found');
        logger.blank();
        logger.info('Create a .devcontainer/devcontainer.json or run:');
        console.log('  rapid init --template <template>');
        logger.blank();
        process.exit(1);
      }

      // Check current status
      spinner.text = 'Checking container status...';
      const status = await getContainerStatus(rootDir, config);

      if (status.running && !options.rebuild) {
        spinner.succeed('Container already running');
        logger.info(`Container: ${status.containerName}`);
        logger.blank();
        logger.info('Run `rapid dev` to start coding');
        return;
      }

      // Start the container
      spinner.text = options.rebuild ? 'Rebuilding container...' : 'Starting container...';
      spinner.stopAndPersist({ symbol: '🐳', text: spinner.text });

      const result = await startContainer(rootDir, config, {
        rebuild: options.rebuild,
        quiet: false,
      });

      if (!result.success) {
        logger.blank();
        logger.error('Failed to start container');
        logger.error(result.error || 'Unknown error');
        process.exit(1);
      }

      logger.blank();
      logger.success('Development environment ready!');
      logger.blank();
      logger.info('Next steps:');
      console.log(`  ${logger.dim('•')} Run ${logger.brand('rapid dev')} to start coding`);
      console.log(`  ${logger.dim('•')} Run ${logger.brand('rapid stop')} when done`);
      logger.blank();

    } catch (error) {
      spinner.fail('Failed to start environment');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
