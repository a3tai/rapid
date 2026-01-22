/**
 * Agent Adapters - Specific integration patterns for supported AI agents
 *
 * This module provides adapters for different AI coding agents (Claude Code, OpenCode,
 * Aider, Codex, Roo Code, GitHub Copilot), enabling RAPID to configure, launch, and manage
 * them with consistent governance policies.
 *
 * @module agent-adapters
 *
 * ## Supported Agents
 * - **Claude Code**: Full RAPID governance with hooks and MCP
 * - **OpenCode**: MCP integration via opencode.json
 * - **Aider**: System prompts and git controls
 * - **Codex**: MCP integration via .codex/config.toml
 * - **Roo Code**: VS Code extension with MCP
 * - **GitHub Copilot**: VS Code extension with MCP
 *
 * @example
 * ```typescript
 * import { getAgentAdapter, configureAgent } from './agent-adapters';
 *
 * // Get adapter for Claude Code
 * const adapter = getAgentAdapter('claude');
 *
 * // Configure the agent
 * const config = await configureAgent('claude', {
 *   projectDir: '/path/to/project',
 *   rapidConfig: myRapidConfig,
 * });
 *
 * // Files are written automatically
 * console.log(config.instructions);
 * ```
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
 * Agent adapter interface for consistent integration across different AI coding tools.
 *
 * Each adapter implements this interface to provide uniform configuration, environment setup,
 * and launch parameters for its specific agent type.
 */
export interface AgentAdapter {
  /** Agent identifier (e.g., 'claude', 'opencode', 'aider') */
  name: string;

  /** CLI command to launch the agent */
  cli: string;

  /** Human-readable description of the agent's capabilities */
  description: string;

  /**
   * Check if the agent is installed and available on the system.
   *
   * @returns Promise resolving to true if the agent CLI is found in PATH
   * @example
   * ```typescript
   * const adapter = getAgentAdapter('claude');
   * if (await adapter.isAvailable()) {
   *   console.log('Claude Code is installed');
   * }
   * ```
   */
  isAvailable(): Promise<boolean>;

  /**
   * Generate agent-specific configuration files for RAPID integration.
   *
   * Creates config files like .mcp.json, CLAUDE.md, opencode.json, etc. based on
   * the agent's configuration format and RAPID's governance policies.
   *
   * @param options - Configuration options including project path and RAPID config
   * @returns Promise resolving to generated files and setup instructions
   * @example
   * ```typescript
   * const config = await adapter.generateConfig({
   *   projectDir: '/my/project',
   *   rapidConfig: { governance: { budgetLimit: 10 } }
   * });
   * // Returns: { files: [...], instructions: [...] }
   * ```
   */
  generateConfig(options: AgentConfigOptions): Promise<GeneratedAgentConfig>;

  /**
   * Get environment variables needed to run the agent with RAPID governance.
   *
   * Includes API gateway routing, proxy settings, and authentication credentials.
   *
   * @param options - Environment configuration including gateway and proxy URLs
   * @returns Record of environment variable names to values
   * @example
   * ```typescript
   * const env = adapter.getEnvironment({
   *   projectDir: '/my/project',
   *   gatewayUrl: 'http://localhost:4000',
   * });
   * // Returns: { ANTHROPIC_BASE_URL: 'http://localhost:4000', ... }
   * ```
   */
  getEnvironment(options: AgentEnvironmentOptions): Record<string, string>;

  /**
   * Get command line arguments for launching the agent with RAPID integration.
   *
   * @param options - Launch configuration including working directory and system prompts
   * @returns Array of CLI arguments to pass to the agent
   * @example
   * ```typescript
   * const args = adapter.getArgs({
   *   workingDir: '/my/project',
   *   systemPrompt: 'You are a helpful assistant',
   * });
   * // Returns: ['--cwd', '/my/project', '--append-system-prompt', '...']
   * ```
   */
  getArgs(options: AgentLaunchOptions): string[];
}

/**
 * Options for generating agent-specific configuration files.
 */
export interface AgentConfigOptions {
  /** Absolute path to the project directory */
  projectDir: string;

  /** RAPID configuration containing governance policies */
  rapidConfig: RapidConfig;

