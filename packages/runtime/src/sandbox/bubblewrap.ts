/**
 * Linux Bubblewrap (bwrap) sandbox implementation
 *
 * Uses bubblewrap for lightweight container-based isolation on Linux.
 * Reference: https://github.com/containers/bubblewrap
 */

import type { SandboxConfig } from '../types.js';
import { expandPath } from './utils.js';

/**
 * Generate bubblewrap arguments from sandbox configuration
 */
export function generateBwrapArgs(
  config: SandboxConfig,
  options: {
    cwd?: string;
    httpProxyPort?: number;
    socksProxyPort?: number;
  } = {}
): string[] {
  const args: string[] = [];
  const fs = config.filesystem || {};
  const mandatory = config.mandatory || {};
  const cwd = options.cwd || process.cwd();

  // Unshare namespaces for isolation
  args.push('--unshare-user');
  args.push('--unshare-pid');
  args.push('--unshare-uts');
  args.push('--unshare-cgroup');

  // Don't unshare network if we need proxy access
  if (!config.network?.blockAll) {
    // Keep network namespace shared to access proxy
  } else {
    args.push('--unshare-net');
  }

  // Create new session
  args.push('--new-session');

  // Die with parent
  args.push('--die-with-parent');

  // Set up /proc
  args.push('--proc', '/proc');

  // Set up /dev (minimal)
  args.push('--dev', '/dev');

  // Bind mount root filesystem
  if (fs.readOnlyRoot) {
    args.push('--ro-bind', '/', '/');
  } else {
    args.push('--bind', '/', '/');
  }

  // Bind /tmp as writable
  args.push('--tmpfs', '/tmp');

  // Set up current working directory
  args.push('--chdir', cwd);

  // Handle allowed write paths
  const allowWritePaths = fs.allowWrite || ['.', '/tmp'];
  for (const path of allowWritePaths) {
    const expanded = expandPath(path, cwd);
    // Remount as read-write if it was read-only
    if (fs.readOnlyRoot) {
      args.push('--bind', expanded, expanded);
    }
  }

  // Handle denied read paths (mask them)
  const denyReadPaths = [...(fs.denyRead || []), ...(mandatory.alwaysDenyRead || [])];

  for (const path of denyReadPaths) {
    const expanded = expandPath(path, cwd);
    // Don't mask if it contains globs (bwrap doesn't support that)
    if (!path.includes('*')) {
      args.push('--tmpfs', expanded);
    }
  }

  // Handle denied write paths (mount read-only)
  const denyWritePaths = [...(fs.denyWrite || []), ...(mandatory.alwaysDenyWrite || [])];

  for (const path of denyWritePaths) {
    const expanded = expandPath(path, cwd);
    if (!path.includes('*')) {
      args.push('--ro-bind', expanded, expanded);
    }
  }

  // Set up environment variables for proxy
  if (options.httpProxyPort) {
    args.push('--setenv', 'HTTP_PROXY', `http://127.0.0.1:${options.httpProxyPort}`);
    args.push('--setenv', 'HTTPS_PROXY', `http://127.0.0.1:${options.httpProxyPort}`);
    args.push('--setenv', 'http_proxy', `http://127.0.0.1:${options.httpProxyPort}`);
    args.push('--setenv', 'https_proxy', `http://127.0.0.1:${options.httpProxyPort}`);
  }

  if (options.socksProxyPort) {
    args.push('--setenv', 'ALL_PROXY', `socks5://127.0.0.1:${options.socksProxyPort}`);
    args.push('--setenv', 'all_proxy', `socks5://127.0.0.1:${options.socksProxyPort}`);
  }

  // Allow localhost for proxy
  args.push('--setenv', 'NO_PROXY', 'localhost,127.0.0.1');
  args.push('--setenv', 'no_proxy', 'localhost,127.0.0.1');

  return args;
}

/**
 * Wrap a command to run under bubblewrap
 */
export function wrapWithBubblewrap(command: string, args: string[]): string {
  return `bwrap ${args.join(' ')} -- ${command}`;
}

/**
 * Build a full bwrap command array
 */
export function buildBwrapCommand(args: string[], command: string[]): string[] {
  return ['bwrap', ...args, '--', ...command];
}

/**
 * Check if bubblewrap is available
 */
export async function isBubblewrapAvailable(): Promise<boolean> {
  if (process.platform !== 'linux') {
    return false;
  }

  try {
    const { execa } = await import('execa');
    await execa('bwrap', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get bubblewrap version
 */
export async function getBubblewrapVersion(): Promise<string | null> {
  try {
    const { execa } = await import('execa');
    const result = await execa('bwrap', ['--version']);
    // Output is like "bubblewrap 0.8.0"
    const match = result.stdout.match(/bubblewrap\s+(\S+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if user namespaces are available
 */
export async function hasUserNamespaces(): Promise<boolean> {
  try {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile('/proc/sys/kernel/unprivileged_userns_clone', 'utf-8');
    return content.trim() === '1';
  } catch {
    // File doesn't exist on some systems, assume namespaces are available
    return true;
  }
}

/**
 * Diagnose bubblewrap setup issues
 */
export async function diagnoseBubblewrap(): Promise<{
  available: boolean;
  version: string | null;
  userNamespaces: boolean;
  issues: string[];
}> {
  const issues: string[] = [];
  const available = await isBubblewrapAvailable();
  const version = await getBubblewrapVersion();
  const userNamespaces = await hasUserNamespaces();

  if (!available) {
    issues.push('bubblewrap (bwrap) is not installed');
  }

  if (!userNamespaces) {
    issues.push(
      'User namespaces are disabled. Enable with: sysctl kernel.unprivileged_userns_clone=1'
    );
  }

  return {
    available,
    version,
    userNamespaces,
    issues,
  };
}
