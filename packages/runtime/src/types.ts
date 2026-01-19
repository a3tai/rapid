/**
 * RAPID Runtime Types
 *
 * OS-level sandbox configuration inspired by Anthropic's sandbox-runtime
 */

import { z } from 'zod';

/**
 * Network filtering configuration
 */
export interface NetworkConfig {
  /** Domains allowed to connect (supports wildcards like *.github.com) */
  allowedDomains?: string[];
  /** Domains explicitly denied (takes precedence over allowed) */
  deniedDomains?: string[];
  /** Block all network access (overrides allowedDomains) */
  blockAll?: boolean;
}

/**
 * Filesystem access configuration
 */
export interface FilesystemConfig {
  /** Paths denied read access (supports ~ expansion and globs) */
  denyRead?: string[];
  /** Paths allowed write access (supports ~ expansion and globs) */
  allowWrite?: string[];
  /** Paths denied write access (takes precedence) */
  denyWrite?: string[];
  /** Make entire filesystem read-only except allowWrite paths */
  readOnlyRoot?: boolean;
}

/**
 * Sandbox configuration mode
 */
export type SandboxMode = 'auto' | 'sandbox' | 'lima' | 'none';

/**
 * Complete sandbox configuration
 */
export interface SandboxConfig {
  /** Enable sandboxing */
  enabled: boolean;
  /** Sandbox mode selection */
  mode: SandboxMode;
  /** Network filtering rules */
  network?: NetworkConfig;
  /** Filesystem access rules */
  filesystem?: FilesystemConfig;
  /** Mandatory protections that cannot be overridden */
  mandatory?: MandatoryProtections;
}

/**
 * Mandatory security protections
 */
export interface MandatoryProtections {
  /** Always deny read to these paths regardless of config */
  alwaysDenyRead?: string[];
  /** Always deny write to these paths regardless of config */
  alwaysDenyWrite?: string[];
  /** Always allow these domains (e.g., for telemetry) */
  alwaysAllowDomains?: string[];
}

/**
 * Proxy server addresses
 */
export interface ProxyAddresses {
  httpProxy: string;
  httpsProxy: string;
  socksProxy: string;
  httpProxyPort: number;
  socksProxyPort: number;
}

/**
 * Sandbox environment variables
 */
export interface SandboxEnv {
  HTTP_PROXY: string;
  HTTPS_PROXY: string;
  ALL_PROXY: string;
  NO_PROXY: string;
}

/**
 * Sandbox status
 */
export interface SandboxStatus {
  available: boolean;
  platform: 'darwin' | 'linux' | 'win32' | 'unsupported';
  method: 'seatbelt' | 'bubblewrap' | 'none';
  httpProxyRunning: boolean;
  socksProxyRunning: boolean;
  httpProxyPort?: number;
  socksProxyPort?: number;
}

/**
 * Result of a sandbox operation
 */
export interface SandboxResult {
  success: boolean;
  error?: string;
  wrappedCommand?: string;
  env?: SandboxEnv;
}

/**
 * Preset sandbox configurations
 */
export type SandboxPreset = 'strict' | 'standard' | 'permissive' | 'development';

/**
 * Predefined sandbox presets
 */
export const SANDBOX_PRESETS: Record<SandboxPreset, Partial<SandboxConfig>> = {
  strict: {
    enabled: true,
    mode: 'sandbox',
    network: {
      allowedDomains: [],
      blockAll: true,
    },
    filesystem: {
      readOnlyRoot: true,
      allowWrite: ['/tmp'],
      denyRead: ['~/.ssh', '~/.gnupg', '~/.aws', '~/.config/gcloud'],
    },
  },
  standard: {
    enabled: true,
    mode: 'auto',
    network: {
      allowedDomains: [
        'github.com',
        '*.github.com',
        'api.anthropic.com',
        'registry.npmjs.org',
        '*.npmjs.org',
        'pypi.org',
        '*.pypi.org',
      ],
    },
    filesystem: {
      denyRead: ['~/.ssh/id_*', '~/.gnupg/private-keys*'],
      allowWrite: ['.', '/tmp', '~/.npm', '~/.cache'],
      denyWrite: ['.env', '*.pem', '*.key'],
    },
  },
  permissive: {
    enabled: true,
    mode: 'auto',
    network: {
      allowedDomains: ['*'],
    },
    filesystem: {
      denyRead: ['~/.ssh/id_*', '~/.gnupg/private-keys*'],
      allowWrite: ['.', '/tmp', '~/.npm', '~/.cache', '~/.local'],
    },
  },
  development: {
    enabled: false,
    mode: 'none',
  },
};

/**
 * Default mandatory protections (always enforced)
 */
export const DEFAULT_MANDATORY_PROTECTIONS: MandatoryProtections = {
  alwaysDenyRead: [
    '~/.ssh/id_*',
    '~/.gnupg/private-keys*',
    '~/.aws/credentials',
    '~/.config/gcloud/credentials.db',
    '~/.kube/config',
  ],
  alwaysDenyWrite: ['~/.ssh', '~/.gnupg', '~/.aws', '/etc/passwd', '/etc/shadow'],
  alwaysAllowDomains: [],
};

// Zod schemas for validation

export const NetworkConfigSchema = z.object({
  allowedDomains: z.array(z.string()).optional(),
  deniedDomains: z.array(z.string()).optional(),
  blockAll: z.boolean().optional(),
});

export const FilesystemConfigSchema = z.object({
  denyRead: z.array(z.string()).optional(),
  allowWrite: z.array(z.string()).optional(),
  denyWrite: z.array(z.string()).optional(),
  readOnlyRoot: z.boolean().optional(),
});

export const SandboxModeSchema = z.enum(['auto', 'sandbox', 'lima', 'none']);

export const SandboxConfigSchema = z.object({
  enabled: z.boolean(),
  mode: SandboxModeSchema,
  network: NetworkConfigSchema.optional(),
  filesystem: FilesystemConfigSchema.optional(),
  mandatory: z
    .object({
      alwaysDenyRead: z.array(z.string()).optional(),
      alwaysDenyWrite: z.array(z.string()).optional(),
      alwaysAllowDomains: z.array(z.string()).optional(),
    })
    .optional(),
});

export type ValidatedSandboxConfig = z.infer<typeof SandboxConfigSchema>;
