/**
 * rapid worktree - Manage git worktrees for isolated development
 *
 * Subcommands:
 * - list: Show all worktrees
 * - prune: Clean up stale worktrees
 * - remove: Remove a specific worktree
 * - cleanup: Remove worktrees for merged branches
 */

import { Command } from 'commander';
import { logger } from '@a3t/rapid-core';
import ora from 'ora';
import {
  isGitRepo,
  getGitRoot,
  listWorktrees,
  pruneWorktrees,
  removeWorktree,
  cleanupMergedWorktrees,
  type WorktreeInfo,
} from '../utils/worktree.js';

/**
 * Format a worktree for display
 */
function formatWorktree(wt: WorktreeInfo, currentPath: string): string {
  const isCurrent = wt.path === currentPath;
  const marker = isCurrent ? logger.brand('*') : ' ';
  const status: string[] = [];

  if (wt.isMain) status.push('main');
  if (wt.locked) status.push('locked');
  if (wt.prunable) status.push('prunable');
  if (!wt.exists) status.push('missing');

  const statusStr = status.length > 0 ? logger.dim(` (${status.join(', ')})`) : '';
  const branchStr = wt.branch ? logger.brand(wt.branch) : logger.dim('detached');
  const headShort = wt.head?.substring(0, 7) ?? '';

  return `${marker} ${branchStr}${statusStr}\n    ${logger.dim(wt.path)}\n    ${logger.dim(`HEAD: ${headShort}`)}`;
}

/**
 * List subcommand - show all worktrees
 */
const listCommand = new Command('list')
  .alias('ls')
  .description('List all git worktrees')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const cwd = process.cwd();

      if (!(await isGitRepo(cwd))) {
        logger.error('Not a git repository');
        process.exit(1);
      }

      const gitRoot = await getGitRoot(cwd);
      const worktrees = await listWorktrees(gitRoot);

      if (options.json) {
        console.log(JSON.stringify(worktrees, null, 2));
        return;
      }

      if (worktrees.length === 0) {
        logger.info('No worktrees found');
        return;
      }

      logger.header('Git Worktrees');
      console.log();

      for (const wt of worktrees) {
        console.log(formatWorktree(wt, gitRoot));
        console.log();
      }

      const prunable = worktrees.filter((wt) => wt.prunable);
      if (prunable.length > 0) {
        logger.warn(`${prunable.length} worktree(s) can be pruned. Run: rapid worktree prune`);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Prune subcommand - remove stale worktrees
 */
const pruneCommand = new Command('prune')
  .description('Remove stale worktree references')
  .option('--dry-run', 'Show what would be pruned without removing')
  .action(async (options) => {
    const spinner = ora('Checking worktrees...').start();

    try {
      const cwd = process.cwd();

      if (!(await isGitRepo(cwd))) {
        spinner.fail('Not a git repository');
        process.exit(1);
      }

      const gitRoot = await getGitRoot(cwd);
      const worktrees = await listWorktrees(gitRoot);
      const prunable = worktrees.filter((wt) => wt.prunable);

      if (prunable.length === 0) {
        spinner.succeed('No stale worktrees to prune');
        return;
      }

      if (options.dryRun) {
        spinner.info(`Would prune ${prunable.length} worktree(s):`);
        for (const wt of prunable) {
          console.log(`  ${logger.dim('•')} ${wt.path}`);
        }
        return;
      }

      spinner.text = `Pruning ${prunable.length} worktree(s)...`;
      const result = await pruneWorktrees(gitRoot);

      if (result.success) {
        spinner.succeed(`Pruned ${result.pruned.length} worktree(s)`);
        for (const path of result.pruned) {
          console.log(`  ${logger.dim('•')} ${path}`);
        }
      } else {
        spinner.fail(`Failed to prune: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Remove subcommand - remove a specific worktree
 */
const removeCommand = new Command('remove')
  .alias('rm')
  .description('Remove a worktree')
  .argument('<path-or-branch>', 'Worktree path or branch name')
  .option('-f, --force', 'Force removal even if worktree is dirty')
  .action(async (pathOrBranch: string, options) => {
    const spinner = ora('Finding worktree...').start();

    try {
      const cwd = process.cwd();

      if (!(await isGitRepo(cwd))) {
        spinner.fail('Not a git repository');
        process.exit(1);
      }

      const gitRoot = await getGitRoot(cwd);
      const worktrees = await listWorktrees(gitRoot);

      // Find worktree by path or branch name
      const worktree = worktrees.find(
        (wt) =>
          wt.path === pathOrBranch || wt.path.endsWith(pathOrBranch) || wt.branch === pathOrBranch
      );

      if (!worktree) {
        spinner.fail(`Worktree not found: ${pathOrBranch}`);
        logger.info('Available worktrees:');
        for (const wt of worktrees) {
          console.log(`  ${wt.branch || wt.path}`);
        }
        process.exit(1);
      }

      if (worktree.isMain) {
        spinner.fail('Cannot remove the main worktree');
        process.exit(1);
      }

      if (worktree.locked && !options.force) {
        spinner.fail('Worktree is locked. Use --force to remove anyway.');
        process.exit(1);
      }

      spinner.text = `Removing worktree: ${worktree.path}...`;
      const result = await removeWorktree(gitRoot, worktree.path, { force: options.force });

      if (result.success) {
        spinner.succeed(`Removed worktree: ${worktree.path}`);
      } else {
        spinner.fail(`Failed to remove: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Cleanup subcommand - remove worktrees for merged branches
 */
const cleanupCommand = new Command('cleanup')
  .description('Remove worktrees for branches that have been merged')
  .option('--dry-run', 'Show what would be removed without removing')
  .action(async (options) => {
    const spinner = ora('Analyzing worktrees...').start();

    try {
      const cwd = process.cwd();

      if (!(await isGitRepo(cwd))) {
        spinner.fail('Not a git repository');
        process.exit(1);
      }

      const gitRoot = await getGitRoot(cwd);

      if (options.dryRun) {
        // Show what would be cleaned up
        const worktrees = await listWorktrees(gitRoot);

        spinner.info('Dry run - would remove worktrees for merged branches');

        const nonMain = worktrees.filter((wt) => !wt.isMain && wt.branch);
        if (nonMain.length === 0) {
          console.log('  No feature branch worktrees found');
        } else {
          console.log('  Feature branch worktrees:');
          for (const wt of nonMain) {
            console.log(`    ${logger.dim('•')} ${wt.branch} - ${wt.path}`);
          }
          console.log();
          logger.info('Run without --dry-run to remove worktrees for merged branches');
        }
        return;
      }

      spinner.text = 'Removing worktrees for merged branches...';
      const result = await cleanupMergedWorktrees(gitRoot);

      if (result.removed.length === 0) {
        spinner.succeed('No worktrees to clean up');
        return;
      }

      spinner.succeed(`Cleaned up ${result.removed.length} worktree(s)`);
      for (const path of result.removed) {
        console.log(`  ${logger.dim('•')} ${path}`);
      }

      if (result.errors.length > 0) {
        console.log();
        logger.warn('Some worktrees could not be removed:');
        for (const err of result.errors) {
          console.log(`  ${logger.dim('•')} ${err}`);
        }
      }
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Main worktree command
 */
export const worktreeCommand = new Command('worktree')
  .alias('wt')
  .description('Manage git worktrees for isolated development')
  .addCommand(listCommand)
  .addCommand(pruneCommand)
  .addCommand(removeCommand)
  .addCommand(cleanupCommand);

// Default action when no subcommand provided
worktreeCommand.action(async () => {
  // Default to list
  await listCommand.parseAsync([], { from: 'user' });
});
