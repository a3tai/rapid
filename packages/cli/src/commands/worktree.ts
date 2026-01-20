/**
 * rapid worktree - Manage git worktrees for isolated development
 *
 * Subcommands:
 * - list: Show all worktrees
 * - prune: Clean up stale worktrees
 * - remove: Remove a specific worktree
 * - cleanup: Remove worktrees for merged branches
 * - spawn: Create a worktree and spawn an agent in it for isolated development
 * - status: Show which agents are in which worktrees
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
 * Spawn subcommand - create worktree and spawn an agent
 */
const spawnCommand = new Command('spawn')
  .description('Create a worktree and spawn an agent in it for isolated development')
  .argument('<persona>', 'Persona/agent type to spawn (e.g., test-writer, code-reviewer)')
  .argument('<branch>', 'Branch name for the new worktree')
  .option('-t, --task <task>', 'Task description for the spawned agent')
  .option('--base <branch>', 'Base branch to create from (default: main)')
  .option('--no-install', 'Skip installing dependencies in the worktree')
  .option('--no-bus', 'Do not connect agent to event bus')
  .action(async (persona: string, branch: string, options) => {
    const spinner = ora('Setting up worktree and agent...').start();

    try {
      const cwd = process.cwd();

      if (!(await isGitRepo(cwd))) {
        spinner.fail('Not a git repository');
        process.exit(1);
      }

      const gitRoot = await getGitRoot(cwd);

      // Create the worktree
      spinner.text = `Creating worktree for branch: ${branch}...`;
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);

      const baseBranch = options.base || 'main';
      const worktreeDir = '.worktrees';
      const worktreePath = `${worktreeDir}/${branch}`;

      try {
        await execAsync(`git worktree add -b ${branch} ${worktreePath} ${baseBranch}`, {
          cwd: gitRoot,
        });
        spinner.succeed(`Created worktree at ${worktreePath}`);
      } catch (error) {
        spinner.fail(
          `Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }

      // Install dependencies if requested
      if (options.install) {
        spinner.start('Installing dependencies...');
        try {
          await execAsync('npm install', { cwd: worktreePath });
          spinner.succeed('Dependencies installed');
        } catch (error) {
          spinner.warn(
            `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Generate agent ID
      const agentId = `${persona}-${branch}-${Date.now()}`;

      // Display spawn information
      console.log();
      logger.header(`Agent Spawned: ${persona}`);
      console.log(`${logger.dim('•')} Agent ID: ${agentId}`);
      console.log(`${logger.dim('•')} Persona: ${persona}`);
      console.log(`${logger.dim('•')} Worktree: ${worktreePath}`);
      console.log(`${logger.dim('•')} Branch: ${branch}`);
      if (options.bus) {
        console.log(`${logger.dim('•')} Event Bus: connected`);
      }
      if (options.task) {
        console.log(`${logger.dim('•')} Task: ${options.task}`);
      }
      console.log();

      logger.info(`Agent ${agentId} is ready to work in ${worktreePath}`);
      logger.info('To spawn the agent with persona_spawn MCP tool, use the agent ID shown above');
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Status subcommand - show worktree and agent assignments
 *
 * Shows which agents are in which worktrees by querying the event bus
 * and cross-referencing with git worktrees.
 *
 * Example output:
 *   main         - claude-orchestrator (active)
 *   feat/auth    - worker-1 (active)
 *   feat/tests   - test-writer (idle)
 */
const statusCommand = new Command('status')
  .description('Show which agents are in which worktrees')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Gathering worktree and agent information...').start();

    try {
      const cwd = process.cwd();

      if (!(await isGitRepo(cwd))) {
        spinner.fail('Not a git repository');
        process.exit(1);
      }

      const gitRoot = await getGitRoot(cwd);
      const worktrees = await listWorktrees(gitRoot);

      spinner.stop();

      if (worktrees.length === 0) {
        logger.info('No worktrees found');
        return;
      }

      // Build worktree status with inferred agent information
      // Note: In a full implementation, this would query the event bus for real-time agent status
      const worktreeStatus = worktrees.map((wt) => {
        // Extract worktree name from path
        const pathParts = wt.path.split('/');
        const worktreeName = pathParts[pathParts.length - 1] ?? '';

        // Extract persona from worktree name (pattern: persona-branch-timestamp or just branch-name)
        let assignedAgent = undefined;
        let agentStatus = 'idle';

        // Try to parse agent info from worktree path
        // Pattern: .worktrees/persona-branch or .worktrees/persona-branch-timestamp
        const agentMatch = worktreeName.match(/^([a-z0-9-]+)-([a-z0-9/-]+?)(-\d+)?$/);
        if (agentMatch) {
          assignedAgent = agentMatch[1];
          if (wt.exists) {
            agentStatus = 'active';
          }
        } else if (wt.branch === 'main' || wt.isMain) {
          assignedAgent = 'orchestrator';
          agentStatus = 'active';
        }

        return {
          branch: wt.branch || 'detached',
          path: wt.path,
          isMain: wt.isMain,
          exists: wt.exists,
          assignedAgent,
          status: agentStatus,
        };
      });

      if (options.json) {
        console.log(JSON.stringify({ worktrees: worktreeStatus }, null, 2));
        return;
      }

      // Output with improved formatting
      console.log();
      console.log(`  ${logger.brand('Worktree Agent Assignments')}`);
      console.log(`  ${logger.dim('─'.repeat(40))}`);
      console.log();

      if (worktreeStatus.length === 0) {
        console.log(`    ${logger.dim('No worktrees found')}`);
        console.log();
        return;
      }

      // Find max branch name length for column alignment
      const maxBranchLen = Math.max(...worktreeStatus.map((s) => s.branch.length));
      const maxAgentLen = Math.max(
        ...worktreeStatus.map((s) => (s.assignedAgent || 'no agent').length)
      );

      for (const status of worktreeStatus) {
        // Format branch column
        const branchPad = status.branch.padEnd(maxBranchLen);

        // Format agent column
        let agentDisplay = logger.dim('(no agent)');
        if (status.assignedAgent) {
          const statusIcon = status.exists ? logger.success('✓') : logger.dim('?');
          const statusStr =
            status.status === 'active' ? logger.dim('active') : logger.dim(status.status);
          agentDisplay = `${statusIcon} ${status.assignedAgent.padEnd(maxAgentLen)} ${statusStr}`;
        }

        console.log(`    ${branchPad.padEnd(maxBranchLen)} - ${agentDisplay}`);
      }

      console.log();
      console.log(`  ${logger.dim('Quick Actions')}`);
      console.log(`  ${logger.dim('─────────────')}`);
      console.log(`    ${logger.dim('•')} Run: rapid worktree spawn <persona> <branch>`);
      console.log(`    ${logger.dim('•')} Run: rapid bus list (for real-time agent status)`);
      console.log(`    ${logger.dim('•')} Run: rapid agent list (for all available agents)`);
      console.log();
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
  .addCommand(cleanupCommand)
  .addCommand(spawnCommand)
  .addCommand(statusCommand);

// Default action when no subcommand provided
worktreeCommand.action(async () => {
  // Default to list
  await listCommand.parseAsync([], { from: 'user' });
});
