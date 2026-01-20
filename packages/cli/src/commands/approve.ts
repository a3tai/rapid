/**
 * Approval Request CLI Commands
 *
 * Commands for human-in-the-loop (HITL) approval workflows.
 * Agents can request approval for high-risk actions, and humans can
 * approve, reject, or defer decisions via these commands.
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
import chalk from 'chalk';

export const approveCommand = new Command('approve').description(
  'Handle approval requests from agents (HITL workflow)'
);

// Cached bus instance
let busInstance: EventBus | InMemoryEventBus | null = null;

function getProjectId(): string {
  return process.cwd().split('/').pop() || 'default';
}

/**
 * Get or create the event bus, preferring Redis if available
 */
async function getOrCreateBus(
  options: { forceInMemory?: boolean } = {}
): Promise<EventBus | InMemoryEventBus> {
  if (busInstance) {
    return busInstance;
  }

  // Check if Redis is running
  if (!options.forceInMemory) {
    const status = await getRedisStatus();
    if (status.running && status.url) {
      const config: EventBusConfig = {
        redis: { url: status.url },
        projectId: getProjectId(),
      };
      busInstance = new EventBus(config);
      await busInstance.connect();
      return busInstance;
    }
  }

  // Fall back to in-memory
  busInstance = new InMemoryEventBus();
  return busInstance;
}

/**
 * rapid approve list
 *
 * List all pending approval requests
 */
approveCommand
  .command('list')
  .description('List pending approval requests')
  .action(async () => {
    const spinner = ora('Fetching pending approval requests...').start();

    try {
      const bus = await getOrCreateBus();
      const messages = await bus.getMessages({
        types: ['approval_request'],
        limit: 100,
      });

      spinner.stop();
      console.log();
      console.log(`  ${logger.brand('RAPID')} Approval Requests`);
      console.log(`  ${logger.dim('─'.repeat(40))}`);
      console.log();

      if (messages.length === 0) {
        console.log(`  ${logger.dim('No pending approval requests')}`);
        console.log();
        return;
      }

      messages.forEach((msg, index) => {
        const requestPayload = msg.payload as Record<string, unknown> & {
          request_id?: string;
          action?: string;
          risk_level?: string;
          expires_at?: string;
        };
        const requestId = requestPayload.request_id || msg.id.substring(0, 8);
        const action = requestPayload.action || 'Unknown';
        const riskLevel = requestPayload.risk_level || 'normal';

        let riskColor = chalk.yellow;
        if (riskLevel === 'critical') riskColor = chalk.red;
        if (riskLevel === 'high') riskColor = chalk.red;
        if (riskLevel === 'low') riskColor = chalk.green;

        console.log(`  ${chalk.bold(`[${index + 1}]`)} ${action}`);
        console.log(`      ID: ${requestId}`);
        console.log(`      Risk: ${riskColor(riskLevel)}`);
        console.log(`      From: ${msg.fromAgent.name}`);
        console.log(`      Time: ${new Date(msg.timestamp).toLocaleString()}`);
        console.log();
      });
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid approve <request-id> --yes
 *
 * Approve a specific request
 */
approveCommand
  .command('approve <requestId>')
  .alias('yes')
  .description('Approve a specific request')
  .action(async (requestId: string) => {
    const spinner = ora('Sending approval...').start();

    try {
      const bus = await getOrCreateBus();

      // Send approval response via event bus
      await bus.send({
        type: 'approval_response',
        fromAgent: {
          id: `human-${Date.now()}`,
          name: 'human-reviewer',
        },
        priority: 'high',
        payload: {
          title: 'Approval Decision',
          content: `Approved request ${requestId}`,
          actionable: false,
          context: {
            request_id: requestId,
            decision: 'approved',
          },
        },
      });

      spinner.succeed('Approval sent');
      console.log();
      console.log(`  ${chalk.green('✓')} Request ${requestId} has been approved`);
      console.log();
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid approve <request-id> --no
 *
 * Reject a specific request
 */
approveCommand
  .command('reject <requestId>')
  .alias('no')
  .description('Reject a specific request')
  .option('-r, --reason <reason>', 'Reason for rejection')
  .action(async (requestId: string, options: { reason?: string }) => {
    const spinner = ora('Sending rejection...').start();

    try {
      const bus = await getOrCreateBus();

      // Send rejection response via event bus
      await bus.send({
        type: 'approval_response',
        fromAgent: {
          id: `human-${Date.now()}`,
          name: 'human-reviewer',
        },
        priority: 'high',
        payload: {
          title: 'Approval Decision',
          content: `Rejected request ${requestId}${options.reason ? ': ' + options.reason : ''}`,
          actionable: false,
          context: {
            request_id: requestId,
            decision: 'rejected',
            reason: options.reason,
          },
        },
      });

      spinner.succeed('Rejection sent');
      console.log();
      console.log(`  ${chalk.red('✗')} Request ${requestId} has been rejected`);
      if (options.reason) {
        console.log(`    Reason: ${options.reason}`);
      }
      console.log();
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid approve <request-id> --defer
 *
 * Defer a decision on a request
 */
approveCommand
  .command('defer <requestId>')
  .description('Defer a decision on a request')
  .option('-r, --reason <reason>', 'Reason for deferral', 'Awaiting more information')
  .action(async (requestId: string, options: { reason?: string }) => {
    const spinner = ora('Sending deferral...').start();

    try {
      const bus = await getOrCreateBus();

      // Send deferral response via event bus
      await bus.send({
        type: 'approval_response',
        fromAgent: {
          id: `human-${Date.now()}`,
          name: 'human-reviewer',
        },
        priority: 'normal',
        payload: {
          title: 'Approval Decision',
          content: `Deferred request ${requestId}: ${options.reason}`,
          actionable: false,
          context: {
            request_id: requestId,
            decision: 'deferred',
            reason: options.reason,
          },
        },
      });

      spinner.succeed('Deferral sent');
      console.log();
      console.log(
        `  ${chalk.yellow('⊘')} Request ${requestId} has been deferred`
      );
      console.log(`    Reason: ${options.reason}`);
      console.log();
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Default action: show help
 */
approveCommand.action(() => {
  approveCommand.help();
});
