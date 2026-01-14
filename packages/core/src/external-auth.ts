/**
 * External Authentication Detection
 *
 * Detects and reuses credentials from AI coding tools like:
 * - Claude Code (~/.claude.json)
 * - OpenAI Codex (~/.codex/auth.json)
 * - Gemini CLI (~/.gemini/)
 * - Aider (.env files with API keys)
 */

import { readFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DetectedCredential, ExternalAuthConfig, AuthStatus } from './types.js';
import { logger } from './logger.js';

/**
 * Default configuration for external auth detection
 */
const DEFAULT_CONFIG: ExternalAuthConfig = {
  enabled: true,
  sources: ['claude-code', 'codex', 'gemini-cli', 'aider', 'env'],
};

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely read and parse JSON file
 */
async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// =============================================================================
// Claude Code Detection
// =============================================================================

interface ClaudeCodeConfig {
  oauthAccount?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    accountUuid?: string;
    emailAddress?: string;
    organizationName?: string;
    planType?: string;
  };
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
  };
  lastAccountUuid?: string;
}

/**
 * Detect Claude Code credentials from ~/.claude.json
 */
export async function detectClaudeCodeAuth(): Promise<DetectedCredential | null> {
  const home = homedir();
  const configPath = join(home, '.claude.json');

  if (!(await fileExists(configPath))) {
    return null;
  }

  const config = await readJsonFile<ClaudeCodeConfig>(configPath);
  if (!config) {
    return null;
  }

  // Check for OAuth session (Claude Pro/Max login)
  const oauth = config.oauthAccount || config.claudeAiOauth;
  if (oauth?.accessToken) {
    const expiresAt = oauth.expiresAt ? new Date(oauth.expiresAt) : undefined;

    // Check if token is expired
    if (expiresAt && expiresAt < new Date()) {
      logger.debug('Claude Code OAuth token expired');
      return null;
    }

    return {
      source: 'claude-code',
      provider: 'anthropic',
      authType: 'oauth',
      value: oauth.accessToken,
      expiresAt,
      accountInfo: {
        email: config.oauthAccount?.emailAddress,
        organization: config.oauthAccount?.organizationName,
        plan: config.oauthAccount?.planType,
      },
      configPath,
    };
  }

  // Check for API key in environment (Claude Code also respects ANTHROPIC_API_KEY)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    return {
      source: 'claude-code',
      provider: 'anthropic',
      authType: 'api-key',
      envVar: 'ANTHROPIC_API_KEY',
      value: apiKey,
      configPath,
    };
  }

  return null;
}

// =============================================================================
// OpenAI Codex Detection
// =============================================================================

interface CodexAuthConfig {
  chatgpt?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    email?: string;
    workspaceId?: string;
  };
  api?: {
    apiKey?: string;
  };
}

/**
 * Detect OpenAI Codex credentials from ~/.codex/auth.json
 */
export async function detectCodexAuth(): Promise<DetectedCredential | null> {
  const home = homedir();
  const configPath = join(home, '.codex', 'auth.json');

  if (!(await fileExists(configPath))) {
    return null;
  }

  const config = await readJsonFile<CodexAuthConfig>(configPath);
  if (!config) {
    return null;
  }

  // Check for ChatGPT OAuth session
  if (config.chatgpt?.accessToken) {
    const expiresAt = config.chatgpt.expiresAt ? new Date(config.chatgpt.expiresAt) : undefined;

    // Check if token is expired
    if (expiresAt && expiresAt < new Date()) {
      logger.debug('Codex ChatGPT OAuth token expired');
      return null;
    }

    return {
      source: 'codex',
      provider: 'openai',
      authType: 'oauth',
      value: config.chatgpt.accessToken,
      expiresAt,
      accountInfo: {
        email: config.chatgpt.email,
        organization: config.chatgpt.workspaceId,
      },
      configPath,
    };
  }

  // Check for API key
  if (config.api?.apiKey) {
    return {
      source: 'codex',
      provider: 'openai',
      authType: 'api-key',
      value: config.api.apiKey,
      configPath,
    };
  }

  // Check environment variable
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    return {
      source: 'codex',
      provider: 'openai',
      authType: 'api-key',
      envVar: 'OPENAI_API_KEY',
      value: apiKey,
    };
  }

  return null;
}

// =============================================================================
// Gemini CLI Detection
// =============================================================================

interface GeminiSettings {
  auth?: {
    oauth?: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: string;
      email?: string;
    };
  };
  googleCloudProject?: string;
}

/**
 * Detect Gemini CLI credentials from ~/.gemini/
 */
