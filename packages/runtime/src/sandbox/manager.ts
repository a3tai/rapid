/**
 * Sandbox Manager
 *
 * Orchestrates OS-level sandboxing using Seatbelt (macOS) or Bubblewrap (Linux)
 * with HTTP/SOCKS proxy servers for network filtering.
 */

import type {
  SandboxConfig,
  SandboxStatus,
  SandboxResult,
  SandboxEnv,
  ProxyAddresses,
} from '../types.js';
import { DEFAULT_MANDATORY_PROTECTIONS, SANDBOX_PRESETS } from '../types.js';
import { createHttpProxy, type HttpProxyInstance } from './http-proxy.js';
import { createSocksProxy, type SocksProxyInstance } from './socks-proxy.js';
import { generateSeatbeltProfile, wrapWithSeatbelt } from './seatbelt.js';
import { generateBwrapArgs, wrapWithBubblewrap } from './bubblewrap.js';
import { getPlatform, detectSandboxMethod } from './utils.js';

export interface SandboxManagerOptions {
  /** Working directory for the sandboxed process */
  cwd?: string;
  /** Callback when a domain is blocked */
  onNetworkBlock?: (domain: string, url?: string) => void;
  /** Callback when a domain is allowed */
  onNetworkAllow?: (domain: string, url?: string) => void;
  /** Enable verbose logging */
  verbose?: boolean;
}

export class SandboxManager {
  private config: SandboxConfig;
  private options: SandboxManagerOptions;
  private httpProxy: HttpProxyInstance | null = null;
  private socksProxy: SocksProxyInstance | null = null;
  private initialized = false;

  constructor(config: SandboxConfig, options: SandboxManagerOptions = {}) {
    // Merge with mandatory protections
    this.config = {
      ...config,
      mandatory: {
        ...DEFAULT_MANDATORY_PROTECTIONS,
        ...config.mandatory,
      },
    };
    this.options = options;
  }

  /**
   * Initialize the sandbox (start proxy servers if needed)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Start network proxies if domain filtering is configured
    const hasNetworkRules =
      this.config.network?.allowedDomains?.length || this.config.network?.deniedDomains?.length;

    if (hasNetworkRules && !this.config.network?.blockAll) {
      // Build proxy options conditionally to satisfy exactOptionalPropertyTypes
      // HTTP proxy uses (domain, url) callbacks
      const httpProxyOptions: Parameters<typeof createHttpProxy>[0] = {
        network: this.config.network!,
      };
      if (this.options.onNetworkBlock) {
        const blockCallback = this.options.onNetworkBlock;
        httpProxyOptions.onBlock = (domain: string, url: string) => blockCallback(domain, url);
      }
      if (this.options.onNetworkAllow) {
        const allowCallback = this.options.onNetworkAllow;
        httpProxyOptions.onAllow = (domain: string, url: string) => allowCallback(domain, url);
      }

      // SOCKS proxy uses (domain) callbacks
      const socksProxyOptions: Parameters<typeof createSocksProxy>[0] = {
        network: this.config.network!,
      };
      if (this.options.onNetworkBlock) {
        const blockCallback = this.options.onNetworkBlock;
        socksProxyOptions.onBlock = (domain: string) => blockCallback(domain);
      }
      if (this.options.onNetworkAllow) {
        const allowCallback = this.options.onNetworkAllow;
        socksProxyOptions.onAllow = (domain: string) => allowCallback(domain);
      }

      this.httpProxy = await createHttpProxy(httpProxyOptions);

      this.socksProxy = await createSocksProxy(socksProxyOptions);

      if (this.options.verbose) {
        console.log(`HTTP Proxy started on port ${this.httpProxy.port}`);
        console.log(`SOCKS Proxy started on port ${this.socksProxy.port}`);
      }
    }

    this.initialized = true;
  }

  /**
   * Shutdown the sandbox (stop proxy servers)
   */
  async shutdown(): Promise<void> {
    if (this.httpProxy) {
      await this.httpProxy.stop();
      this.httpProxy = null;
    }

    if (this.socksProxy) {
      await this.socksProxy.stop();
      this.socksProxy = null;
    }

    this.initialized = false;
  }

