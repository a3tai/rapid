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

  /** Lima VM configuration (macOS local mode) */
  lima?: LimaConfig;

  /** Sandbox runtime configuration */
  sandbox?: SandboxConfig;

  /** LLM Gateway configuration */
  gateway?: GatewayConfig;

  /** Inter-agent event bus configuration */
  eventBus?: EventBusConfig;
}

/**
 * Lima VM configuration
 */
export interface LimaConfig {
  /** Install GitHub CLI (gh) in the VM (default: true) */
  installGh?: boolean;
}

/**
 * Sandbox mode selection
 */
export type SandboxMode = 'auto' | 'sandbox' | 'lima' | 'none';

/**
 * Sandbox runtime configuration
 */
export interface SandboxConfig {
  /** Enable OS-level sandboxing (default: true) */
  enabled?: boolean;

  /** Sandbox mode: auto, sandbox (seatbelt/bubblewrap), lima, or none */
  mode?: SandboxMode;

  /** Sandbox backend: seatbelt (macOS) or bubblewrap (Linux) - deprecated, use mode */
  backend?: 'seatbelt' | 'bubblewrap' | 'auto';

  /** Network sandboxing configuration */
  network?: SandboxNetworkConfig;

  /** Filesystem sandboxing configuration */
  filesystem?: SandboxFilesystemConfig;
}

/**
 * Network sandbox configuration
 */
export interface SandboxNetworkConfig {
  /** Enable network filtering (default: true) */
  enabled?: boolean;

  /** Allowed domains (supports wildcards like *.github.com) */
  allowedDomains?: string[];

  /** Denied domains (overrides allowed) */
  deniedDomains?: string[];

  /** HTTP proxy port (default: 8888) */
  proxyPort?: number;

  /** SOCKS proxy port (default: 1080) */
  socksPort?: number;
}

/**
 * Filesystem sandbox configuration
 */
export interface SandboxFilesystemConfig {
  /** Paths allowed for read access */
  readPaths?: string[];

  /** Paths allowed for write access */
  writePaths?: string[];

  /** Paths allowed for write access (alias for writePaths) */
  allowWrite?: string[];

  /** Paths that are completely blocked */
  blockedPaths?: string[];

  /** Make entire filesystem read-only except allowed paths */
  readOnlyRoot?: boolean;
}

/**
 * LLM Gateway configuration (LiteLLM integration)
 */
export interface GatewayConfig {
  /** Enable LLM gateway (default: false) */
  enabled?: boolean;

  /** Gateway type: litellm, openrouter, custom */
  type?: 'litellm' | 'openrouter' | 'custom';

  /** Gateway mode: external (connect to existing) or managed (RAPID starts it) */
  mode?: 'external' | 'managed';

  /** Gateway connection config */
  config?: GatewayConnectionConfig;

  /** Fallback behavior when gateway is unavailable */
  fallback?: 'direct' | 'error';

  /** Model aliases and routing */
  models?: GatewayModelsConfig;

  /** Budget configuration */
  budgets?: GatewayBudgetConfig;

  /** Enable request/response logging */
  logging?: boolean;
}

/**
 * Gateway connection configuration
 */
export interface GatewayConnectionConfig {
  /** Base URL of the gateway */
  baseUrl?: string;

  /** API key for authentication */
  apiKey?: string;

  /** Path to LiteLLM config file */
  configFile?: string;

  /** Additional headers */
  headers?: Record<string, string>;
}

/**
 * Gateway models configuration
 */
export interface GatewayModelsConfig {
  /** Default model to use */
  default?: string;

  /** Model aliases (alias -> actual model name) */
  aliases?: Record<string, string>;

  /** Detailed model configurations for LiteLLM */
  list?: GatewayModelConfig[];
}

/**
 * Gateway model configuration (for LiteLLM model_list)
 */
export interface GatewayModelConfig {
  /** Model name/alias */
  modelName: string;

  /** Provider (openai, anthropic, google, etc.) */
  provider: string;

  /** Model ID at the provider */
  model: string;

  /** API key environment variable */
  apiKeyEnv?: string;

  /** Priority for routing (higher = preferred) */
  priority?: number;
}

/**
 * Gateway budget configuration
 */
export interface GatewayBudgetConfig {
  /** Project-level budget */
  project?: BudgetLimit;

  /** Per-session budget */
  session?: BudgetLimit;