export async function detectGeminiAuth(): Promise<DetectedCredential | null> {
  const home = homedir();
  const settingsPath = join(home, '.gemini', 'settings.json');

  // Check for settings.json with OAuth
  if (await fileExists(settingsPath)) {
    const settings = await readJsonFile<GeminiSettings>(settingsPath);
    if (settings?.auth?.oauth?.accessToken) {
      const oauth = settings.auth.oauth;
      const expiresAt = oauth.expiresAt ? new Date(oauth.expiresAt) : undefined;

      if (expiresAt && expiresAt < new Date()) {
        logger.debug('Gemini CLI OAuth token expired');
      } else {
        return {
          source: 'gemini-cli',
          provider: 'google',
          authType: 'oauth',
          value: oauth.accessToken,
          expiresAt,
          accountInfo: {
            email: oauth.email,
            organization: settings.googleCloudProject,
          },
          configPath: settingsPath,
        };
      }
    }
  }

  // Check for GEMINI_API_KEY environment variable
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    return {
      source: 'gemini-cli',
      provider: 'google',
      authType: 'api-key',
      envVar: 'GEMINI_API_KEY',
      value: geminiKey,
    };
  }

  // Check for GOOGLE_API_KEY environment variable
  const googleKey = process.env.GOOGLE_API_KEY;
  if (googleKey) {
    return {
      source: 'gemini-cli',
      provider: 'google',
      authType: 'api-key',
      envVar: 'GOOGLE_API_KEY',
      value: googleKey,
    };
  }

  return null;
}

// =============================================================================
// Aider Detection
// =============================================================================

/**
 * Detect Aider credentials from environment variables
 * Aider uses standard environment variables, no config file
 */
export async function detectAiderAuth(): Promise<DetectedCredential[]> {
  const credentials: DetectedCredential[] = [];

  // Anthropic API Key (Aider's preferred for Claude models)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    credentials.push({
      source: 'aider',
      provider: 'anthropic',
      authType: 'api-key',
      envVar: 'ANTHROPIC_API_KEY',
      value: anthropicKey,
    });
  }

  // OpenAI API Key
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    credentials.push({
      source: 'aider',
      provider: 'openai',
      authType: 'api-key',
      envVar: 'OPENAI_API_KEY',
      value: openaiKey,
    });
  }

  // Gemini API Key (Aider also supports Gemini)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    credentials.push({
      source: 'aider',
      provider: 'google',
      authType: 'api-key',
      envVar: 'GEMINI_API_KEY',
      value: geminiKey,
    });
  }

  return credentials;
}

// =============================================================================
// Environment Variable Detection
// =============================================================================

/**
 * Detect credentials from standard environment variables
 */
export async function detectEnvAuth(): Promise<DetectedCredential[]> {
  const credentials: DetectedCredential[] = [];

  const envMappings: Array<{
    envVar: string;
    provider: 'anthropic' | 'openai' | 'google';
  }> = [
    { envVar: 'ANTHROPIC_API_KEY', provider: 'anthropic' },
    { envVar: 'OPENAI_API_KEY', provider: 'openai' },
    { envVar: 'GEMINI_API_KEY', provider: 'google' },
    { envVar: 'GOOGLE_API_KEY', provider: 'google' },
  ];

  for (const { envVar, provider } of envMappings) {
    const value = process.env[envVar];
    if (value) {
      credentials.push({
        source: 'env',
        provider,
        authType: 'api-key',
        envVar,
        value,
      });
    }
  }

  return credentials;
}

// =============================================================================
// Main Detection Functions
// =============================================================================

/**
 * Detect all available credentials from external sources
 */
export async function detectAllCredentials(
  config: ExternalAuthConfig = DEFAULT_CONFIG
): Promise<DetectedCredential[]> {
  if (!config.enabled) {
    return [];
  }

  const sources = config.sources || DEFAULT_CONFIG.sources!;
  const credentials: DetectedCredential[] = [];
  const seenValues = new Set<string>();

  for (const source of sources) {
    try {
      let detected: DetectedCredential | DetectedCredential[] | null = null;

      switch (source) {
        case 'claude-code':
          detected = await detectClaudeCodeAuth();
          break;
        case 'codex':
          detected = await detectCodexAuth();
          break;
        case 'gemini-cli':
          detected = await detectGeminiAuth();
          break;
        case 'aider':
          detected = await detectAiderAuth();
          break;
        case 'env':
          detected = await detectEnvAuth();
          break;
      }

      if (detected) {
        const items = Array.isArray(detected) ? detected : [detected];
        for (const item of items) {
          // Deduplicate by value to avoid listing the same API key multiple times
          const key = item.value || item.envVar || '';
          if (key && !seenValues.has(key)) {
            seenValues.add(key);
            credentials.push(item);
          }
        }
      }
    } catch (error) {
      logger.debug(`Error detecting ${source} credentials:`, error);
    }
  }

  return credentials;
}

/**
 * Get authentication status summary
 */
