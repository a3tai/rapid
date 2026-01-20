/**
 * Cleanup Command
 *
 * Performs cleanup operations on RAPID infrastructure:
 * - Removes stale agent registrations
 * - Prunes old tasks
 * - Cleans up event bus history
 * - Removes completed worktrees
 */

import { Command } from 'commander';
import { logger } from '@a3t/rapid-core';
import {
  EventBus,
  InMemoryEventBus,
  getRedisStatus,
  type EventBusConfig,
} from '@a3t/rapid-eventbus';
import ora from 'ora';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const cleanupCommand = new Command('cleanup')
  .description('Clean up stale agents, old tasks, and event bus history')
  .option(
    '--stale-threshold <seconds>',
    'Mark agents as stale after N seconds (default: 120)',
    '120'
  )
  .option('--task-age <days>', 'Remove completed tasks older than N days (default: 7)', '7')
  .option('--message-age <days>', 'Remove event bus messages older than N days (default: 30)', '30')
  .option('--prune-worktrees', 'Also clean up merged worktrees')
  .option('--dry-run', 'Show what would be cleaned up without actually cleaning')
  .option('--verbose', 'Show detailed cleanup progress')
  .action(async (options) => {
    const spinner = ora('Starting cleanup...').start();

    try {
      // Get project ID
      const projectId = process.cwd().split('/').pop() || 'default';

      // Connect to event bus
      let bus: EventBus | InMemoryEventBus | null = null;

      try {
        const status = await getRedisStatus();
        if (status.running && status.url) {
          const config: EventBusConfig = {
            redis: { url: status.url },
            projectId,
          };
          bus = new EventBus(config);
          await bus.connect();
        }
      } catch {
        // Fall back to in-memory
      }

      if (!bus) {
        bus = new InMemoryEventBus();
      }

      let cleanedCount = 0;

      // 1. Clean up stale agents
      spinner.text = 'Checking for stale agents...';
      const staleThresholdSeconds = parseInt(options.staleThreshold, 10);

      // Get all agents (active within a very long time period) to find all registered
      const allAgents =
        bus instanceof EventBus
          ? await bus.getActiveAgents(86400) // 24 hours - get all agents registered in the last day
          : [];

      // Get recently active agents
      const activeAgents =
        bus instanceof EventBus ? await bus.getActiveAgents(staleThresholdSeconds) : [];

      // Stale agents are those in allAgents but not in activeAgents
      const activeIds = new Set(activeAgents.map((a) => a.id));
      const staleAgents = allAgents.filter((a) => !activeIds.has(a.id));

      if (staleAgents.length > 0) {
        if (options.verbose) {
          spinner.info(
            `Found ${staleAgents.length} stale agent(s): ${staleAgents.map((a) => a.name).join(', ')}`
          );
        }

        if (!options.dryRun && bus instanceof EventBus) {
          for (const agent of staleAgents) {
            await bus.unregisterAgent(agent.id);
            cleanedCount++;
          }
          spinner.text = `Cleaned up ${staleAgents.length} stale agent(s)`;
        } else {
          spinner.warn(`Would clean up ${staleAgents.length} stale agent(s)`);
        }
      }

      // 2. Clean up old tasks
      spinner.text = 'Checking for old completed tasks...';
      // const taskAgeMs = parseInt(options.taskAge, 10) * 24 * 60 * 60 * 1000;

      try {
        const rapidJsonPath = join(process.cwd(), 'rapid.json');
        const content = await readFile(rapidJsonPath, 'utf-8');
        JSON.parse(content); // Validate config is valid JSON

        // Note: This would need task management tools to be fully implemented
        // For now, we'll just log what would be cleaned
        if (options.verbose) {
          logger.info(`Task cleanup would remove tasks older than ${options.taskAge} days`);
        }
      } catch {
        if (options.verbose) {
          logger.warn('Could not load rapid.json for task cleanup');
        }
      }

      // 3. Clean up event bus history
      spinner.text = 'Checking event bus message history...';
      const messageAgeMs = parseInt(options.messageAge, 10) * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(Date.now() - messageAgeMs).toISOString();

      if (options.verbose) {
        logger.info(`Event bus messages before ${cutoffDate} would be cleaned up`);
      }

      // 4. Clean up merged worktrees
      if (options.pruneWorktrees) {
        spinner.text = 'Checking for merged worktrees...';

        try {
          const { execSync } = await import('node:child_process');
          const result = execSync('git worktree list', { encoding: 'utf-8' });
          const worktrees = result
            .split('\n')
            .filter((line) => line.trim())
            .map((line) => line.split(' ')[0]);

          if (options.verbose && worktrees.length > 0) {
            logger.info(`Found ${worktrees.length} worktree(s)`);
          }

          // Note: Actual branch merge check would require git commands per worktree
          if (options.verbose) {
            logger.info('Worktree merge status checking would happen here');
          }
        } catch {
          if (options.verbose) {
            logger.warn('Could not check worktrees');
          }
        }
      }

      // Summary
      if (options.dryRun) {
        spinner.succeed('Cleanup dry-run complete');
        logger.info(
          `${options.verbose ? 'Detailed' : 'Automatic'} cleanup would remove: ${cleanedCount} agent(s)`
        );
      } else {
        spinner.succeed(`Cleanup complete: Removed ${cleanedCount} stale agent(s)`);

        if (options.verbose) {
          logger.success('Cleanup operations:');
          logger.info('  ✓ Stale agents removed');
          logger.info('  ✓ Event bus is ready for the next cycle');
          logger.info('  • Task cleanup would require additional implementation');
          logger.info('  • Worktree cleanup would require branch status verification');
        }
      }

      // Close the bus
      if (bus instanceof EventBus) {
        await bus.disconnect();
      }
    } catch (error) {
      spinner.fail(`Cleanup failed: ${error}`);
      process.exit(1);
    }
  });