  /** Per-model budgets */
  perModel?: Record<string, BudgetLimit>;
}

/**
 * Budget limit configuration
 */
export interface BudgetLimit {
  /** Maximum spend in USD */
  max: number;

  /** Budget duration (e.g., "30d", "24h") */
  duration?: string;

  /** Alert thresholds as percentages */
  alertAt?: number[];
}

/**
 * Inter-agent event bus configuration
 */
export interface EventBusConfig {
  /** Enable event bus (default: false) */
  enabled?: boolean;

  /** Redis configuration (if not set, uses in-memory) */
  redis?: EventBusRedisConfig;

  /** Context injection settings */
  injection?: EventBusInjectionConfig;

  /** Auto-check settings */
  autoCheck?: EventBusAutoCheckConfig;
}

/**
 * Event bus Redis configuration
 */
export interface EventBusRedisConfig {
  /** Redis connection URL */
  url?: string;

  /** Key prefix for RAPID data */
  prefix?: string;
}

/**
 * Event bus context injection configuration
 */
export interface EventBusInjectionConfig {
  /** Injection mode */
  mode?: 'system_prompt' | 'user_prefix' | 'tool_response';

  /** Maximum messages to inject */
  maxMessages?: number;

  /** Minimum priority to include */
  priorityThreshold?: 'low' | 'normal' | 'high' | 'urgent';

  /** Message types to include */
  includeTypes?: string[];
}

/**
 * Event bus auto-check configuration
 */
export interface EventBusAutoCheckConfig {
  /** Enable automatic message checking */
  enabled?: boolean;

  /** Check interval in milliseconds */
  intervalMs?: number;
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

  /** External auth detection configuration */
  externalAuth?: ExternalAuthConfig;
}

/**
 * External auth source types
 */
export type ExternalAuthSource =
  | 'claude-code'
  | 'codex'
  | 'gemini-cli'
  | 'aider'
  | 'env';

/**
 * External auth configuration
 */
export interface ExternalAuthConfig {
  /** Enable external auth detection (default: true) */
  enabled?: boolean;

  /** Sources to check for credentials */
  sources?: ExternalAuthSource[];

  /** Preferred source when multiple are available */
  preferSource?: ExternalAuthSource;
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

  /**
   * YOLO mode: Skip all permission prompts when launching the agent.
   * For Claude, this adds the --dangerously-skip-permissions flag.
   * WARNING: Only use in trusted environments (dev containers, CI, etc.)
   */
  yolo?: boolean;
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
 * MCP transport types following the MCP specification.
 * - 'stdio': Local subprocess communication (MCP spec standard)
 * - 'streamable-http': Remote HTTP communication (MCP spec standard)
 * - 'remote': Alias for 'streamable-http' (user-friendly, backwards compatible)
 */
export type McpTransportType = 'stdio' | 'streamable-http' | 'remote';

/**
 * Configuration for a single MCP server
 */
export interface McpServerConfig {
  /** Enable this MCP server (default: true) */
  enabled?: boolean;

  /**
   * Server transport type (MCP spec naming):
   * - 'stdio': Local subprocess (command + args)
   * - 'streamable-http': Remote HTTP server (url + headers)
   * - 'remote': Alias for 'streamable-http' (backwards compatible)
   */
  type?: McpTransportType;

  /** URL for remote/streamable-http servers */
  url?: string;

  /** HTTP headers for remote/streamable-http servers */
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
 *
 * Key defaults for a "magical" experience:
 * - eventBus enabled: multi-agent communication works out of the box
 * - RAPID MCP server enabled: agents get bus_send, bus_messages, etc.
 * - yolo mode enabled for claude: no permission prompts in trusted environments
 */
export const DEFAULT_CONFIG: RapidConfig = {
  version: '1.0',
  agents: {
    default: 'claude',
    available: {
      claude: {
        cli: 'claude',
        instructionFile: 'CLAUDE.md',
        yolo: true, // Skip permission prompts in trusted dev environments
      },
      opencode: {
        cli: 'opencode',
        instructionFile: 'AGENTS.md',
      },
    },
  },
  eventBus: {
    enabled: true, // Multi-agent features ON by default
  },
  mcp: {
    configFile: '.mcp.json',
    servers: {
      rapid: {
        enabled: true,
        type: 'stdio',
        command: 'rapid',
        args: ['mcp', 'serve'],
      },
    },
  },
};
