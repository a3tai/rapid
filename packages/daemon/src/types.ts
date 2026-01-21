/**
 * RAPID Daemon Types
 *
 * Types for session management, IPC communication, and environment providers.
 */

import type { RapidConfig } from '@a3t/rapid-core';
import type { SandboxConfig } from '@a3t/rapid-runtime';

/**
 * Session state
 */
export type SessionState =
  | 'created'
  | 'initializing'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'error';

/**
 * Environment provider types
 */
export type ProviderType = 'local' | 'devcontainer' | 'docker' | 'lima' | 'remote-ssh';

/**
 * Session information
 */
export interface Session {
  id: string;
  name: string;
  projectDir: string;
  provider: ProviderType;
  agent: string;
  state: SessionState;
  pid?: number;
  createdAt: Date;
  startedAt?: Date;
  stoppedAt?: Date;
  error?: string;
  env?: Record<string, string>;
  config?: RapidConfig;
  sandboxConfig?: SandboxConfig;
}

/**
 * Session creation options
 */
export interface CreateSessionOptions {
  name?: string;
  projectDir: string;
  provider?: ProviderType;
  agent: string;
  config?: RapidConfig;
  sandboxConfig?: SandboxConfig;
  env?: Record<string, string>;
}

/**
 * Daemon status
 */
export interface DaemonStatus {
  running: boolean;
  pid?: number;
  socketPath: string;
  version: string;
  uptime?: number;
  sessions: number;
  gatewayStatus?: GatewayStatus;
}

/**
 * Gateway status
 */
export interface GatewayStatus {
  enabled: boolean;
  type?: 'litellm' | 'custom';
  mode?: 'external' | 'managed' | 'sidecar';
  baseUrl?: string;
  healthy: boolean;
  lastHealthCheck?: Date;
}

/**
 * Gateway configuration
 */
export interface GatewayConfig {
  enabled: boolean;
  type: 'litellm' | 'custom';
  mode: 'external' | 'managed' | 'sidecar';
  config: {
    baseUrl: string;
    apiKey?: string;
    configFile?: string;
  };
  models?: {
    default?: string;
    aliases?: Record<string, string>;
  };
  fallback?: 'direct' | 'error';
}

/**
 * Secrets cache entry
 */
export interface SecretsCacheEntry {
  value: string;
  source: 'env' | '1password' | 'vault' | 'external';
  cachedAt: Date;
  expiresAt?: Date;
}

/**
 * JSON-RPC 2.0 Request
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id?: string | number;
}

/**
 * JSON-RPC 2.0 Response
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: JsonRpcError;
  id: string | number | null;
}

/**
 * JSON-RPC 2.0 Error
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Event types
 */
export type EventType =
  | 'session.created'
  | 'session.started'
  | 'session.stopped'
  | 'session.error'
  | 'config.changed'
  | 'gateway.health'
  | 'secrets.refreshed';

/**
 * Event payload
 */
export interface DaemonEvent {
  type: EventType;
  timestamp: Date;
  sessionId?: string;
  data?: unknown;
}

/**
 * Event listener
 */
export type EventListener = (event: DaemonEvent) => void;

/**
 * Environment provider interface
 */
export interface EnvironmentProvider {
  readonly type: ProviderType;
  readonly name: string;

  /** Check if this provider is available on the current system */
  isAvailable(): Promise<boolean>;

  /** Initialize the provider */
  initialize(options: ProviderInitOptions): Promise<void>;

  /** Create and start an environment for a session */
  createEnvironment(session: Session): Promise<EnvironmentHandle>;

  /** Stop an environment */
  stopEnvironment(handle: EnvironmentHandle): Promise<void>;

  /** Execute a command in the environment */
  execute(
    handle: EnvironmentHandle,
    command: string[],
    options?: ExecuteOptions
  ): Promise<ExecuteResult>;

  /** Get logs from the environment (optional) */
  getLogs?(
    handle: EnvironmentHandle,
    options?: GetLogsOptions
  ): Promise<string>;

  /** Clean up provider resources */
  cleanup(): Promise<void>;
}

/**
 * Options for getting logs from an environment
 */
export interface GetLogsOptions {
  tail?: number;
  since?: number;
  timestamps?: boolean;
}

/**
 * Provider initialization options
 */
export interface ProviderInitOptions {
  cacheDir?: string;
  verbose?: boolean;
}

/**
 * Handle to a running environment
 */
export interface EnvironmentHandle {
  id: string;
  provider: ProviderType;
  pid?: number;
  containerId?: string;
  sshHost?: string;
}

/**
 * Command execution options
 */
export interface ExecuteOptions {
  stdin?: 'inherit' | 'pipe' | 'ignore';
  stdout?: 'inherit' | 'pipe' | 'ignore';
  stderr?: 'inherit' | 'pipe' | 'ignore';
  env?: Record<string, string>;
  cwd?: string;
  interactive?: boolean;
  tty?: boolean;
}

/**
 * Command execution result
 */
export interface ExecuteResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

/**
 * RPC method definitions
 */
export interface RpcMethods {
  // Session management
  'session.create': (params: CreateSessionOptions) => Promise<Session>;
  'session.start': (params: { sessionId: string }) => Promise<Session>;
  'session.stop': (params: { sessionId: string }) => Promise<Session>;
  'session.list': () => Promise<Session[]>;
  'session.get': (params: { sessionId: string }) => Promise<Session | null>;
  'session.attach': (params: { sessionId: string }) => Promise<{ pty: string }>;
  'session.detach': (params: { sessionId: string }) => Promise<void>;

  // Daemon management
  'daemon.status': () => Promise<DaemonStatus>;
  'daemon.shutdown': () => Promise<void>;

  // Config
  'config.get': (params: { projectDir: string }) => Promise<RapidConfig | null>;
  'config.reload': (params: { projectDir: string }) => Promise<RapidConfig | null>;

  // Secrets
  'secrets.get': (params: { key: string; projectDir: string }) => Promise<string | null>;
  'secrets.refresh': (params: { projectDir: string }) => Promise<void>;

  // Gateway
  'gateway.status': () => Promise<GatewayStatus>;
  'gateway.start': () => Promise<GatewayStatus>;
  'gateway.stop': () => Promise<void>;
}

/**
 * Daemon configuration
 */
export interface DaemonConfig {
  socketPath: string;
  httpPort?: number;
  pidFile: string;
  logFile?: string;
  cacheDir: string;
  secretsTtl: number;
  verbose: boolean;
}

/**
 * Default daemon paths
 */
export const DEFAULT_DAEMON_PATHS = {
  socketPath: '~/.rapid/rapid.sock',
  pidFile: '~/.rapid/rapid.pid',
  logFile: '~/.rapid/rapid.log',
  cacheDir: '~/.rapid/cache',
} as const;

/**
 * Default secrets TTL (5 minutes)
 */
export const DEFAULT_SECRETS_TTL = 5 * 60 * 1000;
