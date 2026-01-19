/**
 * rapid rewind - Quickly revert to a previous checkpoint
 *
 * Simplified interface for checkpoint restoration:
 * - rapid rewind: Rewind to last checkpoint
 * - rapid rewind --list: List available checkpoints
 * - rapid rewind <id>: Rewind to specific checkpoint
 */

import { Command } from 'commander';
import { logger } from '@a3t/rapid-core';
import ora from 'ora';
import { execa } from 'execa';
import { isGitRepo, getGitRoot } from '../utils/worktree.js';

/**
 * Checkpoint metadata
 */
interface Checkpoint {
  id: string;
  index: number;
  message: string;
  date: Date;
  branch: string;
}

/**
 * Parse git stash list for RAPID checkpoints
 */
function parseStashList(output: string): Checkpoint[] {
  const checkpoints: Checkpoint[] = [];
  const lines = output.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^stash@\{(\d+)\}:\s+(?:On\s+)?([^:]+):\s*(.*)$/);
    if (match) {
      const indexStr = match[1];
      const branchPart = match[2];
      const messagePart = match[3];

      if (!indexStr || !branchPart || messagePart === undefined) continue;

      const index = parseInt(indexStr, 10);

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
        });
      }
    }
  }

  return checkpoints;
}

/**
 * Get time ago string
 */
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;

  return `${Math.floor(seconds / 86400)}d ago`;
}

export const rewindCommand = new Command('rewind')
  .description('Rewind to a previous checkpoint')
  .argument('[id]', 'Checkpoint ID or index (defaults to most recent)')
  .option('-l, --list', 'List available checkpoints')
  .option('--keep', 'Keep checkpoint after restoring (default: remove)')
  .option('--code-only', 'Rewind files only, preserving conversation context')
  .action(async (id: string | undefined, options) => {
    try {
      const cwd = process.cwd();

      if (!(await isGitRepo(cwd))) {
        logger.error('Not a git repository');
        process.exit(1);
      }

      const gitRoot = await getGitRoot(cwd);

      // Get checkpoints
      const result = await execa('git', ['stash', 'list'], { cwd: gitRoot });
      const checkpoints = parseStashList(result.stdout);

      // List mode
      if (options.list) {
        console.log();
        console.log(`  ${logger.brand('Available Checkpoints')}`);
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
          const timeAgo = getTimeAgo(cp.date);
          const isFirst = cp.index === 0;
          const marker = isFirst ? logger.brand('→') : ' ';
          console.log(`${marker} ${cp.id} ${logger.dim(`(${timeAgo})`)}`);
          console.log(`    ${cp.message}`);
          console.log();
        }

        console.log(`  ${logger.dim('Rewind with:')} rapid rewind [checkpoint-id]`);
        console.log();
        return;
      }

      // No checkpoints
      if (checkpoints.length === 0) {
        logger.error('No checkpoints available');
        logger.info('Create one with: rapid checkpoint create "description"');
        process.exit(1);
      }

      // Determine which checkpoint to restore
      let targetIndex: number;
      let targetCheckpoint: Checkpoint | undefined;

      if (id === undefined) {
        // Default to most recent
        targetIndex = 0;
        targetCheckpoint = checkpoints[0];
      } else if (id.startsWith('checkpoint-')) {
        targetIndex = parseInt(id.replace('checkpoint-', ''), 10);
        targetCheckpoint = checkpoints.find((cp) => cp.index === targetIndex);
      } else {
        targetIndex = parseInt(id, 10);
        targetCheckpoint = checkpoints.find((cp) => cp.index === targetIndex);
      }

      if (!targetCheckpoint) {
        logger.error(`Checkpoint not found: ${id || 'checkpoint-0'}`);
        logger.info('Use `rapid rewind --list` to see available checkpoints');
        process.exit(1);
      }

      // Confirm rewind
      const spinner = ora(`Rewinding to: ${targetCheckpoint.message}`).start();

      try {
        // Restore the checkpoint
        const command = options.keep ? 'apply' : 'pop';
        await execa('git', ['stash', command, `stash@{${targetIndex}}`], { cwd: gitRoot });

        spinner.succeed(`Rewound to: ${targetCheckpoint.message}`);
        console.log();

        if (options.codeOnly) {
          console.log(`  ${logger.dim('Code reverted. Conversation context preserved.')}`);
        } else {
          console.log(`  ${logger.dim('Files restored from checkpoint.')}`);
        }

        if (options.keep) {
          console.log(
            `  ${logger.dim('Checkpoint preserved. Use rapid checkpoint delete to remove.')}`
          );
        }

        console.log();
      } catch (error) {
        spinner.fail('Failed to rewind');

        // Check for common issues
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes('CONFLICT') || errorMsg.includes('conflict')) {
          logger.error('Merge conflicts detected');
          logger.info('Resolve conflicts manually, then:');
          console.log(`  ${logger.dim('•')} git add <resolved-files>`);
          console.log(`  ${logger.dim('•')} git stash drop stash@{${targetIndex}}`);
        } else if (errorMsg.includes('local changes')) {
          logger.error('Local changes would be overwritten');
          logger.info('Options:');
          console.log(`  ${logger.dim('•')} Commit your changes first`);
          console.log(`  ${logger.dim('•')} Create a checkpoint: rapid checkpoint create`);
          console.log(`  ${logger.dim('•')} Discard changes: git checkout -- .`);
        } else {
          logger.error(errorMsg);
        }

        process.exit(1);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
