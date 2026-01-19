/**
 * Daemon Server
 *
 * Unix socket and HTTP server for RAPID daemon communication.
 * Uses JSON-RPC 2.0 for IPC communication.
 */

import { createServer as createNetServer, Socket, type Server as NetServer } from 'node:net';
import {
  createServer as createHttpServer,
  type Server as HttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { mkdir, unlink, writeFile, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { RapidConfig } from '@a3t/rapid-core';
import { SessionManager } from './session-manager.js';
import { ConfigWatcher } from './config-watcher.js';
import { SecretsCache } from './secrets-cache.js';
import { LocalProvider } from './providers/local.js';
import { DevcontainerProvider } from './providers/devcontainer.js';
import { LimaProvider } from './providers/lima.js';
import type {
  DaemonConfig,
  DaemonStatus,
  GatewayStatus,
  JsonRpcRequest,
  JsonRpcResponse,
  CreateSessionOptions,
} from './types.js';
import { DEFAULT_DAEMON_PATHS, DEFAULT_SECRETS_TTL } from './types.js';

const VERSION = '0.1.0';

export class DaemonServer {
  private socketServer: NetServer | null = null;
  private httpServer: HttpServer | null = null;
  private sessionManager: SessionManager;
  private configWatcher: ConfigWatcher;
  private secretsCache: SecretsCache;
  private config: DaemonConfig;
  private startTime: Date | null = null;

  constructor(config?: Partial<DaemonConfig>) {
    const daemonConfig: DaemonConfig = {
      socketPath: this.expandPath(config?.socketPath || DEFAULT_DAEMON_PATHS.socketPath),
      pidFile: this.expandPath(config?.pidFile || DEFAULT_DAEMON_PATHS.pidFile),
      cacheDir: this.expandPath(config?.cacheDir || DEFAULT_DAEMON_PATHS.cacheDir),
      secretsTtl: config?.secretsTtl ?? DEFAULT_SECRETS_TTL,
      verbose: config?.verbose ?? false,
    };
    if (config?.logFile) {
      daemonConfig.logFile = this.expandPath(config.logFile);
    }
    if (config?.httpPort !== undefined) {
      daemonConfig.httpPort = config.httpPort;
    }
    this.config = daemonConfig;

    this.sessionManager = new SessionManager();
    this.configWatcher = new ConfigWatcher({
      onConfigChange: this.handleConfigChange.bind(this),
    });
    this.secretsCache = new SecretsCache({
      ttl: this.config.secretsTtl,
    });

    this.registerProviders();
  }

  /**
   * Register environment providers
   */
  private registerProviders(): void {
    this.sessionManager.registerProvider(new LocalProvider());
    this.sessionManager.registerProvider(new DevcontainerProvider());
    this.sessionManager.registerProvider(new LimaProvider());
  }

  /**
   * Start the daemon server
   */
  async start(): Promise<void> {
    if (this.socketServer) {
      throw new Error('Daemon already running');
    }

    // Create directories
    await mkdir(dirname(this.config.socketPath), { recursive: true });
    await mkdir(this.config.cacheDir, { recursive: true });

    // Remove stale socket file
    try {
      await unlink(this.config.socketPath);
    } catch {
      // File may not exist
    }

    // Create Unix socket server
    this.socketServer = createNetServer((socket) => {
      this.handleConnection(socket);
    });

    await new Promise<void>((resolve, reject) => {
      this.socketServer!.listen(this.config.socketPath, () => resolve());
      this.socketServer!.once('error', reject);
    });

    // Create HTTP server if port specified
    if (this.config.httpPort) {
      this.httpServer = createHttpServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      await new Promise<void>((resolve, reject) => {
        this.httpServer!.listen(this.config.httpPort, () => resolve());
        this.httpServer!.once('error', reject);
      });
    }

    // Write PID file
    await writeFile(this.config.pidFile, process.pid.toString());

    // Start config watcher
    await this.configWatcher.start();

    this.startTime = new Date();

    if (this.config.verbose) {
      console.log(`Daemon started on ${this.config.socketPath}`);
      if (this.config.httpPort) {
        console.log(`HTTP server on port ${this.config.httpPort}`);
      }
    }
  }

  /**
   * Stop the daemon server
   */
  async stop(): Promise<void> {
    // Stop all sessions
    await this.sessionManager.cleanup();

    // Stop config watcher
    await this.configWatcher.stop();

    // Clear secrets cache
    this.secretsCache.clearAll();

    // Close servers
    if (this.socketServer) {
      await new Promise<void>((resolve) => {
        this.socketServer!.close(() => resolve());
      });
      this.socketServer = null;
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    // Remove socket file
    try {
      await unlink(this.config.socketPath);
    } catch {
      // File may not exist
    }

    // Remove PID file
    try {
      await rm(this.config.pidFile);
    } catch {
      // File may not exist
    }

    this.startTime = null;

    if (this.config.verbose) {
      console.log('Daemon stopped');
    }
  }

  /**
   * Handle a socket connection
   */
  private handleConnection(socket: Socket): void {
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();

      // Process complete JSON messages
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const message = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (message.trim()) {
          const response = await this.handleMessage(message);
          socket.write(JSON.stringify(response) + '\n');
        }
      }
    });

    socket.on('error', (error) => {
      if (this.config.verbose) {
        console.error('Socket error:', error);
      }
    });
  }

  /**
   * Handle HTTP request
   */
  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', async () => {
      const response = await this.handleMessage(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    });
  }

  /**
   * Handle a JSON-RPC message
   */
  private async handleMessage(message: string): Promise<JsonRpcResponse> {
    let request: JsonRpcRequest;

    try {
      request = JSON.parse(message);
    } catch {
      return this.errorResponse(null, -32700, 'Parse error');
    }

    if (request.jsonrpc !== '2.0' || !request.method) {
      return this.errorResponse(request.id ?? null, -32600, 'Invalid Request');
    }

    try {
      const result = await this.executeMethod(request.method, request.params);
      return {
        jsonrpc: '2.0',
        result,
        id: request.id ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.errorResponse(request.id ?? null, -32603, message);
    }
  }

  /**
   * Execute an RPC method
   */
  private async executeMethod(method: string, params: unknown): Promise<unknown> {
    const typedParams = params as Record<string, unknown>;

    switch (method) {
      // Session management
      case 'session.create': {
        const opts: CreateSessionOptions = {
          projectDir: typedParams.projectDir as string,
          agent: typedParams.agent as string,
        };
        if (typeof typedParams.provider === 'string') {
          opts.provider = typedParams.provider as 'local' | 'devcontainer' | 'lima' | 'remote-ssh';
        }
        if (typedParams.env && typeof typedParams.env === 'object') {
          opts.env = typedParams.env as Record<string, string>;
        }
        return this.sessionManager.createSession(opts);
      }

      case 'session.start':
        return this.sessionManager.startSession(typedParams.sessionId as string);

      case 'session.stop':
        return this.sessionManager.stopSession(typedParams.sessionId as string);

      case 'session.list':
        return this.sessionManager.listSessions();

      case 'session.get':
        return this.sessionManager.getSession(typedParams.sessionId as string) || null;

      // Daemon management
      case 'daemon.status':
        return this.getStatus();

      case 'daemon.shutdown':
        // Schedule shutdown after response is sent
        setTimeout(() => this.stop(), 100);
        return { message: 'Shutdown initiated' };

      // Config
      case 'config.get':
        return this.configWatcher.getConfig(typedParams.projectDir as string);

      case 'config.reload':
        return this.configWatcher.reloadConfig(typedParams.projectDir as string);

      // Secrets
      case 'secrets.get':
        return this.secretsCache.get(typedParams.key as string, typedParams.projectDir as string);

      case 'secrets.refresh':
        await this.secretsCache.refresh(typedParams.projectDir as string);
        return { success: true };

      // Gateway (placeholder for now)
      case 'gateway.status':
        return this.getGatewayStatus();

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  /**
   * Get daemon status
   */
  private getStatus(): DaemonStatus {
    const status: DaemonStatus = {
      running: this.socketServer !== null,
      pid: process.pid,
      socketPath: this.config.socketPath,
      version: VERSION,
      sessions: this.sessionManager.count,
      gatewayStatus: this.getGatewayStatus(),
    };

    if (this.startTime) {
      status.uptime = Date.now() - this.startTime.getTime();
    }

    return status;
  }

  /**
   * Get gateway status (placeholder)
   */
  private getGatewayStatus(): GatewayStatus {
    return {
      enabled: false,
      healthy: false,
    };
  }

  /**
   * Create an error response
   */
  private errorResponse(
    id: string | number | null,
    code: number,
    message: string
  ): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      error: { code, message },
      id,
    };
  }

  /**
   * Handle config change event
   */
  private handleConfigChange(projectDir: string, config: RapidConfig | null): void {
    if (this.config.verbose) {
      console.log(`Config changed: ${projectDir}`);
    }

    // Refresh secrets for the project if config is available
    if (config) {
      this.secretsCache.loadSecretsForProject(projectDir, config).catch((error) => {
        console.error('Failed to refresh secrets:', error);
      });
    }
  }

  /**
   * Expand ~ in paths
   */
  private expandPath(path: string): string {
    if (path.startsWith('~')) {
      return join(homedir(), path.slice(1));
    }
    return path;
  }

  /**
   * Check if daemon is running
   */
  get isRunning(): boolean {
    return this.socketServer !== null;
  }
}

/**
 * Check if a daemon is already running
 */
export async function isDaemonRunning(socketPath?: string): Promise<boolean> {
  const path = socketPath || join(homedir(), '.rapid', 'rapid.sock');

  return new Promise((resolve) => {
    const socket = new Socket();

    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(path);
  });
}

/**
 * Get daemon PID from PID file
 */
export async function getDaemonPid(pidFile?: string): Promise<number | null> {
  const path = pidFile || join(homedir(), '.rapid', 'rapid.pid');

  try {
    const content = await readFile(path, 'utf-8');
    return parseInt(content.trim(), 10);
  } catch {
    return null;
  }
}
