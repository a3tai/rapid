/**
 * rapid init - Initialize RAPID in a project
 */

import { Command } from 'commander';
import { writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { getDefaultConfig, logger, type RapidConfig } from '@a3t/rapid-core';
import ora from 'ora';

export const initCommand = new Command('init')
  .description('Initialize RAPID in a project')
  .option('-t, --template <name>', 'Template to use', 'default')
  .option('--force', 'Overwrite existing files', false)
  .option('--agent <name>', 'Default agent to configure', 'claude')
  .option('--no-devcontainer', 'Skip devcontainer creation')
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

      // Create config
      const config = createConfig(options);
      
      spinner.text = 'Writing rapid.json...';
      await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
      
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
      console.log(`  ${logger.dim('•')} CLAUDE.md`);
      console.log(`  ${logger.dim('•')} AGENTS.md`);
      
      logger.blank();
      logger.info('Next steps:');
      console.log(`  ${logger.dim('1.')} Run ${logger.brand('rapid dev')} to start coding`);
      console.log(`  ${logger.dim('2.')} Edit ${logger.dim('rapid.json')} to customize your setup`);
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

## Development Guidelines

- Follow existing code patterns and conventions
- Write tests for new functionality
- Update documentation when making changes

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

## Development Guidelines

- Follow existing code patterns and conventions
- Write tests for new functionality
- Update documentation when making changes
- Commit changes with clear, descriptive messages

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
3. Follow the guidelines above when making changes
`;
}
