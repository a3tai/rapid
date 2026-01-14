/**
 * Tests for agents.ts - Agent detection and management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkAgentAvailable,
  checkAllAgents,
  getDefaultAgent,
  getAgent,
  buildAgentArgs,
  agentReadsInstructionFiles,
  agentSupportsRuntimeInjection,
} from './agents.js';
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

  describe('buildAgentArgs', () => {
    it('should return base args when no systemPromptArg is defined', () => {
      const agent: AgentDefinition = {
        cli: 'opencode',
        args: ['--model', 'claude-sonnet'],
      };

      const args = buildAgentArgs(agent);
      expect(args).toEqual(['--model', 'claude-sonnet']);
    });

    it('should inject system prompt when systemPromptArg is defined', () => {
      const agent: AgentDefinition = {
        cli: 'claude',
        args: ['--verbose'],
        systemPromptArg: '--append-system-prompt {prompt}',
      };

      const args = buildAgentArgs(agent);
      expect(args).toContain('--verbose');
      expect(args).toContain('--append-system-prompt');
      // The last arg should be the system prompt content
      expect(args.length).toBeGreaterThan(2);
      expect(args[args.length - 1]).toContain('RAPID');
    });

    it('should not inject system prompt when injectSystemPrompt is false', () => {
      const agent: AgentDefinition = {
        cli: 'claude',
        args: ['--verbose'],
        systemPromptArg: '--append-system-prompt {prompt}',
      };

      const args = buildAgentArgs(agent, { injectSystemPrompt: false });
      expect(args).toEqual(['--verbose']);
    });

    it('should use custom prompt when provided', () => {
      const agent: AgentDefinition = {
        cli: 'claude',
        systemPromptArg: '--append-system-prompt {prompt}',
      };

      const args = buildAgentArgs(agent, { customPrompt: 'Custom instructions here' });
      expect(args).toContain('--append-system-prompt');
      expect(args).toContain('Custom instructions here');
    });

    it('should use compact prompt when requested', () => {
      const agent: AgentDefinition = {
        cli: 'claude',
        systemPromptArg: '--append-system-prompt {prompt}',
      };

      const fullArgs = buildAgentArgs(agent);
      const compactArgs = buildAgentArgs(agent, { compactPrompt: true });

      // Compact prompt should be shorter
      const fullPrompt = fullArgs[fullArgs.length - 1];
      const compactPrompt = compactArgs[compactArgs.length - 1];
      expect(compactPrompt.length).toBeLessThan(fullPrompt.length);
    });
  });

  describe('agentReadsInstructionFiles', () => {
    it('should return true when explicitly set', () => {
      const agent: AgentDefinition = {
        cli: 'custom-agent',
        readsInstructionFiles: true,
      };
      expect(agentReadsInstructionFiles(agent)).toBe(true);
    });

    it('should return false when explicitly set', () => {
      const agent: AgentDefinition = {
        cli: 'opencode',
        readsInstructionFiles: false,
      };
      expect(agentReadsInstructionFiles(agent)).toBe(false);
    });

    it('should infer true for known agents like opencode', () => {
      const agent: AgentDefinition = { cli: 'opencode' };
      expect(agentReadsInstructionFiles(agent)).toBe(true);
    });

    it('should infer true when instructionFile is set but no systemPromptArg', () => {
      const agent: AgentDefinition = {
        cli: 'custom-agent',
        instructionFile: 'CUSTOM.md',
      };
      expect(agentReadsInstructionFiles(agent)).toBe(true);
    });

    it('should return false for unknown agent without instructionFile', () => {
      const agent: AgentDefinition = { cli: 'unknown-agent' };
      expect(agentReadsInstructionFiles(agent)).toBe(false);
    });
  });

  describe('agentSupportsRuntimeInjection', () => {
    it('should return true when systemPromptArg is defined', () => {
      const agent: AgentDefinition = {
        cli: 'claude',
        systemPromptArg: '--append-system-prompt {prompt}',
      };
      expect(agentSupportsRuntimeInjection(agent)).toBe(true);
    });

    it('should return false when systemPromptArg is not defined', () => {
      const agent: AgentDefinition = { cli: 'opencode' };
      expect(agentSupportsRuntimeInjection(agent)).toBe(false);
    });
  });
});
