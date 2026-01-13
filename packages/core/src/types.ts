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

export interface SecretsConfig {
  provider?: 'env' | '1password' | 'vault';
  vault?: string;
  address?: string;
  items?: Record<string, string>;
  envrc?: EnvrcConfig;
  dotenv?: DotenvConfig;
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
  enabled?: boolean;
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