  /**
   * Get the current status of the sandbox
   */
  async getStatus(): Promise<SandboxStatus> {
    const platform = getPlatform();
    const method = await detectSandboxMethod();

    const status: SandboxStatus = {
      available: method !== 'none',
      platform,
      method,
      httpProxyRunning: this.httpProxy !== null,
      socksProxyRunning: this.socksProxy !== null,
    };

    if (this.httpProxy) {
      status.httpProxyPort = this.httpProxy.port;
    }
    if (this.socksProxy) {
      status.socksProxyPort = this.socksProxy.port;
    }

    return status;
  }

  /**
   * Get proxy addresses if proxies are running
   */
  getProxyAddresses(): ProxyAddresses | null {
    if (!this.httpProxy || !this.socksProxy) {
      return null;
    }

    return {
      httpProxy: `http://${this.httpProxy.host}:${this.httpProxy.port}`,
      httpsProxy: `http://${this.httpProxy.host}:${this.httpProxy.port}`,
      socksProxy: `socks5://${this.socksProxy.host}:${this.socksProxy.port}`,
      httpProxyPort: this.httpProxy.port,
      socksProxyPort: this.socksProxy.port,
    };
  }

  /**
   * Get environment variables for the sandboxed process
   */
  getEnvironment(): SandboxEnv {
    const proxyAddresses = this.getProxyAddresses();

    if (proxyAddresses) {
      return {
        HTTP_PROXY: proxyAddresses.httpProxy,
        HTTPS_PROXY: proxyAddresses.httpsProxy,
        ALL_PROXY: proxyAddresses.socksProxy,
        NO_PROXY: 'localhost,127.0.0.1',
      };
    }

    return {
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      ALL_PROXY: '',
      NO_PROXY: 'localhost,127.0.0.1',
    };
  }

  /**
   * Wrap a command to run in the sandbox
   */
  async wrapCommand(command: string): Promise<SandboxResult> {
    if (!this.config.enabled || this.config.mode === 'none') {
      return {
        success: true,
        wrappedCommand: command,
        env: this.getEnvironment(),
      };
    }

    const method = await detectSandboxMethod();

    if (method === 'none') {
      if (this.config.mode === 'sandbox') {
        return {
          success: false,
          error:
            'Sandbox mode required but no sandbox method available. ' +
            'Install bubblewrap (Linux) or use macOS with sandbox-exec.',
        };
      }
      // Auto mode: fall back to direct execution
      return {
        success: true,
        wrappedCommand: command,
        env: this.getEnvironment(),
      };
    }

    await this.initialize();

    const proxyAddresses = this.getProxyAddresses();
    const cwd = this.options.cwd;

    if (method === 'seatbelt') {
      const profileOptions: { cwd?: string; httpProxyPort?: number; socksProxyPort?: number } = {};
      if (cwd) profileOptions.cwd = cwd;
      if (proxyAddresses?.httpProxyPort)
        profileOptions.httpProxyPort = proxyAddresses.httpProxyPort;
      if (proxyAddresses?.socksProxyPort)
        profileOptions.socksProxyPort = proxyAddresses.socksProxyPort;

      const profile = generateSeatbeltProfile(this.config, profileOptions);

      return {
        success: true,
        wrappedCommand: wrapWithSeatbelt(command, profile),
        env: this.getEnvironment(),
      };
    }

    if (method === 'bubblewrap') {
      const bwrapOptions: { cwd?: string; httpProxyPort?: number; socksProxyPort?: number } = {};
      if (cwd) bwrapOptions.cwd = cwd;
      if (proxyAddresses?.httpProxyPort) bwrapOptions.httpProxyPort = proxyAddresses.httpProxyPort;
      if (proxyAddresses?.socksProxyPort)
        bwrapOptions.socksProxyPort = proxyAddresses.socksProxyPort;

      const args = generateBwrapArgs(this.config, bwrapOptions);

      return {
        success: true,
        wrappedCommand: wrapWithBubblewrap(command, args),
        env: this.getEnvironment(),
      };
    }

    return {
      success: false,
      error: `Unknown sandbox method: ${method}`,
    };
  }

