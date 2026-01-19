/**
 * Agent Adapters - Specific integration patterns for supported AI agents
 *
 * This module provides adapters for different AI coding agents, enabling
 * RAPID to configure, launch, and manage them with consistent governance.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execa } from 'execa';
import type { RapidConfig, GatewayConfig } from './types.js';
import { getStandardAgentInstructions } from './system-messages.js';
import { formatJson } from './format.js';
import { logger } from './logger.js';

/**
 * Agent adapter interface for consistent integration
 */
export interface AgentAdapter {
  name: string;
  cli: string;
  description: string;

  /**
   * Check if the agent is installed and available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Generate agent-specific configuration files
   */
  generateConfig(options: AgentConfigOptions): Promise<GeneratedAgentConfig>;

  /**
   * Get environment variables needed to run the agent with RAPID
   */
  getEnvironment(options: AgentEnvironmentOptions): Record<string, string>;

  /**
   * Get command line arguments for launching the agent
   */
  getArgs(options: AgentLaunchOptions): string[];
}

export interface AgentConfigOptions {
  projectDir: string;
  rapidConfig: RapidConfig;
  gatewayConfig?: GatewayConfig;
  mcpServerUrl?: string;
  systemPrompt?: string;
}

export interface AgentEnvironmentOptions {
  projectDir: string;
  gatewayUrl?: string;
  proxyUrl?: string;
  authEnv?: Record<string, string>;
}

export interface AgentLaunchOptions {
  workingDir?: string;
  systemPrompt?: string;
  injectContext?: boolean;
  useGateway?: boolean;
}

export interface GeneratedAgentConfig {
  files: Array<{
    path: string;
    content: string;
  }>;
  instructions: string[];
}

/**
 * OpenCode adapter
 *
 * OpenCode integration points:
 * - OPENCODE_CONFIG_DIR → inject RAPID MCP servers and rules
 * - opencode.json → project-specific configuration
 * - AGENTS.md → instruction file read automatically
 */
export class OpenCodeAdapter implements AgentAdapter {
  name = 'opencode';
  cli = 'opencode';
  description = 'OpenCode AI assistant with RAPID governance integration';

  async isAvailable(): Promise<boolean> {
    try {
      await execa('which', ['opencode']);
      return true;
    } catch {
      return false;
    }
  }

  async generateConfig(options: AgentConfigOptions): Promise<GeneratedAgentConfig> {
    const files: GeneratedAgentConfig['files'] = [];
    const instructions: string[] = [];

    // Generate opencode.json with MCP server configuration
    const opencodeConfig = {
      $schema: 'https://opencode.ai/schema/config.json',
      mcp: {
        servers: {
          rapid: {
            command: 'rapid',
            args: ['mcp', 'serve'],
            env: {},
          },
        },
      },
      providers: {} as Record<string, { baseURL?: string }>,
      instructions:
        options.systemPrompt ??
        getStandardAgentInstructions({
          includeRapid: true,
          includeMcp: true,
          includeGit: true,
          compact: true,
        }),
    };

    // Add gateway configuration if enabled
    if (options.gatewayConfig?.enabled && options.gatewayConfig.config?.baseUrl) {
      opencodeConfig.providers.anthropic = {
        baseURL: options.gatewayConfig.config.baseUrl,
      };
      opencodeConfig.providers.openai = {
        baseURL: options.gatewayConfig.config.baseUrl,
      };
    }

    files.push({
      path: join(options.projectDir, 'opencode.json'),
      content: await formatJson(opencodeConfig),
    });

    instructions.push('Created opencode.json with RAPID MCP server configuration');
    if (options.gatewayConfig?.enabled) {
      instructions.push('Configured LLM requests to route through RAPID gateway');
    }

    return { files, instructions };
  }

  getEnvironment(options: AgentEnvironmentOptions): Record<string, string> {
    const env: Record<string, string> = {};

    // Route through gateway if configured
    if (options.gatewayUrl) {
      env.ANTHROPIC_BASE_URL = options.gatewayUrl;
      env.OPENAI_BASE_URL = options.gatewayUrl;
    }

    // Set proxy environment
    if (options.proxyUrl) {
      env.HTTP_PROXY = options.proxyUrl;
      env.HTTPS_PROXY = options.proxyUrl;
    }

    // Include auth environment
    if (options.authEnv) {
      Object.assign(env, options.authEnv);
    }

    return env;
  }

  getArgs(options: AgentLaunchOptions): string[] {
    const args: string[] = [];

    if (options.workingDir) {
      args.push('--cwd', options.workingDir);
    }

    return args;
  }
}

