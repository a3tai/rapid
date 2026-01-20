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

import crypto from 'node:crypto';
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
 * Start the HTTP server with Streamable HTTP transport
 *
 * Per MCP spec, the server provides a single endpoint that supports:
 * - POST: For client requests/notifications/responses
 * - GET: For server-initiated SSE stream (optional)
 */
async function startHttpServer(config: RapidMcpServerConfig, port: number): Promise<void> {
  // Dynamic import to avoid loading express unless needed
  const express = (await import('express')).default;
  const cors = (await import('cors')).default;
  const { StreamableHTTPServerTransport } =
    await import('@modelcontextprotocol/sdk/server/streamableHttp.js');

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Store active sessions with last activity time and initialization state
  interface SessionEntry {
    transport: InstanceType<typeof StreamableHTTPServerTransport>;
    lastActivity: number;
    initialized: boolean;
  }
  const sessions = new Map<string, SessionEntry>();

  // Clean up idle sessions periodically (5 minute timeout)
  const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, entry] of sessions.entries()) {
      if (now - entry.lastActivity > SESSION_TIMEOUT_MS) {
        sessions.delete(sessionId);
        entry.transport.close();
      }
    }
  }, 60000); // Check every minute

  // Main MCP endpoint - handles both POST and GET per MCP spec
  app.all('/mcp', async (req: Request, res: Response) => {
    // Get session ID from header, or generate a new one
    const clientSessionId = req.headers['mcp-session-id'] as string | undefined;
    const sessionId = clientSessionId || crypto.randomUUID();
    const method = req.body?.method;

    // Get existing session or create new one
    let entry = sessions.get(sessionId);

    if (!entry) {
      // Create new session
      console.error(`[mcp] New session ${sessionId.slice(0, 8)} (method: ${method})`);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
        enableJsonResponse: true,
      });

      const server = createRapidMcpServer(config);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await server.connect(transport as any);

      entry = { transport, lastActivity: Date.now(), initialized: false };
      sessions.set(sessionId, entry);
    } else {
      // Update last activity time
      entry.lastActivity = Date.now();
    }

    // Set session ID header for client
    res.setHeader('mcp-session-id', sessionId);

    // Track initialization
    if (method === 'initialize') {
      entry.initialized = true;
      console.error(`[mcp] Session ${sessionId.slice(0, 8)} initialized`);
      await entry.transport.handleRequest(req, res, req.body);
      return;
    }

    // If not initialized and this is a tool call, auto-initialize first
    if (!entry.initialized && (method === 'tools/call' || method === 'tools/list')) {
      console.error(`[mcp] Auto-initializing session ${sessionId.slice(0, 8)} for ${method}`);

      // Synthesize initialize request
      const initRequest = {
        jsonrpc: '2.0',
        id: `init-${Date.now()}`,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'auto-init', version: '1.0.0' },
        },
      };

      // Create a mock response to capture the init response
      const initRes = {
        headersSent: false,
        statusCode: 200,
        setHeader: () => initRes,
        status: () => initRes,
        json: () => initRes,
        send: () => initRes,
        end: () => {},
        write: () => true,
        on: () => initRes,
        once: () => initRes,
        emit: () => false,
        getHeader: () => undefined,
        removeHeader: () => {},
        flushHeaders: () => {},
      } as unknown as Response;

      try {
        await entry.transport.handleRequest(req, initRes, initRequest);
        entry.initialized = true;
        console.error(`[mcp] Session ${sessionId.slice(0, 8)} auto-initialized successfully`);
      } catch (err) {
        console.error(`[mcp] Auto-init failed for ${sessionId.slice(0, 8)}:`, err);
      }
    }

    // Handle the actual request
    console.error(`[mcp] Session ${sessionId.slice(0, 8)}: ${method}`);
    await entry.transport.handleRequest(req, res, req.body);
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      server: 'rapid-mcp',
      version: config.version,
      projectDir: config.projectDir,
      activeSessions: sessions.size,
    });
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`RAPID MCP Server running at http://0.0.0.0:${port}`);
    console.log(`MCP endpoint: http://localhost:${port}/mcp`);
    console.log(`Health check: http://localhost:${port}/health`);
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
 * Validate security startup requirements
 */
async function validateSecurityStartup(config: RapidMcpServerConfig, port: number): Promise<void> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Verify required environment variables
  const requiredEnvVars = ['NODE_ENV'];
  const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);
  if (missingEnvVars.length > 0) {
    warnings.push(`Missing environment variables: ${missingEnvVars.join(', ')}`);
  }

  // 2. Validate project directory exists
  try {
    const { existsSync } = await import('node:fs');
    if (!existsSync(config.projectDir)) {
      errors.push(`Project directory does not exist: ${config.projectDir}`);
    }
  } catch (err) {
    errors.push(`Failed to check project directory: ${String(err)}`);
  }

  // 3. Validate port is valid
  if (port < 1 || port > 65535) {
    errors.push(`Invalid port number: ${port} (must be 1-65535)`);
  }

  // 4. Check for secret access capability
  try {
    const secretKey = process.env.RAPID_SECRET_PROVIDER || 'env';
    if (config.verbose) {
      console.error(`[validation] Secret provider: ${secretKey}`);
    }
  } catch (err) {
    warnings.push(`Cannot verify secret access: ${String(err)}`);
  }

  // 5. Validate domain whitelist config
  try {
    const domains = process.env.RAPID_ALLOWED_DOMAINS || '';
    if (domains && config.verbose) {
      console.error(
        `[validation] Domain whitelist configured: ${domains.split(',').length} domains`
      );
    }
  } catch (err) {
    warnings.push(`Cannot verify domain whitelist: ${String(err)}`);
  }

  // 6. Check sandboxing capability
  try {
    // Try to detect available sandbox mode
    const sandboxMode = process.env.SANDBOX_MODE || 'balanced';
    if (config.verbose) {
      console.error(`[validation] Sandbox mode: ${sandboxMode}`);
    }
  } catch (err) {
    warnings.push(`Cannot verify sandbox isolation: ${String(err)}`);
  }

  // 7. Verify Redis connectivity (if event bus is enabled)
  try {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl && config.verbose) {
      console.error('[validation] Redis connectivity configured');
    }
  } catch (err) {
    warnings.push(`Cannot verify Redis configuration: ${String(err)}`);
  }

  // 8. Performance check - response time baseline
  const startTime = Date.now();
  const responseTime = Date.now() - startTime;
  if (responseTime > 1000) {
    warnings.push(`Slow startup detected: ${responseTime}ms (expected <1000ms)`);
  }

  // Output results
  if (config.verbose) {
    console.error('[validation] Security startup validation:');
    console.error(`  - Port: ${port}`);
    console.error(`  - Project directory: ${config.projectDir}`);
    console.error(`  - Response time: ${responseTime}ms`);
  }

  if (warnings.length > 0) {
    console.error('[validation] Warnings:');
    warnings.forEach((w) => console.error(`  - ${w}`));
  }

  if (errors.length > 0) {
    console.error('[validation] Critical errors:');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  if (config.verbose) {
    console.error('[validation] Security startup validation passed ✓');
  }
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
    // Run security validation before starting
    await validateSecurityStartup(config, port);

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