  /** Optional gateway configuration for LLM request routing */
  gatewayConfig?: GatewayConfig;

  /** Optional MCP server URL for remote connections */
  mcpServerUrl?: string;

  /** Optional custom system prompt (overrides default RAPID methodology) */
  systemPrompt?: string;
}

/**
 * Options for configuring the agent's runtime environment.
 */
export interface AgentEnvironmentOptions {
  /** Absolute path to the project directory */
  projectDir: string;

  /** Optional gateway URL for routing LLM API requests */
  gatewayUrl?: string;

  /** Optional HTTP/HTTPS proxy URL for network requests */
  proxyUrl?: string;

  /** Optional authentication environment variables (API keys, tokens, etc.) */
  authEnv?: Record<string, string>;
}

/**
 * Options for launching an agent with specific runtime parameters.
 */
export interface AgentLaunchOptions {
  /** Optional working directory for the agent (defaults to current directory) */
  workingDir?: string;

  /** Optional system prompt to inject at runtime */
  systemPrompt?: string;

  /** Whether to inject RAPID context into the agent's prompt */
  injectContext?: boolean;

  /** Whether to route requests through the RAPID gateway */
  useGateway?: boolean;
}

/**
 * Result of generating agent configuration files.
 */
export interface GeneratedAgentConfig {
  /** Array of files to write to disk */
  files: Array<{
    /** Absolute file path */
    path: string;
    /** File content as string */
    content: string;
  }>;

  /** Human-readable instructions for completing the setup */
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
    // OpenCode uses a different format: servers directly under mcp, type: local/remote,
    // and command as an array (not separate command/args)
    const opencodeConfig = {
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        rapid: {
          type: 'local',
          command: ['rapid', 'mcp', 'serve'],
          enabled: true,
          environment: {},
        },
      } as Record<string, unknown>,
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
 * Codex adapter
 *
 * Codex integration points:
 * - ~/.codex/config.toml (or .codex/config.toml) for MCP servers
 * - AGENTS.md → instruction file read automatically
 */
export class CodexAdapter implements AgentAdapter {
  name = 'codex';
  cli = 'codex';
  description = 'OpenAI Codex CLI with RAPID MCP server configuration';

  async isAvailable(): Promise<boolean> {
    try {
      await execa('which', ['codex']);
      return true;
    } catch {
      return false;
    }
  }

  async generateConfig(options: AgentConfigOptions): Promise<GeneratedAgentConfig> {
    const files: GeneratedAgentConfig['files'] = [];
    const instructions: string[] = [];

    const escapedProjectDir = options.projectDir.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const mcpUrl = options.mcpServerUrl ?? 'http://localhost:3100/mcp';

    const codexConfig = [
      `[projects."${escapedProjectDir}"]`,
      'trust_level = "trusted"',
      '',
      '[mcp_servers.rapid]',
      `url = "${mcpUrl}"`,
      '',
    ].join('\n');

    files.push({
      path: join(options.projectDir, '.codex', 'config.toml'),
      content: codexConfig,
    });

    instructions.push('Created .codex/config.toml with RAPID MCP server configuration');
    instructions.push('Merge .codex/config.toml into ~/.codex/config.toml or use codex mcp add');

    return { files, instructions };
  }

