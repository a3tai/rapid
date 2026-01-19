/**
 * RAPID Daemon
 *
 * Background daemon for session management, config watching, and secrets caching.
 *
 * @packageDocumentation
 */

// Types
export type {
  Session,
  SessionState,
  CreateSessionOptions,
  DaemonStatus,
  GatewayStatus,
  GatewayConfig,
  SecretsCacheEntry,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  EventType,
  DaemonEvent,
  EventListener,
  EnvironmentProvider,
  ProviderType,
  ProviderInitOptions,
  EnvironmentHandle,
  ExecuteOptions,
  ExecuteResult,
  RpcMethods,
  DaemonConfig,
} from './types.js';

export { DEFAULT_DAEMON_PATHS, DEFAULT_SECRETS_TTL } from './types.js';

// Server
export { DaemonServer, isDaemonRunning, getDaemonPid } from './server.js';

// Session Manager
export { SessionManager } from './session-manager.js';

// Config Watcher
export { ConfigWatcher, type ConfigWatcherOptions } from './config-watcher.js';

// Secrets Cache
export { SecretsCache, type SecretsCacheOptions } from './secrets-cache.js';

// Providers
export { BaseProvider } from './providers/base.js';
export { LocalProvider } from './providers/local.js';
export { DevcontainerProvider } from './providers/devcontainer.js';
export { LimaProvider } from './providers/lima.js';
