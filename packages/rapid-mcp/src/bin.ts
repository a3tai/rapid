#!/usr/bin/env node
/**
 * RAPID MCP Server CLI
 *
 * Standalone entry point for running the RAPID MCP server.
 * Supports both stdio (default) and HTTP transports.
 *
 * Usage:
 *   rapid-mcp                          # stdio transport (for spawned processes)
 *   rapid-mcp --http --port 3000       # HTTP transport
 *   rapid-mcp --project /path/to/dir   # Specify project directory
 */

import { createRapidMcpServer, type RapidMcpServerConfig } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Request, Response } from 'express';

/**
 * Parse command line arguments
 */
function parseArgs(): {
  transport: 'stdio' | 'http';
  port: number;
  projectDir: string;
  verbose: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);
  let transport: 'stdio' | 'http' = 'stdio';
  let port = 3000;
  let projectDir = process.cwd();
  let verbose = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--http':
        transport = 'http';
        break;
      case '--port': {
        const nextArg = args[++i];
        if (nextArg) {
          port = parseInt(nextArg, 10);
        }
        break;
      }
      case '--project':
      case '-p': {
        const nextArg = args[++i];
        if (nextArg) {
          projectDir = nextArg;
        }
        break;
      }
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      case '--help':
      case '-h':
        help = true;
        break;
    }
  }

  return { transport, port, projectDir, verbose, help };
}

/**
 * Print usage information
 */
function printHelp(): void {
  console.log(`
RAPID MCP Server

Usage:
  rapid-mcp [options]

Options:
  --http              Use HTTP transport instead of stdio
  --port <port>       HTTP port (default: 3000)
  --project, -p       Project directory (default: current directory)
  --verbose, -v       Enable verbose logging
  --help, -h          Show this help message

Examples:
  rapid-mcp                              # Start with stdio (for agent spawning)
  rapid-mcp --http --port 8080           # Start HTTP server on port 8080
  rapid-mcp -p /path/to/project -v       # Specify project with verbose output

Tools provided:
  - secure_exec       Sandboxed command execution
  - fetch_via_proxy   Network fetch with domain filtering
  - get_secret        Secrets retrieval
  - read_file         Read project files
  - write_file        Write project files
  - list_files        List directory contents
  - check_security    Security scanning

Resources provided:
  - rapid://config/current      Project configuration
  - rapid://context/assembled   Combined instruction context
  - rapid://status/daemon       Daemon status
  - rapid://status/sandbox      Sandbox capabilities
  - rapid://status/project      Project file status

Prompts provided:
  - rapid-methodology   RAPID development methodology guide
  - rapid-quick-ref     Quick reference card
`);
}

/**
 * Start the HTTP server
 */
async function startHttpServer(config: RapidMcpServerConfig, port: number): Promise<void> {
  // Dynamic import to avoid loading express unless needed
  const express = (await import('express')).default;
  const { StreamableHTTPServerTransport } =
    await import('@modelcontextprotocol/sdk/server/streamableHttp.js');

  const server = createRapidMcpServer(config);
  const app = express();
  app.use(express.json());

  app.post('/mcp', async (req: Request, res: Response) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      enableJsonResponse: true,
    });
    res.on('close', () => transport.close());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await server.connect(transport as any);
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      server: 'rapid-mcp',
      version: config.version,
      projectDir: config.projectDir,
    });
  });

  app.listen(port, () => {
    console.log(`RAPID MCP Server running at http://localhost:${port}/mcp`);
    console.log(`Health check at http://localhost:${port}/health`);
    console.log(`Project directory: ${config.projectDir}`);
  });
}

/**
 * Start the stdio server
 */
async function startStdioServer(config: RapidMcpServerConfig): Promise<void> {
  const server = createRapidMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (config.verbose) {
    console.error('[rapid-mcp] Server started with stdio transport');
    console.error(`[rapid-mcp] Project directory: ${config.projectDir}`);
  }

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    if (config.verbose) {
      console.error('[rapid-mcp] Shutting down...');
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    if (config.verbose) {
      console.error('[rapid-mcp] Shutting down...');
    }
    process.exit(0);
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { transport, port, projectDir, verbose, help } = parseArgs();

  if (help) {
    printHelp();
    process.exit(0);
  }

  const config: RapidMcpServerConfig = {
    name: 'rapid-mcp',
    version: '0.1.0',
    projectDir,
    verbose,
  };

  try {
    if (transport === 'http') {
      await startHttpServer(config, port);
    } else {
      await startStdioServer(config);
    }
  } catch (error) {
    console.error('Failed to start RAPID MCP server:', error);
    process.exit(1);
  }
}

main();
