/**
 * RAPID MCP Server
 *
 * Exposes RAPID sandbox and governance capabilities via Model Context Protocol.
 * Supports both stdio (for local spawned processes) and HTTP transports.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { RapidMcpServerConfig, TransportType } from './types.js';

// Import tool implementations
import { registerSecureExecTool } from './tools/secure-exec.js';
import { registerFetchViaProxyTool } from './tools/fetch.js';
import { registerGetSecretTool } from './tools/secrets.js';
import { registerFilesystemTools } from './tools/filesystem.js';
import { registerSecurityTools } from './tools/security.js';
import { registerEventBusTools } from './tools/eventbus.js';
import { registerPersonaTools } from './tools/personas.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerDependencyTools } from './tools/dependencies.js';

// Import resource implementations
import { registerConfigResource } from './resources/config.js';
import { registerContextResource } from './resources/context.js';
import { registerStatusResource } from './resources/status.js';

// Import prompt implementations
import { registerMethodologyPrompt } from './prompts/rapid-methodology.js';

/**
 * Server context passed to tool handlers
 */
export interface ServerContext {
  config: RapidMcpServerConfig;
  projectDir: string;
  verbose: boolean;
}

/**
 * Create and configure the RAPID MCP server
 */
export function createRapidMcpServer(config: RapidMcpServerConfig): McpServer {
  const server = new McpServer({
    name: config.name || 'rapid-mcp',
    version: config.version || '1.0.0',
  });

  const context: ServerContext = {
    config,
    projectDir: config.projectDir,
    verbose: config.verbose ?? false,
  };

  // Register tools
  registerSecureExecTool(server, context);
  registerFetchViaProxyTool(server, context);
  registerGetSecretTool(server, context);
  registerFilesystemTools(server, context);
  registerSecurityTools(server, context);
  registerEventBusTools(server, context);
  registerPersonaTools(server, context);
  registerTaskTools(server, context);
  registerDependencyTools(server, context);

  // Register resources
  registerConfigResource(server, context);
  registerContextResource(server, context);
  registerStatusResource(server, context);

  // Register prompts
  registerMethodologyPrompt(server, context);

  return server;
}

/**
 * Start the MCP server with the specified transport
 */
export async function startRapidMcpServer(
  config: RapidMcpServerConfig,
  transport: TransportType = 'stdio'
): Promise<McpServer> {
  const server = createRapidMcpServer(config);

  if (transport === 'stdio') {
    await runStdio(server);
  } else {
    // HTTP transport requires Express setup - see bin.ts for full implementation
    throw new Error('HTTP transport should be started via bin.ts with Express');
  }

  return server;
}

/**
 * Run the server with stdio transport
 */
export async function runStdio(server: McpServer): Promise<void> {
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}

/**
 * Run the server with HTTP transport on the specified port
 */
export async function runHttp(server: McpServer, port: number = 3100): Promise<void> {
  const { default: express, json } = await import('express');
  const { StreamableHTTPServerTransport } =
    await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const { randomUUID } = await import('node:crypto');

  const app = express();
  app.use(json());

  // Create HTTP transport for MCP
  const httpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  // Connect the server to the transport
  await server.connect(httpTransport as unknown as Transport);

  // Mount at /mcp - handle both GET (SSE) and POST (JSON-RPC)
  app.all('/mcp', async (req, res) => {
    await httpTransport.handleRequest(req, res, req.body);
  });

  // Start listening
  app.listen(port);
}

/**
 * Re-export types for consumers
 */
export { McpServer };
export type { RapidMcpServerConfig, TransportType };
