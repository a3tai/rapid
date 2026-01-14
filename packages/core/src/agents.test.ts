/**
 * Tests for agents.ts - Agent detection and management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkAgentAvailable, checkAllAgents, getDefaultAgent, getAgent } from './agents.js';
import type { RapidConfig, AgentDefinition } from './types.js';

// Mock which and execa
vi.mock('which', () => ({
  default: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import which from 'which';
import { execa } from 'execa';

const mockWhich = vi.mocked(which);
const mockExeca = vi.mocked(execa);

describe('agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('checkAgentAvailable', () => {
    it('should return available=true when CLI is found', async () => {
      mockWhich.mockResolvedValue('/usr/local/bin/claude');
      mockExeca.mockResolvedValue({
        stdout: 'claude-code 1.0.0',
        stderr: '',
        exitCode: 0,
      } as never);

      const agent: AgentDefinition = { cli: 'claude' };
      const status = await checkAgentAvailable(agent);

      expect(status.available).toBe(true);
      expect(status.name).toBe('claude');
      expect(status.cliPath).toBe('/usr/local/bin/claude');
      expect(status.version).toBe('claude-code 1.0.0');
    });

    it('should return available=false when CLI is not found', async () => {
      mockWhich.mockRejectedValue(new Error('not found'));

      const agent: AgentDefinition = { cli: 'nonexistent' };
      const status = await checkAgentAvailable(agent);

      expect(status.available).toBe(false);
      expect(status.name).toBe('nonexistent');
      expect(status.cliPath).toBeUndefined();
    });

    it('should return available=true even if version check fails', async () => {
      mockWhich.mockResolvedValue('/usr/local/bin/aider');
      mockExeca.mockRejectedValue(new Error('version command failed'));

      const agent: AgentDefinition = { cli: 'aider' };
      const status = await checkAgentAvailable(agent);

      expect(status.available).toBe(true);
      expect(status.cliPath).toBe('/usr/local/bin/aider');
      expect(status.version).toBeUndefined();
    });

    it('should extract first line of version output', async () => {
      mockWhich.mockResolvedValue('/usr/local/bin/opencode');
      mockExeca.mockResolvedValue({
        stdout: 'OpenCode v2.0.0\nSome other info\nMore lines',
        stderr: '',
        exitCode: 0,
      } as never);

      const agent: AgentDefinition = { cli: 'opencode' };
      const status = await checkAgentAvailable(agent);

      expect(status.version).toBe('OpenCode v2.0.0');
    });
  });

  describe('checkAllAgents', () => {
    const testConfig: RapidConfig = {
      version: '1.0',
      agents: {
        default: 'claude',
        available: {
          claude: { cli: 'claude', instructionFile: 'CLAUDE.md' },
          opencode: { cli: 'opencode', instructionFile: 'AGENTS.md' },
          aider: { cli: 'aider', args: ['--model', 'gpt-4'] },
        },
      },
    };

    it('should check all configured agents', async () => {
      mockWhich.mockImplementation(async (cmd) => {
        if (cmd === 'claude') return '/usr/bin/claude';
        if (cmd === 'opencode') return '/usr/bin/opencode';
        throw new Error('not found');
      });
      mockExeca.mockResolvedValue({ stdout: 'v1.0.0', stderr: '', exitCode: 0 } as never);

      const results = await checkAllAgents(testConfig);

      expect(results).toHaveLength(3);

      const claudeStatus = results.find((r) => r.name === 'claude');
      expect(claudeStatus?.available).toBe(true);

      const opencodeStatus = results.find((r) => r.name === 'opencode');
      expect(opencodeStatus?.available).toBe(true);

      const aiderStatus = results.find((r) => r.name === 'aider');
      expect(aiderStatus?.available).toBe(false);
    });

    it('should return empty array for config with no agents', async () => {
      const emptyConfig: RapidConfig = {
        version: '1.0',
        agents: {
          default: 'none',
          available: {},
        },
      };

      const results = await checkAllAgents(emptyConfig);
      expect(results).toHaveLength(0);
    });
  });

  describe('getDefaultAgent', () => {
    const testConfig: RapidConfig = {
      version: '1.0',
      agents: {
        default: 'opencode',
        available: {
          claude: { cli: 'claude' },
          opencode: { cli: 'opencode', instructionFile: 'AGENTS.md' },
        },
      },
    };

    it('should return the default agent', () => {
      const agent = getDefaultAgent(testConfig);

      expect(agent).not.toBeNull();
      expect(agent?.cli).toBe('opencode');
      expect(agent?.instructionFile).toBe('AGENTS.md');
    });

    it('should return null if default agent does not exist', () => {
      const badConfig: RapidConfig = {
        version: '1.0',
        agents: {
          default: 'nonexistent',
          available: {
            claude: { cli: 'claude' },
          },
        },
      };

      const agent = getDefaultAgent(badConfig);
      expect(agent).toBeNull();
    });
  });

  describe('getAgent', () => {
    const testConfig: RapidConfig = {
      version: '1.0',
      agents: {
        default: 'claude',
        available: {
          claude: { cli: 'claude', instructionFile: 'CLAUDE.md', envVars: ['ANTHROPIC_API_KEY'] },
          aider: { cli: 'aider', args: ['--model', 'claude-3-5-sonnet'] },
        },
      },
    };

    it('should return agent by name', () => {
      const claude = getAgent(testConfig, 'claude');
      expect(claude).not.toBeNull();
      expect(claude?.cli).toBe('claude');
      expect(claude?.envVars).toContain('ANTHROPIC_API_KEY');

      const aider = getAgent(testConfig, 'aider');
      expect(aider).not.toBeNull();
      expect(aider?.args).toContain('--model');
    });

    it('should return null for non-existent agent', () => {
      const agent = getAgent(testConfig, 'nonexistent');
      expect(agent).toBeNull();
    });

    it('should be case-sensitive', () => {
      const agent = getAgent(testConfig, 'Claude');
      expect(agent).toBeNull();
    });
  });
});
