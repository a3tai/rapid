/**
 * rapid agent - Manage AI agents
 */

import { writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { loadConfig, checkAllAgents, logger } from '@a3t/rapid-core';

export const agentCommand = new Command('agent').description('Manage AI agents');

// rapid agent list
agentCommand
  .command('list')
  .description('List available agents')
  .action(async () => {
    try {
      const loaded = await loadConfig();

      if (!loaded) {
        logger.error('No rapid.json found. Run `rapid init` first.');
        process.exit(1);
      }

      const { config } = loaded;
      const statuses = await checkAllAgents(config);

      logger.header('Available Agents');

      statuses.forEach((status) => {
        const isDefault = status.name === config.agents.default;
        const icon = status.available ? '✓' : '○';
        const defaultTag = isDefault ? ' (default)' : '';
        const versionTag = status.version ? ` - ${status.version}` : '';

        if (status.available) {
          console.log(
            `  ${logger.brand(icon)} ${status.name}${defaultTag}${logger.dim(versionTag)}`
          );
        } else {
          console.log(
            `  ${logger.dim(icon)} ${logger.dim(status.name)}${defaultTag} ${logger.dim('[not installed]')}`
          );
        }
      });

      logger.blank();
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// rapid agent default
agentCommand
  .command('default [name]')
  .description('Get or set default agent')
  .action(async (name) => {
    try {
      const loaded = await loadConfig();

      if (!loaded) {
        logger.error('No rapid.json found. Run `rapid init` first.');
        process.exit(1);
      }

      const { config } = loaded;

      if (!name) {
        // Show current default
        console.log(config.agents.default);
        return;
      }

      // Check if agent exists
      if (!config.agents.available[name]) {
        logger.error(`Agent "${name}" not found in configuration`);
        logger.info('Available agents:');
        Object.keys(config.agents.available).forEach((n) => {
          console.log(`  - ${n}`);
        });
        process.exit(1);
      }

      // Update and save the config
      config.agents.default = name;
      await writeFile(loaded.filepath, JSON.stringify(config, null, 2) + '\n');
      logger.success(`Default agent set to "${name}"`);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
