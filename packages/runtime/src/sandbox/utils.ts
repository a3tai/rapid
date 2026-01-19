/**
 * Sandbox utility functions
 */

import { homedir } from 'node:os';
import { resolve, isAbsolute } from 'node:path';

/**
 * Expand ~ to home directory and resolve relative paths
 */
export function expandPath(path: string, cwd?: string): string {
  // Expand ~
  if (path.startsWith('~')) {
    path = path.replace(/^~/, homedir());
  }

  // Resolve relative paths
  if (!isAbsolute(path)) {
    path = resolve(cwd || process.cwd(), path);
  }

  return path;
}

/**
 * Expand an array of paths
 */
export function expandPaths(paths: string[], cwd?: string): string[] {
  return paths.map((p) => expandPath(p, cwd));
}

/**
 * Check if a domain matches a pattern (supports wildcards)
 *
 * Examples:
 *   matchDomain('github.com', 'github.com') => true
 *   matchDomain('api.github.com', '*.github.com') => true
 *   matchDomain('github.com', '*.github.com') => false
 *   matchDomain('example.com', '*') => true
 */
export function matchDomain(domain: string, pattern: string): boolean {
  // Universal wildcard
  if (pattern === '*') {
    return true;
  }

  // Exact match
  if (pattern === domain) {
    return true;
  }

  // Wildcard subdomain match (*.example.com matches sub.example.com but not example.com)
  if (pattern.startsWith('*.')) {
    const baseDomain = pattern.slice(2);
    return domain.endsWith(`.${baseDomain}`);
  }

  return false;
}

/**
 * Check if a domain is allowed based on allow/deny lists
 */
export function isDomainAllowed(
  domain: string,
  allowedDomains?: string[],
  deniedDomains?: string[]
): boolean {
  // Check denied first (takes precedence)
  if (deniedDomains?.some((pattern) => matchDomain(domain, pattern))) {
    return false;
  }

  // If no allowed list, allow all (unless explicitly denied)
  if (!allowedDomains || allowedDomains.length === 0) {
    return true;
  }

  // Check if in allowed list
  return allowedDomains.some((pattern) => matchDomain(domain, pattern));
}

/**
 * Escape a string for use in shell commands
 */
export function shellEscape(str: string): string {
  // If the string contains no special characters, return as-is
  if (/^[a-zA-Z0-9_\-./=:]+$/.test(str)) {
    return str;
  }

  // Otherwise, wrap in single quotes and escape any single quotes
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Get the current platform
 */
export function getPlatform(): 'darwin' | 'linux' | 'win32' | 'unsupported' {
  const platform = process.platform;
  if (platform === 'darwin' || platform === 'linux' || platform === 'win32') {
    return platform;
  }
  return 'unsupported';
}

/**
 * Check if sandbox-exec (Seatbelt) is available on macOS
 */
export async function hasSeatbelt(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false;
  }

  try {
    const { execa } = await import('execa');
    await execa('which', ['sandbox-exec']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if bubblewrap (bwrap) is available on Linux
 */
export async function hasBubblewrap(): Promise<boolean> {
  if (process.platform !== 'linux') {
    return false;
  }

  try {
    const { execa } = await import('execa');
    await execa('which', ['bwrap']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine the best available sandbox method for the current platform
 */
export async function detectSandboxMethod(): Promise<'seatbelt' | 'bubblewrap' | 'none'> {
  const platform = getPlatform();

  if (platform === 'darwin' && (await hasSeatbelt())) {
    return 'seatbelt';
  }

  if (platform === 'linux' && (await hasBubblewrap())) {
    return 'bubblewrap';
  }

  return 'none';
}

/**
 * Extract hostname from a URL
 */
export function extractHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    // Try to extract from host:port format
    const match = url.match(/^([^:]+)(?::\d+)?$/);
    return match?.[1] ?? null;
  }
}

/**
 * Parse a domain list string into an array
 * Supports comma-separated and newline-separated formats
 */
export function parseDomainList(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}