/**
 * Aider adapter
 *
 * Aider integration points:
 * - --system-prompt-file → inject RAPID methodology
 * - --git flag → force git mode for version control
 * - Environment variables for proxy/gateway routing
 * - Reads conventions from .aider.conf.yml
 */
export class AiderAdapter implements AgentAdapter {
  name = 'aider';
  cli = 'aider';
  description = 'Aider pair programming with RAPID sandbox and git controls';

  async isAvailable(): Promise<boolean> {
    try {
      await execa('which', ['aider']);
      return true;
    } catch {
      return false;
    }
  }

  async generateConfig(options: AgentConfigOptions): Promise<GeneratedAgentConfig> {
    const files: GeneratedAgentConfig['files'] = [];
    const instructions: string[] = [];

    // Generate .aider.conf.yml with RAPID settings
    const aiderConfig = [
      '# RAPID Aider Configuration',
      '# Auto-generated by rapid agent configure',
      '',
      '# Git settings',
      'git: true',
      'auto-commits: true',
      'dirty-commits: false',
      '',
      '# Model settings',
      'model: claude-sonnet-4-20250514',
      '',
    ];

    // Add gateway configuration
    if (options.gatewayConfig?.enabled && options.gatewayConfig.config?.baseUrl) {
      aiderConfig.push('# Gateway settings (route through RAPID gateway)');
      aiderConfig.push(`openai-api-base: ${options.gatewayConfig.config.baseUrl}`);
      aiderConfig.push('');
    }

    // Add convention settings if AGENTS.md exists
    aiderConfig.push('# Convention files');
    aiderConfig.push('read:');
    aiderConfig.push('  - AGENTS.md');
    aiderConfig.push('  - README.md');
    aiderConfig.push('');

    files.push({
      path: join(options.projectDir, '.aider.conf.yml'),
      content: aiderConfig.join('\n'),
    });

    // Generate system prompt file
    const systemPrompt =
      options.systemPrompt ??
      getStandardAgentInstructions({
        includeRapid: true,
        includeMcp: false, // Aider doesn't support MCP
        includeGit: true,
        includeCodeEditing: true,
        compact: true,
      });

    files.push({
      path: join(options.projectDir, '.aider.rapid-prompt.md'),
      content: systemPrompt,
    });

    instructions.push('Created .aider.conf.yml with RAPID settings');
    instructions.push('Created .aider.rapid-prompt.md with RAPID methodology');
    if (options.gatewayConfig?.enabled) {
      instructions.push('Configured to route LLM requests through RAPID gateway');
    }

    return { files, instructions };
  }

  getEnvironment(options: AgentEnvironmentOptions): Record<string, string> {
    const env: Record<string, string> = {};

    // Route through gateway if configured
    if (options.gatewayUrl) {
      env.OPENAI_API_BASE = options.gatewayUrl;
      env.ANTHROPIC_BASE_URL = options.gatewayUrl;
    }

    // Set proxy environment
    if (options.proxyUrl) {
      env.HTTP_PROXY = options.proxyUrl;
      env.HTTPS_PROXY = options.proxyUrl;
      env.ALL_PROXY = options.proxyUrl;
    }

    // Include auth environment
    if (options.authEnv) {
      Object.assign(env, options.authEnv);
    }

    return env;
  }

  getArgs(options: AgentLaunchOptions): string[] {
    const args: string[] = ['--git'];

    // Inject system prompt if configured
    if (options.systemPrompt || options.injectContext) {
      args.push('--system-prompt-file', '.aider.rapid-prompt.md');
    }

    return args;
  }
}

/**
 * Roo Code adapter
 *
 * Roo Code integration points:
 * - MCP server configuration in VS Code settings
 * - Custom instructions via settings
 * - execute_command routes through RAPID sandbox
 */
export class RooCodeAdapter implements AgentAdapter {
  name = 'roo-code';
  cli = 'code'; // VS Code CLI (Roo is a VS Code extension)
  description = 'Roo Code VS Code extension with RAPID MCP server';

  async isAvailable(): Promise<boolean> {
    // Roo Code is a VS Code extension, check if VS Code is installed
    try {
      await execa('which', ['code']);
      return true;
    } catch {
      return false;
    }
  }

