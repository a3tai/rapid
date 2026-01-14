/**
 * rapid lima - Manage Lima VM for local development (macOS)
 *
 * Subcommands:
 * - status: Show Lima VM status
 * - start: Start the Lima VM
 * - stop: Stop the Lima VM
 * - shell: Open a shell in the Lima VM
 * - delete: Delete the Lima VM
 */

import { Command } from 'commander';
import { logger } from '@a3t/rapid-core';
import ora from 'ora';
import {
  hasLima,
  isMacOS,
  getInstance,
  listInstances,
  startInstance,
  stopInstance,
  deleteInstance,
  shellInLima,
  setupGitSsh,
  RAPID_LIMA_INSTANCE,
} from '../isolation/lima.js';

/**
 * Check Lima availability and show error if not available
 */
async function checkLimaAvailable(): Promise<boolean> {
  if (!isMacOS()) {
    logger.error('Lima is only available on macOS');
    return false;
  }

  if (!(await hasLima())) {
    logger.error('Lima is not installed');
    logger.blank();
    logger.info('Install Lima with:');
    console.log(`  ${logger.dim('$')} brew install lima`);
    logger.blank();
    logger.info('For more information: https://lima-vm.io');
    return false;
  }

  return true;
}

/**
 * Status subcommand - show Lima VM status
 */
const statusCommand = new Command('status')
  .description('Show Lima VM status')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    if (!(await checkLimaAvailable())) {
      process.exit(1);
    }

    const instance = await getInstance();

    if (options.json) {
      console.log(JSON.stringify(instance, null, 2));
      return;
    }

    if (!instance) {
      logger.info(`Lima VM (${RAPID_LIMA_INSTANCE}) is not created`);
      logger.blank();
      logger.info('Start the VM with:');
      console.log(`  ${logger.dim('$')} rapid lima start`);
      logger.blank();
      logger.info('Or use:');
      console.log(`  ${logger.dim('$')} rapid dev --local`);
      return;
    }

    logger.header('Lima VM Status');
    console.log();
    console.log(`  ${logger.dim('Name:')}     ${instance.name}`);
    console.log(
      `  ${logger.dim('Status:')}   ${instance.status === 'Running' ? logger.brand(instance.status) : instance.status}`
    );
    console.log(`  ${logger.dim('Arch:')}     ${instance.arch}`);
    console.log(`  ${logger.dim('CPUs:')}     ${instance.cpus}`);
    console.log(`  ${logger.dim('Memory:')}   ${instance.memory}`);
    console.log(`  ${logger.dim('Disk:')}     ${instance.disk}`);
    if (instance.sshLocalPort) {
      console.log(`  ${logger.dim('SSH Port:')} ${instance.sshLocalPort}`);
    }
    console.log();

    if (instance.status === 'Running') {
      logger.info('To open a shell:');
      console.log(`  ${logger.dim('$')} rapid lima shell`);
    } else {
      logger.info('To start the VM:');
      console.log(`  ${logger.dim('$')} rapid lima start`);
    }
    console.log();
  });

/**
 * Start subcommand - start the Lima VM
 */
const startCommand = new Command('start')
  .description('Start the Lima VM')
  .option('--cpus <n>', 'Number of CPUs', '4')
  .option('--memory <size>', 'Memory size', '8GiB')
  .option('--disk <size>', 'Disk size', '50GiB')
  .action(async (options) => {
    if (!(await checkLimaAvailable())) {
      process.exit(1);
    }

    const spinner = ora('Starting Lima VM...').start();

    const projectDir = process.cwd();
    const result = await startInstance(projectDir, {
      cpus: parseInt(options.cpus, 10),
      memory: options.memory,
      disk: options.disk,
      timeout: 600,
    });

    if (!result.success) {
      spinner.fail('Failed to start Lima VM');
      logger.error(result.error ?? 'Unknown error');
      process.exit(1);
    }

    spinner.succeed('Lima VM started');

    // Check SSH agent forwarding
    logger.blank();
    const sshSpinner = ora('Checking SSH agent forwarding...').start();
    const sshResult = await setupGitSsh();
    if (sshResult.success) {
      sshSpinner.succeed('SSH agent forwarding is working');
    } else {
      sshSpinner.warn('SSH agent forwarding may not be working');
      logger.dim(sshResult.error ?? 'Make sure ssh-agent is running on the host');
    }

    logger.blank();
    logger.info('To open a shell:');
    console.log(`  ${logger.dim('$')} rapid lima shell`);
    console.log();
  });

