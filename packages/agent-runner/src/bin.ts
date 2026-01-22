#!/usr/bin/env node

/**
 * Agent Runner CLI
 *
 * Command-line interface for running AI coding agents.
 *
 * Usage:
 *   agent-runner --tool claude --task "Fix the bug in auth.ts"
 *   agent-runner --tool gemini --model opus --workdir ./project
 *   agent-runner --list-tools
 */

import { parseArgs } from 'node:util';
import { v4 as uuidv4 } from 'uuid';
import { AgentRunner } from './runner.js';
import { getAvailableTools } from './adapters/index.js';
import type { AgentTool, ModelTier, StreamEvent } from './types.js';

const VERSION = '0.1.0';

interface CliOptions {
  tool?: string;
  model?: string;
  workdir?: string;
  task?: string;
  agentId?: string;
  agentName?: string;
  mcpUrl?: string;
  redisUrl?: string;
  skipPermissions?: boolean;
  listTools?: boolean;
  version?: boolean;
  help?: boolean;
}

function printHelp(): void {
  console.log(`
Agent Runner v${VERSION}
Sophisticated agent runner for RAPID with streaming output and multi-tool support.

USAGE:
  agent-runner [OPTIONS]

OPTIONS:
  --tool <name>       AI tool to use: claude, gemini, opencode, aider (required)
  --model <tier>      Model tier: opus, sonnet, haiku (default: sonnet)
  --workdir <path>    Working directory (default: current directory)
  --task <string>     Initial task/prompt for the agent (required)
  --agent-id <id>     Unique agent ID (default: auto-generated)
  --agent-name <name> Agent name/persona (default: Agent)
  --mcp-url <url>     MCP server URL
  --redis-url <url>   Redis URL for event streaming
  --skip-permissions  Skip permission prompts (dangerous)
  --list-tools        List available AI tools
  --version           Show version
  --help              Show this help

EXAMPLES:
  # Run Claude to fix a bug
  agent-runner --tool claude --task "Fix the authentication bug in src/auth.ts"

  # Run Gemini with opus-tier model
  agent-runner --tool gemini --model opus --task "Refactor the API routes"

  # List available tools
  agent-runner --list-tools
`);
}

async function listTools(): Promise<void> {
  console.log('Checking available AI coding tools...\n');

  const available = await getAvailableTools();

  const tools: AgentTool[] = ['claude', 'gemini', 'opencode', 'aider'];

  for (const tool of tools) {
    const status = available.includes(tool) ? '✓' : '✗';
    const color = available.includes(tool) ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${status}\x1b[0m ${tool}`);
  }

  console.log(`\n${available.length} of ${tools.length} tools available`);
}

function formatEvent(event: StreamEvent): string {
  const typeColors: Record<string, string> = {
    init: '\x1b[34m',      // Blue
    thinking: '\x1b[35m',   // Magenta
    text: '\x1b[0m',        // Default
    tool_use: '\x1b[33m',   // Yellow
    tool_result: '\x1b[36m', // Cyan
    diff: '\x1b[32m',       // Green
    commit: '\x1b[32m',     // Green
    complete: '\x1b[34m',   // Blue
    error: '\x1b[31m',      // Red
  };

  const color = typeColors[event.type] || '\x1b[0m';
  const reset = '\x1b[0m';

  let output = `${color}[${event.type}]${reset}`;

  if (event.toolName) {
    output += ` ${event.toolName}`;
  }

  if (event.content) {
    // Truncate long content
    const content = event.content.length > 200
      ? event.content.slice(0, 200) + '...'
      : event.content;
    output += ` ${content}`;
  }

  return output;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      tool: { type: 'string' },
      model: { type: 'string' },
      workdir: { type: 'string' },
      task: { type: 'string' },
      'agent-id': { type: 'string' },
      'agent-name': { type: 'string' },
      'mcp-url': { type: 'string' },
      'redis-url': { type: 'string' },
      'skip-permissions': { type: 'boolean' },
      'list-tools': { type: 'boolean' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });

  const options: CliOptions = {
    tool: values.tool,
    model: values.model,
    workdir: values.workdir,
    task: values.task,
    agentId: values['agent-id'],
    agentName: values['agent-name'],
    mcpUrl: values['mcp-url'],
    redisUrl: values['redis-url'],
    skipPermissions: values['skip-permissions'],
    listTools: values['list-tools'],
    version: values.version,
    help: values.help,
  };

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    console.log(`agent-runner v${VERSION}`);
    process.exit(0);
  }

  if (options.listTools) {
    await listTools();
    process.exit(0);
  }

  // Validate required options
  if (!options.tool) {
    console.error('Error: --tool is required');
    console.error('Run with --help for usage');
    process.exit(1);
  }

  if (!options.task) {
    console.error('Error: --task is required');
    console.error('Run with --help for usage');
    process.exit(1);
  }

  // Validate tool
  const validTools: AgentTool[] = ['claude', 'gemini', 'opencode', 'aider'];
  if (!validTools.includes(options.tool as AgentTool)) {
    console.error(`Error: Invalid tool "${options.tool}"`);
    console.error(`Valid tools: ${validTools.join(', ')}`);
    process.exit(1);
  }

  // Create runner
  const runner = new AgentRunner({
    agentId: options.agentId || uuidv4(),
    agentName: options.agentName || 'Agent',
    tool: options.tool as AgentTool,
    model: (options.model as ModelTier) || 'sonnet',
    workdir: options.workdir || process.cwd(),
    task: options.task,
    mcpUrl: options.mcpUrl,
    redisUrl: options.redisUrl,
    dangerouslySkipPermissions: options.skipPermissions,
  });

  // Event handlers
  runner.on('event', (event) => {
    console.log(formatEvent(event));
  });

  runner.on('started', (config) => {
    console.log(`\n🚀 Agent started: ${config.agentId}`);
    console.log(`   Tool: ${config.tool}`);
    console.log(`   Model: ${config.model || 'sonnet'}`);
    console.log(`   Workdir: ${config.workdir}\n`);
  });

  runner.on('stopped', (reason, exitCode) => {
    console.log(`\n⏹  Agent stopped: ${reason}${exitCode !== undefined ? ` (exit code: ${exitCode})` : ''}`);

    const state = runner.getState();
    console.log(`   Input tokens: ${state.metrics.totalInputTokens}`);
    console.log(`   Output tokens: ${state.metrics.totalOutputTokens}`);
    console.log(`   Estimated cost: $${state.metrics.estimatedCostUsd.toFixed(4)}`);
  });

  runner.on('error', (error) => {
    console.error(`\n❌ Error: ${error.message}`);
  });

  // Handle signals
  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT, stopping agent...');
    await runner.stop('sigint');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\nReceived SIGTERM, stopping agent...');
    await runner.stop('sigterm');
    process.exit(0);
  });

  // Start the agent
  try {
    await runner.start();
  } catch (error) {
    console.error(`Failed to start agent: ${(error as Error).message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