  getEnvironment(options: AgentEnvironmentOptions): Record<string, string> {
    const env: Record<string, string> = {};

    if (options.gatewayUrl) {
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
      args.push('-C', options.workingDir);
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
    // Use HTTP transport if mcpServerUrl is provided (e.g., in Docker), otherwise use stdio
    const mcpServerConfig = options.mcpServerUrl
      ? {
          type: 'http' as const,
          url: options.mcpServerUrl,
        }
      : {
          command: 'rapid',
          args: ['mcp', 'serve'],
          env: {},
        };

    const mcpConfig = {
      servers: {
        rapid: mcpServerConfig,
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
    // Use HTTP transport if mcpServerUrl is provided (e.g., in Docker), otherwise use stdio
    const mcpServerConfig = options.mcpServerUrl
      ? {
          type: 'http' as const,
          url: options.mcpServerUrl,
        }
      : {
          command: 'rapid',
          args: ['mcp', 'serve'],
          env: {},
        };

    const mcpConfig = {
      servers: {
        rapid: mcpServerConfig,
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
    // Use HTTP transport if mcpServerUrl is provided (e.g., in Docker), otherwise use stdio
    const mcpServerConfig = options.mcpServerUrl
      ? {
          type: 'http' as const,
          url: options.mcpServerUrl,
        }
      : {
          command: 'rapid',
          args: ['mcp', 'serve'],
          env: {},
        };

    const mcpConfig = {
      mcpServers: {
        rapid: mcpServerConfig,
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
  codex: new CodexAdapter(),
  'roo-code': new RooCodeAdapter(),
  copilot: new CopilotAdapter(),
};

/**
 * Get an adapter by agent name.
 *
 * Looks up a registered adapter by its name (case-insensitive). Supported names:
 * 'claude', 'opencode', 'aider', 'codex', 'roo-code', 'copilot'.
 *
 * @param name - Agent name to look up
 * @returns The adapter instance if found, null otherwise
 * @example
 * ```typescript
 * const adapter = getAgentAdapter('claude');
 * if (adapter) {
 *   console.log(adapter.description);
 * }
 * ```
 */
export function getAgentAdapter(name: string): AgentAdapter | null {
  return adapters[name.toLowerCase()] || null;
}

/**
 * Get all available agent adapters.
 *
 * Returns an array of all registered adapter instances. Useful for iteration
 * or discovery of supported agents.
 *
 * @returns Array of all adapter instances
 * @example
 * ```typescript
 * const allAdapters = getAllAdapters();
 * allAdapters.forEach(adapter => {
 *   console.log(`${adapter.name}: ${adapter.description}`);
 * });
 * ```
 */
export function getAllAdapters(): AgentAdapter[] {
  return Object.values(adapters);
}

/**
 * Check which agent adapters are installed and available on the system.
 *
 * Checks each registered adapter by running its isAvailable() method, which
 * typically checks if the agent's CLI is in PATH.
 *
 * @returns Promise resolving to array of adapter names with availability status
 * @example
 * ```typescript
 * const available = await checkAvailableAdapters();
 * // [
 * //   { name: 'claude', available: true },
 * //   { name: 'opencode', available: false },
 * //   ...
 * // ]
 *
 * const installed = available.filter(a => a.available);
 * console.log(`Found ${installed.length} installed agents`);
 * ```
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
 * Configure a specific agent with RAPID integration.
 *
 * Generates agent-specific configuration files (.mcp.json, CLAUDE.md, opencode.json, etc.)
 * and writes them to disk. This is the main entry point for setting up RAPID governance
 * for a particular agent.
 *
 * @param agentName - Name of the agent to configure ('claude', 'opencode', etc.)
 * @param options - Configuration options including project path and RAPID config
 * @returns Promise resolving to generated config, or null if agent not found
 * @throws May throw filesystem errors if unable to write files
 * @example
 * ```typescript
 * const config = await configureAgent('claude', {
 *   projectDir: '/my/project',
 *   rapidConfig: {
 *     governance: { budgetLimit: 10 }
 *   }
 * });
 *
 * if (config) {
 *   console.log('Setup instructions:');
 *   config.instructions.forEach(instruction => console.log(`- ${instruction}`));
 * }
 * ```
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
 * Configure all registered agents with RAPID integration in one operation.
 *
 * Iterates through all adapters and generates their configuration files. Useful for
 * setting up a project that supports multiple agents, allowing developers to switch
 * between them seamlessly.
 *
 * @param options - Configuration options shared across all agents
 * @returns Promise resolving to Map of agent names to their generated configs
 * @throws May throw filesystem errors if unable to write files
 * @example
 * ```typescript
 * const allConfigs = await configureAllAgents({
 *   projectDir: '/my/project',
 *   rapidConfig: myRapidConfig
 * });
 *
 * console.log(`Configured ${allConfigs.size} agents:`);
 * for (const [name, config] of allConfigs) {
 *   console.log(`- ${name}: ${config.files.length} files created`);
 * }
 * ```
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
