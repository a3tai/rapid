/**
 * @a3t/rapid-schema
 *
 * JSON schema and TypeScript types for RAPID configuration.
 * An open source project by A3T.
 *
 * @packageDocumentation
 */

// Re-export the JSON schema
export { default as schema } from './rapid.schema.json';

/**
 * RAPID configuration file (rapid.json)
 */
export interface RapidConfig {
  /** JSON schema URL for validation and IntelliSense */
  $schema?: string;

  /** RAPID configuration specification version */
  version: '1.0';

  /** Project name (defaults to directory name) */
  name?: string;

  /** Container lifecycle configuration */
  container?: ContainerConfig;

  /** Secret management configuration */
  secrets?: SecretsConfig;

  /** AI agent configuration */
  agents: AgentsConfig;

  /** Context file generation and management */
  context?: ContextConfig;

  /** Model Context Protocol server configuration */
  mcp?: McpConfig;
}

/**
 * Container lifecycle configuration
 */
export interface ContainerConfig {
  /** Path to devcontainer.json (default: ".devcontainer/devcontainer.json") */
  devcontainer?: string;

  /** Docker Compose file (overrides devcontainer) */
  compose?: string;

  /** Start container automatically on rapid dev (default: true) */
  autoStart?: boolean;

  /** Additional Docker build arguments */
  buildArgs?: Record<string, string>;
}

/**
 * Secret management configuration
 */
export interface SecretsConfig {
  /** Secret provider to use (default: "1password") */
  provider?: '1password' | 'vault' | 'env';

  /** Vault name (1Password) or path (HashiCorp) */
  vault?: string;

  /** Vault server address (HashiCorp Vault only) */
  address?: string;

  /** Map of environment variable names to secret references */
  items?: Record<string, string>;

  /** .envrc generation settings */
  envrc?: EnvrcConfig;

  /** .env file integration (discouraged) */
  dotenv?: DotenvConfig;
}

/**
 * .envrc generation settings
 */
export interface EnvrcConfig {
  /** Auto-generate .envrc from items (default: true) */
  generate?: boolean;

  /** Path to .envrc file (default: ".envrc") */
  path?: string;

  /** Source .envrc.local if present (default: true) */
  includeLocal?: boolean;
}

/**
 * .env file integration (discouraged)
 */
export interface DotenvConfig {
  /** Enable .env file loading (default: false) */
  enabled?: boolean;

  /** .env files to load (default: [".env", ".env.local"]) */
  files?: string[];

  /** Show security warning when loading .env files (default: true) */
  warn?: boolean;
}

/**
 * AI agent configuration
 */
export interface AgentsConfig {
  /** Name of the default agent */
  default: string;

  /** Map of agent name to configuration */
  available: Record<string, AgentDefinition>;
}

/**
 * Configuration for a single AI agent
 */
export interface AgentDefinition {
  /** CLI command to execute */
  cli: string;

  /** Path to instruction file for this agent */
  instructionFile?: string;

  /** Required environment variables */
  envVars?: string[];

  /** Command to install the CLI tool */
  installCmd?: string;

  /** Additional CLI arguments */
  args?: string[];

  /**
   * CLI argument pattern for injecting system prompts at runtime.
   * Use {prompt} as placeholder for the prompt content.
   * Example: "--append-system-prompt {prompt}" for Claude
   */
  systemPromptArg?: string;

  /**
   * Whether this agent reads instruction files from the filesystem automatically.
   * If true, RAPID will ensure AGENTS.md exists with methodology.
   */
  readsInstructionFiles?: boolean;
}

/**
 * Context file generation and management
 */
export interface ContextConfig {
  /** Files to include in agent context (default: ["README.md"]) */
  files?: string[];

  /** Directories to include (default: ["docs/"]) */
  dirs?: string[];

  /** Patterns to exclude */
  exclude?: string[];

  /** Auto-generate AGENTS.md, CLAUDE.md (default: true) */
  generateAgentFiles?: boolean;

  /** Custom templates for agent files */
  templateDir?: string;

  /** Files to preserve from auto-updates */
  preserve?: string[];
}

/**
 * Model Context Protocol server configuration
 */
export interface McpConfig {
  /** Path to MCP config file (default: ".mcp.json") */
  configFile?: string;

  /** MCP server configurations */
  servers?: Record<string, McpServerConfig>;
}

/**
 * Configuration for a single MCP server
 */
export interface McpServerConfig {
  /** Enable this MCP server (default: true) */
  enabled?: boolean;

  /** Server type: remote HTTP or local stdio */
  type?: 'remote' | 'stdio';

  /** URL for remote servers */
  url?: string;

  /** HTTP headers for remote servers */
  headers?: Record<string, string>;

  /** Command for stdio servers */
  command?: string;

  /** Arguments for stdio command */
  args?: string[];

  /** Environment variables for stdio servers */
  env?: Record<string, string>;

  /** Additional server-specific configuration */
  [key: string]: unknown;
}

/**
 * Schema URL for use in rapid.json files
 */
export const SCHEMA_URL = 'https://getrapid.dev/schema/v1/rapid.json';

/**
 * Current schema version
 */
export const SCHEMA_VERSION = '1.0';

/**
 * Default rapid.json configuration
 */
export const DEFAULT_CONFIG: RapidConfig = {
  version: '1.0',
  agents: {
    default: 'claude',
    available: {
      claude: {
        cli: 'claude',
        instructionFile: 'CLAUDE.md',
        envVars: ['ANTHROPIC_API_KEY'],
        installCmd: 'npm install -g @anthropic-ai/claude-code',
      },
    },
  },
};
