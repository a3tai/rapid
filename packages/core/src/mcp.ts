/**
 * MCP Server Management
 *
 * Functions for managing Model Context Protocol servers in RAPID configuration.
 */

import { writeFile, readFile, access } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import type { RapidConfig, McpServerConfig } from './types.js';
import { getMcpTemplate } from './mcp-templates.js';

/**
 * Extended MCP server configuration with type-safe properties
 */
export interface McpServerDefinition extends McpServerConfig {
  enabled?: boolean;
  type?: 'remote' | 'stdio';
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * MCP server info for display
 */
export interface McpServerInfo {
  name: string;
  enabled: boolean;
  type: 'remote' | 'stdio';
  url?: string | undefined;
  command?: string | undefined;
  template?: string | undefined;
}

/**
 * MCP server status
 */
export interface McpServerStatus extends McpServerInfo {
  status: 'enabled' | 'disabled' | 'error';
  error?: string | undefined;
}

/**
 * Generated MCP config file format (for .mcp.json)
 */
export interface GeneratedMcpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

/**
 * Single server entry in generated config
 */
export interface McpServerEntry {
  type?: 'http' | 'stdio';
  url?: string | undefined;
  headers?: Record<string, string> | undefined;
  command?: string | undefined;
  args?: string[] | undefined;
  env?: Record<string, string> | undefined;
}

/**
 * OpenCode config format
 */
export interface OpenCodeConfig {
  $schema?: string;
  mcp?: Record<string, OpenCodeMcpEntry>;
}

/**
 * OpenCode MCP entry format
 */
export interface OpenCodeMcpEntry {
  type: 'remote' | 'stdio';
  url?: string | undefined;
  headers?: Record<string, string> | undefined;
  command?: string | undefined;
  args?: string[] | undefined;
  env?: Record<string, string> | undefined;
}

/**
 * Get all configured MCP servers from config
 */
export function getMcpServers(config: RapidConfig): McpServerInfo[] {
  const servers: McpServerInfo[] = [];

  if (!config.mcp?.servers) {
    return servers;
  }

  for (const [name, serverConfig] of Object.entries(config.mcp.servers)) {
    if (!serverConfig || typeof serverConfig !== 'object') {
      continue;
    }

    const def = serverConfig as McpServerDefinition;
    const template = getMcpTemplate(name);

    servers.push({
      name,
      enabled: def.enabled !== false,
      type: def.type ?? template?.type ?? 'stdio',
      url: def.url ?? template?.url,
      command: def.command ?? template?.command,
      template: template ? name : undefined,
    });
  }

  return servers;
}

/**
 * Get MCP server status for all configured servers
 */
export function getMcpServerStatus(config: RapidConfig): McpServerStatus[] {
  const servers = getMcpServers(config);

  return servers.map((server) => ({
    ...server,
    status: server.enabled ? ('enabled' as const) : ('disabled' as const),
  }));
}

/**
 * Add an MCP server to configuration
 */
export function addMcpServer(
  config: RapidConfig,
  name: string,
  serverConfig: McpServerDefinition
): RapidConfig {
  return {
    ...config,
    mcp: {
      ...config.mcp,
      configFile: config.mcp?.configFile ?? '.mcp.json',
      servers: {
        ...config.mcp?.servers,
        [name]: serverConfig,
      },
    },
  };
}

/**
 * Add an MCP server from a template
 */
export function addMcpServerFromTemplate(config: RapidConfig, templateName: string): RapidConfig {
  const template = getMcpTemplate(templateName);
  if (!template) {
    throw new Error(`Unknown MCP server template: ${templateName}`);
  }

  const serverConfig: McpServerDefinition = {
    enabled: true,
    type: template.type,
  };

  // Add type-specific config
  if (template.type === 'remote') {
    if (template.url) {
      serverConfig.url = template.url;
    }
    if (template.headers) {
      serverConfig.headers = { ...template.headers };
    }
  } else {
    if (template.command) {
      serverConfig.command = template.command;
    }
    if (template.args) {
      serverConfig.args = [...template.args];
    }
    if (template.env) {
      serverConfig.env = { ...template.env };
    }
  }

  return addMcpServer(config, templateName, serverConfig);
}

/**
 * Remove an MCP server from configuration
 */
export function removeMcpServer(config: RapidConfig, name: string): RapidConfig {
  if (!config.mcp?.servers?.[name]) {
    throw new Error(`MCP server not found: ${name}`);
  }

  const { [name]: _removed, ...remainingServers } = config.mcp.servers;

  return {
    ...config,
    mcp: {
      ...config.mcp,
      servers: remainingServers,
    },
  };
}

/**
 * Enable an MCP server
 */
export function enableMcpServer(config: RapidConfig, name: string): RapidConfig {
  if (!config.mcp?.servers?.[name]) {
    throw new Error(`MCP server not found: ${name}`);
  }

  return {
    ...config,
    mcp: {
      ...config.mcp,
      servers: {
        ...config.mcp.servers,
        [name]: {
          ...config.mcp.servers[name],
          enabled: true,
        },
      },
    },
  };
}

/**
 * Disable an MCP server
 */
export function disableMcpServer(config: RapidConfig, name: string): RapidConfig {
  if (!config.mcp?.servers?.[name]) {
    throw new Error(`MCP server not found: ${name}`);
  }

  return {
    ...config,
    mcp: {
      ...config.mcp,
      servers: {
        ...config.mcp.servers,
        [name]: {
          ...config.mcp.servers[name],
          enabled: false,
        },
      },
    },
  };
}

/**
 * Generate .mcp.json config from rapid.json mcp section
 */
export function generateMcpConfig(config: RapidConfig): GeneratedMcpConfig {
  const mcpServers: Record<string, McpServerEntry> = {};

  if (!config.mcp?.servers) {
    return { mcpServers };
  }

  for (const [name, serverConfig] of Object.entries(config.mcp.servers)) {
    if (!serverConfig || typeof serverConfig !== 'object') {
      continue;
    }

    const def = serverConfig as McpServerDefinition;

    // Skip disabled servers
    if (def.enabled === false) {
      continue;
    }

    // Get template for defaults
    const template = getMcpTemplate(name);

    const entry: McpServerEntry = {};

    // Determine type
    const type = def.type ?? template?.type ?? 'stdio';

    if (type === 'remote') {
      entry.type = 'http';
      entry.url = def.url ?? template?.url;
      entry.headers = def.headers ?? template?.headers;
    } else {
      entry.type = 'stdio';
      entry.command = def.command ?? template?.command;
      entry.args = def.args ?? template?.args;
      if (def.env ?? template?.env) {
        entry.env = { ...template?.env, ...def.env };
      }
    }

    mcpServers[name] = entry;
  }

  return { mcpServers };
}

/**
 * Generate opencode.json config format
 */
export function generateOpenCodeConfig(config: RapidConfig): OpenCodeConfig {
  const mcp: Record<string, OpenCodeMcpEntry> = {};

  if (!config.mcp?.servers) {
    return { $schema: 'https://opencode.ai/config.json', mcp };
  }

  for (const [name, serverConfig] of Object.entries(config.mcp.servers)) {
    if (!serverConfig || typeof serverConfig !== 'object') {
      continue;
    }

    const def = serverConfig as McpServerDefinition;

    // Skip disabled servers
    if (def.enabled === false) {
      continue;
    }

    // Get template for defaults
    const template = getMcpTemplate(name);

    const type = def.type ?? template?.type ?? 'stdio';

    const entry: OpenCodeMcpEntry = {
      type: type,
    };

    if (type === 'remote') {
      entry.url = def.url ?? template?.url;
      const headers = def.headers ?? template?.headers;
      if (headers) {
        // OpenCode uses {env:VAR} format instead of ${VAR}
        entry.headers = {};
        for (const [key, value] of Object.entries(headers)) {
          entry.headers[key] = value.replace(/\$\{(\w+)\}/g, '{env:$1}');
        }
      }
    } else {
      entry.command = def.command ?? template?.command;
      entry.args = def.args ?? template?.args;
      if (def.env ?? template?.env) {
        entry.env = { ...template?.env, ...def.env };
      }
    }

    mcp[name] = entry;
  }

  return { $schema: 'https://opencode.ai/config.json', mcp };
}

/**
 * Write .mcp.json file
 */
export async function writeMcpConfig(rootDir: string, config: RapidConfig): Promise<void> {
  const mcpConfig = generateMcpConfig(config);
  const configFile = config.mcp?.configFile ?? '.mcp.json';
  const configPath = isAbsolute(configFile) ? configFile : join(rootDir, configFile);

  await writeFile(configPath, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf-8');
}

/**
 * Write opencode.json file
 */
export async function writeOpenCodeConfig(rootDir: string, config: RapidConfig): Promise<void> {
  const openCodeConfig = generateOpenCodeConfig(config);
  const configPath = join(rootDir, 'opencode.json');

  await writeFile(configPath, JSON.stringify(openCodeConfig, null, 2) + '\n', 'utf-8');
}

/**
 * Check if .mcp.json exists
 */
export async function hasMcpConfig(rootDir: string, config?: RapidConfig): Promise<boolean> {
  const configFile = config?.mcp?.configFile ?? '.mcp.json';
  const configPath = isAbsolute(configFile) ? configFile : join(rootDir, configFile);

  try {
    await access(configPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read existing .mcp.json file
 */
export async function readMcpConfig(
  rootDir: string,
  config?: RapidConfig
): Promise<GeneratedMcpConfig | null> {
  const configFile = config?.mcp?.configFile ?? '.mcp.json';
  const configPath = isAbsolute(configFile) ? configFile : join(rootDir, configFile);

  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content) as GeneratedMcpConfig;
  } catch {
    return null;
  }
}

/**
 * Get the MCP config file path for environment variable
 */
export function getMcpConfigPath(rootDir: string, config?: RapidConfig): string {
  const configFile = config?.mcp?.configFile ?? '.mcp.json';
  return isAbsolute(configFile) ? configFile : join(rootDir, configFile);
}

// Re-export template functions
export {
  MCP_SERVER_TEMPLATES,
  getMcpTemplate,
  getMcpTemplateNames,
  getEasySetupTemplates,
  getRequiredSecrets,
  getSecretReferences,
  type McpServerTemplate,
} from './mcp-templates.js';
