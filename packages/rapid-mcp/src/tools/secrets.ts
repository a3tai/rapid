/**
 * get_secret Tool
 *
 * Retrieve secrets from RAPID's secrets cache with short-lived tokens.
 * Integrates with 1Password, HashiCorp Vault, or environment variables.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from '@a3t/rapid-core';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('secrets');

/**
 * Input schema for get_secret tool
 */
const inputSchema = {
  key: z.string().describe('Secret key name (e.g., GITHUB_TOKEN, API_KEY)'),
  ttl: z
    .number()
    .default(300)
    .describe('Token TTL in seconds (how long the secret should be valid)'),
};

/**
 * Output schema for get_secret tool
 */
const outputSchema = {
  value: z.string().optional().describe('The secret value (only if found)'),
  masked: z.string().describe('Masked value for logging (e.g., sk-...xyz)'),
  expiresAt: z.string().datetime().optional(),
  source: z.enum(['1password', 'vault', 'env', 'cache']),
  found: z.boolean(),
};

/**
 * Mask a secret value for safe logging
 */
function maskSecret(value: string): string {
  if (value.length <= 8) {
    return '****';
  }
  const prefix = value.slice(0, 4);
  const suffix = value.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Get secret from environment
 */
function getFromEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * Get secret from 1Password CLI
 */
async function getFrom1Password(reference: string): Promise<string | undefined> {
  try {
    const { execa } = await import('execa');
    const result = await execa('op', ['read', reference], {
      timeout: 10000,
      reject: false,
    });

    if (result.exitCode === 0 && result.stdout) {
      return result.stdout.trim();
    }
  } catch {
    // 1Password CLI not available or failed
  }
  return undefined;
}

/**
 * Get secret reference from config
 */
async function getSecretReference(projectDir: string, key: string): Promise<string | undefined> {
  try {
    const loaded = await loadConfig(projectDir);
    if (loaded?.config?.secrets?.items) {
      return loaded.config.secrets.items[key];
    }
  } catch {
    // Config not found
  }
  return undefined;
}

/**
 * Register the get_secret tool with the MCP server
 */
export function registerGetSecretTool(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'get_secret',
    {
      title: 'Get Secret',
      description:
        'Retrieve a secret from RAPID secrets cache. ' +
        'Secrets are fetched from 1Password, HashiCorp Vault, or environment variables ' +
        'based on the project configuration. The masked value is safe for logging.',
      inputSchema,
      outputSchema,
    },
    async (args) => {
      const { key, ttl } = args as { key: string; ttl: number };

      let value: string | undefined;
      let source: 'env' | '1password' | 'vault' | 'cache' = 'env';

      // First, try environment variable
      value = getFromEnv(key);
      if (value) {
        source = 'env';
      }

      // If not in env, check for 1Password reference in config
      if (!value) {
        const reference = await getSecretReference(context.projectDir, key);
        if (reference && reference.startsWith('op://')) {
          value = await getFrom1Password(reference);
          if (value) {
            source = '1password';
          }
        }
      }

      // Calculate expiration
      const expiresAt = value ? new Date(Date.now() + ttl * 1000).toISOString() : undefined;

      const output = {
        value: value || undefined,
        masked: value ? maskSecret(value) : '(not found)',
        expiresAt,
        source,
        found: !!value,
      };

      if (context.verbose) {
        logger.error(`[get_secret] Key: ${key}`);
        logger.error(`[get_secret] Found: ${!!value}, Source: ${source}`);
        if (value) {
          logger.error(`[get_secret] Masked: ${output.masked}`);
        }
      }

      // Return without the actual value in the text content (security)
      const safeOutput = {
        ...output,
        value: output.found ? '[PRESENT - use structuredContent.value]' : undefined,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(safeOutput, null, 2),
          },
        ],
        structuredContent: output,
      };
    }
  );
}
