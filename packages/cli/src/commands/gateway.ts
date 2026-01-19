/**
 * rapid gateway - Manage API gateway
 */

import { Command } from 'commander';
import {
  loadConfig,
  logger,
  GatewayManager,
  checkExternalGateway,
  type GatewayStatus,
} from '@a3t/rapid-core';
import ora from 'ora';
import chalk from 'chalk';

export const gatewayCommand = new Command('gateway')
  .description('Manage LiteLLM API gateway')
  .addCommand(
    new Command('status')
      .description('Show gateway status')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          const spinner = ora('Checking gateway status...').start();

          // Load config
          const loaded = await loadConfig();
          const config = loaded?.config;
          const gatewayConfig = config?.gateway;

          let status: GatewayStatus;

          if (gatewayConfig?.enabled) {
            const manager = new GatewayManager(gatewayConfig);
            status = await manager.getStatus();
          } else {
            status = {
              enabled: false,
              healthy: false,
            };
          }

          spinner.stop();

          if (options.json) {
            console.log(JSON.stringify(status, null, 2));
            return;
          }

          // Pretty output
          console.log();
          console.log(`  ${logger.brand('RAPID')} Gateway Status`);
          console.log(`  ${logger.dim('─'.repeat(28))}`);
          console.log();

          if (!gatewayConfig?.enabled) {
            console.log(`  ${logger.dim('○')} Gateway not enabled in rapid.json`);
            console.log();
            logger.info('Add gateway configuration to rapid.json to enable');
            console.log();
            return;
          }

          const enabledIcon = logger.brand('✓');
          console.log(`  ${enabledIcon} Gateway enabled`);
          console.log(`  ${logger.dim('Type:')}     ${gatewayConfig.type ?? 'litellm'}`);
          console.log(`  ${logger.dim('Mode:')}     ${gatewayConfig.mode ?? 'external'}`);
          console.log(`  ${logger.dim('URL:')}      ${gatewayConfig.config?.baseUrl}`);

          const healthIcon = status.healthy ? logger.brand('✓') : logger.dim('○');
          console.log(
            `  ${logger.dim('Health:')}   ${healthIcon} ${status.healthy ? 'Healthy' : 'Unhealthy'}`
          );

          if (gatewayConfig.models?.default) {
            console.log(`  ${logger.dim('Default:')}  ${gatewayConfig.models.default}`);
          }

          if (gatewayConfig.models?.aliases) {
            const aliasCount = Object.keys(gatewayConfig.models.aliases).length;
            console.log(`  ${logger.dim('Aliases:')}  ${aliasCount} configured`);
          }

          console.log();

          if (!status.healthy) {
            if (gatewayConfig.mode === 'external') {
              logger.warn(`Gateway at ${gatewayConfig.config?.baseUrl} is not responding`);
            } else if (gatewayConfig.mode === 'managed') {
              logger.info('Run `rapid gateway start` to start the gateway');
            }
          }

          console.log();
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('start').description('Start managed gateway').action(async () => {
      try {
        const spinner = ora('Starting gateway...').start();

        const loaded = await loadConfig();
        const config = loaded?.config;
        const gatewayConfig = config?.gateway;

        if (!gatewayConfig?.enabled) {
          spinner.fail('Gateway not enabled in rapid.json');
          process.exit(1);
        }

        if (gatewayConfig.mode !== 'managed') {
          spinner.fail('Gateway is not in managed mode');
          logger.info('Set gateway.mode to "managed" in rapid.json');
          process.exit(1);
        }

        const manager = new GatewayManager(gatewayConfig);

        try {
          await manager.start();
          spinner.succeed('Gateway started');

          const status = await manager.getStatus();
          console.log();
          console.log(`  ${logger.dim('URL:')}      ${status.baseUrl}`);
          console.log(`  ${logger.dim('Health:')}   ${status.healthy ? 'Healthy' : 'Starting...'}`);
          console.log();
        } catch (error) {
          spinner.fail('Failed to start gateway');
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    })
  )
  .addCommand(
    new Command('stop').description('Stop managed gateway').action(async () => {
      try {
        const spinner = ora('Stopping gateway...').start();

        const loaded = await loadConfig();
        const config = loaded?.config;
        const gatewayConfig = config?.gateway;

        if (!gatewayConfig?.enabled) {
          spinner.fail('Gateway not enabled in rapid.json');
          process.exit(1);
        }

        const manager = new GatewayManager(gatewayConfig);
        await manager.stop();

        spinner.succeed('Gateway stopped');
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    })
  )
  .addCommand(
    new Command('check')
      .description('Check external gateway health')
      .argument('[url]', 'Gateway URL to check')
      .action(async (url?: string) => {
        try {
          const loaded = await loadConfig();
          const config = loaded?.config;
          const gatewayConfig = config?.gateway;

          const checkUrl = url || gatewayConfig?.config?.baseUrl || 'http://localhost:4000';

          const spinner = ora(`Checking ${checkUrl}...`).start();

          const healthy = await checkExternalGateway(checkUrl);

          spinner.stop();

          if (healthy) {
            console.log(`  ${logger.brand('✓')} Gateway at ${checkUrl} is healthy`);
          } else {
            console.log(`  ${logger.dim('○')} Gateway at ${checkUrl} is not responding`);
          }
          console.log();
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('generate-config')
      .description('Generate LiteLLM configuration file')
      .option('-o, --output <file>', 'Output file', 'litellm_config.yaml')
      .action(async (options) => {
        try {
          const configContent = GatewayManager.generateLitellmConfig({
            models: {
              'claude-3.5-sonnet': {
                litellm_provider: 'anthropic',
                model: 'claude-3-5-sonnet-20241022',
              },
              'gpt-4o': {
                litellm_provider: 'openai',
                model: 'gpt-4o',
              },
            },
          });

          const fs = await import('node:fs/promises');
          await fs.writeFile(options.output, configContent);

          console.log(`  ${logger.brand('✓')} Generated ${options.output}`);
          console.log();
          logger.info('Edit the file to add your models and settings');
          logger.info(`Start with: litellm --config ${options.output}`);
          console.log();
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('costs')
      .description('View LLM cost summary and history')
      .option('--hours <hours>', 'Show costs for last N hours', '24')
      .option('--days <days>', 'Show costs for last N days')
      .option('--model <model>', 'Filter by model')
      .option('--agent <agent>', 'Filter by agent')
      .option('--session <session>', 'Filter by session')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          const manager = new GatewayManager();

          const hours = options.days
            ? parseInt(options.days, 10) * 24
            : parseInt(options.hours, 10);
          const summary = manager.getCostSummary({ hours });

          if (options.json) {
            console.log(JSON.stringify(summary, null, 2));
            return;
          }

          console.log();
          console.log(`  ${logger.brand('RAPID')} Gateway Costs`);
          console.log(`  ${logger.dim('─'.repeat(40))}`);
          console.log();

          // Period
          const startDate = new Date(summary.period.start);
          const endDate = new Date(summary.period.end);
          console.log(
            `  ${chalk.bold('Period:')}      ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
          );
          console.log(
            `  ${chalk.bold('Total Cost:')} ${chalk.green('$' + summary.totalCost.toFixed(2))}`
          );
          console.log(`  ${chalk.bold('Requests:')}   ${summary.totalRequests}`);
          console.log(
            `  ${chalk.bold('Tokens:')}     ${(summary.totalInputTokens + summary.totalOutputTokens).toLocaleString()}`
          );
          console.log();

          // By model
          if (Object.keys(summary.byModel).length > 0) {
            console.log(`  ${chalk.bold('By Model:')}`);
            for (const [model, data] of Object.entries(summary.byModel)) {
              console.log(
                `    ${chalk.cyan(model.padEnd(20))} $${data.cost.toFixed(2).padStart(8)} (${data.tokens.toLocaleString()} tokens)`
              );
            }
            console.log();
          }

          // By agent
          if (Object.keys(summary.byAgent).length > 0) {
            console.log(`  ${chalk.bold('By Agent:')}`);
            for (const [agent, data] of Object.entries(summary.byAgent)) {
              console.log(
                `    ${chalk.cyan(agent.padEnd(20))} $${data.cost.toFixed(2).padStart(8)} (${data.requests} requests)`
              );
            }
            console.log();
          }

          if (summary.totalRequests === 0) {
            console.log(chalk.dim('  No cost data recorded yet.'));
            console.log(chalk.dim('  Cost tracking records LLM requests when using the gateway.'));
            console.log();
          }
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('logs')
      .description('View gateway request logs')
      .option('--limit <count>', 'Maximum number of records', '20')
      .option('--model <model>', 'Filter by model')
      .option('--agent <agent>', 'Filter by agent')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          const manager = new GatewayManager();
          const limit = parseInt(options.limit, 10);

          const records = manager.getCostRecords({
            model: options.model,
            agent: options.agent,
            limit,
          });

          if (options.json) {
            console.log(JSON.stringify(records, null, 2));
            return;
          }

          console.log();
          console.log(`  ${logger.brand('RAPID')} Gateway Logs`);
          console.log(`  ${logger.dim('─'.repeat(60))}`);
          console.log();

          if (records.length === 0) {
            console.log(chalk.dim('  No request logs found.'));
            console.log();
            return;
          }

          for (const record of records) {
            const time = new Date(record.timestamp).toLocaleTimeString();
            const status = record.status === 'success' ? chalk.green('✓') : chalk.red('✗');
            const cost = '$' + record.cost.toFixed(4);
            const tokens = `${record.inputTokens}→${record.outputTokens}`;

            console.log(
              `  ${chalk.dim(time)} ${status} ${chalk.cyan(record.model.padEnd(16))} ${cost.padStart(8)} ${chalk.dim(tokens.padStart(12))} ${record.latencyMs}ms`
            );
          }
          console.log();
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('init')
      .description('Initialize gateway with default LiteLLM configuration')
      .option('--budget <amount>', 'Monthly budget in USD', '100')
      .option('--cache', 'Enable response caching (requires Redis)')
      .option('--verbose', 'Enable verbose logging')
      .action(async (options) => {
        try {
          const spinner = ora('Generating LiteLLM configuration...').start();

          const manager = new GatewayManager();
          const config = GatewayManager.generateDefaultConfig({
            budget: {
              maxBudget: parseFloat(options.budget),
              budgetDuration: '30d',
            },
            useCache: options.cache,
            verbose: options.verbose,
          });

          const configPath = manager.writeLiteLLMConfig(config);

          spinner.succeed('LiteLLM configuration created');
          console.log();
          console.log(`  ${chalk.bold('Config file:')} ${configPath}`);
          console.log(`  ${chalk.bold('Budget:')}      $${options.budget}/month`);
          console.log(
            `  ${chalk.bold('Models:')}      claude-sonnet, claude-opus, gpt-4o, gpt-4o-mini`
          );
          console.log();
          console.log(chalk.dim('  To start the gateway:'));
          console.log(chalk.dim(`  litellm --config ${configPath} --port 4000`));
          console.log();
          console.log(chalk.dim('  Then update rapid.json:'));
          console.log(chalk.dim('  { "gateway": { "enabled": true, "mode": "external" } }'));
          console.log();
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  );
