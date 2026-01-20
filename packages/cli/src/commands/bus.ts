/**
 * Event Bus CLI Commands
 *
 * Commands for managing and interacting with the inter-agent event bus.
 * Redis is automatically managed via Docker for seamless multi-agent communication.
 */

import { Command } from 'commander';
import { logger, loadConfig } from '@a3t/rapid-core';
import {
  EventBus,
  InMemoryEventBus,
  formatMessagesForInjection,
  MESSAGE_TYPE_ICONS,
  getRedisStatus,
  type MessageType,
  type AgentInfo,
  type EventBusConfig,
} from '@a3t/rapid-eventbus';
import ora from 'ora';
import chalk from 'chalk';

export const busCommand = new Command('bus').description(
  'Manage inter-agent event bus for multi-agent collaboration'
);

// Cached bus instance
let busInstance: EventBus | InMemoryEventBus | null = null;

async function getProjectId(): Promise<string> {
  // Try to load rapid.json config to get consistent project root
  try {
    const loaded = await loadConfig();
    if (loaded?.rootDir) {
      // Use rootDir basename as project ID for consistency across worktrees
      const baseName = loaded.rootDir.split('/').pop();
      if (baseName) return baseName;
    }
  } catch {
    // Fall back to cwd if config not found
  }
  // Fallback: use current directory name
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
        projectId: await getProjectId(),
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
 * rapid bus status
 *
 * Note: start/stop commands removed - event bus is auto-managed by `rapid dev`
 */
busCommand
  .command('status')
  .description('Show event bus status and statistics')
  .action(async () => {
    const spinner = ora('Checking event bus status...').start();

    try {
      const redisStatus = await getRedisStatus();
      const projectId = await getProjectId();

      spinner.stop();
      console.log();
      console.log(`  ${logger.brand('RAPID')} Event Bus Status`);
      console.log(`  ${logger.dim('─'.repeat(32))}`);
      console.log();

      console.log(`  ${chalk.bold('Project:')}    ${projectId}`);

      if (redisStatus.running) {
        console.log(`    ✓ ${chalk.green('Redis')} ${chalk.dim('(persistent)')}`);
        console.log(`    ${chalk.dim('URL:')}        ${redisStatus.url}`);
        console.log(`    ${chalk.dim('Container:')} ${redisStatus.containerId}`);

        // Get bus stats
        try {
          const bus = await getOrCreateBus();
          const stats = await bus.getStats();
          console.log();
          console.log(`    ${chalk.dim('Messages:')}   ${stats.messageCount}`);
          console.log(`    ${chalk.dim('Agents:')}     ${stats.activeAgents}`);
        } catch {
          // Stats not available
        }
      } else if (redisStatus.containerId) {
        console.log(`    ○ ${chalk.yellow('Stopped')}`);
        console.log(`    ${chalk.dim('Container:')} ${redisStatus.containerId}`);
      } else {
        console.log(`    ○ ${chalk.dim('Not running')}`);
      }

      console.log();
      console.log(`  ${logger.brand('Quick Actions')}`);
      console.log(`  ${logger.dim('─'.repeat(20))}`);
      if (redisStatus.running) {
        console.log(`    • rapid bus agents     ${chalk.dim('List connected agents')}`);
        console.log(`    • rapid bus listen     ${chalk.dim('Watch messages in real-time')}`);
        console.log(`    • rapid bus history    ${chalk.dim('View message history')}`);
      } else {
        console.log(`    • rapid dev            ${chalk.dim('Start development (auto-starts bus)')}`);
      }
      console.log();
    } catch (error) {
      spinner.fail('Failed to get bus status');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

/**
 * rapid bus agents
 */
busCommand
  .command('agents')
  .description('List active agents connected to the event bus')
  .option('--max-age <seconds>', 'Consider agents active within this time window', '300')
  .action(async (options) => {
    const spinner = ora('Fetching active agents...').start();

    try {
      const bus = await getOrCreateBus();
      const maxAge = parseInt(options.maxAge, 10);
      // Both EventBus and InMemoryEventBus support getActiveAgents
      const agents =
        bus instanceof EventBus
          ? await bus.getActiveAgents(maxAge)
          : await (bus as InMemoryEventBus).getActiveAgents();

      spinner.succeed(`Found ${agents.length} active agent(s)`);
      console.log();

      if (agents.length === 0) {
        console.log(
          chalk.dim('  No active agents. Agents register when they connect to the event bus.')
        );
      } else {
        console.log(chalk.bold('  ID                     NAME        WORKTREE'));
        console.log(chalk.dim('  ─'.repeat(30)));
        for (const agent of agents) {
          console.log(
            `  ${chalk.cyan(agent.id.padEnd(22))} ${agent.name.padEnd(11)} ${agent.worktree || chalk.dim('(none)')}`
          );
        }
      }
      console.log();
    } catch (error) {
      spinner.fail('Failed to list agents');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

/**
 * rapid bus history
 */
busCommand
  .command('history')
  .description('View message history from the event bus')
  .option('--hours <hours>', 'Get messages from the last N hours', '1')
  .option(
    '--type <type>',
    'Filter by message type (discovery, error, completion, question, learning, coordination)'
  )
  .option('--from <agent>', 'Filter by agent name')
  .option('--limit <count>', 'Maximum number of messages', '20')
  .option('--format <format>', 'Output format: display, json, inject', 'display')
  .action(async (options) => {
    const spinner = ora('Fetching message history...').start();

    try {
      const bus = await getOrCreateBus();
      const hours = parseFloat(options.hours);
      const limit = parseInt(options.limit, 10);

      const historyOptions: { hours: number; types?: MessageType[]; fromAgent?: string } = {
        hours,
      };
      if (options.type) {
        historyOptions.types = [options.type as MessageType];
      }
      if (options.from) {
        historyOptions.fromAgent = options.from;
      }

      const messages = await bus.getHistory(historyOptions);
      const limited = messages.slice(0, limit);

      spinner.succeed(`Retrieved ${limited.length} message(s)`);
      console.log();

      if (limited.length === 0) {
        console.log(chalk.dim('  No messages found in the specified time range.'));
      } else if (options.format === 'json') {
        console.log(JSON.stringify(limited, null, 2));
      } else if (options.format === 'inject') {
        console.log(formatMessagesForInjection(limited));
      } else {
        for (const msg of limited) {
          const icon = MESSAGE_TYPE_ICONS[msg.type] || '📨';
          const time = new Date(msg.timestamp).toLocaleTimeString();
          const from = msg.fromAgent.worktree
            ? `${msg.fromAgent.name} (${msg.fromAgent.worktree})`
            : msg.fromAgent.name;

          console.log(`  ${chalk.dim(time)} │ ${chalk.cyan(from)}`);
          console.log(
            `           │ ${icon} ${chalk.bold(msg.type.toUpperCase())}: ${msg.payload.title}`
          );
          if (msg.payload.content) {
            const contentLines = msg.payload.content.split('\n');
            for (const line of contentLines) {
              console.log(`           │    ${chalk.dim(line)}`);
            }
          }
          console.log();
        }
      }
    } catch (error) {
      spinner.fail('Failed to fetch history');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

/**
 * rapid bus send
 */
busCommand
  .command('send')
  .description('Send a message to other agents via the event bus')
  .requiredOption(
    '--type <type>',
    'Message type (discovery, error, completion, question, learning, coordination)'
  )
  .requiredOption('--title <title>', 'Short message title')
  .requiredOption('--content <content>', 'Message content')
  .option('--name <name>', 'Your agent name', 'cli')
  .option('--worktree <worktree>', 'Your worktree/branch')
  .option('--priority <priority>', 'Message priority (low, normal, high, urgent)', 'normal')
  .option('--to <agents>', 'Target agent IDs (comma-separated, omit for broadcast)')
  .action(async (options) => {
    const spinner = ora('Sending message...').start();

    try {
      const bus = await getOrCreateBus();

      const agentId = `${options.name}-${Date.now()}`;
      const fromAgent: AgentInfo = {
        id: agentId,
        name: options.name,
        worktree: options.worktree,
      };

      // Register agent first
      await bus.registerAgent(fromAgent);

      const toAgents = options.to ? options.to.split(',').map((s: string) => s.trim()) : undefined;

      const message = await bus.sendMessage(
        options.type as MessageType,
        fromAgent,
        {
          title: options.title,
          content: options.content,
        },
        {
          toAgents,
          priority: options.priority,
        }
      );

      spinner.succeed('Message sent');
      console.log();
      console.log(`  ${chalk.bold('Message ID:')} ${message.id}`);
      console.log(`  ${chalk.bold('Timestamp:')}  ${message.timestamp}`);
      console.log(
        `  ${chalk.bold('Type:')}       ${MESSAGE_TYPE_ICONS[message.type]} ${message.type}`
      );
      console.log(`  ${chalk.bold('Title:')}      ${message.payload.title}`);
      console.log();
    } catch (error) {
      spinner.fail('Failed to send message');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

/**
 * rapid bus register
 */
busCommand
  .command('register')
  .description('Register an agent with the event bus')
  .requiredOption('--name <name>', 'Agent name (e.g., claude, opencode, aider)')
  .option('--worktree <worktree>', 'Git worktree or branch name')
  .option('--session <session>', 'Session identifier')
  .action(async (options) => {
    const spinner = ora('Registering agent...').start();

    try {
      const bus = await getOrCreateBus();

      const agentId = `${options.name}-${Date.now()}`;
      const agent: AgentInfo = {
        id: agentId,
        name: options.name,
        worktree: options.worktree,
        session: options.session,
      };

      await bus.registerAgent(agent);

      spinner.succeed('Agent registered');
      console.log();
      console.log(`  ${chalk.bold('Agent ID:')}   ${agentId}`);
      console.log(`  ${chalk.bold('Name:')}       ${options.name}`);
      if (options.worktree) {
        console.log(`  ${chalk.bold('Worktree:')}   ${options.worktree}`);
      }
      if (options.session) {
        console.log(`  ${chalk.bold('Session:')}    ${options.session}`);
      }
      console.log();
      console.log(chalk.dim('  Use this agent ID when sending messages.'));
      console.log();
    } catch (error) {
      spinner.fail('Failed to register agent');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

/**
 * rapid bus listen - Listen for messages in real-time
 */
busCommand
  .command('listen')
  .description('Listen for messages in real-time')
  .option('--type <type>', 'Filter by message type')
  .action(async (options) => {
    try {
      const bus = await getOrCreateBus();

      console.log();
      console.log(`  ${logger.brand('RAPID')} Event Bus - Listening for messages...`);
      console.log(`  ${logger.dim('─'.repeat(40))}`);
      console.log(chalk.dim('  Press Ctrl+C to stop'));
      console.log();

      // Subscribe to messages
      bus.onMessage((msg) => {
        if (options.type && msg.type !== options.type) {
          return;
        }

        const icon = MESSAGE_TYPE_ICONS[msg.type] || '📨';
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const from = msg.fromAgent.worktree
          ? `${msg.fromAgent.name} (${msg.fromAgent.worktree})`
          : msg.fromAgent.name;

        console.log(`  ${chalk.dim(time)} │ ${chalk.cyan(from)}`);
        console.log(
          `           │ ${icon} ${chalk.bold(msg.type.toUpperCase())}: ${msg.payload.title}`
        );
        if (msg.payload.content) {
          const contentLines = msg.payload.content.split('\n').slice(0, 3);
          for (const line of contentLines) {
            console.log(`           │    ${chalk.dim(line)}`);
          }
          if (msg.payload.content.split('\n').length > 3) {
            console.log(`           │    ${chalk.dim('...')}`);
          }
        }
        console.log();
      });

      // Keep running
      await new Promise(() => {});
    } catch (error) {
      logger.error('Error:', error);
      process.exit(1);
    }
  });
