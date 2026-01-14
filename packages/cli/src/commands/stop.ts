/**
 * rapid stop - Stop the development container
 */

import { Command } from 'commander';
import { loadConfig, logger, getContainerStatus, stopContainer } from '@a3t/rapid-core';
import ora from 'ora';

export const stopCommand = new Command('stop')
  .description('Stop the development container')
  .option('--remove', 'Remove container after stopping', false)
  .action(async (options) => {
    const spinner = ora('Stopping development environment...').start();

    try {
      // Load config
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found');
        process.exit(1);
      }

      const { config, rootDir } = loaded;

      // Check current status
      spinner.text = 'Checking container status...';
      const status = await getContainerStatus(rootDir, config);

      if (!status.exists) {
        spinner.succeed('No container to stop');
        return;
      }

      if (!status.running) {
        if (options.remove) {
          spinner.text = 'Removing container...';
          await stopContainer(rootDir, config, { remove: true });
          spinner.succeed('Container removed');
        } else {
          spinner.succeed('Container already stopped');
        }
        return;
      }

      // Stop the container
      spinner.text = 'Stopping container...';
      const result = await stopContainer(rootDir, config, { remove: options.remove });

      if (!result.success) {
        spinner.fail('Failed to stop container');
        logger.error(result.error || 'Unknown error');
        process.exit(1);
      }

      spinner.succeed(options.remove ? 'Container stopped and removed' : 'Container stopped');
    } catch (error) {
      spinner.fail('Failed to stop environment');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
