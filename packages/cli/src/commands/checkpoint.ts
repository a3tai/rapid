/**
 * rapid checkpoint - Create and manage code checkpoints
 *
 * Checkpoints allow you to save the current state of your code and revert to it later.
 * Uses git stash under the hood for efficient storage.
 *
 * Subcommands:
 * - create: Create a new checkpoint
 * - list: List all checkpoints
 * - restore: Restore a checkpoint
 * - delete: Delete a checkpoint
 */

import { Command } from 'commander';
import { logger } from '@a3t/rapid-core';
import ora from 'ora';
import { execa } from 'execa';
import { isGitRepo, getGitRoot } from '../utils/worktree.js';

/**
 * Checkpoint metadata stored in the stash message
 */
interface Checkpoint {
  id: string;
  index: number;
  message: string;
  date: Date;
  branch: string;
  hash: string;
}

/**
 * Parse git stash list output into checkpoint objects
 */
function parseStashList(output: string): Checkpoint[] {
  const checkpoints: Checkpoint[] = [];
  const lines = output.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    // Format: stash@{0}: On branch: message
    const match = line.match(/^stash@\{(\d+)\}:\s+(?:On\s+)?([^:]+):\s*(.*)$/);
    if (match) {
      const indexStr = match[1];
      const branchPart = match[2];
      const messagePart = match[3];

      if (!indexStr || !branchPart || messagePart === undefined) continue;

      const index = parseInt(indexStr, 10);

      // Check if this is a RAPID checkpoint
      const rapidMatch = messagePart.match(/^rapid-checkpoint-(\d+)(?:\s+(.*))?$/);
      if (rapidMatch) {
        const timestamp = rapidMatch[1];
        const userMessage = rapidMatch[2];
        if (!timestamp) continue;

        checkpoints.push({
          id: `checkpoint-${index}`,
          index,
          message: userMessage || 'Auto checkpoint',
          date: new Date(parseInt(timestamp, 10) * 1000),
          branch: branchPart.replace('On ', ''),
          hash: '',
        });
      }
    }
  }

  return checkpoints;
}

/**
 * Create a checkpoint (git stash with RAPID prefix)
 */
