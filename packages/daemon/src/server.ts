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
import { mkdir, unlink, writeFile, readFile, rm, stat, open } from 'node:fs/promises';
import { watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { Redis } from 'ioredis';
import type { RapidConfig } from '@a3t/rapid-core';
import { SessionManager } from './session-manager.js';
import { ConfigWatcher } from './config-watcher.js';
import { SecretsCache } from './secrets-cache.js';
import { LocalProvider } from './providers/local.js';
import { DevcontainerProvider } from './providers/devcontainer.js';
import { LimaProvider } from './providers/lima.js';
import { DockerProvider } from './providers/docker.js';
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
  private redis: Redis | null = null;
  private sessionManager: SessionManager;
  private configWatcher: ConfigWatcher;
  private secretsCache: SecretsCache;
  private config: DaemonConfig;
  private startTime: Date | null = null;
  private staleCleanupInterval: NodeJS.Timeout | null = null;

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
    this.sessionManager.registerProvider(new DockerProvider());
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

    // Connect to Redis event bus
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      await this.redis.connect();
      if (this.config.verbose) {
        console.log(`Connected to Redis at ${redisUrl}`);
      }
    } catch (err) {
      if (this.config.verbose) {
        console.warn(`Warning: Could not connect to Redis at ${redisUrl}: ${err}`);
      }
      this.redis = null;
    }

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

    // Start stale agent cleanup and recovery job (runs every 30 seconds)
    this.staleCleanupInterval = setInterval(() => {
      this.cleanupStaleAgents().catch((err) => {
        if (this.config.verbose) {
          console.error('Error in stale agent cleanup:', err);
        }
      });
      this.recoverOrphanedTasks().catch((err) => {
        if (this.config.verbose) {
          console.error('Error in task recovery:', err);
        }
      });
    }, 30000);

    if (this.config.verbose) {
      console.log(`Daemon started on ${this.config.socketPath}`);
      if (this.config.httpPort) {
        console.log(`HTTP server on port ${this.config.httpPort}`);
      }
    }
  }

  /**
   * Cleanup stale agents from Redis registry
   * Agents without heartbeat for 60+ seconds are checked against Docker
   * and removed if their containers are no longer running
   */
  private async cleanupStaleAgents(): Promise<void> {
    if (!this.redis) return;

    const now = Date.now();
    const staleThreshold = 120000; // 2 minutes - more forgiving for long Claude iterations

    try {
      // Get all agents from the active sorted set
      const agents = await this.redis.zrangebyscore(
        'rapid:agents:active',
        '-inf',
        '+inf',
        'WITHSCORES'
      );

      for (let i = 0; i < agents.length; i += 2) {
        const agentId = agents[i];
        const scoreStr = agents[i + 1];
        if (!agentId || !scoreStr) continue;

        const lastSeen = parseInt(scoreStr, 10);

        if (now - lastSeen > staleThreshold) {
          // Agent is stale - check if session/container is still running
          const session = this.sessionManager.getSession(agentId);

          if (session && session.state === 'running') {
            // Container still running but no heartbeat - update timestamp
            await this.redis.zadd('rapid:agents:active', String(now), agentId);
            if (this.config.verbose) {
              console.log(`[cleanup] Agent ${agentId} is stale but container running, refreshed timestamp`);
            }
          } else {
            // Container stopped or doesn't exist - clean up registry
            await this.redis.zrem('rapid:agents:active', agentId);
            await this.redis.del(`rapid:agents:${agentId}`);

            // Also clean from app-specific sorted set
            const appAgents = await this.redis.zrangebyscore('rapid:agents:app', '-inf', '+inf');
            for (const entry of appAgents) {
              try {
                const parsed = JSON.parse(entry);
                if (parsed.id === agentId) {
                  await this.redis.zrem('rapid:agents:app', entry);
                }
              } catch {
                // Skip invalid entries
              }
            }

            if (this.config.verbose) {
              console.log(`[cleanup] Removed stale agent ${agentId} from registry`);
            }
          }
        }
      }
    } catch (err) {
      if (this.config.verbose) {
        console.error('Error during stale agent cleanup:', err);
      }
    }
  }

  /**
   * Recover orphaned tasks from dead agents
   * Tasks assigned to agents that are no longer active are unassigned
   * so they can be claimed by other workers
   */
  private async recoverOrphanedTasks(): Promise<void> {
    if (!this.redis) return;

    try {
      // Get all in-progress tasks
      const taskKeys = await this.redis.keys('rapid:*:tasks');

      for (const key of taskKeys) {
        const tasks = await this.redis.hgetall(key);

        for (const [taskId, taskData] of Object.entries(tasks)) {
          try {
            const task = JSON.parse(String(taskData));

            // Only check tasks that are in_progress and assigned
            if (task.status !== 'in_progress' || !task.assignedTo) {
              continue;
            }

            // Check if the assigned agent is still active
            const agentScore = await this.redis.zscore('rapid:agents:active', task.assignedTo);
            const now = Date.now();
            const staleThreshold = 120000; // 2 minutes - more forgiving for long Claude iterations

            // Agent is dead if no score or score is too old
            const agentIsDead = !agentScore || (now - parseFloat(agentScore)) > staleThreshold;

            if (agentIsDead) {
              // Unassign the task so it can be claimed by another agent
              const updatedTask = {
                ...task,
                status: 'pending',
                assignedTo: null,
                notes: `Auto-unassigned from dead agent ${task.assignedTo} at ${new Date().toISOString()}`,
                updatedAt: new Date().toISOString(),
              };

              await this.redis.hset(key, taskId, JSON.stringify(updatedTask));

              // Publish recovery event
              await this.redis.publish('rapid:events', JSON.stringify({
                type: 'task_recovered',
                taskId,
                title: task.title,
                previousAgent: task.assignedTo,
                message: `Task unassigned from dead agent, ready for claiming`,
                timestamp: new Date().toISOString(),
              }));

              if (this.config.verbose) {
                console.log(`[recovery] Unassigned task ${taskId} from dead agent ${task.assignedTo}`);
              }
            }
          } catch {
            // Skip invalid task entries
          }
        }
      }
    } catch (err) {
      if (this.config.verbose) {
        console.error('Error during task recovery:', err);
      }
    }
  }

  /**
   * Stop the daemon server
   */
  async stop(): Promise<void> {
    // Stop stale agent cleanup
    if (this.staleCleanupInterval) {
      clearInterval(this.staleCleanupInterval);
      this.staleCleanupInterval = null;
    }

    // Stop all sessions
    await this.sessionManager.cleanup();

    // Stop config watcher
    await this.configWatcher.stop();

    // Clear secrets cache
    this.secretsCache.clearAll();

    // Disconnect from Redis
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }

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
    const url = new URL(req.url || '/', `http://localhost`);

    // Handle SSE events endpoint
    if (url.pathname === '/events' && req.method === 'GET') {
      await this.handleSSEConnection(req, res);
      return;
    }

    // Handle SSE log streaming endpoint: /logs/:agentName
    const logsMatch = url.pathname.match(/^\/logs\/([^/]+)$/);
    if (logsMatch && logsMatch[1] && req.method === 'GET') {
      await this.handleLogStream(req, res, logsMatch[1]);
      return;
    }

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

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
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(response));
    });
  }

  /**
   * Handle SSE connection for real-time event streaming
   */
  private async handleSSEConnection(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', timestamp: Date.now() })}\n\n`);

    if (!this.redis) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Redis not connected' })}\n\n`);
      return;
    }

    // Create subscriber for Redis pub/sub
    const subscriber = this.redis.duplicate();
    try {
      await subscriber.subscribe('rapid:events');

      subscriber.on('message', (_channel: string, message: string) => {
        try {
          // Forward event to SSE client
          res.write(`event: message\ndata: ${message}\n\n`);
        } catch {
          // Connection may be closed
        }
      });

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // Cleanup on connection close
      req.on('close', () => {
        clearInterval(heartbeat);
        subscriber.unsubscribe().catch(() => {});
        subscriber.quit().catch(() => {});
        if (this.config.verbose) {
          console.log('[SSE] Client disconnected');
        }
      });

      if (this.config.verbose) {
        console.log('[SSE] Client connected');
      }
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
      subscriber.quit().catch(() => {});
    }
  }

  /**
   * Handle log streaming via SSE for a specific agent
   * Streams log file updates in real-time using file watching
   */
  private async handleLogStream(
    req: IncomingMessage,
    res: ServerResponse,
    agentName: string
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Log files are in /project/.rapid/logs/ inside daemon container
    const projectDir = process.env.RAPID_PROJECT_DIR || '/project';
    const logFile = join(projectDir, '.rapid', 'logs', `agent-${agentName}.log`);

    // Send initial connection event
    res.write(
      `event: connected\ndata: ${JSON.stringify({ agentName, logFile, timestamp: Date.now() })}\n\n`
    );

    let fileOffset = 0;
    let watcher: ReturnType<typeof watch> | null = null;

    // Function to read new content from log file
    const readNewContent = async () => {
      try {
        const stats = await stat(logFile);
        if (stats.size > fileOffset) {
          // Read new content
          const fd = await open(logFile, 'r');
          const buffer = Buffer.alloc(stats.size - fileOffset);
          await fd.read(buffer, 0, buffer.length, fileOffset);
          await fd.close();

          const newContent = buffer.toString('utf-8');
          fileOffset = stats.size;

          // Split into lines and send each as an event
          const lines = newContent.split('\n').filter((line) => line.length > 0);
          for (const line of lines) {
            res.write(`event: log\ndata: ${JSON.stringify({ line, timestamp: Date.now() })}\n\n`);
          }
        }
      } catch (err) {
        // File may not exist yet - that's ok
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
        }
      }
    };

    // Initial read of existing content
    await readNewContent();

    // Watch for file changes
    try {
      const logDir = dirname(logFile);
      await mkdir(logDir, { recursive: true });

      watcher = watch(logDir, { persistent: false }, (_eventType, filename) => {
        if (filename === `agent-${agentName}.log`) {
          readNewContent().catch(() => {});
        }
      });
    } catch (err) {
      res.write(
        `event: warning\ndata: ${JSON.stringify({ warning: 'Could not watch log directory', error: String(err) })}\n\n`
      );
    }

    // Fallback polling in case watch doesn't work reliably
    const pollInterval = setInterval(() => {
      readNewContent().catch(() => {});
    }, 1000);

    // Send heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Cleanup on connection close
    req.on('close', () => {
      clearInterval(pollInterval);
      clearInterval(heartbeat);
      if (watcher) {
        watcher.close();
      }
      if (this.config.verbose) {
        console.log(`[LogStream] Client disconnected for agent ${agentName}`);
      }
    });

    if (this.config.verbose) {
      console.log(`[LogStream] Client connected for agent ${agentName}, watching ${logFile}`);
    }
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
          opts.provider = typedParams.provider as 'local' | 'devcontainer' | 'docker' | 'lima' | 'remote-ssh';
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

      case 'session.execute': {
        const sessionId = typedParams.sessionId as string;
        const command = typedParams.command as string[];
        const execOpts = typedParams.options as Record<string, unknown> | undefined;
        return this.sessionManager.execute(sessionId, command, execOpts);
      }

      // Agent spawning (combines session creation + execution)
      case 'agent.spawn': {
        const projectDir = typedParams.projectDir as string;
        const persona = typedParams.persona as string;
        const task = typedParams.task as string;
        // Note: systemPrompt is passed but agent-loop.sh handles prompting via event bus
        let yoloMode = typedParams.yoloMode as boolean | undefined;
        const model = typedParams.model as string | undefined;
        let env = (typedParams.env as Record<string, string>) || {};

        // Load secrets from project config and add to environment
        let config = this.configWatcher.getConfig(projectDir);
        if (!config) {
          // Try to load config directly if not already watched
          const configPath = join(projectDir, 'rapid.json');
          config = await this.configWatcher.watchProject(projectDir, configPath);
          if (this.config.verbose) {
            console.log(`[agent.spawn] Loaded config from ${configPath}`);
          }
        }
        if (config?.secrets) {
          try {
            const secrets = await this.secretsCache.loadSecretsForProject(projectDir, config);
            // Merge env with secrets, but non-empty env values take precedence over empty secrets
            // This ensures OAuth tokens passed from MCP server aren't overwritten by empty secrets
            const merged: Record<string, string> = {};
            // Start with non-empty secrets
            for (const [key, value] of Object.entries(secrets)) {
              if (value) merged[key] = value;
            }
            // Env values override (they're already non-empty from personas.ts filtering)
            for (const [key, value] of Object.entries(env)) {
              if (value) merged[key] = value;
            }
            env = merged;
            if (this.config.verbose) {
              const secretKeys = Object.keys(secrets).filter(k => secrets[k]);
              console.log(`[agent.spawn] Loaded ${secretKeys.length} secrets: ${secretKeys.join(', ')}`);
            }
          } catch (err) {
            if (this.config.verbose) {
              console.warn(`[agent.spawn] Failed to load secrets: ${err}`);
            }
          }
        }

        // Use yolo mode from rapid.json config if not explicitly passed
        // rapid.json: agents.available.claude.yolo = true
        if (yoloMode === undefined && config) {
          const agents = config as { agents?: { available?: { claude?: { yolo?: boolean } } } };
          yoloMode = agents.agents?.available?.claude?.yolo ?? false;
          if (this.config.verbose) {
            console.log(`[agent.spawn] Yolo mode from config: ${yoloMode}`);
          }
        }

        // Generate a session ID for pre-registration
        const preSessionId = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

        // Pre-register agent in Redis BEFORE creating container
        // This ensures the agent appears in UI immediately on spawn
        if (this.redis) {
          const agentData = {
            id: preSessionId,
            name: persona,
            status: 'starting',
            type: persona,
            registeredAt: new Date().toISOString(),
            lastHeartbeat: new Date().toISOString(),
            task: task.slice(0, 200),
          };
          await this.redis.hset(`rapid:agents:${preSessionId}`, agentData);
          await this.redis.zadd('rapid:agents:active', Date.now(), preSessionId);
          // Also add to the app-specific sorted set for bus_agents compatibility
          await this.redis.zadd(
            'rapid:agents:app',
            Date.now(),
            JSON.stringify({ id: preSessionId, name: persona, status: 'starting' })
          );
          if (this.config.verbose) {
            console.log(`[agent.spawn] Pre-registered agent ${preSessionId} in Redis`);
          }
        }

        // Create session with docker provider
        const session = await this.sessionManager.createSession({
          projectDir,
          agent: persona,
          provider: 'docker',
          env: { ...env, RAPID_PRE_SESSION_ID: preSessionId },
        });

        // Start the session (creates the container)
        await this.sessionManager.startSession(session.id);

        // Use agent-loop.sh for Ralph-style continuous operation
        // State persists in event bus, agents coordinate through orchestrator
        const worktreeName = session.env?.RAPID_WORKTREE || `agent-${session.id.slice(0, 8)}`;

        // Build agent-loop.sh command args
        // Usage: agent-loop.sh "AGENT_NAME" "WORKTREE" "INITIAL_TASK" [MODEL] [--yolo]
        const agentLoopArgs = [
          '/usr/local/bin/agent-loop.sh',
          persona,
          worktreeName,
          task,
        ];

        // Add model if specified
        // Model selection: opus (orchestrators), haiku (workers), sonnet (thinking)
        if (model) {
          agentLoopArgs.push(model);
          if (this.config.verbose) {
            console.log(`[agent.spawn] Using model '${model}' for ${persona}`);
          }
        }

        // Add yolo flag if enabled
        if (yoloMode) {
          agentLoopArgs.push('--yolo');
          if (this.config.verbose) {
            console.log(`[agent.spawn] Yolo mode enabled for ${persona}`);
          }
        } else {
          // HITL mode: permission prompts will surface in UI via output streaming
          if (this.config.verbose) {
            console.log(`[agent.spawn] HITL mode enabled for ${persona} - approvals will surface in UI`);
          }
        }

        if (this.config.verbose) {
          console.log(`[agent.spawn] Starting agent loop: ${agentLoopArgs.join(' ')}`);
        }

        // Execute the agent loop in background with TTY for interactive mode
        // Don't await - let it run asynchronously (the loop runs forever)
        // NOTE: With TTY mode, the docker exec stream ends immediately but the process keeps running
        // We do NOT stop the session when the exec "finishes" - agent-loop.sh runs continuously
        // The container will be stopped by explicit user action or shutdown handler
        this.sessionManager.execute(session.id, agentLoopArgs, {
          stdout: 'pipe',
          stderr: 'pipe',
          tty: true,  // Enable TTY for interactive/continuous operation
        }).then(() => {
          // Note: With TTY, this fires when the exec starts, not when agent-loop.sh exits
          // The actual loop continues running in the container
          if (this.config.verbose) {
            console.log(`[agent.spawn] Agent ${session.id} exec stream ended (loop continues in container)`);
          }
          // Do NOT stop the session - agent-loop.sh is still running
          // Session cleanup happens via:
          // 1. persona_stop tool call
          // 2. daemon.shutdown
          // 3. staleCleanupInterval detecting dead containers
        }).catch((err) => {
          console.error(`[agent.spawn] Agent ${session.id} exec failed:`, err);
          // Only stop session on actual exec errors (e.g., container not found)
          this.sessionManager.stopSession(session.id).catch(() => {});
        });

        return {
          sessionId: session.id,
          persona,
          task,
          model: model || 'default',
          status: 'running',
        };
      }

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

      // Agents (from Redis event bus)
      case 'agents.list': {
        if (!this.redis) {
          return { agents: [], count: 0 };
        }
        const maxAge = typedParams.maxAgeSeconds !== undefined ? (typedParams.maxAgeSeconds as number) : 300;
        const agents = await this.getAgentsFromRedis(maxAge);
        return { agents, count: agents.length };
      }

      // Tasks (from Redis)
      case 'tasks.list': {
        if (!this.redis) {
          return { tasks: [], count: 0 };
        }
        const status = typedParams.status as string | undefined;
        const tasks = await this.getTasksFromRedis(status);
        return { tasks, count: tasks.length };
      }

      // Agent logs (from container)
      case 'agent.logs': {
        const sessionId = typedParams.sessionId as string;
        const tail = typedParams.tail as number | undefined;
        const since = typedParams.since as number | undefined;
        const timestamps = typedParams.timestamps as boolean | undefined;

        if (!sessionId) {
          throw new Error('sessionId is required');
        }

        try {
          const logOptions = {
            tail: tail ?? 200,
            timestamps: timestamps ?? false,
            ...(since !== undefined && { since }),
          };
          const logs = await this.sessionManager.getSessionLogs(sessionId, logOptions);
          return { sessionId, logs };
        } catch (err) {
          return { sessionId, logs: '', error: err instanceof Error ? err.message : String(err) };
        }
      }

      // Stop agent container
      case 'agent.stop': {
        const agentId = typedParams.agentId as string;

        if (!agentId) {
          throw new Error('agentId is required');
        }

        try {
          // Try to stop the session (container)
          const result = await this.sessionManager.stopSession(agentId);

          // Also clean up from Redis registry
          if (this.redis) {
            await this.redis.zrem('rapid:agents:active', agentId);
            await this.redis.del(`rapid:agents:${agentId}`);

            // Clean from app-specific sorted set
            const appAgents = await this.redis.zrangebyscore('rapid:agents:app', '-inf', '+inf');
            for (const entry of appAgents) {
              try {
                const parsed = JSON.parse(entry);
                if (parsed.id === agentId) {
                  await this.redis.zrem('rapid:agents:app', entry);
                }
              } catch {
                // Skip invalid entries
              }
            }
          }

          if (this.config.verbose) {
            console.log(`[agent.stop] Stopped agent ${agentId}`);
          }

          return { agentId, stopped: true, result };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (this.config.verbose) {
            console.error(`[agent.stop] Failed to stop agent ${agentId}: ${errorMsg}`);
          }
          return { agentId, stopped: false, error: errorMsg };
        }
      }

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

  /**
   * Get active agents from Redis event bus
   * Agents are stored in sorted sets like rapid:agents:app, rapid:agents:cli
   * with score = timestamp and value = JSON
   */
  private async getAgentsFromRedis(maxAgeSeconds: number): Promise<Array<{
    id: string;
    name: string;
    worktree?: string;
    session?: string;
    lastSeen?: number;
  }>> {
    if (!this.redis) return [];

    try {
      // Get all agent sorted set keys
      const keys = await this.redis.keys('rapid:agents:*');
      const agents: Array<{
        id: string;
        name: string;
        worktree?: string;
        session?: string;
        lastSeen?: number;
      }> = [];

      const now = Date.now();
      // If maxAgeSeconds <= 0, get all agents (no time filter)
      const cutoff = maxAgeSeconds > 0 ? now - (maxAgeSeconds * 1000) : 0;
      const minScore = maxAgeSeconds > 0 ? String(cutoff) : '-inf';

      for (const key of keys) {
        // Get all entries from the sorted set with scores (timestamps)
        const entries = await this.redis.zrangebyscore(key, minScore, '+inf', 'WITHSCORES');

        // Entries come as [value, score, value, score, ...]
        for (let i = 0; i < entries.length; i += 2) {
          const value = entries[i];
          const score = Number(entries[i + 1]);

          if (!value) continue;

          try {
            const parsed = JSON.parse(value);
            agents.push({
              id: parsed.id || `agent-${score}`,
              name: parsed.name || 'unknown',
              worktree: parsed.worktree,
              session: parsed.session,
              lastSeen: score,
            });
          } catch {
            // Skip invalid JSON entries
          }
        }
      }

      // Sort by lastSeen descending (most recent first)
      agents.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

      return agents;
    } catch (err) {
      if (this.config.verbose) {
        console.error('Error getting agents from Redis:', err);
      }
      return [];
    }
  }

  /**
   * Get tasks from Redis
   */
  private async getTasksFromRedis(statusFilter?: string): Promise<Array<{
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    assignedTo?: string;
    createdAt: string;
    updatedAt: string;
    tags?: string[];
  }>> {
    if (!this.redis) return [];

    try {
      // Get all project task keys
      const keys = await this.redis.keys('rapid:*:tasks');
      const tasks: Array<{
        id: string;
        title: string;
        description?: string;
        status: string;
        priority: string;
        assignedTo?: string;
        createdAt: string;
        updatedAt: string;
        tags?: string[];
      }> = [];

      for (const key of keys) {
        const taskData = await this.redis.hgetall(key);
        for (const [taskId, data] of Object.entries(taskData)) {
          try {
            const parsed = JSON.parse(String(data));
            // Filter by status if specified
            if (statusFilter && parsed.status !== statusFilter) {
              continue;
            }
            tasks.push({
              id: taskId,
              title: parsed.title || 'Untitled',
              description: parsed.description,
              status: parsed.status || 'pending',
              priority: parsed.priority || 'normal',
              assignedTo: parsed.assignedTo,
              createdAt: parsed.createdAt || new Date().toISOString(),
              updatedAt: parsed.updatedAt || parsed.createdAt || new Date().toISOString(),
              tags: parsed.tags,
            });
          } catch {
            // Skip invalid entries
          }
        }
      }

      // Sort by updatedAt descending
      tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return tasks;
    } catch (err) {
      if (this.config.verbose) {
        console.error('Error getting tasks from Redis:', err);
      }
      return [];
    }
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
