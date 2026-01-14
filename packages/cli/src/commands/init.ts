/**
 * rapid init - Initialize RAPID in a project
 */

import { Command } from 'commander';
import { writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import {
  getDefaultConfig,
  logger,
  MCP_SERVER_TEMPLATES,
  addMcpServerFromTemplate,
  getSecretReferences,
  writeMcpConfig,
  writeOpenCodeConfig,
  RAPID_METHODOLOGY,
  MCP_USAGE_GUIDELINES,
  GIT_GUIDELINES,
  type RapidConfig,
} from '@a3t/rapid-core';
import ora from 'ora';

export const initCommand = new Command('init')
  .description('Initialize RAPID in a project')
  .option('-t, --template <name>', 'Template to use', 'default')
  .option('--force', 'Overwrite existing files', false)
  .option('--agent <name>', 'Default agent to configure', 'claude')
  .option('--no-devcontainer', 'Skip devcontainer creation')
  .option('--mcp <servers>', 'MCP servers to enable (comma-separated)', 'context7,tavily')
  .option('--no-mcp', 'Skip MCP server configuration')
  .action(async (options) => {
    const spinner = ora('Initializing RAPID...').start();

    try {
      const cwd = process.cwd();
      const configPath = join(cwd, 'rapid.json');

      // Check if config already exists
      if (!options.force) {
        try {
          await access(configPath);
          spinner.fail('rapid.json already exists. Use --force to overwrite.');
          process.exit(1);
        } catch {
          // File doesn't exist, continue
        }
      }

      // Parse MCP servers option
      const mcpServers: string[] =
        options.mcp === false ? [] : options.mcp.split(',').map((s: string) => s.trim());

      // Create config with MCP servers
      let config = createConfig(options);

      // Add MCP servers
      if (mcpServers.length > 0) {
        spinner.text = 'Configuring MCP servers...';
        for (const serverName of mcpServers) {
          if (MCP_SERVER_TEMPLATES[serverName]) {
            config = addMcpServerFromTemplate(config, serverName);
          } else {
            logger.warn(`Unknown MCP server template: ${serverName}`);
          }
        }

        // Add secret references for MCP servers
        const secretRefs = getSecretReferences(mcpServers);
        if (Object.keys(secretRefs).length > 0) {
          config.secrets = {
            ...config.secrets,
            provider: '1password',
            vault: 'Development',
            items: {
              ...config.secrets?.items,
              ...secretRefs,
            },
          };
        }
      }

      spinner.text = 'Writing rapid.json...';
      await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');

      // Generate MCP config files if MCP servers are configured
      if (mcpServers.length > 0) {
        spinner.text = 'Generating MCP configuration files...';
        await writeMcpConfig(cwd, config);
        await writeOpenCodeConfig(cwd, config);
      }

      // Create CLAUDE.md if using claude
      if (config.agents.available.claude) {
        spinner.text = 'Creating CLAUDE.md...';
        const claudeMdPath = join(cwd, 'CLAUDE.md');
        await writeFile(claudeMdPath, getClaudeMdTemplate(cwd));
      }

      // Create AGENTS.md
      spinner.text = 'Creating AGENTS.md...';
      const agentsMdPath = join(cwd, 'AGENTS.md');
      await writeFile(agentsMdPath, getAgentsMdTemplate(cwd));

      spinner.succeed('RAPID initialized successfully!');

      logger.blank();
      logger.info('Created files:');
      console.log(`  ${logger.dim('•')} rapid.json`);
      if (mcpServers.length > 0) {
        console.log(`  ${logger.dim('•')} .mcp.json`);
        console.log(`  ${logger.dim('•')} opencode.json`);
      }
      console.log(`  ${logger.dim('•')} CLAUDE.md`);
      console.log(`  ${logger.dim('•')} AGENTS.md`);

      // Show configured MCP servers
      if (mcpServers.length > 0) {
        logger.blank();
        logger.info('MCP servers configured:');
        for (const serverName of mcpServers) {
          const template = MCP_SERVER_TEMPLATES[serverName];
          if (template) {
            console.log(`  ${logger.brand('•')} ${serverName} - ${template.description}`);
          }
        }
      }

      logger.blank();
      logger.info('Next steps:');
      console.log(`  ${logger.dim('1.')} Run ${logger.brand('rapid dev')} to start coding`);
      console.log(`  ${logger.dim('2.')} Edit ${logger.dim('rapid.json')} to customize your setup`);
      if (mcpServers.length > 0) {
        console.log(
          `  ${logger.dim('3.')} Add API keys to ${logger.dim('secrets.items')} in rapid.json`
        );
      }
      logger.blank();
    } catch (error) {
      spinner.fail('Failed to initialize RAPID');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

function createConfig(options: { agent: string; template: string }): RapidConfig {
  const defaults = getDefaultConfig();

  return {
    $schema: 'https://getrapid.dev/schema/v1/rapid.json',
    version: '1.0',
    agents: {
      default: options.agent,
      available: defaults.agents.available,
    },
    secrets: {
      provider: 'env',
    },
    context: {
      files: ['README.md', 'CLAUDE.md', 'AGENTS.md'],
      generateAgentFiles: false, // We already created them
    },
  };
}

function getClaudeMdTemplate(projectPath: string): string {
  const projectName = projectPath.split('/').pop() || 'project';

  return `# Claude Instructions

## Project: ${projectName}

This file contains instructions for Claude Code when working on this project.

## Overview

<!-- Describe your project here -->

${RAPID_METHODOLOGY}
${MCP_USAGE_GUIDELINES}
${GIT_GUIDELINES}
## Key Files

- \`rapid.json\` - RAPID configuration
- \`README.md\` - Project documentation

## Commands

\`\`\`bash
# Start development
rapid dev

# Check status
rapid status
\`\`\`
`;
}

function getAgentsMdTemplate(projectPath: string): string {
  const projectName = projectPath.split('/').pop() || 'project';

  return `# Agent Instructions

## Project: ${projectName}

This file contains instructions for AI coding agents working on this project.

## Overview

<!-- Describe your project here -->

${RAPID_METHODOLOGY}
${MCP_USAGE_GUIDELINES}
${GIT_GUIDELINES}
## Project Structure

\`\`\`
.
├── rapid.json          # RAPID configuration
├── CLAUDE.md           # Claude-specific instructions
├── AGENTS.md           # Generic agent instructions
└── ...
\`\`\`

## Getting Started

1. Review the project structure
2. Check \`rapid.json\` for configuration
3. Follow the RAPID methodology above when making changes
`;
}
