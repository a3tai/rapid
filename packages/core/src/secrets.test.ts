/**
 * Tests for secrets.ts - Secrets management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SecretsConfig } from './types.js';
import {
  hasOpServiceAccountToken,
  verifySecret,
  generateEnvrc,
  writeEnvrc,
  hasEnvrc,
  readEnvrc,
  getProviderInfo,
} from './secrets.js';

// Store original env
const originalEnv = { ...process.env };

describe('secrets', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `rapid-secrets-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });
    // Reset env
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  describe('hasOpServiceAccountToken', () => {
    it('should return true when OP_SERVICE_ACCOUNT_TOKEN is set', () => {
      process.env.OP_SERVICE_ACCOUNT_TOKEN = 'test-token';
      expect(hasOpServiceAccountToken()).toBe(true);
    });

    it('should return false when OP_SERVICE_ACCOUNT_TOKEN is not set', () => {
      delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
      expect(hasOpServiceAccountToken()).toBe(false);
    });

    it('should return false when OP_SERVICE_ACCOUNT_TOKEN is empty', () => {
      process.env.OP_SERVICE_ACCOUNT_TOKEN = '';
      expect(hasOpServiceAccountToken()).toBe(false);
    });
  });

  describe('verifySecret', () => {
    describe('env provider', () => {
      it('should return available=true when env var is set', async () => {
        process.env.TEST_SECRET = 'secret-value';

        const status = await verifySecret('TEST_SECRET', 'TEST_SECRET', 'env');

        expect(status.available).toBe(true);
        expect(status.name).toBe('TEST_SECRET');
        expect(status.provider).toBe('env');
        expect(status.error).toBeUndefined();
      });

      it('should return available=false when env var is not set', async () => {
        delete process.env.MISSING_SECRET;

        const status = await verifySecret('MISSING_SECRET', 'MISSING_SECRET', 'env');

        expect(status.available).toBe(false);
        expect(status.error).toBe('Environment variable not set');
      });

      it('should return available=false when env var is empty', async () => {
        process.env.EMPTY_SECRET = '';

        const status = await verifySecret('EMPTY_SECRET', 'EMPTY_SECRET', 'env');

        expect(status.available).toBe(false);
      });
    });

    // Note: 1Password and Vault tests would require mocking the CLI commands
    // These are integration tests that would need the actual CLIs
  });

  describe('generateEnvrc', () => {
    it('should generate envrc for env provider', () => {
      const config: SecretsConfig = {
        provider: 'env',
        items: {
          API_KEY: 'API_KEY',
          SECRET_TOKEN: 'SECRET_TOKEN',
        },
      };

      const envrc = generateEnvrc(config);

      expect(envrc).toContain('# Provider: env');
      expect(envrc).toContain('# export API_KEY="your-value-here"');
      expect(envrc).toContain('# export SECRET_TOKEN="your-value-here"');
      expect(envrc).toContain('source_env .env.local');
    });

    it('should generate envrc for 1password provider', () => {
      const config: SecretsConfig = {
        provider: '1password',
        vault: 'Development',
        items: {
          ANTHROPIC_API_KEY: 'op://Development/RAPID/ANTHROPIC_API_KEY',
          OPENAI_API_KEY: 'op://Development/RAPID/OPENAI_API_KEY',
        },
      };

      const envrc = generateEnvrc(config);

      expect(envrc).toContain('# Provider: 1password');
      expect(envrc).toContain('# Secrets loaded from 1Password');
      expect(envrc).toContain(
        'export ANTHROPIC_API_KEY=$(op read "op://Development/RAPID/ANTHROPIC_API_KEY")'
      );
      expect(envrc).toContain(
        'export OPENAI_API_KEY=$(op read "op://Development/RAPID/OPENAI_API_KEY")'
      );
    });

    it('should generate envrc for vault provider', () => {
      const config: SecretsConfig = {
        provider: 'vault',
        vault: 'secret/data/rapid',
        address: 'https://vault.example.com',
        items: {
          DB_PASSWORD: 'password',
        },
      };

      const envrc = generateEnvrc(config);

      expect(envrc).toContain('# Provider: vault');
      expect(envrc).toContain('# Secrets loaded from HashiCorp Vault');
      expect(envrc).toContain('export VAULT_ADDR="https://vault.example.com"');
      expect(envrc).toContain('vault kv get');
    });

    it('should handle empty items', () => {
      const config: SecretsConfig = {
        provider: 'env',
        items: {},
      };

      const envrc = generateEnvrc(config);

      expect(envrc).toContain('# No secrets configured');
    });

    it('should respect includeLocal setting', () => {
      const configWithLocal: SecretsConfig = {
        provider: 'env',
        items: { KEY: 'val' },
        envrc: { includeLocal: true },
      };

      const configWithoutLocal: SecretsConfig = {
        provider: 'env',
        items: { KEY: 'val' },
        envrc: { includeLocal: false },
      };

      expect(generateEnvrc(configWithLocal)).toContain('source_env .env.local');
      expect(generateEnvrc(configWithoutLocal)).not.toContain('source_env .env.local');
    });
  });

  describe('writeEnvrc / hasEnvrc / readEnvrc', () => {
    it('should write and read .envrc file', async () => {
      const config: SecretsConfig = {
        provider: 'env',
        items: { TEST_KEY: 'TEST_KEY' },
      };

      const writtenPath = await writeEnvrc(testDir, config);

      expect(writtenPath).toBe(join(testDir, '.envrc'));
      expect(await hasEnvrc(testDir)).toBe(true);

      const content = await readEnvrc(testDir);
      expect(content).toContain('# Provider: env');
      expect(content).toContain('TEST_KEY');
    });

    it('should use custom path from config', async () => {
      const config: SecretsConfig = {
        provider: 'env',
        items: { KEY: 'KEY' },
        envrc: { path: 'custom/.envrc' },
      };

      await mkdir(join(testDir, 'custom'), { recursive: true });
      const writtenPath = await writeEnvrc(testDir, config);

      expect(writtenPath).toBe(join(testDir, 'custom/.envrc'));
      expect(await hasEnvrc(testDir, config)).toBe(true);
    });

    it('should return null/false when envrc does not exist', async () => {
      expect(await hasEnvrc(testDir)).toBe(false);
      expect(await readEnvrc(testDir)).toBeNull();
    });
  });

  describe('getProviderInfo', () => {
    it('should return 1Password info', () => {
      const info = getProviderInfo('1password');

      expect(info.name).toBe('1Password');
      expect(info.cliRequired).toBe('op');
      expect(info.authCommand).toBe('eval $(op signin)');
      expect(info.installUrl).toContain('1password.com');
    });

    it('should return Vault info', () => {
      const info = getProviderInfo('vault');

      expect(info.name).toBe('HashiCorp Vault');
      expect(info.cliRequired).toBe('vault');
      expect(info.authCommand).toBe('vault login');
      expect(info.installUrl).toContain('hashicorp.com');
    });

    it('should return env info', () => {
      const info = getProviderInfo('env');

      expect(info.name).toBe('Environment Variables');
      expect(info.cliRequired).toBeNull();
      expect(info.authCommand).toBeNull();
      expect(info.installUrl).toBeNull();
    });
  });
});
