/**
 * Tests for @a3t/rapid-schema - JSON schema and TypeScript types
 */

import { describe, it, expect } from 'vitest';
import { schema, SCHEMA_URL, SCHEMA_VERSION, DEFAULT_CONFIG } from './index.js';
import type {
  RapidConfig,
  ContainerConfig,
  SecretsConfig,
  AgentsConfig,
  AgentDefinition,
  ContextConfig,
  McpConfig,
  McpServerConfig,
} from './index.js';

describe('@a3t/rapid-schema', () => {
  describe('schema export', () => {
    it('should export JSON schema', () => {
      expect(schema).toBeDefined();
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema.title).toBe('RAPID Configuration');
    });

    it('should have required properties in schema', () => {
      expect(schema.required).toContain('version');
      expect(schema.required).toContain('agents');
    });

    it('should define version enum', () => {
      expect(schema.properties?.version?.enum).toContain('1.0');
    });
  });

  describe('constants', () => {
    it('should export SCHEMA_URL', () => {
      expect(SCHEMA_URL).toBe('https://getrapid.dev/schema/v1/rapid.json');
    });

    it('should export SCHEMA_VERSION', () => {
      expect(SCHEMA_VERSION).toBe('1.0');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should be a valid RapidConfig', () => {
      expect(DEFAULT_CONFIG.version).toBe('1.0');
      expect(DEFAULT_CONFIG.agents).toBeDefined();
      expect(DEFAULT_CONFIG.agents.default).toBe('claude');
      expect(DEFAULT_CONFIG.agents.available.claude).toBeDefined();
      expect(DEFAULT_CONFIG.agents.available.codex).toBeDefined();
    });

    it('should have claude as default agent with proper config', () => {
      const claude = DEFAULT_CONFIG.agents.available.claude;
      expect(claude).toBeDefined();
      expect(claude!.cli).toBe('claude');
      expect(claude!.instructionFile).toBe('CLAUDE.md');
      // Auth passthrough is used instead of explicit envVars - no ANTHROPIC_API_KEY needed
      expect(claude!.yolo).toBe(true); // Skip permission prompts by default
    });

    it('should have codex configured by default', () => {
      const codex = DEFAULT_CONFIG.agents.available.codex;
      expect(codex).toBeDefined();
      expect(codex!.cli).toBe('codex');
      expect(codex!.instructionFile).toBe('AGENTS.md');
    });

    it('should have eventBus enabled by default', () => {
      expect(DEFAULT_CONFIG.eventBus).toBeDefined();
      expect(DEFAULT_CONFIG.eventBus!.enabled).toBe(true);
    });

    it('should have RAPID MCP server configured by default', () => {
      expect(DEFAULT_CONFIG.mcp).toBeDefined();
      expect(DEFAULT_CONFIG.mcp!.servers).toBeDefined();
      expect(DEFAULT_CONFIG.mcp!.servers!.rapid).toBeDefined();
      expect(DEFAULT_CONFIG.mcp!.servers!.rapid!.enabled).toBe(true);
      expect(DEFAULT_CONFIG.mcp!.servers!.rapid!.type).toBe('remote');
      expect(DEFAULT_CONFIG.mcp!.servers!.rapid!.url).toBe('http://localhost:3100/mcp');
    });
  });

  describe('TypeScript types', () => {
    it('should allow valid RapidConfig', () => {
      const config: RapidConfig = {
        version: '1.0',
        agents: {
          default: 'claude',
          available: {
            claude: { cli: 'claude' },
          },
        },
      };

      expect(config.version).toBe('1.0');
    });

    it('should allow optional properties', () => {
      const config: RapidConfig = {
        version: '1.0',
        name: 'my-project',
        agents: {
          default: 'claude',
          available: {
            claude: { cli: 'claude' },
          },
        },
        container: {
          devcontainer: '.devcontainer/devcontainer.json',
          autoStart: true,
        },
        secrets: {
          provider: '1password',
          vault: 'Development',
        },
        context: {
          files: ['README.md'],
          generateAgentFiles: true,
        },
        mcp: {
          configFile: '.mcp.json',
          servers: {},
        },
      };

      expect(config.name).toBe('my-project');
      expect(config.container?.autoStart).toBe(true);
      expect(config.secrets?.provider).toBe('1password');
    });

    it('should type ContainerConfig correctly', () => {
      const container: ContainerConfig = {
        devcontainer: '.devcontainer/devcontainer.json',
        compose: 'docker-compose.yml',
        autoStart: false,
        buildArgs: { NODE_VERSION: '20' },
      };

      expect(container.buildArgs?.NODE_VERSION).toBe('20');
    });

    it('should type SecretsConfig correctly', () => {
      const secrets: SecretsConfig = {
        provider: '1password',
        vault: 'Development',
        items: {
          API_KEY: 'op://Development/App/API_KEY',
        },
        envrc: {
          generate: true,
          path: '.envrc',
          includeLocal: true,
        },
        dotenv: {
          enabled: false,
          files: ['.env', '.env.local'],
          warn: true,
        },
      };

      expect(secrets.provider).toBe('1password');
      expect(secrets.items?.API_KEY).toContain('op://');
    });

    it('should type AgentsConfig correctly', () => {
      const agents: AgentsConfig = {
        default: 'opencode',
        available: {
          opencode: {
            cli: 'opencode',
            instructionFile: 'AGENTS.md',
            envVars: ['ANTHROPIC_API_KEY'],
          },
          aider: {
            cli: 'aider',
            args: ['--model', 'gpt-4'],
            installCmd: 'pip install aider-chat',
          },
        },
      };

      expect(agents.available.opencode!.cli).toBe('opencode');
      expect(agents.available.aider!.args).toContain('--model');
    });

    it('should type AgentDefinition correctly', () => {
      const agent: AgentDefinition = {
        cli: 'claude',
        instructionFile: 'CLAUDE.md',
        envVars: ['ANTHROPIC_API_KEY'],
        installCmd: 'npm install -g @anthropic-ai/claude-code',
        args: ['--verbose'],
      };

      expect(agent.cli).toBe('claude');
      expect(agent.envVars).toHaveLength(1);
    });

    it('should type ContextConfig correctly', () => {
      const context: ContextConfig = {
        files: ['README.md', 'CONTRIBUTING.md'],
        dirs: ['docs/', 'guides/'],
        exclude: ['node_modules/', '*.log'],
        generateAgentFiles: true,
        templateDir: 'templates/',
        preserve: ['CLAUDE.md'],
      };

      expect(context.files).toHaveLength(2);
      expect(context.exclude).toContain('node_modules/');
    });

    it('should type McpConfig correctly', () => {
      const mcp: McpConfig = {
        configFile: '.mcp.json',
        servers: {
          context7: {
            enabled: true,
            type: 'remote',
            url: 'https://mcp.context7.com/mcp',
            headers: { 'X-API-Key': '${API_KEY}' },
          },
          filesystem: {
            enabled: true,
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            env: { HOME: '/home/user' },
          },
        },
      };

      expect(mcp.servers?.context7?.type).toBe('remote');
      expect(mcp.servers?.filesystem?.command).toBe('npx');
    });

    it('should type McpServerConfig correctly', () => {
      const remoteServer: McpServerConfig = {
        enabled: true,
        type: 'remote',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer ${TOKEN}' },
      };

      const stdioServer: McpServerConfig = {
        enabled: true,
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: { DEBUG: 'true' },
      };

      expect(remoteServer.type).toBe('remote');
      expect(stdioServer.type).toBe('stdio');
    });
  });

  describe('schema validation structure', () => {
    it('should define agents schema correctly', () => {
      // Agents uses $ref, check definitions instead
      const agentsDefinition = (schema.definitions as Record<string, unknown>)?.AgentsConfig as {
        required?: string[];
      };
      expect(agentsDefinition).toBeDefined();
      expect(agentsDefinition?.required).toContain('default');
      expect(agentsDefinition?.required).toContain('available');
    });

    it('should define secrets provider enum', () => {
      // Secrets uses $ref, check definitions instead
      const secretsDefinition = (schema.definitions as Record<string, unknown>)?.SecretsConfig as {
        properties?: { provider?: { enum?: string[] } };
      };
      const providerEnum = secretsDefinition?.properties?.provider?.enum;
      expect(providerEnum).toContain('1password');
      expect(providerEnum).toContain('vault');
      expect(providerEnum).toContain('env');
    });

    it('should define mcp server config', () => {
      // MCP uses $ref, check definitions instead
      const mcpServerDefinition = (schema.definitions as Record<string, unknown>)
        ?.McpServerConfig as {
        properties?: { enabled?: { type?: string } };
      };
      expect(mcpServerDefinition).toBeDefined();
      expect(mcpServerDefinition?.properties?.enabled?.type).toBe('boolean');
    });
  });
});
