/**
 * RAPID Runtime
 *
 * OS-level sandbox runtime for RAPID, inspired by Anthropic's sandbox-runtime.
 * Provides process isolation using platform-native mechanisms:
 * - macOS: Seatbelt (sandbox-exec)
 * - Linux: Bubblewrap (bwrap)
 *
 * @packageDocumentation
 */

// Types
export type {
  SandboxConfig,
  SandboxMode,
  NetworkConfig,
  FilesystemConfig,
  MandatoryProtections,
  ProxyAddresses,
  SandboxEnv,
  SandboxStatus,
  SandboxResult,
  SandboxPreset,
  ValidatedSandboxConfig,
} from './types.js';

export {
  SANDBOX_PRESETS,
  DEFAULT_MANDATORY_PROTECTIONS,
  SandboxConfigSchema,
  NetworkConfigSchema,
  FilesystemConfigSchema,
  SandboxModeSchema,
} from './types.js';

// Sandbox Manager
export {
  SandboxManager,
  createSandboxManager,
  type SandboxManagerOptions,
} from './sandbox/manager.js';

// Seatbelt (macOS)
export {
  generateSeatbeltProfile,
  wrapWithSeatbelt,
  buildSeatbeltArgs,
  isSeatbeltAvailable,
} from './sandbox/seatbelt.js';

// Bubblewrap (Linux)
export {
  generateBwrapArgs,
  wrapWithBubblewrap,
  buildBwrapCommand,
  isBubblewrapAvailable,
  getBubblewrapVersion,
  hasUserNamespaces,
  diagnoseBubblewrap,
} from './sandbox/bubblewrap.js';

// HTTP Proxy
export {
  createHttpProxy,
  createProxyEnv,
  type HttpProxyOptions,
  type HttpProxyInstance,
} from './sandbox/http-proxy.js';

// SOCKS Proxy
export {
  createSocksProxy,
  createSocksProxyEnv,
  type SocksProxyOptions,
  type SocksProxyInstance,
} from './sandbox/socks-proxy.js';

// Utilities
export {
  expandPath,
  expandPaths,
  matchDomain,
  isDomainAllowed,
  shellEscape,
  getPlatform,
  hasSeatbelt,
  hasBubblewrap,
  detectSandboxMethod,
  extractHostname,
  parseDomainList,
} from './sandbox/utils.js';