export async function getAuthStatus(
  config: ExternalAuthConfig = DEFAULT_CONFIG
): Promise<AuthStatus> {
  const credentials = await detectAllCredentials(config);
  const warnings: string[] = [];

  // Check for expired tokens
  for (const cred of credentials) {
    if (cred.expiresAt && cred.expiresAt < new Date()) {
      warnings.push(`${cred.source} OAuth token has expired. Please re-authenticate.`);
    }
  }

  // Find preferred source
  let preferredSource: DetectedCredential | undefined;
  if (config.preferSource) {
    preferredSource = credentials.find((c) => c.source === config.preferSource);
  }

  // If no preferred source specified, prioritize OAuth over API keys
  if (!preferredSource && credentials.length > 0) {
    preferredSource = credentials.find((c) => c.authType === 'oauth') || credentials[0];
  }

  return {
    authenticated: credentials.length > 0,
    sources: credentials,
    preferredSource,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Get credentials for a specific provider
 */
export async function getCredentialsForProvider(
  provider: 'anthropic' | 'openai' | 'google',
  config: ExternalAuthConfig = DEFAULT_CONFIG
): Promise<DetectedCredential | null> {
  const credentials = await detectAllCredentials(config);
  const providerCreds = credentials.filter((c) => c.provider === provider);

  if (providerCreds.length === 0) {
    return null;
  }

  // Prefer OAuth over API keys
  return providerCreds.find((c) => c.authType === 'oauth') || providerCreds[0];
}

/**
 * Get environment variables to inject based on detected credentials
 */
export async function getAuthEnvironment(
  config: ExternalAuthConfig = DEFAULT_CONFIG
): Promise<Record<string, string>> {
  const credentials = await detectAllCredentials(config);
  const env: Record<string, string> = {};

  // Group by provider and prefer OAuth tokens
  const byProvider = new Map<string, DetectedCredential>();

  for (const cred of credentials) {
    const existing = byProvider.get(cred.provider);
    // Prefer OAuth over API keys
    if (!existing || (cred.authType === 'oauth' && existing.authType !== 'oauth')) {
      byProvider.set(cred.provider, cred);
    }
  }

  // Map to environment variables
  for (const [provider, cred] of byProvider) {
    if (!cred.value) continue;

    switch (provider) {
      case 'anthropic':
        // For OAuth tokens, we use ANTHROPIC_AUTH_TOKEN
        // For API keys, we use ANTHROPIC_API_KEY
        if (cred.authType === 'oauth') {
          env['ANTHROPIC_AUTH_TOKEN'] = cred.value;
        } else {
          env['ANTHROPIC_API_KEY'] = cred.value;
        }
        break;

      case 'openai':
        if (cred.authType === 'oauth') {
          // OpenAI Codex uses a different auth header for OAuth
          env['OPENAI_AUTH_TOKEN'] = cred.value;
        } else {
          env['OPENAI_API_KEY'] = cred.value;
        }
        break;

      case 'google':
        if (cred.authType === 'oauth') {
          env['GOOGLE_AUTH_TOKEN'] = cred.value;
        } else {
          // Prefer GEMINI_API_KEY, fallback to GOOGLE_API_KEY
          if (cred.envVar === 'GOOGLE_API_KEY') {
            env['GOOGLE_API_KEY'] = cred.value;
          } else {
            env['GEMINI_API_KEY'] = cred.value;
          }
        }
        break;
    }
  }

  return env;
}

/**
 * Format auth status for display
 */
export function formatAuthStatus(status: AuthStatus): string {
  const lines: string[] = [];

  if (!status.authenticated) {
    lines.push('No authentication detected');
    lines.push('');
    lines.push('To authenticate, either:');
    lines.push('  - Log in with Claude Code: claude');
    lines.push('  - Log in with Codex: codex');
    lines.push('  - Log in with Gemini CLI: gemini');
    lines.push('  - Set environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)');
    return lines.join('\n');
  }

  lines.push('Detected authentication sources:');
  lines.push('');

  for (const cred of status.sources) {
    const isPrimary = cred === status.preferredSource;
    const prefix = isPrimary ? '* ' : '  ';
    const authType = cred.authType === 'oauth' ? 'OAuth' : 'API Key';

    let line = `${prefix}${cred.source} (${cred.provider}, ${authType})`;

    if (cred.accountInfo?.email) {
      line += ` - ${cred.accountInfo.email}`;
    }
    if (cred.accountInfo?.plan) {
      line += ` [${cred.accountInfo.plan}]`;
    }
    if (cred.expiresAt) {
      const expiresIn = Math.round((cred.expiresAt.getTime() - Date.now()) / 1000 / 60);
      if (expiresIn > 0) {
        line += ` (expires in ${expiresIn}m)`;
      } else {
        line += ' (EXPIRED)';
      }
    }

    lines.push(line);
  }

  if (status.warnings && status.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of status.warnings) {
      lines.push(`  ! ${warning}`);
    }
  }

  return lines.join('\n');
}
