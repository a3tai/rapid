/**
 * Built-in MCP Server Templates
 *
 * Predefined configurations for popular MCP servers that can be
 * selected during `rapid init` or added via `rapid mcp add`.
 */

/**
 * MCP server template definition
 */
export interface McpServerTemplate {
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Server type: remote HTTP or local stdio */
  type: 'remote' | 'stdio';
  /** URL for remote servers */
  url?: string;
  /** HTTP headers for remote servers (supports ${VAR} substitution) */
  headers?: Record<string, string>;
  /** Command for stdio servers */
  command?: string;
  /** Arguments for stdio command */
  args?: string[];
  /** Environment variables for stdio servers */
  env?: Record<string, string>;
  /** Required secrets (env var names) */
  requiredSecrets: string[];
  /** Hint for obtaining required secrets */
  secretHint?: string;
  /** Default 1Password reference for secrets */
  secretReferences?: Record<string, string>;
}

/**
 * Built-in MCP server templates
 */
export const MCP_SERVER_TEMPLATES: Record<string, McpServerTemplate> = {
  context7: {
    name: 'Context7',
    description: 'Documentation context for libraries and frameworks',
    type: 'remote',
    url: 'https://mcp.context7.com/mcp',
    headers: {
      'Context7-API-Key': '${CONTEXT7_API_KEY}',
    },
    requiredSecrets: ['CONTEXT7_API_KEY'],
    secretHint: 'Get your API key at https://context7.com',
    secretReferences: {
      CONTEXT7_API_KEY: 'op://Development/Context7/api-key',
    },
  },

  tavily: {
    name: 'Tavily',
    description: 'Web search and data extraction',
    type: 'remote',
    url: 'https://mcp.tavily.com/mcp',
    headers: {
      Authorization: 'Bearer ${TAVILY_API_KEY}',
    },
    requiredSecrets: ['TAVILY_API_KEY'],
    secretHint: 'Get your API key at https://tavily.com',
    secretReferences: {
      TAVILY_API_KEY: 'op://Development/Tavily/api-key',
    },
  },

  playwright: {
    name: 'Playwright',
    description: 'Browser automation and web scraping',
    type: 'stdio',
    command: 'npx',
    args: ['@playwright/mcp@latest'],
    requiredSecrets: [],
  },

  github: {
    name: 'GitHub',
    description: 'GitHub operations (PRs, issues, repos)',
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-github'],
    env: {
      GITHUB_TOKEN: '${GITHUB_TOKEN}',
    },
    requiredSecrets: ['GITHUB_TOKEN'],
    secretHint: 'Create a personal access token at https://github.com/settings/tokens',
    secretReferences: {
      GITHUB_TOKEN: 'op://Development/GitHub/pat',
    },
  },

  filesystem: {
    name: 'Filesystem',
    description: 'File system access (read/write/search)',
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-filesystem', '.'],
    requiredSecrets: [],
  },

  memory: {
    name: 'Memory',
    description: 'Persistent knowledge graph memory',
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-memory'],
    requiredSecrets: [],
  },

  postgres: {
    name: 'PostgreSQL',
    description: 'PostgreSQL database access',
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-postgres'],
    env: {
      DATABASE_URL: '${DATABASE_URL}',
    },
    requiredSecrets: ['DATABASE_URL'],
    secretHint: 'PostgreSQL connection string (e.g., postgres://user:pass@host:5432/db)',
    secretReferences: {
      DATABASE_URL: 'op://Development/PostgreSQL/connection-string',
    },
  },

  slack: {
    name: 'Slack',
    description: 'Slack messaging and channel management',
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-slack'],
    env: {
      SLACK_TOKEN: '${SLACK_TOKEN}',
    },
    requiredSecrets: ['SLACK_TOKEN'],
    secretHint: 'Create a Slack app and get a bot token at https://api.slack.com/apps',
    secretReferences: {
      SLACK_TOKEN: 'op://Development/Slack/bot-token',
    },
  },

  fetch: {
    name: 'Fetch',
    description: 'HTTP fetch for web content retrieval',
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-fetch'],
    requiredSecrets: [],
  },

  sqlite: {
    name: 'SQLite',
    description: 'SQLite database access',
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-sqlite'],
    requiredSecrets: [],
  },
};

/**
 * Get a template by name
 */
export function getMcpTemplate(name: string): McpServerTemplate | undefined {
  return MCP_SERVER_TEMPLATES[name];
}

/**
 * Get all template names
 */
export function getMcpTemplateNames(): string[] {
  return Object.keys(MCP_SERVER_TEMPLATES);
}

/**
 * Get templates that don't require secrets (easy setup)
 */
export function getEasySetupTemplates(): string[] {
  return Object.entries(MCP_SERVER_TEMPLATES)
    .filter(([, template]) => template.requiredSecrets.length === 0)
    .map(([name]) => name);
}

/**
 * Get all required secrets for a list of template names
 */
export function getRequiredSecrets(templateNames: string[]): string[] {
  const secrets = new Set<string>();
  for (const name of templateNames) {
    const template = MCP_SERVER_TEMPLATES[name];
    if (template) {
      for (const secret of template.requiredSecrets) {
        secrets.add(secret);
      }
    }
  }
  return [...secrets];
}

/**
 * Get all secret references for a list of template names
 */
export function getSecretReferences(templateNames: string[]): Record<string, string> {
  const refs: Record<string, string> = {};
  for (const name of templateNames) {
    const template = MCP_SERVER_TEMPLATES[name];
    if (template?.secretReferences) {
      Object.assign(refs, template.secretReferences);
    }
  }
  return refs;
}
