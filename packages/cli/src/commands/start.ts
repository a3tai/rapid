/**
 * rapid start - Start all RAPID services based on rapid.json config
 *
 * Orchestrates:
 * - Event bus (Redis in Docker) when eventBus.enabled
 * - LLM Gateway when gateway.enabled
 * - Dev container when container configured
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
import { startRedis, getRedisStatus } from '@a3t/rapid-eventbus';
import ora from 'ora';

export const startCommand = new Command('start')
  .description('Start all RAPID services (event bus, gateway, container)')
  .option('--rebuild', 'Force rebuild the container', false)
  .option('--no-cache', 'Build without Docker cache', false)
  .option('--no-container', 'Skip starting the dev container')
  .option('--services-only', 'Only start services (event bus, gateway), not the container')
  .action(async (options) => {
    const spinner = ora('Starting RAPID environment...').start();

    try {
      // Load config
      spinner.text = 'Loading configuration...';
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found. Run `rapid init` first.');
        process.exit(1);
      }

      const { config, rootDir } = loaded;
      const servicesStarted: string[] = [];

      // Check Docker availability (needed for event bus and container)
      spinner.text = 'Checking Docker...';
      const dockerAvailable = await hasDocker();

      // ─────────────────────────────────────────────────────────────
      // Start Event Bus (Redis) if enabled
      // ─────────────────────────────────────────────────────────────
      if (config.eventBus?.enabled) {
        spinner.text = 'Starting event bus...';

        if (!dockerAvailable) {
          spinner.warn('Event bus enabled but Docker not available');
        } else {
          try {
            const redisStatus = await getRedisStatus();

            if (redisStatus.running) {
              servicesStarted.push(`Event Bus (${redisStatus.url})`);
            } else {
              const status = await startRedis({
                port: config.eventBus.redis?.url
                  ? parseInt(new URL(config.eventBus.redis.url).port || '6379', 10)
                  : 6379,
              });

              if (status.running) {
                servicesStarted.push(`Event Bus (${status.url})`);
              }
            }
          } catch (error) {
            logger.warn(
              `Failed to start event bus: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Start Gateway if enabled (placeholder for now)
      // ─────────────────────────────────────────────────────────────
      if (config.gateway?.enabled) {
        spinner.text = 'Starting gateway...';

        if (config.gateway.mode === 'managed') {
          // TODO: Start managed LiteLLM gateway in Docker
          logger.debug('Managed gateway not yet implemented');
        } else if (config.gateway.mode === 'external') {
          // External gateway - just verify it's accessible
          servicesStarted.push(`Gateway (${config.gateway.config?.baseUrl || 'external'})`);
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Start Dev Container if configured
      // ─────────────────────────────────────────────────────────────
      const skipContainer = options.servicesOnly || options.container === false;

      if (!skipContainer) {
        // Check for devcontainer CLI
        spinner.text = 'Checking devcontainer CLI...';
        const hasDevCli = await hasDevcontainerCli();

        if (!hasDevCli) {
          spinner.text = 'Devcontainer CLI not found, skipping container';
          logger.debug('Install with: npm install -g @devcontainers/cli');
        } else if (!dockerAvailable) {
          spinner.text = 'Docker not running, skipping container';
        } else {
          // Check for devcontainer.json
          spinner.text = 'Checking devcontainer configuration...';
          const devcontainerConfig = await loadDevcontainerConfig(rootDir, config);

          if (!devcontainerConfig) {
            logger.debug('No devcontainer.json found, skipping container');
          } else {
            // Check current status
            spinner.text = 'Checking container status...';
            const status = await getContainerStatus(rootDir, config);

            if (status.running && !options.rebuild) {
              servicesStarted.push(`Container (${status.containerName})`);
            } else {
              // Start the container
              spinner.text = options.rebuild ? 'Rebuilding container...' : 'Starting container...';
              spinner.stopAndPersist({ symbol: '🐳', text: spinner.text });

              const result = await startContainer(rootDir, config, {
                rebuild: options.rebuild,
                quiet: false,
              });

              if (result.success) {
                servicesStarted.push('Container');
              } else {
                logger.warn(`Container failed to start: ${result.error}`);
              }
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Summary
      // ─────────────────────────────────────────────────────────────
      spinner.stop();
      logger.blank();

      if (servicesStarted.length > 0) {
        logger.success('RAPID environment ready!');
        logger.blank();

        console.log(`  ${logger.brand('Services running:')}`);
        for (const service of servicesStarted) {
          console.log(`    ${logger.dim('•')} ${service}`);
        }
        logger.blank();

        console.log(`  ${logger.dim('Next steps:')}`);
        console.log(`    ${logger.dim('•')} Run ${logger.brand('rapid dev')} to start coding`);
        console.log(
          `    ${logger.dim('•')} Run ${logger.brand('rapid status')} to see full status`
        );
        console.log(`    ${logger.dim('•')} Run ${logger.brand('rapid stop')} when done`);
      } else {
        logger.info('No services to start.');
        logger.blank();
        logger.info('Configure services in rapid.json:');
        console.log(
          `    ${logger.dim('•')} eventBus.enabled: true  ${logger.dim('# Inter-agent communication')}`
        );
        console.log(
          `    ${logger.dim('•')} gateway.enabled: true   ${logger.dim('# LLM cost tracking')}`
        );
        console.log(
          `    ${logger.dim('•')} Add .devcontainer/      ${logger.dim('# Sandboxed development')}`
        );
      }

      logger.blank();
    } catch (error) {
      spinner.fail('Failed to start environment');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