  async generateConfig(options: AgentConfigOptions): Promise<GeneratedAgentConfig> {
    const files: GeneratedAgentConfig['files'] = [];
    const instructions: string[] = [];

    // Roo Code MCP configuration goes in .vscode/mcp.json
    const mcpConfig = {
      servers: {
        rapid: {
          command: 'rapid',
          args: ['mcp', 'serve'],
          env: {},
        },
      },
    };

    const vscodePath = join(options.projectDir, '.vscode');
    files.push({
      path: join(vscodePath, 'mcp.json'),
      content: await formatJson(mcpConfig),
    });

    // VS Code settings for Roo Code
    const vscodeSettings = {
      'roo-code.customInstructions':
        options.systemPrompt ??
        getStandardAgentInstructions({
          includeRapid: true,
          includeMcp: true,
          includeGit: true,
          compact: true,
        }),
      'roo-code.mcpServers': ['rapid'],
    };

    files.push({
      path: join(vscodePath, 'settings.json'),
      content: await formatJson(vscodeSettings),
    });

    instructions.push('Created .vscode/mcp.json with RAPID MCP server');
    instructions.push('Created .vscode/settings.json with Roo Code configuration');
    instructions.push('Install the Roo Code extension in VS Code to use');

    return { files, instructions };
  }

  getEnvironment(options: AgentEnvironmentOptions): Record<string, string> {
    const env: Record<string, string> = {};

    // VS Code inherits environment from shell
    if (options.gatewayUrl) {
      env.ANTHROPIC_BASE_URL = options.gatewayUrl;
      env.OPENAI_BASE_URL = options.gatewayUrl;
    }

    if (options.proxyUrl) {
      env.HTTP_PROXY = options.proxyUrl;
      env.HTTPS_PROXY = options.proxyUrl;
    }

    if (options.authEnv) {
      Object.assign(env, options.authEnv);
    }

    return env;
  }

  getArgs(options: AgentLaunchOptions): string[] {
    const args: string[] = [];

    if (options.workingDir) {
      args.push(options.workingDir);
    }

    return args;
  }
}

/**
 * GitHub Copilot adapter
 *
 * Copilot integration points:
 * - VS Code extension with MCP support
 * - vscode.lm.tools API for tool registration
 * - Custom instructions via chat participants
 */
export class CopilotAdapter implements AgentAdapter {
  name = 'copilot';
  cli = 'code'; // VS Code CLI
  description = 'GitHub Copilot with RAPID MCP tools via VS Code extension';

  async isAvailable(): Promise<boolean> {
    try {
      await execa('which', ['code']);
      return true;
    } catch {
      return false;
    }
  }

  async generateConfig(options: AgentConfigOptions): Promise<GeneratedAgentConfig> {
    const files: GeneratedAgentConfig['files'] = [];
    const instructions: string[] = [];

    // Copilot MCP configuration
    const mcpConfig = {
      servers: {
        rapid: {
          command: 'rapid',
          args: ['mcp', 'serve'],
          env: {},
        },
      },
    };

    const vscodePath = join(options.projectDir, '.vscode');
    files.push({
      path: join(vscodePath, 'mcp.json'),
      content: await formatJson(mcpConfig),
    });

    // VS Code settings for Copilot
    const vscodeSettings = {
      'github.copilot.advanced': {
        customInstructions:
          options.systemPrompt ??
          getStandardAgentInstructions({
            includeRapid: true,
            includeMcp: true,
            includeGit: true,
            compact: true,
          }),
      },
    };

    files.push({
      path: join(vscodePath, 'settings.json'),
      content: await formatJson(vscodeSettings),
    });

    // Create .github/copilot-instructions.md
    const copilotInstructions =
      options.systemPrompt ??
      getStandardAgentInstructions({
        includeRapid: true,
        includeMcp: true,
        includeGit: true,
        compact: false,
      });

    const githubPath = join(options.projectDir, '.github');
    files.push({
      path: join(githubPath, 'copilot-instructions.md'),
      content: copilotInstructions,
    });

    instructions.push('Created .vscode/mcp.json with RAPID MCP server');
    instructions.push('Created .vscode/settings.json with Copilot configuration');
    instructions.push('Created .github/copilot-instructions.md for Copilot');
    instructions.push('Ensure GitHub Copilot extension is installed in VS Code');

    return { files, instructions };
  }

  getEnvironment(options: AgentEnvironmentOptions): Record<string, string> {
    const env: Record<string, string> = {};

    if (options.gatewayUrl) {
      env.ANTHROPIC_BASE_URL = options.gatewayUrl;
      env.OPENAI_BASE_URL = options.gatewayUrl;
    }

    if (options.proxyUrl) {
      env.HTTP_PROXY = options.proxyUrl;
      env.HTTPS_PROXY = options.proxyUrl;
    }

    if (options.authEnv) {
      Object.assign(env, options.authEnv);
    }

    return env;
  }

  getArgs(options: AgentLaunchOptions): string[] {
    const args: string[] = [];

    if (options.workingDir) {
      args.push(options.workingDir);
    }

    return args;
  }
}

