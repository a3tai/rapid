/**
 * rapid context - Show or inject project context
 */

import { Command } from 'commander';
import { loadConfig, assembleContext, logger } from '@a3t/rapid-core';
import ora from 'ora';

export const contextCommand = new Command('context')
  .description('Show or inject project context from rapid.json')
  .argument('[action]', 'Action: show (default) or inject', 'show')
  .option('--json', 'Output as JSON')
  .action(async (action: string, options) => {
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
        if (action === 'inject') {
          // For inject mode, output nothing and exit silently
          return;
        }
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

      if (action === 'inject') {
        // Output raw content for hooks to consume
        if (assembled.content) {
          console.log(assembled.content);
        }
        return;
      }

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
