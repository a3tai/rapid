/**
 * rapid mcp - Manage MCP (Model Context Protocol) servers
 */

import { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  loadConfig,
  logger,
  getMcpServers,
  getMcpServerStatus,
  addMcpServerFromTemplate,
  addMcpServer,
  removeMcpServer,
  enableMcpServer,
  disableMcpServer,
  writeMcpConfig,
  writeOpenCodeConfig,
  MCP_SERVER_TEMPLATES,
  getMcpTemplate,
  type RapidConfig,
  type McpServerDefinition,
} from '@a3t/rapid-core';
import ora from 'ora';

export const mcpCommand = new Command('mcp').description(
  'Manage MCP (Model Context Protocol) servers'
);

/**
 * Save updated config to rapid.json
 */
async function saveConfig(rootDir: string, config: RapidConfig): Promise<void> {
  const configPath = join(rootDir, 'rapid.json');
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * rapid mcp list - List configured MCP servers
 */
mcpCommand
  .command('list')
  .description('List configured MCP servers')
  .option('--json', 'Output as JSON')
  .option('--templates', 'Show available templates instead of configured servers')
  .action(async (options) => {
    try {
      if (options.templates) {
        // Show available templates
        if (options.json) {
          console.log(JSON.stringify(MCP_SERVER_TEMPLATES, null, 2));
          return;
        }

        console.log();
        console.log(`  ${logger.brand('Available MCP Server Templates')}`);
        console.log(`  ${logger.dim('─'.repeat(40))}`);
        console.log();

        for (const [name, template] of Object.entries(MCP_SERVER_TEMPLATES)) {
          const typeLabel =
            template.type === 'remote' ? logger.dim('(remote)') : logger.dim('(stdio)');
          const secretsLabel =
            template.requiredSecrets.length > 0
              ? logger.dim(` - requires: ${template.requiredSecrets.join(', ')}`)
              : logger.dim(' - no secrets required');

          console.log(`  ${logger.brand('•')} ${name} ${typeLabel}`);
          console.log(`    ${template.description}${secretsLabel}`);
          console.log();
        }

        logger.info(`Use ${logger.brand('rapid mcp add <name>')} to add a server`);
        console.log();
        return;
      }

      const loaded = await loadConfig();

      if (!loaded) {
        logger.error('No rapid.json found. Run `rapid init` first.');
        process.exit(1);
      }

      const { config } = loaded;
      const servers = getMcpServers(config);

      if (options.json) {
        console.log(JSON.stringify({ servers }, null, 2));
        return;
      }

      console.log();
      console.log(`  ${logger.brand('MCP Servers')}`);
      console.log(`  ${logger.dim('─'.repeat(40))}`);
      console.log();

      if (servers.length === 0) {
        console.log(`  ${logger.dim('No MCP servers configured')}`);
        console.log();
        logger.info(`Use ${logger.brand('rapid mcp add <name>')} to add a server`);
        logger.info(`Use ${logger.brand('rapid mcp list --templates')} to see available templates`);
        console.log();
        return;
      }

      for (const server of servers) {
        const icon = server.enabled ? logger.brand('✓') : logger.dim('○');
        const typeLabel = server.type === 'remote' ? logger.dim('(remote)') : logger.dim('(stdio)');
        const statusLabel = server.enabled ? '' : logger.dim(' [disabled]');
        const location =
          server.type === 'remote'
            ? logger.dim(server.url || '')
            : logger.dim(server.command || '');

        console.log(`  ${icon} ${server.name} ${typeLabel}${statusLabel}`);
        if (location) {
          console.log(`    ${location}`);
        }
        console.log();
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid mcp add - Add an MCP server
 */
mcpCommand
  .command('add')
  .description('Add an MCP server')
  .argument('<name>', 'Server name (or template name)')
  .option('--type <type>', 'Server type: remote or stdio')
  .option('--url <url>', 'URL for remote servers')
  .option('--command <cmd>', 'Command for stdio servers')
  .option('--args <args>', 'Arguments for stdio command (comma-separated)')
  .option('--header <header>', 'HTTP header for remote servers (name=value)', collectHeaders, {})
  .action(async (name: string, options) => {
    const spinner = ora(`Adding MCP server '${name}'...`).start();

    try {
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found. Run `rapid init` first.');
        process.exit(1);
      }

      let { config } = loaded;
      const { rootDir } = loaded;

      // Check if server already exists
      const existingServers = getMcpServers(config);
      if (existingServers.some((s) => s.name === name)) {
        spinner.fail(`MCP server '${name}' already exists`);
        logger.info(`Use ${logger.brand(`rapid mcp remove ${name}`)} to remove it first`);
        process.exit(1);
      }

      // Check if it's a template
      const template = getMcpTemplate(name);

      if (template && !options.type && !options.url && !options.command) {
        // Add from template
        config = addMcpServerFromTemplate(config, name);
        spinner.text = `Adding '${name}' from template...`;
      } else if (options.type || options.url || options.command) {
        // Add custom server
        const serverConfig: McpServerDefinition = {
          enabled: true,
        };

        if (options.type) {
          serverConfig.type = options.type as 'remote' | 'stdio';
        }

        if (options.url) {
          serverConfig.type = 'remote';
          serverConfig.url = options.url;
        }

        if (options.header && Object.keys(options.header).length > 0) {
          serverConfig.headers = options.header;
        }

        if (options.command) {
          serverConfig.type = 'stdio';
          serverConfig.command = options.command;
        }

        if (options.args) {
          serverConfig.args = options.args.split(',').map((a: string) => a.trim());
        }

        config = addMcpServer(config, name, serverConfig);
      } else if (template) {
        // Add from template (fallback)
        config = addMcpServerFromTemplate(config, name);
      } else {
        spinner.fail(`Unknown MCP server template: ${name}`);
        logger.info(`Use ${logger.brand('rapid mcp list --templates')} to see available templates`);
        logger.info('Or specify --type, --url, or --command for a custom server');
        process.exit(1);
      }

      // Save config
      await saveConfig(rootDir, config);

      // Regenerate MCP config files
      await writeMcpConfig(rootDir, config);
      await writeOpenCodeConfig(rootDir, config);

      spinner.succeed(`Added MCP server '${name}'`);
      console.log();

      // Show required secrets if any
      if (template?.requiredSecrets.length) {
        logger.info('Required secrets:');
        for (const secret of template.requiredSecrets) {
          const ref = template.secretReferences?.[secret];
          console.log(`  ${logger.brand('•')} ${secret}${ref ? logger.dim(` (${ref})`) : ''}`);
        }
        console.log();
        logger.info(`Add these to ${logger.brand('rapid.json')} secrets.items section`);
        console.log();
      }
    } catch (error) {
      spinner.fail('Failed to add MCP server');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid mcp remove - Remove an MCP server
 */
mcpCommand
  .command('remove')
  .description('Remove an MCP server')
  .argument('<name>', 'Server name to remove')
  .action(async (name: string) => {
    const spinner = ora(`Removing MCP server '${name}'...`).start();

    try {
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found');
        process.exit(1);
      }

      let { config } = loaded;
      const { rootDir } = loaded;

      // Remove the server
      config = removeMcpServer(config, name);

      // Save config
      await saveConfig(rootDir, config);

      // Regenerate MCP config files
      await writeMcpConfig(rootDir, config);
      await writeOpenCodeConfig(rootDir, config);

      spinner.succeed(`Removed MCP server '${name}'`);
      console.log();
    } catch (error) {
      spinner.fail('Failed to remove MCP server');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid mcp enable - Enable a disabled MCP server
 */
mcpCommand
  .command('enable')
  .description('Enable a disabled MCP server')
  .argument('<name>', 'Server name to enable')
  .action(async (name: string) => {
    const spinner = ora(`Enabling MCP server '${name}'...`).start();

    try {
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found');
        process.exit(1);
      }

      let { config } = loaded;
      const { rootDir } = loaded;

      // Enable the server
      config = enableMcpServer(config, name);

      // Save config
      await saveConfig(rootDir, config);

      // Regenerate MCP config files
      await writeMcpConfig(rootDir, config);
      await writeOpenCodeConfig(rootDir, config);

      spinner.succeed(`Enabled MCP server '${name}'`);
      console.log();
    } catch (error) {
      spinner.fail('Failed to enable MCP server');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid mcp disable - Disable an MCP server (without removing)
 */
mcpCommand
  .command('disable')
  .description('Disable an MCP server (without removing)')
  .argument('<name>', 'Server name to disable')
  .action(async (name: string) => {
    const spinner = ora(`Disabling MCP server '${name}'...`).start();

    try {
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found');
        process.exit(1);
      }

      let { config } = loaded;
      const { rootDir } = loaded;

      // Disable the server
      config = disableMcpServer(config, name);

      // Save config
      await saveConfig(rootDir, config);

      // Regenerate MCP config files
      await writeMcpConfig(rootDir, config);
      await writeOpenCodeConfig(rootDir, config);

      spinner.succeed(`Disabled MCP server '${name}'`);
      console.log();
    } catch (error) {
      spinner.fail('Failed to disable MCP server');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid mcp status - Show MCP server status
 */
mcpCommand
  .command('status')
  .description('Show MCP server status')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const loaded = await loadConfig();

      if (!loaded) {
        logger.error('No rapid.json found. Run `rapid init` first.');
        process.exit(1);
      }

      const { config } = loaded;
      const servers = getMcpServerStatus(config);

      if (options.json) {
        console.log(JSON.stringify({ servers }, null, 2));
        return;
      }

      console.log();
      console.log(`  ${logger.brand('MCP Server Status')}`);
      console.log(`  ${logger.dim('─'.repeat(40))}`);
      console.log();

      if (servers.length === 0) {
        console.log(`  ${logger.dim('No MCP servers configured')}`);
        console.log();
        return;
      }

      let enabledCount = 0;
      let disabledCount = 0;

      for (const server of servers) {
        if (server.enabled) {
          enabledCount++;
        } else {
          disabledCount++;
        }

        const icon =
          server.status === 'enabled'
            ? logger.brand('✓')
            : server.status === 'disabled'
              ? logger.dim('○')
              : '✗';

        const statusLabel =
          server.status === 'enabled'
            ? 'enabled'
            : server.status === 'disabled'
              ? logger.dim('disabled')
              : logger.dim(`error: ${server.error}`);

        const typeLabel = server.type === 'remote' ? 'remote' : 'stdio';

        console.log(`  ${icon} ${server.name}`);
        console.log(`    ${logger.dim('Type:')}   ${typeLabel}`);
        console.log(`    ${logger.dim('Status:')} ${statusLabel}`);

        if (server.url) {
          console.log(`    ${logger.dim('URL:')}    ${server.url}`);
        }
        if (server.command) {
          console.log(`    ${logger.dim('Cmd:')}    ${server.command}`);
        }
        console.log();
      }

      console.log(`  ${logger.dim('Summary:')} ${enabledCount} enabled, ${disabledCount} disabled`);
      console.log();
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid mcp sync - Regenerate .mcp.json and opencode.json from rapid.json
 */
mcpCommand
  .command('sync')
  .description('Regenerate .mcp.json and opencode.json from rapid.json')
  .action(async () => {
    const spinner = ora('Syncing MCP configuration files...').start();

    try {
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found');
        process.exit(1);
      }

      const { config, rootDir } = loaded;

      // Regenerate MCP config files
      await writeMcpConfig(rootDir, config);
      await writeOpenCodeConfig(rootDir, config);

      const servers = getMcpServers(config);
      const enabledCount = servers.filter((s) => s.enabled).length;

      spinner.succeed('MCP configuration synced');
      console.log();
      console.log(`  ${logger.dim('Files updated:')}`);
      console.log(`    ${logger.brand('•')} .mcp.json`);
      console.log(`    ${logger.brand('•')} opencode.json`);
      console.log();
      console.log(`  ${logger.dim('Servers:')} ${enabledCount} enabled`);
      console.log();
    } catch (error) {
      spinner.fail('Failed to sync MCP configuration');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Helper to collect multiple --header flags
 */
function collectHeaders(value: string, previous: Record<string, string>): Record<string, string> {
  const [name, ...rest] = value.split('=');
  if (name && rest.length > 0) {
    previous[name] = rest.join('=');
  }
  return previous;
}