/**
 * Claude Code adapter
 *
 * Claude Code integration points:
 * - Hooks for policy enforcement (PreToolUse, PostToolUse, PermissionRequest)
 * - MCP server configuration
 * - --append-system-prompt for runtime injection
 */
export class ClaudeCodeAdapter implements AgentAdapter {
  name = 'claude';
  cli = 'claude';
  description = 'Claude Code CLI with full RAPID governance integration';

  async isAvailable(): Promise<boolean> {
    try {
      await execa('which', ['claude']);
      return true;
    } catch {
      return false;
    }
  }

  async generateConfig(options: AgentConfigOptions): Promise<GeneratedAgentConfig> {
    const files: GeneratedAgentConfig['files'] = [];
    const instructions: string[] = [];

    // Claude Code MCP configuration in .mcp.json
    const mcpConfig = {
      mcpServers: {
        rapid: {
          command: 'rapid',
          args: ['mcp', 'serve'],
          env: {},
        },
      },
    };

    files.push({
      path: join(options.projectDir, '.mcp.json'),
      content: await formatJson(mcpConfig),
    });

    // Create CLAUDE.md with RAPID methodology
    const claudeMd =
      options.systemPrompt ??
      getStandardAgentInstructions({
        includeRapid: true,
        includeMcp: true,
        includeGit: true,
        includeCodeEditing: true,
        compact: false,
      });

    files.push({
      path: join(options.projectDir, 'CLAUDE.md'),
      content: claudeMd,
    });

    instructions.push('Created .mcp.json with RAPID MCP server');
    instructions.push('Created CLAUDE.md with RAPID methodology');
    instructions.push('Install rapid-governance plugin: rapid plugin install');

    return { files, instructions };
  }

  getEnvironment(options: AgentEnvironmentOptions): Record<string, string> {
    const env: Record<string, string> = {};

    if (options.gatewayUrl) {
      env.ANTHROPIC_BASE_URL = options.gatewayUrl;
    }

    if (options.proxyUrl) {
      env.HTTP_PROXY = options.proxyUrl;
      env.HTTPS_PROXY = options.proxyUrl;
    }

    if (options.authEnv) {
      Object.assign(env, options.authEnv);
    }

    return env;
  }

  getArgs(options: AgentLaunchOptions): string[] {
    const args: string[] = [];

    if (options.systemPrompt) {
      args.push('--append-system-prompt', options.systemPrompt);
    }

    return args;
  }
}

// Adapter registry
const adapters: Record<string, AgentAdapter> = {
  claude: new ClaudeCodeAdapter(),
  opencode: new OpenCodeAdapter(),
  aider: new AiderAdapter(),
  'roo-code': new RooCodeAdapter(),
  copilot: new CopilotAdapter(),
};

/**
 * Get an adapter by agent name
 */
export function getAgentAdapter(name: string): AgentAdapter | null {
  return adapters[name.toLowerCase()] || null;
}

/**
 * Get all available adapters
 */
export function getAllAdapters(): AgentAdapter[] {
  return Object.values(adapters);
}

/**
 * Check which adapters are available on the system
 */
export async function checkAvailableAdapters(): Promise<
  Array<{ name: string; available: boolean }>
> {
  const results: Array<{ name: string; available: boolean }> = [];

  for (const adapter of Object.values(adapters)) {
    const available = await adapter.isAvailable();
    results.push({ name: adapter.name, available });
  }

  return results;
}

/**
 * Configure an agent with RAPID integration
 */
export async function configureAgent(
  agentName: string,
  options: AgentConfigOptions
): Promise<GeneratedAgentConfig | null> {
  const adapter = getAgentAdapter(agentName);
  if (!adapter) {
    logger.error(`Unknown agent: ${agentName}`);
    return null;
  }

  const config = await adapter.generateConfig(options);

  // Write the generated files
  for (const file of config.files) {
    const dir = dirname(file.path);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(file.path, file.content, 'utf-8');
    logger.info(`Wrote ${file.path}`);
  }

  return config;
}

/**
 * Configure all available agents at once
 */
export async function configureAllAgents(
  options: AgentConfigOptions
): Promise<Map<string, GeneratedAgentConfig>> {
  const results = new Map<string, GeneratedAgentConfig>();

  for (const adapter of Object.values(adapters)) {
    try {
      const config = await adapter.generateConfig(options);
      results.set(adapter.name, config);

      // Write the generated files
      for (const file of config.files) {
        const dir = dirname(file.path);
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
        }
        await writeFile(file.path, file.content, 'utf-8');
      }
    } catch (error) {
      logger.warn(`Failed to configure ${adapter.name}: ${error}`);
    }
  }

  return results;
}
