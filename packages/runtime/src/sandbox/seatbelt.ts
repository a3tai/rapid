/**
 * macOS Seatbelt (sandbox-exec) profile generation
 *
 * Uses Apple's sandbox-exec with Seatbelt profiles for process isolation.
 * Reference: https://reverse.put.as/wp-content/uploads/2011/09/Apple-Sandbox-Guide-v1.0.pdf
 */

import type { SandboxConfig } from '../types.js';
import { expandPath } from './utils.js';

/**
 * Generate a Seatbelt profile from sandbox configuration
 */
export function generateSeatbeltProfile(
  config: SandboxConfig,
  options: {
    cwd?: string;
    httpProxyPort?: number;
    socksProxyPort?: number;
  } = {}
): string {
  const rules: string[] = [
    '(version 1)',
    '(deny default)',
    '',
    '; Essential process operations',
    '(allow process-exec)',
    '(allow process-fork)',
    '(allow signal)',
    '(allow sysctl-read)',
    '',
    '; Required device access',
    '(allow file-read* (literal "/dev/null"))',
    '(allow file-read* (literal "/dev/urandom"))',
    '(allow file-read* (literal "/dev/random"))',
    '(allow file-write* (literal "/dev/null"))',
    '(allow file-ioctl (literal "/dev/null"))',
    '(allow file-read* (literal "/dev/tty"))',
    '(allow file-write* (literal "/dev/tty"))',
    '(allow file-ioctl (literal "/dev/tty"))',
    '',
    '; PTY access for terminal',
    '(allow file-read* (regex #"^/dev/ttys[0-9]+$"))',
    '(allow file-write* (regex #"^/dev/ttys[0-9]+$"))',
    '(allow file-ioctl (regex #"^/dev/ttys[0-9]+$"))',
    '',
    '; System library access',
    '(allow file-read* (subpath "/usr/lib"))',
    '(allow file-read* (subpath "/usr/share"))',
    '(allow file-read* (subpath "/System"))',
    '(allow file-read* (subpath "/Library/Frameworks"))',
    '(allow file-read* (subpath "/private/var/db/dyld"))',
    '',
    '; User library access',
    '(allow file-read* (subpath "/usr/local"))',
    '(allow file-read* (subpath "/opt/homebrew"))',
    '',
    '; Mach services',
    '(allow mach-lookup)',
    '',
  ];

  // Filesystem rules
  rules.push('; Filesystem rules');
  rules.push(...generateFilesystemRules(config, options.cwd));
  rules.push('');

  // Network rules
  rules.push('; Network rules');
  rules.push(...generateNetworkRules(config, options.httpProxyPort, options.socksProxyPort));
  rules.push('');

  return rules.join('\n');
}

/**
 * Generate filesystem access rules
 */
function generateFilesystemRules(config: SandboxConfig, cwd?: string): string[] {
  const rules: string[] = [];
  const fs = config.filesystem || {};
  const mandatory = config.mandatory || {};

  // Start with read access by default (unless readOnlyRoot)
  if (!fs.readOnlyRoot) {
    rules.push('(allow file-read*)');
  } else {
    // Read-only root: only allow specific paths
    rules.push('(allow file-read* (subpath "/"))');
  }

  // Deny read to specific paths
  const denyReadPaths = [...(fs.denyRead || []), ...(mandatory.alwaysDenyRead || [])];

  for (const path of denyReadPaths) {
    const expanded = expandPath(path, cwd);
    if (path.includes('*')) {
      // Convert glob to regex
      const regex = globToSeatbeltRegex(expanded);
      rules.push(`(deny file-read* (regex #"${regex}"))`);
    } else {
      rules.push(`(deny file-read* (subpath "${expanded}"))`);
    }
  }

  // Deny write by default
  rules.push('(deny file-write*)');

  // Allow write to specific paths
  const allowWritePaths = fs.allowWrite || ['.', '/tmp'];
  for (const path of allowWritePaths) {
    const expanded = expandPath(path, cwd);
    rules.push(`(allow file-write* (subpath "${expanded}"))`);
  }

  // Deny write to specific paths (takes precedence)
  const denyWritePaths = [...(fs.denyWrite || []), ...(mandatory.alwaysDenyWrite || [])];

  for (const path of denyWritePaths) {
    const expanded = expandPath(path, cwd);
    if (path.includes('*')) {
      const regex = globToSeatbeltRegex(expanded);
      rules.push(`(deny file-write* (regex #"${regex}"))`);
    } else {
      rules.push(`(deny file-write* (subpath "${expanded}"))`);
    }
  }

  return rules;
}

/**
 * Generate network access rules
 */
function generateNetworkRules(
  config: SandboxConfig,
  httpProxyPort?: number,
  socksProxyPort?: number
): string[] {
  const rules: string[] = [];
  const network = config.network || {};

  if (network.blockAll) {
    // Block all network access
    rules.push('(deny network*)');
    return rules;
  }

  // If using proxy-based filtering, only allow connections to the proxy
  if (httpProxyPort && socksProxyPort) {
    rules.push('; Only allow connections to local proxy servers');
    rules.push(`(allow network-outbound (remote ip "localhost:${httpProxyPort}"))`);
    rules.push(`(allow network-outbound (remote ip "127.0.0.1:${httpProxyPort}"))`);
    rules.push(`(allow network-outbound (remote ip "localhost:${socksProxyPort}"))`);
    rules.push(`(allow network-outbound (remote ip "127.0.0.1:${socksProxyPort}"))`);
    rules.push('(allow network-inbound (local ip "localhost:*"))');
    rules.push('(allow network-inbound (local ip "127.0.0.1:*"))');
    rules.push('; DNS resolution');
    rules.push('(allow network-outbound (remote unix-socket))');
    rules.push('(allow network-outbound (remote ip "*:53"))');
  } else {
    // No proxy, allow all network (domain filtering handled elsewhere or not enforced)
    rules.push('(allow network*)');
  }

  return rules;
}

/**
 * Convert a simple glob pattern to Seatbelt regex
 */
function globToSeatbeltRegex(glob: string): string {
  return glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\*/g, '.*') // Convert * to .*
    .replace(/\?/g, '.'); // Convert ? to .
}

/**
 * Wrap a command to run under sandbox-exec
 */
export function wrapWithSeatbelt(command: string, profile: string): string {
  // Escape the profile for shell embedding
  const escapedProfile = profile.replace(/'/g, "'\\''");
  return `sandbox-exec -p '${escapedProfile}' ${command}`;
}

/**
 * Build sandbox-exec arguments
 */
export function buildSeatbeltArgs(profile: string): string[] {
  return ['-p', profile];
}

/**
 * Check if sandbox-exec is available
 */
export async function isSeatbeltAvailable(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false;
  }

  try {
    const { execa } = await import('execa');
    // Test with a minimal profile
    const testProfile = '(version 1)(allow default)';
    await execa('sandbox-exec', ['-p', testProfile, 'true']);
    return true;
  } catch {
    return false;
  }
}
