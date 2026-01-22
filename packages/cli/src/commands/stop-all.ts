/**
 * Stop All Agents Command
 *
 * Gracefully shuts down all running agents in the RAPID system.
 * Sends a system_command message via the event bus signaling agents to shutdown.
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

export const stopAllCommand = new Command('stop-all')
  .description('Gracefully shut down all running agents')
  .option('--wait-tasks', 'Wait for current tasks to complete before shutdown')
  .option('--force', 'Force immediate shutdown without waiting')
  .option('--timeout <seconds>', 'Timeout in seconds for graceful shutdown (default: 30)', '30')
  .option('--verbose', 'Show detailed shutdown progress')
  .action(async (options) => {
    const spinner = ora('Preparing to shut down agents...').start();

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

      // Get all active agents
      const agents = await bus.getActiveAgents();

      if (agents.length === 0) {
        spinner.warn('No active agents to shut down');
        return;
      }

      spinner.text = `Found ${agents.length} active agent(s). Sending shutdown signal...`;

      // Send shutdown command to all agents
      const timeoutSeconds = parseInt(options.timeout, 10);
      const shutdownPayload = {
        title: 'System Shutdown',
        content: `Agents should shut down gracefully. ${
          options.waitTasks ? 'Complete current tasks before shutdown.' : 'Shutdown immediately.'
        } Timeout in ${timeoutSeconds} seconds.`,
        actionable: true,
      };

      // Send shutdown signal (one message to all agents)
      try {
        await bus!.sendMessage(
          'system_command',
          {
            id: 'system',
            name: 'rapid-cli',
          },
          shutdownPayload
        );

        if (options.verbose) {
          logger.info(`Shutdown signal sent to all ${agents.length} agent(s)`);
        }
      } catch (err) {
        logger.warn(`Failed to send shutdown signal: ${err}`);
      }

      // Wait for agents to shut down
      if (!options.force) {
        spinner.text = `Waiting for ${agents.length} agent(s) to shut down (timeout: ${timeoutSeconds}s)...`;

        const startTime = Date.now();
        const timeoutMs = timeoutSeconds * 1000;
        let remainingAgents = agents.length;

        while (remainingAgents > 0 && Date.now() - startTime < timeoutMs) {
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const currentAgents = await bus!.getActiveAgents();
          const newRemainingCount = currentAgents.filter((a) =>
            agents.some((orig) => orig.id === a.id)
          ).length;

          if (newRemainingCount < remainingAgents) {
            remainingAgents = newRemainingCount;
            spinner.text = `Waiting for ${remainingAgents} agent(s) to shut down (timeout: ${timeoutSeconds}s)...`;
          }
        }

        if (remainingAgents > 0) {
          spinner.warn(
            `${remainingAgents} agent(s) did not shut down gracefully. They may still be running.`
          );
        } else {
          spinner.succeed(`All ${agents.length} agent(s) shut down successfully`);
        }
      } else {
        spinner.succeed(`Shutdown signal sent to all ${agents.length} agent(s)`);
      }

      // Close the bus
      if (bus instanceof EventBus) {
        await bus.disconnect();
      }
    } catch (error) {
      spinner.fail(`Failed to shut down agents: ${error}`);
      process.exit(1);
    }
  });
