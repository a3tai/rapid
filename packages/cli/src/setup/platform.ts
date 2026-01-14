/**
 * Platform detection utilities for RAPID setup
 */

import { platform, arch } from 'node:os';
import { execa } from 'execa';

/**
 * Supported platforms
 */
export type Platform = 'macos' | 'linux' | 'windows' | 'unknown';

/**
 * Supported architectures
 */
export type Architecture = 'x64' | 'arm64' | 'unknown';

/**
 * Platform information
 */
export interface PlatformInfo {
  platform: Platform;
  arch: Architecture;
  isAppleSilicon: boolean;
  hasDocker: boolean;
  hasLima: boolean;
  hasGit: boolean;
  hasGpgAgent: boolean;
  hasSshAgent: boolean;
}

/**
 * Get the current platform
 */
export function getPlatform(): Platform {
  const p = platform();
  switch (p) {
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    case 'win32':
      return 'windows';
    default:
      return 'unknown';
  }
}

/**
 * Get the current architecture
 */
export function getArchitecture(): Architecture {
  const a = arch();
  switch (a) {
    case 'x64':
      return 'x64';
    case 'arm64':
      return 'arm64';
    default:
      return 'unknown';
  }
}

/**
 * Check if running on Apple Silicon
 */
export function isAppleSilicon(): boolean {
  return getPlatform() === 'macos' && getArchitecture() === 'arm64';
}

/**
 * Check if Docker is available
 */
export async function hasDocker(): Promise<boolean> {
  try {
    await execa('docker', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Lima is available (macOS)
 */
export async function hasLima(): Promise<boolean> {
  try {
    await execa('limactl', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Git is available
 */
export async function hasGit(): Promise<boolean> {
  try {
    await execa('git', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if GPG agent is available
 */
export async function hasGpgAgent(): Promise<boolean> {
  try {
    await execa('gpg-agent', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if SSH agent is running
 */
export async function hasSshAgent(): Promise<boolean> {
  return !!process.env.SSH_AUTH_SOCK;
}

/**
 * Get comprehensive platform information
 */
export async function getPlatformInfo(): Promise<PlatformInfo> {
  const [docker, lima, git, gpg, ssh] = await Promise.all([
    hasDocker(),
    hasLima(),
    hasGit(),
    hasGpgAgent(),
    hasSshAgent(),
  ]);

  return {
    platform: getPlatform(),
    arch: getArchitecture(),
    isAppleSilicon: isAppleSilicon(),
    hasDocker: docker,
    hasLima: lima,
    hasGit: git,
    hasGpgAgent: gpg,
    hasSshAgent: ssh,
  };
}

/**
 * Check minimum requirements for RAPID
 */
export async function checkRequirements(): Promise<{
  met: boolean;
  missing: string[];
  warnings: string[];
}> {
  const info = await getPlatformInfo();
  const missing: string[] = [];
  const warnings: string[] = [];

  // Git is required
  if (!info.hasGit) {
    missing.push('git');
  }

  // Docker is required for container mode
  if (!info.hasDocker) {
    missing.push('docker');
  }

  // SSH agent is recommended for commit signing
  if (!info.hasSshAgent) {
    warnings.push('SSH agent not running - commit signing will not work in containers');
  }

  // Lima is recommended for macOS local mode
  if (info.platform === 'macos' && !info.hasLima) {
    warnings.push('Lima not installed - local mode will run without VM isolation');
  }

  return {
    met: missing.length === 0,
    missing,
    warnings,
  };
}
