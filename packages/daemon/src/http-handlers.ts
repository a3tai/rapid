/**
 * HTTP Handlers for Daemon
 *
 * Handles HTTP endpoints including SSE streaming, log streaming,
 * and dependency graph visualization.
 *
 * Log streaming now reads from Redis Streams where agents write their output,
 * instead of watching non-existent log files.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Redis } from 'ioredis';
import type { DaemonConfig, JsonRpcResponse } from './types.js';

/**
 * Context required for HTTP handlers
 */
export interface HttpContext {
  redis: Redis | null;
  config: DaemonConfig;
  handleMessage: (message: string) => Promise<JsonRpcResponse>;
}

/**
 * Handle HTTP request routing
 */
export async function handleHttpRequest(
  ctx: HttpContext,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost`);

  // Handle SSE events endpoint
  if (url.pathname === '/events' && req.method === 'GET') {
    await handleSSEConnection(ctx, req, res);
    return;
  }

  // Handle SSE log streaming endpoint: /logs/:agentName
  const logsMatch = url.pathname.match(/^\/logs\/([^/]+)$/);
  if (logsMatch && logsMatch[1] && req.method === 'GET') {
    await handleLogStream(ctx, req, res, logsMatch[1]);
    return;
  }

  // Handle SSE agent stream endpoint: /agents/stream/:agentId (alias for /logs)
  const agentStreamMatch = url.pathname.match(/^\/agents\/stream\/([^/]+)$/);
  if (agentStreamMatch && agentStreamMatch[1] && req.method === 'GET') {
    await handleLogStream(ctx, req, res, agentStreamMatch[1]);
    return;
  }

  // Handle task dependency graph endpoint: /api/dependencies
  if (url.pathname === '/api/dependencies' && req.method === 'GET') {
    await handleDependencyGraph(req, res);
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
    const response = await ctx.handleMessage(body);
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
async function handleSSEConnection(
  ctx: HttpContext,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', timestamp: Date.now() })}\n\n`);

  if (!ctx.redis) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Redis not connected' })}\n\n`);
    return;
  }

  // Create subscriber for Redis pub/sub
  const subscriber = ctx.redis.duplicate();
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
      if (ctx.config.verbose) {
        console.log('[SSE] Client disconnected');
      }
    });

    if (ctx.config.verbose) {
      console.log('[SSE] Client connected');
    }
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
    subscriber.quit().catch(() => {});
  }
}

/**
 * Handle log streaming via SSE for a specific agent
 * Reads from Redis Streams where LogBuffer writes agent output
 *
 * Redis key format: rapid:logs:{projectId}:{agentId}
 * Pub/sub channel: rapid:logs:{projectId}:{agentId}:stream
 */
