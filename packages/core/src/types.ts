/**
 * RAPID Configuration Types
 */

export interface RapidConfig {
  $schema?: string;
  version: '1.0';
  name?: string;
  container?: ContainerConfig;
  secrets?: SecretsConfig;
  agents: AgentsConfig;
  context?: ContextConfig;
  mcp?: McpConfig;
}

export interface ContainerConfig {
  devcontainer?: string;
  compose?: string;
  autoStart?: boolean;
  buildArgs?: Record<string, string>;
}

/**
 * External auth source types
 */
export type ExternalAuthSource = 'claude-code' | 'codex' | 'gemini-cli' | 'aider' | 'env';

/**
 * External auth configuration
 */
export interface ExternalAuthConfig {
  enabled?: boolean;
  sources?: ExternalAuthSource[];
  preferSource?: ExternalAuthSource;
}

export interface SecretsConfig {
  provider?: 'env' | '1password' | 'vault';
  vault?: string;
  address?: string;
  items?: Record<string, string>;
  envrc?: EnvrcConfig;
  dotenv?: DotenvConfig;
  externalAuth?: ExternalAuthConfig;
}

export interface EnvrcConfig {
  generate?: boolean;
  path?: string;
  includeLocal?: boolean;
}

export interface DotenvConfig {
  enabled?: boolean;
  files?: string[];
  warn?: boolean;
}

export interface AgentsConfig {
  default: string;
  available: Record<string, AgentDefinition>;
}

export interface AgentDefinition {
  cli: string;
  instructionFile?: string;
  envVars?: string[];
  installCmd?: string;
  args?: string[];
  /**
   * CLI argument pattern for injecting system prompts at runtime.
   * Use {prompt} as placeholder for the prompt content.
   * Example: "--append-system-prompt {prompt}" for Claude
   * If not specified, system prompt injection via CLI is not supported.
   */
  systemPromptArg?: string;
  /**
   * Whether this agent reads instruction files from the filesystem automatically.
   * If true, RAPID will ensure AGENTS.md exists with methodology.
   * If false, RAPID will try to inject prompts via CLI args.
   */
  readsInstructionFiles?: boolean;
  /**
   * YOLO mode: Skip all permission prompts when launching the agent.
   * For Claude, this adds the --dangerously-skip-permissions flag.
   * WARNING: Only use in trusted environments (dev containers, CI, etc.)
   */
  yolo?: boolean;
}

export interface ContextConfig {
  files?: string[];
  dirs?: string[];
  exclude?: string[];
  generateAgentFiles?: boolean;
  templateDir?: string;
  preserve?: string[];
}

export interface McpConfig {
  configFile?: string;
  servers?: Record<string, McpServerConfig>;
}

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
 * Agent status
 */
export interface AgentStatus {
  name: string;
  available: boolean;
  cliPath?: string;
  version?: string;
}

/**
 * Environment status
 */
export interface EnvironmentStatus {
  configPath?: string;
  configValid: boolean;
  agents: AgentStatus[];
  secretsLoaded: boolean;
  containerRunning: boolean;
}

/**
 * Detected credential from an external tool
 */
export interface DetectedCredential {
  source: ExternalAuthSource;
  provider: 'anthropic' | 'openai' | 'google' | 'unknown';
  authType: 'api-key' | 'oauth' | 'service-account';
  envVar?: string;
  value?: string;
  expiresAt?: Date;
  accountInfo?: {
    email?: string;
    organization?: string;
    plan?: string;
  };
  configPath?: string;
}

/**
 * Auth status summary
 */
export interface AuthStatus {
  authenticated: boolean;
  sources: DetectedCredential[];
  preferredSource?: DetectedCredential;
  warnings?: string[];
}
