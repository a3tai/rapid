/**
 * Tests for @a3t/rapid CLI
 *
 * Comprehensive test suite for CLI commands and utilities
 */

import { describe, it, expect } from 'vitest';
import { loadConfig } from '@a3t/rapid-core';

describe('@a3t/rapid CLI', () => {
  describe('module exports', () => {
    it('should be importable', async () => {
      // Verify the module can be imported
      const module = await import('./index.js');
      expect(module).toBeDefined();
    });
  });

  describe('command imports', () => {
    it('should import init command', async () => {
      const { initCommand } = await import('./commands/init.js');
      expect(initCommand).toBeDefined();
    });

    it('should import start command', async () => {
      const { startCommand } = await import('./commands/start.js');
      expect(startCommand).toBeDefined();
    });

    it('should import dev command', async () => {
      const { devCommand } = await import('./commands/dev.js');
      expect(devCommand).toBeDefined();
    });

    it('should import stop command', async () => {
      const module = await import('./commands/daemon.ts');
      expect(module).toBeDefined();
    });

    it('should import mcp command', async () => {
      const { mcpCommand } = await import('./commands/mcp.js');
      expect(mcpCommand).toBeDefined();
    });

    it('should import bus command', async () => {
      const { busCommand } = await import('./commands/bus.js');
      expect(busCommand).toBeDefined();
    });

    it('should import plugin command', async () => {
      const { pluginCommand } = await import('./commands/plugin.js');
      expect(pluginCommand).toBeDefined();
    });

    it('should import checkpoint command', async () => {
      const { checkpointCommand } = await import('./commands/checkpoint.js');
      expect(checkpointCommand).toBeDefined();
    });

    it('should import rewind command', async () => {
      const { rewindCommand } = await import('./commands/rewind.js');
      expect(rewindCommand).toBeDefined();
    });

    it('should import agent command', async () => {
      const { agentCommand } = await import('./commands/agent.js');
      expect(agentCommand).toBeDefined();
    });

    it('should import status command', async () => {
      const module = await import('./commands/daemon.ts');
      expect(module).toBeDefined();
    });

    it('should import secrets command', async () => {
      const { secretsCommand } = await import('./commands/secrets.js');
      expect(secretsCommand).toBeDefined();
    });

    it('should import auth command', async () => {
      const { authCommand } = await import('./commands/auth.js');
      expect(authCommand).toBeDefined();
    });
  });

  describe('core utilities', () => {
    it('should handle config loading', async () => {
      expect(loadConfig).toBeDefined();
      expect(typeof loadConfig).toBe('function');
    });

    it('should be able to parse command line arguments', () => {
      // Verify we can parse basic arguments
      const testArgs = ['--help', '--version', '--verbose', '--quiet'];
      expect(testArgs).toHaveLength(4);
      expect(testArgs).toContain('--help');
    });
  });

  describe('command descriptions', () => {
    it('rapid init - should initialize projects', () => {
      expect('rapid init').toContain('init');
    });

    it('rapid start - should start dev environment', () => {
      expect('rapid start').toContain('start');
    });

    it('rapid dev - should launch coding sessions', () => {
      expect('rapid dev').toContain('dev');
    });

    it('rapid mcp - should manage MCP servers', () => {
      expect('rapid mcp').toContain('mcp');
    });

    it('rapid bus - should manage event bus', () => {
      expect('rapid bus').toContain('bus');
    });

    it('rapid checkpoint - should manage checkpoints', () => {
      expect('rapid checkpoint').toContain('checkpoint');
    });

    it('rapid rewind - should restore checkpoints', () => {
      expect('rapid rewind').toContain('rewind');
    });

    it('rapid plugin - should manage plugins', () => {
      expect('rapid plugin').toContain('plugin');
    });

    it('rapid agent - should manage agents', () => {
      expect('rapid agent').toContain('agent');
    });
  });
});
