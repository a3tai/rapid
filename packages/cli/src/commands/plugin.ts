/**
 * rapid plugin - Manage RAPID plugins for Claude Code
 */

import { Command } from 'commander';
import { mkdir, copyFile, readFile, stat, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '@a3t/rapid-core';
import ora from 'ora';
import { execa } from 'execa';

export const pluginCommand = new Command('plugin').description(
  'Manage RAPID plugins for Claude Code'
);

/**
 * Get Claude Code plugin directory
 */
function getClaudePluginDir(): string {
  const homeDir = homedir();
  // Claude Code looks for plugins in ~/.claude/plugins or equivalent
  // This may vary by platform
  const platform = process.platform;
  if (platform === 'darwin') {
    return join(homeDir, '.claude', 'plugins');
  } else if (platform === 'win32') {
    return join(homeDir, 'AppData', 'Local', 'claude', 'plugins');
  } else {
    return join(homeDir, '.config', 'claude', 'plugins');
  }
}

/**
 * rapid plugin build - Build the RAPID Claude plugin
 */
pluginCommand
  .command('build')
  .description('Build the RAPID Claude plugin as a tarball')
  .option('-o, --output <path>', 'Output path for tarball', './rapid-governance-plugin.tar.gz')
  .action(async (options) => {
    const spinner = ora('Building RAPID Claude plugin...').start();

    try {
      // Find the plugin source
      const pluginSrcPaths = [
        join(process.cwd(), 'packages', 'claude-plugin'),
        join(dirname(dirname(import.meta.url.replace('file://', ''))), '..', 'claude-plugin'),
      ];

      let pluginSrc: string | null = null;
      for (const path of pluginSrcPaths) {
        try {
          await stat(path);
          pluginSrc = path;
          break;
        } catch {
          continue;
        }
      }

      if (!pluginSrc) {
        spinner.fail('Could not find claude-plugin package');
        logger.error('Run this command from the RAPID monorepo root');
        process.exit(1);
      }

      // Create tarball
      const outputPath = resolve(options.output);
      spinner.text = `Creating tarball at ${outputPath}...`;

      await execa('tar', [
        '-czf',
        outputPath,
        '-C',
        pluginSrc,
        '.claude-plugin',
        'hooks',
        'package.json',
      ]);

      spinner.succeed(`Plugin built: ${outputPath}`);
      console.log();
      console.log(`  ${logger.dim('Install with:')}`);
      console.log(`    rapid plugin install ${outputPath}`);
      console.log();
    } catch (error) {
      spinner.fail('Failed to build plugin');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid plugin install - Install a RAPID Claude plugin
 */
pluginCommand
  .command('install')
  .description('Install a RAPID Claude plugin')
  .argument('[source]', 'Plugin source (tarball path, directory, or "rapid-governance")')
  .option('--from-repo', 'Install built-in rapid-governance plugin from repo')
  .action(async (source: string | undefined, options) => {
    const spinner = ora('Installing plugin...').start();

    try {
      const pluginDir = getClaudePluginDir();
      const targetDir = join(pluginDir, 'rapid-governance');

      // Ensure plugin directory exists
      await mkdir(pluginDir, { recursive: true });

      // Determine source
      let srcDir: string;

      if (options.fromRepo || source === 'rapid-governance' || !source) {
        // Install from repo
        const repoPluginPaths = [
          join(process.cwd(), 'packages', 'claude-plugin'),
          join(dirname(dirname(import.meta.url.replace('file://', ''))), '..', 'claude-plugin'),
        ];

        srcDir = '';
        for (const path of repoPluginPaths) {
          try {
            await stat(join(path, '.claude-plugin', 'plugin.json'));
            srcDir = path;
            break;
          } catch {
            continue;
          }
        }

        if (!srcDir) {
          spinner.fail('Could not find rapid-governance plugin');
          logger.error('Run this command from the RAPID monorepo root');
          process.exit(1);
        }
      } else if (source.endsWith('.tar.gz') || source.endsWith('.tgz')) {
        // Extract tarball to temp dir then copy
        const tmpDir = join(homedir(), '.rapid', 'tmp', `plugin-${Date.now()}`);
        await mkdir(tmpDir, { recursive: true });

        spinner.text = `Extracting ${source}...`;
        await execa('tar', ['-xzf', source, '-C', tmpDir]);

        srcDir = tmpDir;
      } else {
        // Assume it's a directory
        srcDir = resolve(source);
      }

      // Verify plugin structure
      try {
        await stat(join(srcDir, '.claude-plugin', 'plugin.json'));
      } catch {
        spinner.fail('Invalid plugin: missing .claude-plugin/plugin.json');
        process.exit(1);
      }

      // Remove existing installation
      try {
        await rm(targetDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }

      // Create target directory
      await mkdir(targetDir, { recursive: true });

      // Copy plugin files
      spinner.text = 'Copying plugin files...';

      // Copy .claude-plugin directory
      const claudePluginSrc = join(srcDir, '.claude-plugin');
      const claudePluginDst = join(targetDir, '.claude-plugin');
      await mkdir(claudePluginDst, { recursive: true });

      for (const file of ['plugin.json', 'hooks.json', 'mcp.json', 'settings.json']) {
        try {
          await copyFile(join(claudePluginSrc, file), join(claudePluginDst, file));
        } catch {
          // Optional file
        }
      }

      // Copy hooks directory
      const hooksSrc = join(srcDir, 'hooks');
      const hooksDst = join(targetDir, 'hooks');
      await mkdir(hooksDst, { recursive: true });

      for (const hook of ['pre-tool-use.sh', 'post-tool-use.sh', 'permission-request.sh']) {
        try {
          await copyFile(join(hooksSrc, hook), join(hooksDst, hook));
          // Make executable
          await execa('chmod', ['+x', join(hooksDst, hook)]);
        } catch {
          // Optional hook
        }
      }

      // Copy package.json
      try {
        await copyFile(join(srcDir, 'package.json'), join(targetDir, 'package.json'));
      } catch {
        // Optional
      }

      spinner.succeed('Plugin installed: rapid-governance');
      console.log();
      console.log(`  ${logger.dim('Location:')} ${targetDir}`);
      console.log(`  ${logger.dim('Restart Claude Code to activate the plugin')}`);
      console.log();
    } catch (error) {
      spinner.fail('Failed to install plugin');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid plugin uninstall - Uninstall a RAPID Claude plugin
 */
pluginCommand
  .command('uninstall')
  .description('Uninstall the RAPID Claude plugin')
  .argument('[name]', 'Plugin name', 'rapid-governance')
  .action(async (name: string) => {
    const spinner = ora(`Uninstalling plugin ${name}...`).start();

    try {
      const pluginDir = getClaudePluginDir();
      const targetDir = join(pluginDir, name);

      try {
        await stat(targetDir);
      } catch {
        spinner.fail(`Plugin not installed: ${name}`);
        process.exit(1);
      }

      await rm(targetDir, { recursive: true, force: true });

      spinner.succeed(`Plugin uninstalled: ${name}`);
      console.log();
      console.log(`  ${logger.dim('Restart Claude Code to complete removal')}`);
      console.log();
    } catch (error) {
      spinner.fail('Failed to uninstall plugin');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid plugin list - List installed plugins
 */
pluginCommand
  .command('list')
  .description('List installed Claude Code plugins')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const pluginDir = getClaudePluginDir();
      const { readdir } = await import('node:fs/promises');

      const plugins: Array<{
        name: string;
        version: string;
        description: string;
        path: string;
      }> = [];

      try {
        const entries = await readdir(pluginDir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const pluginJsonPath = join(pluginDir, entry.name, '.claude-plugin', 'plugin.json');
            try {
              const content = await readFile(pluginJsonPath, 'utf-8');
              const manifest = JSON.parse(content);
              plugins.push({
                name: manifest.name || entry.name,
                version: manifest.version || 'unknown',
                description: manifest.description || '',
                path: join(pluginDir, entry.name),
              });
            } catch {
              // Not a valid plugin
            }
          }
        }
      } catch {
        // Plugin directory doesn't exist
      }

      if (options.json) {
        console.log(JSON.stringify({ plugins }, null, 2));
        return;
      }

      console.log();
      console.log(`  ${logger.brand('Claude Code Plugins')}`);
      console.log(`  ${logger.dim('─'.repeat(40))}`);
      console.log();

      if (plugins.length === 0) {
        console.log(`  ${logger.dim('No plugins installed')}`);
        console.log();
        console.log(`  ${logger.dim('Install with:')} rapid plugin install`);
        console.log();
        return;
      }

      for (const plugin of plugins) {
        console.log(`  ${logger.brand('•')} ${plugin.name} ${logger.dim(`v${plugin.version}`)}`);
        if (plugin.description) {
          console.log(`    ${logger.dim(plugin.description)}`);
        }
        console.log(`    ${logger.dim('Path:')} ${plugin.path}`);
        console.log();
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid plugin status - Show plugin status
 */
pluginCommand
  .command('status')
  .description('Show status of installed plugins')
  .action(async () => {
    try {
      const pluginDir = getClaudePluginDir();
      const targetDir = join(pluginDir, 'rapid-governance');

      console.log();
      console.log(`  ${logger.brand('RAPID Plugin Status')}`);
      console.log(`  ${logger.dim('─'.repeat(40))}`);
      console.log();

      try {
        await stat(targetDir);

        // Read manifest
        const manifestPath = join(targetDir, '.claude-plugin', 'plugin.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

        console.log(
          `  ${logger.brand('✓')} rapid-governance ${logger.dim(`v${manifest.version}`)}`
        );
        console.log(`    ${logger.dim('Status:')} Installed`);
        console.log(`    ${logger.dim('Path:')}   ${targetDir}`);
        console.log();

        // Check hooks
        const hooks = ['pre-tool-use.sh', 'post-tool-use.sh', 'permission-request.sh'];
        console.log(`  ${logger.dim('Hooks:')}`);
        for (const hook of hooks) {
          const hookPath = join(targetDir, 'hooks', hook);
          try {
            await stat(hookPath);
            console.log(`    ${logger.brand('✓')} ${hook}`);
          } catch {
            console.log(`    ${logger.dim('○')} ${hook} ${logger.dim('(missing)')}`);
          }
        }
        console.log();

        // Check MCP server
        const mcpPath = join(targetDir, '.claude-plugin', 'mcp.json');
        try {
          const mcpConfig = JSON.parse(await readFile(mcpPath, 'utf-8'));
          console.log(`  ${logger.dim('MCP Servers:')}`);
          for (const [name] of Object.entries(mcpConfig.mcpServers || {})) {
            console.log(`    ${logger.brand('•')} ${name}`);
          }
          console.log();
        } catch {
          // No MCP config
        }
      } catch {
        console.log(`  ${logger.dim('○')} rapid-governance not installed`);
        console.log();
        console.log(`  ${logger.dim('Install with:')} rapid plugin install`);
        console.log();
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