  /**
   * Execute a command in the sandbox
   */
  async execute(
    command: string[],
    options: {
      stdin?: 'inherit' | 'pipe' | 'ignore';
      stdout?: 'inherit' | 'pipe' | 'ignore';
      stderr?: 'inherit' | 'pipe' | 'ignore';
      env?: Record<string, string>;
    } = {}
  ): Promise<{ exitCode: number; stdout?: string; stderr?: string }> {
    const { execa } = await import('execa');

    const wrapResult = await this.wrapCommand(command.join(' '));

    if (!wrapResult.success) {
      throw new Error(wrapResult.error);
    }

    const mergedEnv = {
      ...process.env,
      ...wrapResult.env,
      ...options.env,
    };

    try {
      // Build execa options conditionally to satisfy exactOptionalPropertyTypes
      const execaOptions: {
        shell: true;
        stdin: 'inherit' | 'pipe' | 'ignore';
        stdout: 'inherit' | 'pipe' | 'ignore';
        stderr: 'inherit' | 'pipe' | 'ignore';
        env: typeof mergedEnv;
        cwd?: string;
      } = {
        shell: true,
        stdin: options.stdin || 'inherit',
        stdout: options.stdout || 'inherit',
        stderr: options.stderr || 'inherit',
        env: mergedEnv,
      };
      if (this.options.cwd) {
        execaOptions.cwd = this.options.cwd;
      }

      const result = await execa(wrapResult.wrappedCommand!, execaOptions);

      const response: { exitCode: number; stdout?: string; stderr?: string } = {
        exitCode: result.exitCode ?? 0,
      };
      if (result.stdout && typeof result.stdout === 'string') {
        response.stdout = result.stdout;
      }
      if (result.stderr && typeof result.stderr === 'string') {
        response.stderr = result.stderr;
      }

      return response;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'exitCode' in error) {
        const execaError = error as {
          exitCode: number;
          stdout?: unknown;
          stderr?: unknown;
        };
        const response: { exitCode: number; stdout?: string; stderr?: string } = {
          exitCode: execaError.exitCode,
        };
        if (execaError.stdout && typeof execaError.stdout === 'string') {
          response.stdout = execaError.stdout;
        }
        if (execaError.stderr && typeof execaError.stderr === 'string') {
          response.stderr = execaError.stderr;
        }
        return response;
      }
      throw error;
    }
  }

  /**
   * Create a SandboxManager from a preset
   */
  static fromPreset(
    preset: keyof typeof SANDBOX_PRESETS,
    options: SandboxManagerOptions = {}
  ): SandboxManager {
    const config = {
      enabled: true,
      mode: 'auto' as const,
      ...SANDBOX_PRESETS[preset],
    };
    return new SandboxManager(config, options);
  }

  /**
   * Check if sandboxing is available on this system
   */
  static async isAvailable(): Promise<boolean> {
    const method = await detectSandboxMethod();
    return method !== 'none';
  }

  /**
   * Get available sandbox method for this system
   */
  static async getMethod(): Promise<'seatbelt' | 'bubblewrap' | 'none'> {
    return detectSandboxMethod();
  }
}

/**
 * Create a sandbox manager with default configuration
 */
export function createSandboxManager(
  config?: Partial<SandboxConfig>,
  options?: SandboxManagerOptions
): SandboxManager {
  const fullConfig: SandboxConfig = {
    enabled: true,
    mode: 'auto',
    ...config,
  };
  return new SandboxManager(fullConfig, options);
}
