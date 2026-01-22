/**
 * Tests for Agent Adapters
 *
 * Tests the adapter implementations for various AI coding agents
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  OpenCodeAdapter,
  AiderAdapter,
  CodexAdapter,
  RooCodeAdapter,
  CopilotAdapter,
  ClaudeCodeAdapter,
  getAgentAdapter,
  getAllAdapters,
  checkAvailableAdapters,
  configureAgent,
  type AgentConfigOptions,
  type AgentEnvironmentOptions,
  type AgentLaunchOptions,
} from '../agent-adapters.js';

// Mock execa for isAvailable tests
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

// Import mocked execa
import { execa } from 'execa';

const mockedExeca = vi.mocked(execa);

describe('Agent Adapters', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-adapters-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // Helper to create basic config options
  const createConfigOptions = (overrides?: Partial<AgentConfigOptions>): AgentConfigOptions => ({
    projectDir: tempDir,
    rapidConfig: {
      name: 'test-project',
      projectDir: tempDir,
    },
    ...overrides,
  });

  describe('OpenCodeAdapter', () => {
    let adapter: OpenCodeAdapter;

    beforeEach(() => {
      adapter = new OpenCodeAdapter();
    });

    it('should have correct metadata', () => {
      expect(adapter.name).toBe('opencode');
      expect(adapter.cli).toBe('opencode');
      expect(adapter.description).toContain('OpenCode');
    });

    describe('isAvailable', () => {
      it('should return true when opencode is installed', async () => {
        mockedExeca.mockResolvedValueOnce({} as never);
        const result = await adapter.isAvailable();
        expect(result).toBe(true);
        expect(mockedExeca).toHaveBeenCalledWith('which', ['opencode']);
      });

      it('should return false when opencode is not installed', async () => {
        mockedExeca.mockRejectedValueOnce(new Error('not found'));
        const result = await adapter.isAvailable();
        expect(result).toBe(false);
      });
    });

    describe('generateConfig', () => {
      it('should generate opencode.json with MCP server', async () => {
        const options = createConfigOptions();
        const result = await adapter.generateConfig(options);

        expect(result.files).toHaveLength(1);
        expect(result.files[0].path).toBe(join(tempDir, 'opencode.json'));

        const config = JSON.parse(result.files[0].content);
        // OpenCode uses servers directly under mcp, not mcp.servers
        expect(config.mcp.rapid).toBeDefined();
        expect(config.mcp.rapid.type).toBe('local');
        expect(config.mcp.rapid.command).toEqual(['rapid', 'mcp', 'serve']);
        expect(config.mcp.rapid.enabled).toBe(true);
      });

      it('should add gateway configuration when enabled', async () => {
        const options = createConfigOptions({
          gatewayConfig: {
            enabled: true,
            config: {
              baseUrl: 'http://localhost:3000/v1',
            },
          },
        });
        const result = await adapter.generateConfig(options);
        const config = JSON.parse(result.files[0].content);

        expect(config.providers.anthropic.baseURL).toBe('http://localhost:3000/v1');
        expect(config.providers.openai.baseURL).toBe('http://localhost:3000/v1');
      });

      it('should use custom system prompt when provided', async () => {
        const options = createConfigOptions({
          systemPrompt: 'Custom instructions for testing',
        });
        const result = await adapter.generateConfig(options);
        const config = JSON.parse(result.files[0].content);

        expect(config.instructions).toBe('Custom instructions for testing');
      });
    });

    describe('getEnvironment', () => {
      it('should return empty object with no options', () => {
        const env = adapter.getEnvironment({ projectDir: tempDir });
        expect(env).toEqual({});
      });

      it('should set gateway URLs when provided', () => {
        const options: AgentEnvironmentOptions = {
          projectDir: tempDir,
          gatewayUrl: 'http://gateway.local:3000',
        };
        const env = adapter.getEnvironment(options);

        expect(env.ANTHROPIC_BASE_URL).toBe('http://gateway.local:3000');
        expect(env.OPENAI_BASE_URL).toBe('http://gateway.local:3000');
      });

      it('should set proxy URLs when provided', () => {
        const options: AgentEnvironmentOptions = {
          projectDir: tempDir,
          proxyUrl: 'http://proxy.local:8080',
        };
        const env = adapter.getEnvironment(options);

        expect(env.HTTP_PROXY).toBe('http://proxy.local:8080');
        expect(env.HTTPS_PROXY).toBe('http://proxy.local:8080');
      });

      it('should include auth environment when provided', () => {
        const options: AgentEnvironmentOptions = {
          projectDir: tempDir,
          authEnv: {
            ANTHROPIC_API_KEY: 'test-key',
            OPENAI_API_KEY: 'openai-key',
          },
        };
        const env = adapter.getEnvironment(options);

        expect(env.ANTHROPIC_API_KEY).toBe('test-key');
        expect(env.OPENAI_API_KEY).toBe('openai-key');
      });
    });

    describe('getArgs', () => {
      it('should return empty array with no options', () => {
        const args = adapter.getArgs({});
        expect(args).toEqual([]);
      });

      it('should add --cwd when workingDir is provided', () => {
        const options: AgentLaunchOptions = {
          workingDir: '/some/path',
        };
        const args = adapter.getArgs(options);
        expect(args).toEqual(['--cwd', '/some/path']);
      });
    });
  });

  describe('AiderAdapter', () => {
    let adapter: AiderAdapter;

    beforeEach(() => {
      adapter = new AiderAdapter();
    });

    it('should have correct metadata', () => {
      expect(adapter.name).toBe('aider');
      expect(adapter.cli).toBe('aider');
      expect(adapter.description).toContain('Aider');
    });

    describe('isAvailable', () => {
      it('should return true when aider is installed', async () => {
        mockedExeca.mockResolvedValueOnce({} as never);
        const result = await adapter.isAvailable();
        expect(result).toBe(true);
        expect(mockedExeca).toHaveBeenCalledWith('which', ['aider']);
      });

      it('should return false when aider is not installed', async () => {
        mockedExeca.mockRejectedValueOnce(new Error('not found'));
        const result = await adapter.isAvailable();
        expect(result).toBe(false);
      });
    });

    describe('generateConfig', () => {
      it('should generate .aider.conf.yml and .aider.rapid-prompt.md', async () => {
        const options = createConfigOptions();
        const result = await adapter.generateConfig(options);

        expect(result.files).toHaveLength(2);
        expect(result.files[0].path).toBe(join(tempDir, '.aider.conf.yml'));
        expect(result.files[1].path).toBe(join(tempDir, '.aider.rapid-prompt.md'));
      });

      it('should include git settings in aider config', async () => {
        const options = createConfigOptions();
        const result = await adapter.generateConfig(options);
        const content = result.files[0].content;

        expect(content).toContain('git: true');
        expect(content).toContain('auto-commits: true');
        expect(content).toContain('dirty-commits: false');
      });

      it('should add gateway configuration when enabled', async () => {
        const options = createConfigOptions({
          gatewayConfig: {
            enabled: true,
            config: {
              baseUrl: 'http://localhost:3000/v1',
            },
          },
        });
        const result = await adapter.generateConfig(options);
        const content = result.files[0].content;

        expect(content).toContain('openai-api-base: http://localhost:3000/v1');
      });
    });

    describe('getEnvironment', () => {
      it('should set OPENAI_API_BASE for gateway', () => {
        const options: AgentEnvironmentOptions = {
          projectDir: tempDir,
          gatewayUrl: 'http://gateway.local:3000',
        };
        const env = adapter.getEnvironment(options);

        expect(env.OPENAI_API_BASE).toBe('http://gateway.local:3000');
        expect(env.ANTHROPIC_BASE_URL).toBe('http://gateway.local:3000');
      });

      it('should include ALL_PROXY for aider', () => {
        const options: AgentEnvironmentOptions = {
          projectDir: tempDir,
          proxyUrl: 'http://proxy.local:8080',
        };
        const env = adapter.getEnvironment(options);

        expect(env.ALL_PROXY).toBe('http://proxy.local:8080');
      });
    });

    describe('getArgs', () => {
      it('should always include --git flag', () => {
        const args = adapter.getArgs({});
        expect(args).toContain('--git');
      });

      it('should add system prompt file when systemPrompt is provided', () => {
        const options: AgentLaunchOptions = {
          systemPrompt: 'Custom prompt',
        };
        const args = adapter.getArgs(options);
        expect(args).toContain('--system-prompt-file');
        expect(args).toContain('.aider.rapid-prompt.md');
      });

      it('should add system prompt file when injectContext is true', () => {
        const options: AgentLaunchOptions = {
          injectContext: true,
        };
        const args = adapter.getArgs(options);
        expect(args).toContain('--system-prompt-file');
      });
    });
  });

  describe('CodexAdapter', () => {
    let adapter: CodexAdapter;

    beforeEach(() => {
      adapter = new CodexAdapter();
    });

    it('should have correct metadata', () => {
      expect(adapter.name).toBe('codex');
      expect(adapter.cli).toBe('codex');
      expect(adapter.description).toContain('Codex');
    });

    describe('isAvailable', () => {
      it('should return true when codex is installed', async () => {
        mockedExeca.mockResolvedValueOnce({} as never);
        const result = await adapter.isAvailable();
        expect(result).toBe(true);
        expect(mockedExeca).toHaveBeenCalledWith('which', ['codex']);
      });

      it('should return false when codex is not installed', async () => {
        mockedExeca.mockRejectedValueOnce(new Error('not found'));
        const result = await adapter.isAvailable();
        expect(result).toBe(false);
      });
    });

    describe('generateConfig', () => {
      it('should generate .codex/config.toml with rapid MCP server', async () => {
        const options = createConfigOptions();
        const result = await adapter.generateConfig(options);

        expect(result.files).toHaveLength(1);
        expect(result.files[0].path).toBe(join(tempDir, '.codex', 'config.toml'));
        expect(result.files[0].content).toContain('[mcp_servers.rapid]');
        expect(result.files[0].content).toContain('url = "http://localhost:3100/mcp"');
      });
    });

    describe('getEnvironment', () => {
      it('should set OPENAI_BASE_URL for gateway', () => {
        const options: AgentEnvironmentOptions = {
          projectDir: tempDir,
          gatewayUrl: 'http://gateway.local:3000',
        };
        const env = adapter.getEnvironment(options);

        expect(env.OPENAI_BASE_URL).toBe('http://gateway.local:3000');
      });
    });

    describe('getArgs', () => {
      it('should add -C when workingDir is provided', () => {
        const options: AgentLaunchOptions = {
          workingDir: '/some/path',
        };
        const args = adapter.getArgs(options);
        expect(args).toEqual(['-C', '/some/path']);
      });
    });
  });

  describe('RooCodeAdapter', () => {
    let adapter: RooCodeAdapter;

    beforeEach(() => {
      adapter = new RooCodeAdapter();
    });

    it('should have correct metadata', () => {
      expect(adapter.name).toBe('roo-code');
      expect(adapter.cli).toBe('code');
      expect(adapter.description).toContain('Roo Code');
    });

    describe('isAvailable', () => {
      it('should check for VS Code CLI', async () => {
        mockedExeca.mockResolvedValueOnce({} as never);
        const result = await adapter.isAvailable();
        expect(result).toBe(true);
        expect(mockedExeca).toHaveBeenCalledWith('which', ['code']);
      });
    });

    describe('generateConfig', () => {
      it('should generate .vscode/mcp.json and .vscode/settings.json', async () => {
        const options = createConfigOptions();
        const result = await adapter.generateConfig(options);

        expect(result.files).toHaveLength(2);
        expect(result.files[0].path).toBe(join(tempDir, '.vscode', 'mcp.json'));
        expect(result.files[1].path).toBe(join(tempDir, '.vscode', 'settings.json'));
      });

      it('should include roo-code settings', async () => {
        const options = createConfigOptions();
        const result = await adapter.generateConfig(options);
        const settings = JSON.parse(result.files[1].content);

        expect(settings['roo-code.mcpServers']).toEqual(['rapid']);
        expect(settings['roo-code.customInstructions']).toBeDefined();
      });
    });

    describe('getArgs', () => {
      it('should return workingDir as argument when provided', () => {
        const options: AgentLaunchOptions = {
          workingDir: '/some/path',
        };
        const args = adapter.getArgs(options);
        expect(args).toEqual(['/some/path']);
      });
    });
  });

  describe('CopilotAdapter', () => {
    let adapter: CopilotAdapter;

    beforeEach(() => {
      adapter = new CopilotAdapter();
    });

    it('should have correct metadata', () => {
      expect(adapter.name).toBe('copilot');
      expect(adapter.cli).toBe('code');
      expect(adapter.description).toContain('Copilot');
    });

    describe('generateConfig', () => {
      it('should generate mcp.json, settings.json, and copilot-instructions.md', async () => {
        const options = createConfigOptions();
        const result = await adapter.generateConfig(options);

        expect(result.files).toHaveLength(3);
        expect(result.files[0].path).toBe(join(tempDir, '.vscode', 'mcp.json'));
        expect(result.files[1].path).toBe(join(tempDir, '.vscode', 'settings.json'));
        expect(result.files[2].path).toBe(join(tempDir, '.github', 'copilot-instructions.md'));
      });

      it('should include copilot advanced settings', async () => {
        const options = createConfigOptions();
        const result = await adapter.generateConfig(options);
        const settings = JSON.parse(result.files[1].content);

        expect(settings['github.copilot.advanced']).toBeDefined();
        expect(settings['github.copilot.advanced'].customInstructions).toBeDefined();
      });
    });
  });

  describe('ClaudeCodeAdapter', () => {
    let adapter: ClaudeCodeAdapter;

    beforeEach(() => {
      adapter = new ClaudeCodeAdapter();
    });

    it('should have correct metadata', () => {
      expect(adapter.name).toBe('claude');
      expect(adapter.cli).toBe('claude');
      expect(adapter.description).toContain('Claude Code');
    });

    describe('isAvailable', () => {
      it('should check for claude CLI', async () => {
        mockedExeca.mockResolvedValueOnce({} as never);
        const result = await adapter.isAvailable();
        expect(result).toBe(true);
        expect(mockedExeca).toHaveBeenCalledWith('which', ['claude']);
      });
    });

    describe('generateConfig', () => {
      it('should generate .mcp.json and CLAUDE.md', async () => {
        const options = createConfigOptions();
        const result = await adapter.generateConfig(options);

        expect(result.files).toHaveLength(2);
        expect(result.files[0].path).toBe(join(tempDir, '.mcp.json'));
        expect(result.files[1].path).toBe(join(tempDir, 'CLAUDE.md'));
      });

      it('should configure mcpServers in .mcp.json', async () => {
        const options = createConfigOptions();
        const result = await adapter.generateConfig(options);
        const config = JSON.parse(result.files[0].content);

        expect(config.mcpServers.rapid).toBeDefined();
        expect(config.mcpServers.rapid.command).toBe('rapid');
      });
    });

    describe('getEnvironment', () => {
      it('should only set ANTHROPIC_BASE_URL for gateway (not OPENAI)', () => {
        const options: AgentEnvironmentOptions = {
          projectDir: tempDir,
          gatewayUrl: 'http://gateway.local:3000',
        };
        const env = adapter.getEnvironment(options);

        expect(env.ANTHROPIC_BASE_URL).toBe('http://gateway.local:3000');
        expect(env.OPENAI_BASE_URL).toBeUndefined();
      });
    });

    describe('getArgs', () => {
      it('should add --append-system-prompt when systemPrompt is provided', () => {
        const options: AgentLaunchOptions = {
          systemPrompt: 'Custom system prompt',
        };
        const args = adapter.getArgs(options);
        expect(args).toEqual(['--append-system-prompt', 'Custom system prompt']);
      });

      it('should return empty array when no systemPrompt', () => {
        const args = adapter.getArgs({});
        expect(args).toEqual([]);
      });
    });
  });

  describe('Helper Functions', () => {
    describe('getAgentAdapter', () => {
      it('should return adapter for valid name', () => {
        const adapter = getAgentAdapter('claude');
        expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
      });

      it('should be case-insensitive', () => {
        const adapter = getAgentAdapter('CLAUDE');
        expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
      });

      it('should return null for unknown adapter', () => {
        const adapter = getAgentAdapter('unknown-agent');
        expect(adapter).toBeNull();
      });

      it('should return correct adapter for each supported name', () => {
        expect(getAgentAdapter('claude')).toBeInstanceOf(ClaudeCodeAdapter);
        expect(getAgentAdapter('opencode')).toBeInstanceOf(OpenCodeAdapter);
        expect(getAgentAdapter('aider')).toBeInstanceOf(AiderAdapter);
        expect(getAgentAdapter('codex')).toBeInstanceOf(CodexAdapter);
        expect(getAgentAdapter('roo-code')).toBeInstanceOf(RooCodeAdapter);
        expect(getAgentAdapter('copilot')).toBeInstanceOf(CopilotAdapter);
      });
    });

    describe('getAllAdapters', () => {
      it('should return all 6 adapters', () => {
        const adapters = getAllAdapters();
        expect(adapters).toHaveLength(6);
      });

      it('should return instances of AgentAdapter', () => {
        const adapters = getAllAdapters();
        for (const adapter of adapters) {
          expect(adapter).toHaveProperty('name');
          expect(adapter).toHaveProperty('cli');
          expect(adapter).toHaveProperty('description');
          expect(adapter).toHaveProperty('isAvailable');
          expect(adapter).toHaveProperty('generateConfig');
          expect(adapter).toHaveProperty('getEnvironment');
          expect(adapter).toHaveProperty('getArgs');
        }
      });
    });

    describe('checkAvailableAdapters', () => {
      it('should check availability of all adapters', async () => {
        // All adapters available
        mockedExeca.mockResolvedValue({} as never);

        const results = await checkAvailableAdapters();
        expect(results).toHaveLength(6);
        expect(results.every((r) => r.available)).toBe(true);
      });

      it('should return unavailable status when CLI not found', async () => {
        // All adapters unavailable
        mockedExeca.mockRejectedValue(new Error('not found'));

        const results = await checkAvailableAdapters();
        expect(results).toHaveLength(6);
        expect(results.every((r) => !r.available)).toBe(true);
      });

      it('should include adapter names in results', async () => {
        mockedExeca.mockResolvedValue({} as never);

        const results = await checkAvailableAdapters();
        const names = results.map((r) => r.name);

        expect(names).toContain('claude');
        expect(names).toContain('opencode');
        expect(names).toContain('aider');
        expect(names).toContain('codex');
        expect(names).toContain('roo-code');
        expect(names).toContain('copilot');
      });
    });

    describe('configureAgent', () => {
      it('should generate and write config files', async () => {
        const options = createConfigOptions();
        const result = await configureAgent('opencode', options);

        expect(result).not.toBeNull();
        expect(result!.files).toHaveLength(1);

        // Verify file was written
        const configPath = join(tempDir, 'opencode.json');
        expect(existsSync(configPath)).toBe(true);

        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        // OpenCode uses servers directly under mcp, not mcp.servers
        expect(config.mcp.rapid).toBeDefined();
      });

      it('should create necessary directories', async () => {
        const options = createConfigOptions();
        await configureAgent('roo-code', options);

        expect(existsSync(join(tempDir, '.vscode'))).toBe(true);
        expect(existsSync(join(tempDir, '.vscode', 'mcp.json'))).toBe(true);
      });

      it('should return null for unknown agent', async () => {
        const options = createConfigOptions();
        const result = await configureAgent('unknown-agent', options);
        expect(result).toBeNull();
      });

      it('should configure claude agent with .mcp.json and CLAUDE.md', async () => {
        const options = createConfigOptions();
        await configureAgent('claude', options);

        expect(existsSync(join(tempDir, '.mcp.json'))).toBe(true);
        expect(existsSync(join(tempDir, 'CLAUDE.md'))).toBe(true);
      });

      it('should configure aider with .aider.conf.yml', async () => {
        const options = createConfigOptions();
        await configureAgent('aider', options);

        expect(existsSync(join(tempDir, '.aider.conf.yml'))).toBe(true);
        expect(existsSync(join(tempDir, '.aider.rapid-prompt.md'))).toBe(true);
      });
    });
  });
});
