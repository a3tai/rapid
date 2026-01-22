/**
 * Suggestion CLI Commands
 *
 * Commands for agents to propose suggestions, vote on them, and for
 * orchestrators to make decisions on group suggestions.
 */

import { Command } from 'commander';
import { logger } from '@a3t/rapid-core';
import ora from 'ora';
import chalk from 'chalk';

export const suggestCommand = new Command('suggest')
  .description('Manage agent suggestions and voting')
  .argument('[description]', 'Description of the suggestion to propose')
  .option(
    '--category <category>',
    'Category: feature, fix, improvement, refactor, or docs',
    'feature'
  )
  .option('--list', 'List all suggestions')
  .option('--list-status <status>', 'List suggestions with specific status')
  .option(
    '--vote <suggestionId>:<vote>',
    'Vote on a suggestion (format: id:approve|reject|abstain)'
  )
  .option('--approve <suggestionId>', 'Orchestrator: Approve a suggestion')
  .option('--veto <suggestionId>', 'Orchestrator: Veto a suggestion')
  .option('--reason <reason>', 'Reason for orchestrator decision')
  .option('--verbose', 'Show detailed information')
  .action(async (description, options) => {
    try {
      // List mode
      if (options.list || options.listStatus) {
        const spinner = ora('Loading suggestions...').start();

        try {
          // In a real implementation, this would call the MCP tool via the event bus or daemon
          spinner.warn('Suggestion listing requires MCP server integration');
          logger.info('Run: rapid dev to start the MCP server with suggestion tools');
        } catch (err) {
          spinner.fail(`Failed to load suggestions: ${err}`);
          process.exit(1);
        }
        return;
      }

      // Vote mode
      if (options.vote) {
        const spinner = ora('Casting vote...').start();
        const [suggestionId, vote] = options.vote.split(':');

        if (!suggestionId || !vote) {
          spinner.fail('Invalid vote format. Use: --vote <id>:<approve|reject|abstain>');
          process.exit(1);
        }

        if (!['approve', 'reject', 'abstain'].includes(vote)) {
          spinner.fail(`Invalid vote: ${vote}. Must be approve, reject, or abstain`);
          process.exit(1);
        }

        try {
          // In a real implementation, this would call the MCP tool
          spinner.warn('Voting requires MCP server integration');
          logger.info('Run: rapid dev to start the MCP server with voting tools');
        } catch (err) {
          spinner.fail(`Failed to cast vote: ${err}`);
          process.exit(1);
        }
        return;
      }

      // Orchestrator approve mode
      if (options.approve) {
        const spinner = ora('Approving suggestion...').start();

        if (!options.reason) {
          spinner.fail('Reason required: use --reason "your reason"');
          process.exit(1);
        }

        try {
          // In a real implementation, this would call the MCP tool
          spinner.warn('Approval requires MCP server integration');
          logger.info('Run: rapid dev to start the MCP server with orchestrator tools');
        } catch (err) {
          spinner.fail(`Failed to approve suggestion: ${err}`);
          process.exit(1);
        }
        return;
      }

      // Orchestrator veto mode
      if (options.veto) {
        const spinner = ora('Vetoing suggestion...').start();

        if (!options.reason) {
          spinner.fail('Reason required: use --reason "your reason"');
          process.exit(1);
        }

        try {
          // In a real implementation, this would call the MCP tool
          spinner.warn('Veto requires MCP server integration');
          logger.info('Run: rapid dev to start the MCP server with orchestrator tools');
        } catch (err) {
          spinner.fail(`Failed to veto suggestion: ${err}`);
          process.exit(1);
        }
        return;
      }

      // Propose mode (default)
      if (!description) {
        logger.error('Please provide a suggestion description or use --list to view suggestions');
        process.exit(1);
      }

      const spinner = ora('Proposing suggestion...').start();

      if (!['feature', 'fix', 'improvement', 'refactor', 'docs'].includes(options.category)) {
        spinner.fail(`Invalid category: ${options.category}`);
        process.exit(1);
      }

      try {
        // In a real implementation, this would call the MCP tool via the event bus or daemon
        spinner.succeed('Suggestion submitted for voting');
        console.log();
        console.log(`  ${logger.brand('RAPID')} Suggestion Proposed`);
        console.log(`  ${logger.dim('─'.repeat(40))}`);
        console.log();
        console.log(`  ${chalk.bold('Category:')} ${options.category}`);
        console.log(`  ${chalk.bold('Description:')} ${description}`);
        console.log();
        console.log(`  ${chalk.dim('Agents will be notified and voting will start.')}`);
        console.log(`  ${chalk.dim('Voting period: 5 minutes')}`);
        console.log(`  ${chalk.dim('Orchestrator can approve or veto at any time.')}`);

        if (options.verbose) {
          console.log();
          console.log(`  ${chalk.dim('Note: Orchestrator will be notified immediately.')}`);
          console.log(`  ${chalk.dim('Approved suggestions will become tasks.')}`);
        }
      } catch (err) {
        spinner.fail(`Failed to propose suggestion: ${err}`);
        process.exit(1);
      }
    } catch (error) {
      logger.error(`Suggestion command failed: ${error}`);
      process.exit(1);
    }
  });
