/**
 * Secrets management for RAPID
 * Supports 1Password, HashiCorp Vault, and environment variables
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { SecretsConfig } from './types.js';
import { logger } from './logger.js';

export interface SecretStatus {
  name: string;
  reference: string;
  provider: 'env' | '1password' | 'vault';
  available: boolean;
  error?: string;
}

export interface SecretsStatus {
  provider: 'env' | '1password' | 'vault';
  authenticated: boolean;
  authMethod?: 'service-account' | 'user' | 'token';
  secrets: SecretStatus[];
  allAvailable: boolean;
}

export interface OpAuthStatus {
  authenticated: boolean;
  method: 'service-account' | 'user' | 'none';
  accountInfo?: string;
}

/**
 * Execute a command and return stdout
 */
async function execCommand(
  command: string,
  args: string[],
  options: { timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout ?? 30000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: 1 });
    });
  });
}

/**
 * Check if 1Password CLI is installed
 */
export async function hasOpCli(): Promise<boolean> {
  const result = await execCommand('op', ['--version']);
  return result.exitCode === 0;
}

/**
 * Check if OP_SERVICE_ACCOUNT_TOKEN is set
 */
export function hasOpServiceAccountToken(): boolean {
  return !!process.env.OP_SERVICE_ACCOUNT_TOKEN;
}

/**
 * Check if 1Password CLI is authenticated (via service account or user)
 */
export async function isOpAuthenticated(): Promise<boolean> {
  // Service account token takes precedence
  if (hasOpServiceAccountToken()) {
    // Verify the token works by trying to list vaults
    const result = await execCommand('op', ['vault', 'list', '--format=json']);
    return result.exitCode === 0;
  }

  // Fall back to user authentication
  const result = await execCommand('op', ['account', 'list']);
  return result.exitCode === 0 && result.stdout.length > 0;
}

/**
 * Get detailed 1Password authentication status
 */
export async function getOpAuthStatus(): Promise<OpAuthStatus> {
  // Check for service account token first
  if (hasOpServiceAccountToken()) {
    const result = await execCommand('op', ['vault', 'list', '--format=json']);
    if (result.exitCode === 0) {
      return {
        authenticated: true,
        method: 'service-account',
        accountInfo: 'Service Account',
      };
    }
    return {
      authenticated: false,
      method: 'none',
      accountInfo: 'Invalid service account token',
    };
  }

  // Check for user authentication
  const result = await execCommand('op', ['account', 'list', '--format=json']);
  if (result.exitCode === 0 && result.stdout.length > 0) {
    try {
      const accounts = JSON.parse(result.stdout);
      if (accounts.length > 0) {
        return {
          authenticated: true,
          method: 'user',
          accountInfo: accounts[0].email || accounts[0].url,
        };
      }
    } catch {
      // Parse error, but command succeeded
      return {
        authenticated: true,
        method: 'user',
      };
    }
  }

  return {
    authenticated: false,
    method: 'none',
  };
}

/**
 * Check if HashiCorp Vault CLI is installed
 */
export async function hasVaultCli(): Promise<boolean> {
  const result = await execCommand('vault', ['--version']);
  return result.exitCode === 0;
}

/**
 * Check if HashiCorp Vault is authenticated
 */
export async function isVaultAuthenticated(): Promise<boolean> {
  const result = await execCommand('vault', ['token', 'lookup']);
  return result.exitCode === 0;
}

/**
 * Read a secret from 1Password
 * @param reference - 1Password reference (e.g., "op://vault/item/field")
 */
export async function readOpSecret(reference: string): Promise<string | null> {
  const result = await execCommand('op', ['read', reference]);
  if (result.exitCode !== 0) {
    return null;
  }
  return result.stdout;
}

/**
 * Read a secret from HashiCorp Vault
 * @param path - Vault path (e.g., "secret/data/myproject")
 * @param field - Field name within the secret
 */
export async function readVaultSecret(path: string, field: string): Promise<string | null> {
  const result = await execCommand('vault', ['kv', 'get', '-field', field, path]);
  if (result.exitCode !== 0) {
    return null;
  }
  return result.stdout;
}

/**
 * Verify a single secret is accessible
 */
export async function verifySecret(
  name: string,
  reference: string,
  provider: 'env' | '1password' | 'vault',
  config?: SecretsConfig
): Promise<SecretStatus> {
  const status: SecretStatus = {
    name,
    reference,
    provider,
    available: false,
  };

  try {
    switch (provider) {
      case 'env': {
        const value = process.env[name];
        status.available = !!value && value.length > 0;
        if (!status.available) {
          status.error = 'Environment variable not set';
        }
        break;
      }

      case '1password': {
        // Reference should be in format op://vault/item/field
        const value = await readOpSecret(reference);
        status.available = value !== null;
        if (!status.available) {
          status.error = 'Secret not found in 1Password';
        }
        break;
      }

      case 'vault': {
        // Parse path and field from reference
        const field = reference.split('/').pop() || 'value';
        const vaultPath = reference.includes('/')
          ? reference.substring(0, reference.lastIndexOf('/'))
          : config?.vault || 'secret/data/default';

        const value = await readVaultSecret(vaultPath, field);
        status.available = value !== null;
        if (!status.available) {
          status.error = 'Secret not found in Vault';
        }
        break;
      }
    }
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error);
    status.available = false;
  }

  return status;
}

/**
 * Verify all secrets in configuration
 */
