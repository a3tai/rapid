/**
 * rapid status - Show environment status
 */

import { Command } from 'commander';
import { loadConfig, checkAllAgents, logger } from '@a3t/rapid-core';
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
          agents: agentStatuses,
        }, null, 2));
        return;
      }

      // Pretty output
      console.log();
      console.log(`  ${logger.brand('RAPID')} Status`);
      console.log(`  ${logger.dim('─'.repeat(20))}`);
      console.log();
      
      console.log(`  ${logger.dim('Config:')}     ${filepath}`);
      console.log(`  ${logger.dim('Root:')}       ${rootDir}`);
      console.log(`  ${logger.dim('Default:')}    ${config.agents.default}`);
      console.log();
      
      console.log(`  ${logger.dim('Agents:')}`);
      agentStatuses.forEach((status) => {
        const isDefault = status.name === config.agents.default;
        const icon = status.available ? logger.brand('✓') : logger.dim('○');
        const name = isDefault ? logger.bold(status.name) : status.name;
        const version = status.version ? logger.dim(` (${status.version})`) : '';
        const defaultTag = isDefault ? logger.dim(' [default]') : '';
        
        console.log(`    ${icon} ${name}${version}${defaultTag}`);
      });
      
      console.log();
      
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