async function handleLogStream(
  ctx: HttpContext,
  req: IncomingMessage,
  res: ServerResponse,
  agentIdOrName: string
): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  if (!ctx.redis) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Redis not connected' })}\n\n`);
    res.end();
    return;
  }

  // Send initial connection event
  res.write(
    `event: connected\ndata: ${JSON.stringify({ agentId: agentIdOrName, timestamp: Date.now() })}\n\n`
  );

  // Find the log stream key - try to match by agentId
  // LogBuffer uses key format: rapid:logs:{projectId}:{agentId}
  let streamKey: string | null = null;
  let pubsubChannel: string | null = null;

  try {
    // Search for matching log streams
    const keys = await ctx.redis.keys(`rapid:logs:*:${agentIdOrName}`);
    if (keys.length > 0) {
      streamKey = keys[0];
      pubsubChannel = `${streamKey}:stream`;
    } else {
      // Try partial match (agentId might be a UUID)
      const allKeys = await ctx.redis.keys('rapid:logs:*');
      // Filter to only log stream keys (not meta or stream channel keys)
      const logStreamKeys = allKeys.filter(k => !k.endsWith(':meta') && !k.endsWith(':stream'));
      for (const key of logStreamKeys) {
        if (key.includes(agentIdOrName)) {
          streamKey = key;
          pubsubChannel = `${key}:stream`;
          break;
        }
      }
    }
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: `Failed to find log stream: ${err}` })}\n\n`);
  }

  if (!streamKey) {
    res.write(`event: info\ndata: ${JSON.stringify({ message: 'No logs found yet for this agent', agentId: agentIdOrName })}\n\n`);
  } else if (ctx.config.verbose) {
    console.log(`[LogStream] Found stream key: ${streamKey}`);
  }

  // Read existing logs from Redis Stream
  if (streamKey) {
    try {
      const entries = await ctx.redis.xrange(streamKey, '-', '+', 'COUNT', '100');
      for (const [_id, fields] of entries) {
        // Parse fields array into object
        const data: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1];
        }
        const line = data.text || '';
        res.write(`event: log\ndata: ${JSON.stringify({ line, timestamp: data.timestamp || Date.now() })}\n\n`);
      }
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: `Failed to read logs: ${err}` })}\n\n`);
    }
  }

  // Subscribe to real-time updates via Redis pub/sub
  let subscriber: ReturnType<typeof ctx.redis.duplicate> | null = null;

  if (pubsubChannel && ctx.redis) {
    try {
      subscriber = ctx.redis.duplicate();
      await subscriber.subscribe(pubsubChannel);

      subscriber.on('message', (_channel: string, message: string) => {
        try {
          const entry = JSON.parse(message);
          const line = entry.text || '';
          res.write(`event: log\ndata: ${JSON.stringify({ line, timestamp: entry.timestamp || Date.now() })}\n\n`);
        } catch {
          // If not JSON, send as-is
          res.write(`event: log\ndata: ${JSON.stringify({ line: message, timestamp: Date.now() })}\n\n`);
        }
      });
    } catch (err) {
      res.write(`event: warning\ndata: ${JSON.stringify({ warning: 'Could not subscribe to real-time updates', error: String(err) })}\n\n`);
    }
  }

  // Fallback polling for new entries if we have a stream key
  let lastId = '$';
  const pollInterval = setInterval(async () => {
    if (!streamKey || !ctx.redis) return;

    try {
      const result = await ctx.redis.xread('COUNT', '50', 'BLOCK', '0', 'STREAMS', streamKey, lastId);
      if (result) {
        for (const [, entries] of result) {
          for (const [id, fields] of entries) {
            lastId = id;
            const data: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) {
              data[fields[i]] = fields[i + 1];
            }
            const line = data.text || '';
            res.write(`event: log\ndata: ${JSON.stringify({ line, timestamp: data.timestamp || Date.now() })}\n\n`);
          }
        }
      }
    } catch {
      // Ignore polling errors
    }
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
    if (subscriber) {
      subscriber.unsubscribe().catch(() => {});
      subscriber.quit().catch(() => {});
    }
    if (ctx.config.verbose) {
      console.log(`[LogStream] Client disconnected for agent ${agentIdOrName}`);
    }
  });

  if (ctx.config.verbose) {
    console.log(`[LogStream] Client connected for agent ${agentIdOrName}, stream: ${streamKey || 'not found'}`);
  }
}

/**
 * Handle task dependency graph visualization endpoint
 * Returns nodes and edges for visualizing task dependencies
 */
async function handleDependencyGraph(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url || '/', `http://localhost`);
    const status = url.searchParams.get('status') || 'all';

    // Call task_execution_order tool to get dependency data
    const isDocker = process.env.DOCKER_ENV === 'true' || process.env.HOSTNAME?.includes('rapid');
    const mcpUrl = process.env.MCP_URL || (isDocker ? 'http://rapid-mcp:3100/mcp' : 'http://localhost:3100/mcp');

    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'task_execution_order',
          arguments: { includeCompleted: false },
        },
      }),
    });

    const result = await response.json() as {
      result?: { structuredContent?: { order?: Array<{ taskId: string; title: string; status: string; dependsOn: string[] }> } };
    };

    const tasks = result.result?.structuredContent?.order || [];

    // Build nodes and edges for visualization
    const nodes = tasks.map((task) => ({
      id: task.taskId,
      label: task.title,
      status: task.status,
    }));

    const edges: Array<{ source: string; target: string }> = [];
    for (const task of tasks) {
      for (const dep of task.dependsOn || []) {
        edges.push({ source: dep, target: task.taskId });
      }
    }

    // Filter by status if needed
    let filteredNodes = nodes;
    let filteredEdges = edges;

    if (status !== 'all') {
      const validIds = new Set(nodes.filter((n) => n.status === status).map((n) => n.id));
      filteredNodes = nodes.filter((n) => validIds.has(n.id));
      filteredEdges = edges.filter((e) => validIds.has(e.source) && validIds.has(e.target));
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });

    const graph = {
      nodes: filteredNodes,
      edges: filteredEdges,
      stats: {
        totalTasks: tasks.length,
        nodeCount: filteredNodes.length,
        edgeCount: filteredEdges.length,
      },
    };

    res.end(JSON.stringify(graph));
  } catch (err) {
    res.writeHead(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
}