export async function verifySecrets(config: SecretsConfig): Promise<SecretsStatus> {
  const provider = config.provider || 'env';
  let authenticated = true;

  // Check authentication status for provider
  switch (provider) {
    case '1password':
      authenticated = await isOpAuthenticated();
      break;
    case 'vault':
      authenticated = await isVaultAuthenticated();
      break;
    case 'env':
      authenticated = true;
      break;
  }

  const secrets: SecretStatus[] = [];

  if (config.items) {
    for (const [name, reference] of Object.entries(config.items)) {
      const status = await verifySecret(name, reference, provider, config);
      secrets.push(status);
    }
  }

  const allAvailable = secrets.length === 0 || secrets.every((s) => s.available);

  return {
    provider,
    authenticated,
    secrets,
    allAvailable,
  };
}

/**
 * Load all secrets into environment
 */
export async function loadSecrets(config: SecretsConfig): Promise<Record<string, string>> {
  const provider = config.provider || 'env';
  const secrets: Record<string, string> = {};

  if (!config.items) {
    return secrets;
  }

  for (const [name, reference] of Object.entries(config.items)) {
    try {
      let value: string | null = null;

      switch (provider) {
        case 'env':
          value = process.env[name] || null;
          break;

        case '1password':
          value = await readOpSecret(reference);
          break;

        case 'vault': {
          const field = reference.split('/').pop() || 'value';
          const path = reference.substring(0, reference.lastIndexOf('/')) || config.vault || '';
          value = await readVaultSecret(path, field);
          break;
        }
      }

      if (value) {
        secrets[name] = value;
      }
    } catch (error) {
      logger.debug(`Failed to load secret ${name}: ${error}`);
    }
  }

  return secrets;
}

/**
 * Generate .envrc file from secrets configuration
 */
export function generateEnvrc(config: SecretsConfig): string {
  const provider = config.provider || 'env';
  const lines: string[] = [
    '# .envrc - RAPID project secrets',
    '# This file is safe to commit - it contains NO secrets, only references',
    '#',
    `# Provider: ${provider}`,
    `# Generated by: rapid secrets generate`,
    '',
  ];

  if (!config.items || Object.keys(config.items).length === 0) {
    lines.push('# No secrets configured in rapid.json');
    return lines.join('\n');
  }

  switch (provider) {
    case '1password':
      lines.push('# Secrets loaded from 1Password');
      lines.push('# Requires: 1Password CLI (op) installed and authenticated');
      lines.push('');
      for (const [name, reference] of Object.entries(config.items)) {
        lines.push(`export ${name}=$(op read "${reference}")`);
      }
      break;

    case 'vault':
      lines.push('# Secrets loaded from HashiCorp Vault');
      lines.push('# Requires: Vault CLI installed and authenticated');
      lines.push('');
      if (config.address) {
        lines.push(`export VAULT_ADDR="${config.address}"`);
        lines.push('');
      }
      for (const [name, reference] of Object.entries(config.items)) {
        const path = config.vault || 'secret/data/default';
        lines.push(`export ${name}=$(vault kv get -field=${reference} ${path})`);
      }
      break;

    case 'env':
      lines.push('# WARNING: env provider expects secrets to be set manually');
      lines.push('# Consider using 1password or vault for better security');
      lines.push('');
      lines.push('# Uncomment and set values (DO NOT commit actual values!)');
      for (const name of Object.keys(config.items)) {
        lines.push(`# export ${name}="your-value-here"`);
      }
      break;
  }

  // Add .env.local loading if configured
  if (config.envrc?.includeLocal !== false) {
    lines.push('');
    lines.push('# Load local overrides if present');
    lines.push('[[ -f .env.local ]] && source_env .env.local');
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Write .envrc file to project directory
 */
export async function writeEnvrc(rootDir: string, config: SecretsConfig): Promise<string> {
  const envrcPath = config.envrc?.path || '.envrc';
  const fullPath = join(rootDir, envrcPath);
  const content = generateEnvrc(config);

  await writeFile(fullPath, content);
  return fullPath;
}

/**
 * Check if .envrc exists in project
 */
export async function hasEnvrc(rootDir: string, config?: SecretsConfig): Promise<boolean> {
  const envrcPath = config?.envrc?.path || '.envrc';
  const fullPath = join(rootDir, envrcPath);

  try {
    await access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read existing .envrc content
 */
export async function readEnvrc(rootDir: string, config?: SecretsConfig): Promise<string | null> {
  const envrcPath = config?.envrc?.path || '.envrc';
  const fullPath = join(rootDir, envrcPath);

  try {
    const content = await readFile(fullPath, 'utf-8');
    return content;
  } catch {
    return null;
  }
}

/**
 * Get a summary of provider requirements
 */
export function getProviderInfo(provider: 'env' | '1password' | 'vault'): {
  name: string;
  cliRequired: string | null;
  authCommand: string | null;
  installUrl: string | null;
} {
  switch (provider) {
    case '1password':
      return {
        name: '1Password',
        cliRequired: 'op',
        authCommand: 'eval $(op signin)',
        installUrl: 'https://developer.1password.com/docs/cli/get-started/',
      };
    case 'vault':
      return {
        name: 'HashiCorp Vault',
        cliRequired: 'vault',
        authCommand: 'vault login',
        installUrl: 'https://developer.hashicorp.com/vault/docs/install',
      };
    case 'env':
      return {
        name: 'Environment Variables',
        cliRequired: null,
        authCommand: null,
        installUrl: null,
      };
  }
}