/**
 * Stop subcommand - stop the Lima VM
 */
const stopCommand = new Command('stop')
  .description('Stop the Lima VM')
  .option('-f, --force', 'Force stop')
  .action(async (options) => {
    if (!(await checkLimaAvailable())) {
      process.exit(1);
    }

    const instance = await getInstance();
    if (!instance) {
      logger.info('Lima VM is not created');
      return;
    }

    if (instance.status !== 'Running') {
      logger.info('Lima VM is already stopped');
      return;
    }

    const spinner = ora('Stopping Lima VM...').start();

    const result = await stopInstance(RAPID_LIMA_INSTANCE, {
      force: options.force,
    });

    if (!result.success) {
      spinner.fail('Failed to stop Lima VM');
      logger.error(result.error ?? 'Unknown error');
      process.exit(1);
    }

    spinner.succeed('Lima VM stopped');
  });

/**
 * Shell subcommand - open a shell in the Lima VM
 */
const shellCommand = new Command('shell')
  .description('Open a shell in the Lima VM')
  .option('-c, --command <cmd>', 'Command to run instead of interactive shell')
  .action(async (options) => {
    if (!(await checkLimaAvailable())) {
      process.exit(1);
    }

    const instance = await getInstance();
    if (!instance || instance.status !== 'Running') {
      logger.error('Lima VM is not running');
      logger.info('Start with: rapid lima start');
      process.exit(1);
    }

    await shellInLima({
      cwd: process.cwd(),
      command: options.command,
    });
  });

/**
 * Delete subcommand - delete the Lima VM
 */
const deleteCommand = new Command('delete')
  .description('Delete the Lima VM')
  .option('-f, --force', 'Force delete without confirmation')
  .action(async (options) => {
    if (!(await checkLimaAvailable())) {
      process.exit(1);
    }

    const instance = await getInstance();
    if (!instance) {
      logger.info('Lima VM does not exist');
      return;
    }

    if (!options.force) {
      logger.warn('This will permanently delete the Lima VM and all its data.');
      logger.info(`Use ${logger.brand('--force')} to confirm deletion.`);
      return;
    }

    const spinner = ora('Deleting Lima VM...').start();

    const result = await deleteInstance(RAPID_LIMA_INSTANCE, { force: true });

    if (!result.success) {
      spinner.fail('Failed to delete Lima VM');
      logger.error(result.error ?? 'Unknown error');
      process.exit(1);
    }

    spinner.succeed('Lima VM deleted');
  });

/**
 * List subcommand - list all Lima instances
 */
const listCommand = new Command('list')
  .alias('ls')
  .description('List all Lima instances')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    if (!(await checkLimaAvailable())) {
      process.exit(1);
    }

    const instances = await listInstances();

    if (options.json) {
      console.log(JSON.stringify(instances, null, 2));
      return;
    }

    if (instances.length === 0) {
      logger.info('No Lima instances found');
      return;
    }

    logger.header('Lima Instances');
    console.log();

    for (const inst of instances) {
      const isRapid = inst.name === RAPID_LIMA_INSTANCE;
      const statusColor = inst.status === 'Running' ? logger.brand : logger.dim;
      console.log(
        `  ${isRapid ? logger.brand('*') : ' '} ${inst.name} ${statusColor(`(${inst.status})`)}`
      );
      console.log(`    ${logger.dim(`${inst.cpus} CPUs, ${inst.memory}, ${inst.disk}`)}`);
    }
    console.log();
  });

/**
 * Main lima command
 */
export const limaCommand = new Command('lima')
  .description('Manage Lima VM for local development (macOS)')
  .addCommand(statusCommand)
  .addCommand(startCommand)
  .addCommand(stopCommand)
  .addCommand(shellCommand)
  .addCommand(deleteCommand)
  .addCommand(listCommand);

// Default action when no subcommand provided
limaCommand.action(async () => {
  // Default to status
  await statusCommand.parseAsync([], { from: 'user' });
});
