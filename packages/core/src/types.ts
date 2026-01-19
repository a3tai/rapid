/**
 * @a3t/rapid-core Types
 *
 * This file re-exports configuration types from @a3t/rapid-schema (the source of truth)
 * and defines runtime-only types used within core.
 */

// ============================================================================
// Re-export all configuration types from schema (single source of truth)
// ============================================================================
export type {
  RapidConfig,
  LimaConfig,
  ContainerConfig,
  SecretsConfig,
  EnvrcConfig,
  DotenvConfig,
  ExternalAuthSource,
  ExternalAuthConfig,
  AgentsConfig,
  AgentDefinition,
  ContextConfig,
  McpConfig,
  McpTransportType,
  McpServerConfig,
  SandboxMode,
  SandboxConfig,
  SandboxNetworkConfig,
  SandboxFilesystemConfig,
  GatewayConfig,
  GatewayConnectionConfig,
  GatewayModelsConfig,
  GatewayModelConfig,
  GatewayBudgetConfig,
  BudgetLimit,
  EventBusConfig,
  EventBusRedisConfig,
  EventBusInjectionConfig,
  EventBusAutoCheckConfig,
} from '@a3t/rapid-schema';

// ============================================================================
// Runtime types (not persisted to config, only used at runtime)
// ============================================================================

/**
 * Runtime status of an AI agent
 */
export interface AgentStatus {
  name: string;
  available: boolean;
  cliPath?: string;
  version?: string;
}

/**
 * Runtime environment status
 */
export interface EnvironmentStatus {
  configPath?: string;
  configValid: boolean;
  agents: AgentStatus[];
  secretsLoaded: boolean;
  containerRunning: boolean;
}

/**
 * Detected credential from an external tool (runtime)
 */
export interface DetectedCredential {
  source: import('@a3t/rapid-schema').ExternalAuthSource;
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
 * Runtime auth status summary
 */
export interface AuthStatus {
  authenticated: boolean;
  sources: DetectedCredential[];
  preferredSource?: DetectedCredential;
  warnings?: string[];
}

/**
 * Runtime gateway status
 */
export interface GatewayStatus {
  enabled: boolean;
  healthy: boolean;
  type?: string | undefined;
  mode?: string | undefined;
  baseUrl?: string | undefined;
  lastHealthCheck?: Date | undefined;
}
