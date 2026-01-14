/**
 * RAPID CLI
 */

import { Command } from 'commander';
import { setLogLevel, logger } from '@a3t/rapid-core';

import { initCommand } from './commands/init.js';
import { devCommand } from './commands/dev.js';
import { statusCommand } from './commands/status.js';
import { agentCommand } from './commands/agent.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { secretsCommand } from './commands/secrets.js';

const VERSION = '0.1.0';

export const program = new Command();

program
  .name('rapid')
  .description('AI-assisted development with dev containers')
  .version(VERSION, '-v, --version', 'Show version')
  .option('--verbose', 'Verbose output')
  .option('-q, --quiet', 'Minimal output')
  .option('--config <path>', 'Path to rapid.json')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setLogLevel('debug');
    } else if (opts.quiet) {
      setLogLevel('error');
    }
  });

// Register commands
program.addCommand(initCommand);
program.addCommand(startCommand);
program.addCommand(devCommand);
program.addCommand(stopCommand);
program.addCommand(statusCommand);
program.addCommand(agentCommand);
program.addCommand(secretsCommand);

// Default action - show help
program.action(() => {
  console.log();
  console.log(`  ${logger.brand('RAPID')} ${logger.dim(`v${VERSION}`)}`);
  console.log(`  ${logger.dim('AI-assisted development with dev containers')}`);
  console.log();
  program.help();
});