async function createCheckpoint(
  gitRoot: string,
  message: string,
  options: { includeUntracked?: boolean }
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const stashMessage = `rapid-checkpoint-${timestamp} ${message}`.trim();

    const args = ['stash', 'push', '-m', stashMessage];
    if (options.includeUntracked) {
      args.push('--include-untracked');
    }

    const result = await execa('git', args, { cwd: gitRoot });

    // Check if stash was created
    if (result.stdout.includes('No local changes to save')) {
      return { success: false, error: 'No changes to checkpoint' };
    }

    return { success: true, id: `checkpoint-0` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * List all RAPID checkpoints
 */
async function listCheckpoints(gitRoot: string): Promise<Checkpoint[]> {
  try {
    const result = await execa('git', ['stash', 'list'], { cwd: gitRoot });
    return parseStashList(result.stdout);
  } catch {
    return [];
  }
}

/**
 * Restore a checkpoint
 */
async function restoreCheckpoint(
  gitRoot: string,
  index: number,
  options: { drop?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const command = options.drop ? 'pop' : 'apply';
    await execa('git', ['stash', command, `stash@{${index}}`], { cwd: gitRoot });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Delete a checkpoint
 */
async function deleteCheckpoint(
  gitRoot: string,
  index: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await execa('git', ['stash', 'drop', `stash@{${index}}`], { cwd: gitRoot });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format checkpoint for display
 */
function formatCheckpoint(cp: Checkpoint): string {
  const timeAgo = getTimeAgo(cp.date);
  const branch = logger.dim(`(${cp.branch})`);
  return `  ${logger.brand('•')} ${cp.id} ${branch}\n    ${cp.message}\n    ${logger.dim(timeAgo)}`;
}

/**
 * Get human-readable time ago
 */
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;

  return date.toLocaleDateString();
}

/**
 * Create subcommand
 */
const createCommand = new Command('create')
  .alias('save')
  .description('Create a new checkpoint')
  .argument('[message]', 'Checkpoint description', 'Manual checkpoint')
  .option('-u, --include-untracked', 'Include untracked files')
  .action(async (message: string, options) => {
    const spinner = ora('Creating checkpoint...').start();

    try {
      const cwd = process.cwd();

      if (!(await isGitRepo(cwd))) {
        spinner.fail('Not a git repository');
        process.exit(1);
      }

      const gitRoot = await getGitRoot(cwd);
      const result = await createCheckpoint(gitRoot, message, {
        includeUntracked: options.includeUntracked,
      });

      if (result.success) {
        spinner.succeed(`Checkpoint created: ${result.id}`);
        console.log();
        console.log(`  ${logger.dim('Message:')} ${message}`);
        console.log(`  ${logger.dim('Restore with:')} rapid checkpoint restore ${result.id}`);
        console.log();
      } else {
        spinner.fail(result.error || 'Failed to create checkpoint');
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * List subcommand
 */
const listCommand = new Command('list')
  .alias('ls')
  .description('List all checkpoints')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const cwd = process.cwd();

      if (!(await isGitRepo(cwd))) {
        logger.error('Not a git repository');
        process.exit(1);
      }

      const gitRoot = await getGitRoot(cwd);
      const checkpoints = await listCheckpoints(gitRoot);

      if (options.json) {
        console.log(JSON.stringify(checkpoints, null, 2));
        return;
      }

      console.log();
      console.log(`  ${logger.brand('Checkpoints')}`);
      console.log(`  ${logger.dim('─'.repeat(40))}`);
      console.log();

      if (checkpoints.length === 0) {
        console.log(`  ${logger.dim('No checkpoints found')}`);
        console.log();
        console.log(`  ${logger.dim('Create one with:')} rapid checkpoint create "description"`);
        console.log();
        return;
      }

      for (const cp of checkpoints) {
        console.log(formatCheckpoint(cp));
        console.log();
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Restore subcommand
 */
const restoreCommand = new Command('restore')
  .alias('apply')
  .description('Restore a checkpoint')
  .argument('<id>', 'Checkpoint ID (e.g., checkpoint-0) or index number')
  .option('--drop', 'Remove checkpoint after restoring')
  .action(async (id: string, options) => {
    const spinner = ora('Restoring checkpoint...').start();

    try {
      const cwd = process.cwd();

      if (!(await isGitRepo(cwd))) {
        spinner.fail('Not a git repository');
        process.exit(1);
      }

      const gitRoot = await getGitRoot(cwd);

      // Parse checkpoint ID
      let index: number;
      if (id.startsWith('checkpoint-')) {
        index = parseInt(id.replace('checkpoint-', ''), 10);
      } else {
        index = parseInt(id, 10);
      }

      if (isNaN(index)) {
        spinner.fail(`Invalid checkpoint ID: ${id}`);
        process.exit(1);
      }

      // Verify checkpoint exists
      const checkpoints = await listCheckpoints(gitRoot);
      const checkpoint = checkpoints.find((cp) => cp.index === index);

      if (!checkpoint) {
        spinner.fail(`Checkpoint not found: ${id}`);
        logger.info('Use `rapid checkpoint list` to see available checkpoints');
        process.exit(1);
      }

      const result = await restoreCheckpoint(gitRoot, index, { drop: options.drop });

      if (result.success) {
        const action = options.drop ? 'restored and removed' : 'restored';
        spinner.succeed(`Checkpoint ${action}: ${checkpoint.message}`);
        console.log();
        if (!options.drop) {
          console.log(
            `  ${logger.dim('Checkpoint still available. Use --drop to remove after restore.')}`
          );
          console.log();
        }
      } else {
        spinner.fail(result.error || 'Failed to restore checkpoint');
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Delete subcommand
 */
const deleteCommand = new Command('delete')
  .alias('rm')
  .description('Delete a checkpoint')
  .argument('<id>', 'Checkpoint ID (e.g., checkpoint-0) or index number')
  .action(async (id: string) => {
    const spinner = ora('Deleting checkpoint...').start();

    try {
      const cwd = process.cwd();

      if (!(await isGitRepo(cwd))) {
        spinner.fail('Not a git repository');
        process.exit(1);
      }

      const gitRoot = await getGitRoot(cwd);

      // Parse checkpoint ID
      let index: number;
      if (id.startsWith('checkpoint-')) {
        index = parseInt(id.replace('checkpoint-', ''), 10);
      } else {
        index = parseInt(id, 10);
      }

      if (isNaN(index)) {
        spinner.fail(`Invalid checkpoint ID: ${id}`);
        process.exit(1);
      }

      // Verify checkpoint exists
      const checkpoints = await listCheckpoints(gitRoot);
      const checkpoint = checkpoints.find((cp) => cp.index === index);

      if (!checkpoint) {
        spinner.fail(`Checkpoint not found: ${id}`);
        logger.info('Use `rapid checkpoint list` to see available checkpoints');
        process.exit(1);
      }

      const result = await deleteCheckpoint(gitRoot, index);

      if (result.success) {
        spinner.succeed(`Deleted checkpoint: ${checkpoint.message}`);
        console.log();
      } else {
        spinner.fail(result.error || 'Failed to delete checkpoint');
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Main checkpoint command
 */
export const checkpointCommand = new Command('checkpoint')
  .alias('cp')
  .description('Create and manage code checkpoints')
  .addCommand(createCommand)
  .addCommand(listCommand)
  .addCommand(restoreCommand)
  .addCommand(deleteCommand);

// Default action - show list
checkpointCommand.action(async () => {
  await listCommand.parseAsync([], { from: 'user' });
});
