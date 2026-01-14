/**
 * Tests for mcp.ts - MCP Server Management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { RapidConfig } from './types.js';
import {
  getMcpServers,
  getMcpServerStatus,
  addMcpServer,
  addMcpServerFromTemplate,
  removeMcpServer,
  enableMcpServer,
  disableMcpServer,
  generateMcpConfig,
  generateOpenCodeConfig,
  writeMcpConfig,
  writeOpenCodeConfig,
  hasMcpConfig,
  readMcpConfig,
  getMcpConfigPath,
} from './mcp.js';

describe('mcp', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `rapid-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  const baseConfig: RapidConfig = {
    version: '1.0',
    agents: {
      default: 'claude',
      available: { claude: { cli: 'claude' } },
    },
  };

  describe('getMcpServers', () => {
    it('should return empty array when no MCP config', () => {
      const servers = getMcpServers(baseConfig);
      expect(servers).toHaveLength(0);
    });

    it('should return configured servers', () => {
      const config: RapidConfig = {
        ...baseConfig,
        mcp: {
          servers: {
            context7: { enabled: true, type: 'remote', url: 'https://mcp.context7.com/mcp' },
            filesystem: { enabled: false, type: 'stdio', command: 'npx' },
          },
        },
      };

      const servers = getMcpServers(config);

      expect(servers).toHaveLength(2);

      const context7 = servers.find((s) => s.name === 'context7');
      expect(context7?.enabled).toBe(true);
      expect(context7?.type).toBe('remote');
      expect(context7?.url).toBe('https://mcp.context7.com/mcp');

      const filesystem = servers.find((s) => s.name === 'filesystem');
      expect(filesystem?.enabled).toBe(false);
      expect(filesystem?.type).toBe('stdio');
    });

    it('should default enabled to true', () => {
      const config: RapidConfig = {
        ...baseConfig,
        mcp: {
          servers: {
            test: { type: 'stdio', command: 'test' },
          },
        },
      };

      const servers = getMcpServers(config);
      expect(servers[0]?.enabled).toBe(true);
    });
  });

  describe('getMcpServerStatus', () => {
    it('should return server statuses', () => {
      const config: RapidConfig = {
        ...baseConfig,
        mcp: {
          servers: {
            enabled: { enabled: true, type: 'remote', url: 'https://example.com' },
            disabled: { enabled: false, type: 'stdio', command: 'test' },
          },
        },
      };

      const statuses = getMcpServerStatus(config);

      expect(statuses).toHaveLength(2);

      const enabledStatus = statuses.find((s) => s.name === 'enabled');
      expect(enabledStatus?.status).toBe('enabled');

      const disabledStatus = statuses.find((s) => s.name === 'disabled');
      expect(disabledStatus?.status).toBe('disabled');
    });
  });

  describe('addMcpServer', () => {
    it('should add a new server to config', () => {
      const updated = addMcpServer(baseConfig, 'newserver', {
        type: 'remote',
        url: 'https://new.example.com',
        headers: { 'X-API-Key': '${API_KEY}' },
      });

      expect(updated.mcp?.servers?.newserver).toBeDefined();
      expect(updated.mcp?.servers?.newserver?.url).toBe('https://new.example.com');
      expect(updated.mcp?.configFile).toBe('.mcp.json');
    });

    it('should preserve existing servers', () => {
      const configWithServers: RapidConfig = {
        ...baseConfig,
        mcp: {
          servers: {
            existing: { type: 'stdio', command: 'existing-cmd' },
          },
        },
      };

      const updated = addMcpServer(configWithServers, 'new', {
        type: 'remote',
        url: 'https://new.example.com',
      });

      expect(updated.mcp?.servers?.existing).toBeDefined();
      expect(updated.mcp?.servers?.new).toBeDefined();
    });
  });

  describe('addMcpServerFromTemplate', () => {
    it('should add a server from template', () => {
      const updated = addMcpServerFromTemplate(baseConfig, 'context7');

      expect(updated.mcp?.servers?.context7).toBeDefined();
      expect(updated.mcp?.servers?.context7?.enabled).toBe(true);
      expect(updated.mcp?.servers?.context7?.type).toBe('remote');
    });

    it('should throw for unknown template', () => {
      expect(() => addMcpServerFromTemplate(baseConfig, 'unknown-template')).toThrow(
        'Unknown MCP server template'
      );
    });
  });

  describe('removeMcpServer', () => {
    it('should remove a server from config', () => {
      const configWithServers: RapidConfig = {
        ...baseConfig,
        mcp: {
          servers: {
            toRemove: { type: 'stdio', command: 'remove-me' },
            toKeep: { type: 'stdio', command: 'keep-me' },
          },
        },
      };

      const updated = removeMcpServer(configWithServers, 'toRemove');

      expect(updated.mcp?.servers?.toRemove).toBeUndefined();
      expect(updated.mcp?.servers?.toKeep).toBeDefined();
    });

    it('should throw for non-existent server', () => {
      expect(() => removeMcpServer(baseConfig, 'nonexistent')).toThrow('MCP server not found');
    });
  });

  describe('enableMcpServer / disableMcpServer', () => {
    const configWithServer: RapidConfig = {
      ...baseConfig,
      mcp: {
        servers: {
          test: { enabled: false, type: 'stdio', command: 'test' },
        },
      },
    };

    it('should enable a disabled server', () => {
      const updated = enableMcpServer(configWithServer, 'test');
      expect(updated.mcp?.servers?.test?.enabled).toBe(true);
    });

    it('should disable an enabled server', () => {
      const enabledConfig = enableMcpServer(configWithServer, 'test');
      const updated = disableMcpServer(enabledConfig, 'test');
      expect(updated.mcp?.servers?.test?.enabled).toBe(false);
    });

    it('should throw for non-existent server', () => {
      expect(() => enableMcpServer(baseConfig, 'nonexistent')).toThrow('MCP server not found');
      expect(() => disableMcpServer(baseConfig, 'nonexistent')).toThrow('MCP server not found');
    });
  });

  describe('generateMcpConfig', () => {
    it('should generate empty config when no servers', () => {
      const generated = generateMcpConfig(baseConfig);
      expect(generated.mcpServers).toEqual({});
    });

    it('should generate config for enabled servers only', () => {
      const config: RapidConfig = {
        ...baseConfig,
        mcp: {
          servers: {
            enabled: { enabled: true, type: 'remote', url: 'https://enabled.com' },
            disabled: { enabled: false, type: 'remote', url: 'https://disabled.com' },
          },
        },
      };

      const generated = generateMcpConfig(config);

      expect(generated.mcpServers.enabled).toBeDefined();
      expect(generated.mcpServers.disabled).toBeUndefined();
    });

    it('should use http type for remote servers in output', () => {
      const config: RapidConfig = {
        ...baseConfig,
        mcp: {
          servers: {
            remote: { type: 'remote', url: 'https://example.com', headers: { 'X-Key': 'val' } },
          },
        },
      };

      const generated = generateMcpConfig(config);

      expect(generated.mcpServers.remote?.type).toBe('http');
      expect(generated.mcpServers.remote?.url).toBe('https://example.com');
      expect(generated.mcpServers.remote?.headers).toEqual({ 'X-Key': 'val' });
    });

    it('should handle stdio servers', () => {
      const config: RapidConfig = {
        ...baseConfig,
        mcp: {
          servers: {
            stdio: {
              type: 'stdio',
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem'],
              env: { HOME: '/home/user' },
            },
          },
        },
      };

      const generated = generateMcpConfig(config);

      expect(generated.mcpServers.stdio?.type).toBe('stdio');
      expect(generated.mcpServers.stdio?.command).toBe('npx');
      expect(generated.mcpServers.stdio?.args).toEqual([
        '-y',
        '@modelcontextprotocol/server-filesystem',
      ]);
      expect(generated.mcpServers.stdio?.env).toEqual({ HOME: '/home/user' });
    });
  });

  describe('generateOpenCodeConfig', () => {
    it('should generate OpenCode format config', () => {
      const config: RapidConfig = {
        ...baseConfig,
        mcp: {
          servers: {
            context7: {
              type: 'remote',
              url: 'https://mcp.context7.com/mcp',
              headers: { 'Context7-API-Key': '${CONTEXT7_API_KEY}' },
            },
          },
        },
      };

      const generated = generateOpenCodeConfig(config);

      expect(generated.$schema).toBe('https://opencode.ai/config.json');
      expect(generated.mcp?.context7?.type).toBe('remote');
      // Should convert ${VAR} to {env:VAR}
      expect(generated.mcp?.context7?.headers?.['Context7-API-Key']).toBe('{env:CONTEXT7_API_KEY}');
    });
  });

  describe('writeMcpConfig / readMcpConfig / hasMcpConfig', () => {
    it('should write and read MCP config file', async () => {
      const config: RapidConfig = {
        ...baseConfig,
        mcp: {
          configFile: '.mcp.json',
          servers: {
            test: { type: 'remote', url: 'https://test.com' },
          },
        },
      };

      await writeMcpConfig(testDir, config);

      const hasConfig = await hasMcpConfig(testDir, config);
      expect(hasConfig).toBe(true);

      const read = await readMcpConfig(testDir, config);
      expect(read?.mcpServers?.test).toBeDefined();
      expect(read?.mcpServers?.test?.url).toBe('https://test.com');
    });

    it('should return false/null when config does not exist', async () => {
      expect(await hasMcpConfig(testDir)).toBe(false);
      expect(await readMcpConfig(testDir)).toBeNull();
    });
  });

  describe('writeOpenCodeConfig', () => {
    it('should write opencode.json file', async () => {
      const config: RapidConfig = {
        ...baseConfig,
        mcp: {
          servers: {
            test: { type: 'stdio', command: 'test-cmd' },
          },
        },
      };

      await writeOpenCodeConfig(testDir, config);

      const content = await readFile(join(testDir, 'opencode.json'), 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.$schema).toBe('https://opencode.ai/config.json');
      expect(parsed.mcp?.test?.type).toBe('stdio');
    });
  });

  describe('getMcpConfigPath', () => {
    it('should return default path', () => {
      const path = getMcpConfigPath(testDir);
      expect(path).toBe(join(testDir, '.mcp.json'));
    });

    it('should use custom path from config', () => {
      const config: RapidConfig = {
        ...baseConfig,
        mcp: { configFile: 'custom/mcp-config.json' },
      };

      const path = getMcpConfigPath(testDir, config);
      expect(path).toBe(join(testDir, 'custom/mcp-config.json'));
    });

    it('should use absolute path if provided', () => {
      const config: RapidConfig = {
        ...baseConfig,
        mcp: { configFile: '/absolute/path/.mcp.json' },
      };

      const path = getMcpConfigPath(testDir, config);
      expect(path).toBe('/absolute/path/.mcp.json');
    });
  });
});
