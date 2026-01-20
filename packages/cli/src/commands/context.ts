/**
 * rapid context - Show or inject project context
 */

import { Command } from 'commander';
import { loadConfig, assembleContext, logger, createContextEngine } from '@a3t/rapid-core';
import ora from 'ora';
import chalk from 'chalk';

export const contextCommand = new Command('context').description('Manage project context and agent knowledge');

// Subcommand: Show (original behavior)
contextCommand
  .command('show')
  .description('Show project context from rapid.json')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const spinner = ora('Loading configuration...').start();
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found. Run `rapid init` first.');
        process.exit(1);
      }

      const { config, rootDir } = loaded;
      spinner.stop();

      if (!config.context?.files?.length && !config.context?.dirs?.length) {
        logger.info('No context files or directories configured.');
        logger.blank();
        logger.dim('Add files or directories to rapid.json:');
        logger.dim('  "context": {');
        logger.dim('    "files": ["README.md", "docs/architecture.md"],');
        logger.dim('    "dirs": ["docs/"]');
        logger.dim('  }');
        return;
      }

      const assembled = await assembleContext(rootDir, config.context);

      // Show mode
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              files: assembled.files.map((f) => ({
                path: f.relativePath,
                size: f.size,
                truncated: f.truncated,
              })),
              totalSize: assembled.totalSize,
              skippedFiles: assembled.skippedFiles.map((f) => ({
                path: f.path,
                reason: f.reason,
              })),
            },
            null,
            2
          )
        );
        return;
      }

      logger.header('Context Configuration');
      logger.blank();

      // Show configured sources
      if (config.context.files?.length) {
        logger.info('Configured files:');
        for (const file of config.context.files) {
          console.log(`  ${logger.dim('•')} ${file}`);
        }
        logger.blank();
      }

      if (config.context.dirs?.length) {
        logger.info('Configured directories:');
        for (const dir of config.context.dirs) {
          console.log(`  ${logger.dim('•')} ${dir}`);
        }
        logger.blank();
      }

      if (config.context.exclude?.length) {
        logger.info('Exclude patterns:');
        for (const pattern of config.context.exclude) {
          console.log(`  ${logger.dim('•')} ${pattern}`);
        }
        logger.blank();
      }

      // Show assembled files
      logger.info(`Assembled ${assembled.files.length} file(s):`);
      for (const file of assembled.files) {
        const sizeKb = (file.size / 1024).toFixed(1);
        console.log(`  ${logger.brand('•')} ${file.relativePath} ${logger.dim(`(${sizeKb}KB)`)}`);
      }

      // Show total size
      const totalKb = (assembled.totalSize / 1024).toFixed(1);
      logger.blank();
      logger.dim(`Total size: ${totalKb}KB`);

      // Show skipped files if any
      if (assembled.skippedFiles.length > 0) {
        logger.blank();
        logger.info(`Skipped ${assembled.skippedFiles.length} file(s):`);
        for (const skipped of assembled.skippedFiles) {
          const reasonText = getSkipReasonText(skipped.reason);
          console.log(`  ${logger.dim('•')} ${skipped.path} ${logger.dim(`(${reasonText})`)}`);
        }
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Subcommand: Knowledge - Learn
contextCommand
  .command('learn <key> <value>')
  .option('-m, --memory-type <type>', 'Memory type: episodic, semantic, procedural, decision_trace', 'semantic')
  .option('-t, --tags <tags...>', 'Tags for categorization')
  .option('--confidence <score>', 'Confidence score (0-1)', '0.8')
  .option('--expires <iso>', 'ISO timestamp when knowledge expires')
  .description('Store new knowledge or learned information')
  .action(async (key: string, value: string, options: Record<string, unknown>) => {
    const spinner = ora('Storing knowledge...').start();
    try {
      const engine = createContextEngine({
        projectDir: process.cwd(),
      });

      const confidence = Math.min(1, Math.max(0, parseFloat(String(options.confidence))));
      const memoryType = (String(options.memoryType) || 'semantic') as 'episodic' | 'semantic' | 'procedural' | 'decision_trace';
      const learnOptions: Record<string, unknown> = {
        confidence,
        tags: (Array.isArray(options.tags) ? options.tags.map(String) : []) || [],
      };
      if (options.expires) {
        learnOptions.expiresAt = String(options.expires);
      }
      const entry = await engine.learn(key, value, memoryType, learnOptions);

      spinner.succeed('Knowledge stored');
      console.log();
      console.log(`  ${logger.brand('✓')} Knowledge Stored`);
      console.log(`    Key: ${entry.key}`);
      console.log(`    ID: ${entry.id}`);
      console.log(`    Type: ${entry.memoryType}`);
      if (entry.metadata.tags.length > 0) {
        console.log(`    Tags: ${entry.metadata.tags.join(', ')}`);
      }
      console.log(`    Confidence: ${(entry.metadata.confidence * 100).toFixed(0)}%`);
      console.log();
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Subcommand: Knowledge - Recall
contextCommand
  .command('recall <key>')
  .description('Retrieve specific knowledge by key')
  .action(async (key: string) => {
    const spinner = ora('Recalling knowledge...').start();
    try {
      const engine = createContextEngine({
        projectDir: process.cwd(),
      });

      const entry = await engine.recall(key);

      if (!entry) {
        spinner.warn('Knowledge not found');
        console.log();
        console.log(`  ${chalk.yellow('⚠')} No knowledge found for key: ${key}`);
        console.log();
        return;
      }

      spinner.succeed('Knowledge retrieved');
      console.log();
      console.log(`  ${logger.brand('✓')} Knowledge Recalled`);
      console.log(`    Key: ${entry.key}`);
      console.log(`    Type: ${entry.memoryType}`);
      console.log(`    Confidence: ${(entry.metadata.confidence * 100).toFixed(0)}%`);
      console.log(`    Created: ${new Date(entry.metadata.createdAt).toISOString()}`);
      if (entry.metadata.tags.length > 0) {
        console.log(`    Tags: ${entry.metadata.tags.join(', ')}`);
      }
      console.log(`    Value:`);
      console.log(`      ${JSON.stringify(entry.value, null, 2).split('\n').join('\n      ')}`);
      console.log();
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Subcommand: Knowledge - Search
contextCommand
  .command('search <query>')
  .option('-m, --memory-type <type>', 'Filter by memory type')
  .option('-l, --limit <number>', 'Maximum results', '20')
  .description('Search across stored knowledge')
  .action(async (query: string, options: Record<string, unknown>) => {
    const spinner = ora('Searching knowledge...').start();
    try {
      const engine = createContextEngine({
        projectDir: process.cwd(),
      });

      const searchOptions: Record<string, unknown> = {
        limit: parseInt(String(options.limit), 10),
      };
      if (options.memoryType) {
        searchOptions.memoryType = String(options.memoryType) as 'episodic' | 'semantic' | 'procedural' | 'decision_trace';
      }
      const results = await engine.search(query, searchOptions);

      spinner.succeed('Search completed');
      console.log();
      console.log(`  ${logger.brand('✓')} Knowledge Search Results`);
      console.log(`    Query: ${query}`);
      if (options.memoryType) {
        console.log(`    Type: ${options.memoryType}`);
      }
      console.log(`    Found: ${results.length} result(s)`);
      console.log();

      if (results.length > 0) {
        for (const result of results) {
          console.log(`    ${logger.brand('•')} ${result.key}`);
          console.log(`      Type: ${result.memoryType}`);
          console.log(`      Confidence: ${(result.metadata.confidence * 100).toFixed(0)}%`);
          if (result.metadata.tags.length > 0) {
            console.log(`      Tags: ${result.metadata.tags.join(', ')}`);
          }
        }
      }
      console.log();
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Subcommand: Knowledge - List
contextCommand
  .command('list')
  .option('-m, --memory-type <type>', 'Filter by memory type')
  .option('-t, --tags <tags...>', 'Filter by tags')
  .option('--confidence <score>', 'Minimum confidence score')
  .option('-l, --limit <number>', 'Maximum results', '50')
  .description('List all stored knowledge with optional filtering')
  .action(async (options: Record<string, unknown>) => {
    const spinner = ora('Listing knowledge...').start();
    try {
      const engine = createContextEngine({
        projectDir: process.cwd(),
      });

      const listOptions: Record<string, unknown> = {
        tags: Array.isArray(options.tags) ? options.tags.map(String) : [],
      };
      if (options.memoryType) {
        listOptions.memoryType = String(options.memoryType) as 'episodic' | 'semantic' | 'procedural' | 'decision_trace';
      }
      if (options.confidence) {
        listOptions.minConfidence = parseFloat(String(options.confidence));
      }
      const entries = await engine.list(listOptions);

      const limited = entries.slice(0, parseInt(String(options.limit), 10));

      spinner.succeed('Knowledge listed');
      console.log();
      console.log(`  ${logger.brand('✓')} Stored Knowledge`);
      console.log(`    Total: ${limited.length} entry(ies)`);
      console.log();

      if (limited.length > 0) {
        for (const entry of limited) {
          console.log(`    ${logger.brand('•')} ${entry.key}`);
          console.log(`      Type: ${entry.memoryType}`);
          console.log(`      Confidence: ${(entry.metadata.confidence * 100).toFixed(0)}%`);
          if (entry.metadata.tags.length > 0) {
            console.log(`      Tags: ${entry.metadata.tags.join(', ')}`);
          }
          console.log(`      Created: ${new Date(entry.metadata.createdAt).toLocaleDateString()}`);
        }
      } else {
        console.log(`    ${chalk.dim('(no entries found)')}`);
      }
      console.log();
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Subcommand: Knowledge - Forget
contextCommand
  .command('forget <key>')
  .option('--confirm', 'Skip confirmation prompt')
  .description('Remove outdated or incorrect knowledge')
  .action(async (key: string, options: Record<string, unknown>) => {
    if (!options.confirm) {
      console.log();
      console.log(`  ${chalk.yellow('⚠')} This will permanently delete knowledge for key: ${key}`);
      console.log(`  ${chalk.dim('Use --confirm to skip this prompt')}`);
      console.log();
      return;
    }

    const spinner = ora('Removing knowledge...').start();
    try {
      const engine = createContextEngine({
        projectDir: process.cwd(),
      });

      const deleted = await engine.forget(key);

      if (!deleted) {
        spinner.warn('Knowledge not found');
        console.log();
        console.log(`  ${chalk.yellow('⚠')} No knowledge found for key: ${key}`);
        console.log();
        return;
      }

      spinner.succeed('Knowledge removed');
      console.log();
      console.log(`  ${logger.brand('✗')} Knowledge forgotten`);
      console.log(`    Key: ${key}`);
      console.log();
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Subcommand: Stats
contextCommand
  .command('stats')
  .description('Show context engine statistics')
  .action(async () => {
    const spinner = ora('Gathering statistics...').start();
    try {
      const engine = createContextEngine({
        projectDir: process.cwd(),
      });

      const stats = await engine.getStats();

      spinner.succeed('Statistics retrieved');
      console.log();
      console.log(`  ${logger.brand('✓')} Context Engine Statistics`);
      console.log(`    Total Entries: ${stats.totalEntries}`);
      console.log(`    By Memory Type:`);
      console.log(`      Episodic: ${stats.byMemoryType.episodic}`);
      console.log(`      Semantic: ${stats.byMemoryType.semantic}`);
      console.log(`      Procedural: ${stats.byMemoryType.procedural}`);
      console.log(`      Decision Trace: ${stats.byMemoryType.decision_trace}`);
      if (stats.oldestEntry) {
        console.log(`    Oldest Entry: ${stats.oldestEntry}`);
      }
      if (stats.mostAccessed) {
        console.log(`    Most Accessed: ${stats.mostAccessed}`);
      }
      console.log();
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Subcommand: Inject
contextCommand
  .command('inject <keywords...>')
  .option('-l, --limit <number>', 'Maximum results', '10')
  .description('Get context relevant to keywords for a task')
  .action(async (keywords: string[], options: Record<string, unknown>) => {
    const spinner = ora('Injecting relevant context...').start();
    try {
      const engine = createContextEngine({
        projectDir: process.cwd(),
      });

      const entries = await engine.inject(keywords, parseInt(String(options.limit), 10));

      spinner.succeed('Context injected');
      console.log();
      console.log(`  ${logger.brand('✓')} Relevant Context for Task`);
      console.log(`    Keywords: ${keywords.join(', ')}`);
      console.log(`    Found: ${entries.length} entry(ies)`);
      console.log();

      if (entries.length > 0) {
        for (const entry of entries) {
          console.log(`    ${logger.brand('•')} ${entry.key}`);
          console.log(`      Type: ${entry.memoryType}`);
          console.log(`      Confidence: ${(entry.metadata.confidence * 100).toFixed(0)}%`);
        }
      }
      console.log();
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Subcommand: Consolidate
contextCommand
  .command('consolidate')
  .option('--max-age <days>', 'Maximum age in days', '30')
  .option('--min-confidence <score>', 'Minimum confidence (0-1)', '0.5')
  .description('Archive old, low-confidence entries')
  .action(async (options: Record<string, unknown>) => {
    const spinner = ora('Consolidating knowledge store...').start();
    try {
      const engine = createContextEngine({
        projectDir: process.cwd(),
      });

      const maxAge = parseInt(String(options.maxAge), 10);
      const minConfidence = parseFloat(String(options.minConfidence));

      const result = await engine.consolidate({
        maxAge,
        minConfidence,
      });

      spinner.succeed('Knowledge consolidated');
      console.log();
      console.log(`  ${logger.brand('✓')} Knowledge Store Consolidation`);
      console.log(`    Criteria: age > ${maxAge} days AND confidence < ${minConfidence}`);
      console.log(`    Archived: ${result.archived} entries`);
      console.log(`    Kept: ${result.kept} entries`);
      console.log();
    } catch (error) {
      spinner.fail(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Default action
contextCommand.action(() => {
  contextCommand.help();
});

function getSkipReasonText(reason: string): string {
  switch (reason) {
    case 'missing':
      return 'file not found';
    case 'binary':
      return 'binary file';
    case 'too-large':
      return 'exceeds size limit';
    case 'excluded':
      return 'excluded by pattern';
    case 'directory':
      return 'is a directory';
    case 'error':
      return 'read error';
    default:
      return reason;
  }
}
