/**
 * Claude Code Plugin Templates
 *
 * Generates the .claude-plugin/ directory structure for Claude Code's
 * native extensibility features (commands, hooks, skills).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatJson, logger } from '@a3t/rapid-core';

/**
 * Plugin manifest (plugin.json)
 */
export function getPluginManifest(projectName: string): object {
  return {
    name: `${projectName}-rapid`,
    version: '1.0.0',
    description: `RAPID plugin for ${projectName}`,
    commands: [
      'commands/rapid-status.md',
      'commands/rapid-worktree.md',
      'commands/rapid-context.md',
      'commands/rapid-mcp.md',
    ],
    skills: ['skills/rapid-methodology.md', 'skills/mcp-usage.md'],
  };
}

/**
 * Slash command: /rapid-status
 */
export const COMMAND_RAPID_STATUS = `---
description: Check RAPID environment status
allowed-tools: Bash(rapid:*)
argument-hint: [--json]
---

Check the current RAPID environment status.

Run: \`rapid status $ARGUMENTS\`

This command shows:
- Container status (running/stopped)
- Configured agents
- MCP server status
- Secrets status
`;

/**
 * Slash command: /rapid-worktree
 */
export const COMMAND_RAPID_WORKTREE = `---
description: Manage git worktrees for branch isolation
allowed-tools: Bash(rapid:*, git:*)
argument-hint: <create|list|remove> [branch]
---

Manage git worktrees for isolated feature branch development.

## Usage

- \`/rapid-worktree list\` - List all worktrees
- \`/rapid-worktree create <branch>\` - Create a worktree for a branch
- \`/rapid-worktree remove <path>\` - Remove a worktree

Run: \`rapid worktree $ARGUMENTS\`
`;

/**
 * Slash command: /rapid-context
 */
export const COMMAND_RAPID_CONTEXT = `---
description: Show or inject project context
allowed-tools: Bash(rapid:*)
argument-hint: [show|inject]
---

Show or inject project context from rapid.json configuration.

## Usage

- \`/rapid-context show\` - Display current context configuration
- \`/rapid-context inject\` - Output assembled context (for hooks)

Run: \`rapid context $ARGUMENTS\`
`;

/**
 * Slash command: /rapid-mcp
 */
export const COMMAND_RAPID_MCP = `---
description: Manage MCP servers
allowed-tools: Bash(rapid:*)
argument-hint: <add|remove|list> [server]
---

Manage Model Context Protocol (MCP) servers.

## Usage

- \`/rapid-mcp list\` - List configured MCP servers
- \`/rapid-mcp add <server>\` - Add an MCP server from templates
- \`/rapid-mcp remove <server>\` - Remove an MCP server

Run: \`rapid mcp $ARGUMENTS\`
`;

/**
 * Skill: RAPID Methodology
 */
export const SKILL_RAPID_METHODOLOGY = `---
description: Apply the RAPID 5-phase development methodology
---

# RAPID Methodology

When working on this project, follow the RAPID 5-phase approach:

## 1. Research Phase
- Understand the codebase structure and existing patterns
- Use grep, find, and read tools to explore before making changes
- Identify dependencies and potential impacts

## 2. Augment Phase
- Gather additional context from documentation and MCP servers
- Use Context7 for library documentation
- Use Tavily for web searches when needed

## 3. Plan Phase
- Break down the task into concrete steps
- Identify files that need to be created or modified
- Consider edge cases and error handling

## 4. Integrate Phase
- Make changes incrementally, testing each step
- Follow existing code patterns and conventions
- Run tests after each significant change

## 5. Develop Phase
- Complete the implementation
- Write or update tests as needed
- Document changes in code comments where helpful
`;

/**
 * Skill: MCP Usage
 */
export const SKILL_MCP_USAGE = `---
description: Guidelines for using MCP servers effectively
---

# MCP Server Usage Guidelines

## Available Servers

Check configured MCP servers with: \`rapid mcp list\`

## Common Servers

### Context7
Use for up-to-date library documentation:
1. First resolve library ID: \`mcp__context7__resolve-library-id\`
2. Then query docs: \`mcp__context7__query-docs\`

### Tavily
Use for web searches and content extraction:
- \`mcp__tavily__tavily_search\` - Search the web
- \`mcp__tavily__tavily_extract\` - Extract content from URLs

## Best Practices

1. Always check if an MCP server is available before using it
2. Prefer MCP servers over manual web searches
3. Cache relevant documentation locally when possible
4. Use specific queries for better results
`;

/**
 * Hooks configuration
 */
export function getHooksConfig(): object {
  return {
    // SessionStart hook is not currently supported via JSON config
    // This is a placeholder for future hook support
  };
}

/**
 * Create the .claude-plugin directory structure
 */
export async function createClaudePlugin(
  rootDir: string,
  projectName: string,
  _options: { force?: boolean } = {}
): Promise<boolean> {
  const pluginDir = join(rootDir, '.claude-plugin');
  const commandsDir = join(pluginDir, 'commands');
  const skillsDir = join(pluginDir, 'skills');
  const hooksDir = join(pluginDir, 'hooks');

  try {
    // Create directories
    await mkdir(pluginDir, { recursive: true });
    await mkdir(commandsDir, { recursive: true });
    await mkdir(skillsDir, { recursive: true });
    await mkdir(hooksDir, { recursive: true });

    // Write plugin.json
    await writeFile(
      join(pluginDir, 'plugin.json'),
      await formatJson(getPluginManifest(projectName))
    );

    // Write commands
    await writeFile(join(commandsDir, 'rapid-status.md'), COMMAND_RAPID_STATUS);
    await writeFile(join(commandsDir, 'rapid-worktree.md'), COMMAND_RAPID_WORKTREE);
    await writeFile(join(commandsDir, 'rapid-context.md'), COMMAND_RAPID_CONTEXT);
    await writeFile(join(commandsDir, 'rapid-mcp.md'), COMMAND_RAPID_MCP);

    // Write skills
    await writeFile(join(skillsDir, 'rapid-methodology.md'), SKILL_RAPID_METHODOLOGY);
    await writeFile(join(skillsDir, 'mcp-usage.md'), SKILL_MCP_USAGE);

    // Write hooks config (placeholder)
    await writeFile(join(hooksDir, 'hooks.json'), await formatJson(getHooksConfig()));

    return true;
  } catch (error) {
    logger.debug(
      `Failed to create Claude plugin: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Get list of files created by createClaudePlugin
 */
export function getClaudePluginFiles(): string[] {
  return [
    '.claude-plugin/plugin.json',
    '.claude-plugin/commands/rapid-status.md',
    '.claude-plugin/commands/rapid-worktree.md',
    '.claude-plugin/commands/rapid-context.md',
    '.claude-plugin/commands/rapid-mcp.md',
    '.claude-plugin/skills/rapid-methodology.md',
    '.claude-plugin/skills/mcp-usage.md',
    '.claude-plugin/hooks/hooks.json',
  ];
}
