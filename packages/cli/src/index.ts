/**
 * RAPID CLI
 */

import { Command } from 'commander';
import { setLogLevel, logger } from '@a3t/rapid-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { initCommand } from './commands/init.js';
import { devCommand } from './commands/dev.js';
import { statusCommand } from './commands/status.js';
import { agentCommand } from './commands/agent.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { secretsCommand } from './commands/secrets.js';
import { authCommand } from './commands/auth.js';
import { mcpCommand } from './commands/mcp.js';
import { contextCommand } from './commands/context.js';
import { updateCommand } from './commands/update.js';
import { worktreeCommand } from './commands/worktree.js';
import { limaCommand } from './commands/lima.js';
import { checkpointCommand } from './commands/checkpoint.js';
import { busCommand } from './commands/bus.js';
import { gatewayCommand } from './commands/gateway.js';
import { sandboxCommand } from './commands/sandbox.js';
import { daemonCommand } from './commands/daemon.js';
import { sessionCommand } from './commands/session.js';
import { pluginCommand } from './commands/plugin.js';
import { rewindCommand } from './commands/rewind.js';
import { updateChecker } from './utils/update-checker.js';

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const VERSION = packageJson.version;

export const program = new Command();

program
  .name('rapid')
  .description('AI-assisted development with dev containers')
  .version(VERSION, '-v, --version', 'Show version')
  .option('--verbose', 'Verbose output')
  .option('-q, --quiet', 'Minimal output')
  .option('--config <path>', 'Path to rapid.json')
  .hook('preAction', async (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setLogLevel('debug');
    } else if (opts.quiet) {
      setLogLevel('error');
    }

    // Skip update check for the update command itself and version command
    if (thisCommand.name() === 'update' || thisCommand.name() === 'version') {
      return;
    }

    // Check for updates in the background
    try {
      await updateChecker.checkAndUpdate();
    } catch (error) {
      // Silently fail update checks to not interrupt normal CLI usage
      logger.debug('Update check failed:', error);
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
program.addCommand(authCommand);
program.addCommand(mcpCommand);
program.addCommand(contextCommand);
program.addCommand(updateCommand);
program.addCommand(worktreeCommand);
program.addCommand(limaCommand);
program.addCommand(checkpointCommand);
program.addCommand(busCommand);
program.addCommand(gatewayCommand);
program.addCommand(sandboxCommand);
program.addCommand(daemonCommand);
program.addCommand(sessionCommand);
program.addCommand(pluginCommand);
program.addCommand(rewindCommand);

// Default action - show help
program.action(() => {
  console.log();
  console.log(`  ${logger.brand('RAPID')} ${logger.dim(`v${VERSION}`)}`);
  console.log(`  ${logger.dim('AI-assisted development with dev containers')}`);
  console.log();
  program.help();
});
