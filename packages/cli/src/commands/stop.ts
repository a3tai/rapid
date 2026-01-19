/**
 * rapid stop - Stop all RAPID services
 *
 * Stops:
 * - Dev container
 * - Event bus (Redis)
 * - Gateway
 */

import { Command } from 'commander';
import { loadConfig, logger, getContainerStatus, stopContainer } from '@a3t/rapid-core';
import { getRedisStatus, stopRedis } from '@a3t/rapid-eventbus';
import ora from 'ora';

export const stopCommand = new Command('stop')
  .description('Stop all RAPID services (container, event bus, gateway)')
  .option('--remove', 'Remove containers after stopping', false)
  .option('--services-only', 'Only stop services, not the container')
  .action(async (options) => {
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
      // Stop Dev Container
      // ─────────────────────────────────────────────────────────────
      if (!options.servicesOnly) {
        spinner.text = 'Checking container status...';
        const status = await getContainerStatus(rootDir, config);

        if (status.exists && status.running) {
          spinner.text = 'Stopping container...';
          const result = await stopContainer(rootDir, config, { remove: options.remove });

          if (result.success) {
            servicesStopped.push('Container');
          } else {
            logger.warn(`Failed to stop container: ${result.error}`);
          }
        } else if (status.exists && options.remove) {
          await stopContainer(rootDir, config, { remove: true });
          servicesStopped.push('Container (removed)');
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Stop Event Bus (Redis)
      // ─────────────────────────────────────────────────────────────
      spinner.text = 'Checking event bus...';
      const redisStatus = await getRedisStatus();

      if (redisStatus.running || redisStatus.containerId) {
        spinner.text = 'Stopping event bus...';
        await stopRedis(options.remove);
        servicesStopped.push(options.remove ? 'Event Bus (removed)' : 'Event Bus');
      }

      // ─────────────────────────────────────────────────────────────
      // Stop Gateway (placeholder)
      // ─────────────────────────────────────────────────────────────
      // TODO: Stop managed gateway if running

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
