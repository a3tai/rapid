/**
 * Daemon Client
 *
 * JSON-RPC 2.0 client for communicating with the RAPID daemon.
 */

import { createConnection, type Socket } from 'node:net';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Session, CreateSessionOptions, DaemonStatus, GatewayStatus } from '@a3t/rapid-daemon';
import type { RapidConfig } from '@a3t/rapid-core';

const DEFAULT_SOCKET_PATH = join(homedir(), '.rapid', 'rapid.sock');

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id: string | number;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: string | number | null;
}

export class DaemonClient {
  private socket: Socket | null = null;
  private socketPath: string;
  private requestId = 0;
  private pendingRequests: Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  > = new Map();
  private buffer = '';

  constructor(socketPath?: string) {
    this.socketPath = socketPath || DEFAULT_SOCKET_PATH;
  }

  /**
   * Connect to the daemon
   */
  async connect(): Promise<void> {
    if (this.socket) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath, () => {
        resolve();
      });

      this.socket.on('data', (data) => {
        // Convert string to Buffer if necessary
        const buffer = typeof data === 'string' ? Buffer.from(data) : data;
        this.handleData(buffer);
      });

      this.socket.on('error', (error) => {
        if (this.pendingRequests.size === 0) {
          reject(error);
        } else {
          // Reject all pending requests
          for (const { reject } of this.pendingRequests.values()) {
            reject(error);
          }
          this.pendingRequests.clear();
        }
      });

      this.socket.on('close', () => {
        this.socket = null;
        // Reject all pending requests
        for (const { reject } of this.pendingRequests.values()) {
          reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
      });
    });
  }

  /**
   * Disconnect from the daemon
   */
  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }

  /**
   * Handle incoming data
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    // Process complete JSON messages
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const message = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (message.trim()) {
        try {
          const response: JsonRpcResponse = JSON.parse(message);
          this.handleResponse(response);
        } catch {
          // Ignore invalid JSON
        }
      }
    }
  }

  /**
   * Handle JSON-RPC response
   */
  private handleResponse(response: JsonRpcResponse): void {
    if (response.id === null) {
      return; // Notification, no pending request
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Send a JSON-RPC request
   */
  private async call<T>(method: string, params?: unknown): Promise<T> {
    if (!this.socket) {
      throw new Error('Not connected to daemon');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.socket!.write(JSON.stringify(request) + '\n');
    });
  }

  // Session management

  async createSession(options: CreateSessionOptions): Promise<Session> {
    return this.call<Session>('session.create', options);
  }

  async startSession(sessionId: string): Promise<Session> {
    return this.call<Session>('session.start', { sessionId });
  }

  async stopSession(sessionId: string): Promise<Session> {
    return this.call<Session>('session.stop', { sessionId });
  }

  async listSessions(): Promise<Session[]> {
    return this.call<Session[]>('session.list');
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.call<Session | null>('session.get', { sessionId });
  }

  // Daemon management

  async getDaemonStatus(): Promise<DaemonStatus> {
    return this.call<DaemonStatus>('daemon.status');
  }

  async shutdownDaemon(): Promise<void> {
    await this.call<void>('daemon.shutdown');
  }

  // Config

  async getConfig(projectDir: string): Promise<RapidConfig | null> {
    return this.call<RapidConfig | null>('config.get', { projectDir });
  }

  async reloadConfig(projectDir: string): Promise<RapidConfig | null> {
    return this.call<RapidConfig | null>('config.reload', { projectDir });
  }

  // Secrets

  async getSecret(key: string, projectDir: string): Promise<string | null> {
    return this.call<string | null>('secrets.get', { key, projectDir });
  }

  async refreshSecrets(projectDir: string): Promise<void> {
    await this.call<void>('secrets.refresh', { projectDir });
  }

  // Gateway

  async getGatewayStatus(): Promise<GatewayStatus> {
    return this.call<GatewayStatus>('gateway.status');
  }
}

/**
 * Create a connected daemon client
 */
export async function createDaemonClient(socketPath?: string): Promise<DaemonClient> {
  const client = new DaemonClient(socketPath);
  await client.connect();
  return client;
}

/**
 * Check if daemon is running and create a client
 */
export async function connectToDaemon(socketPath?: string): Promise<DaemonClient | null> {
  try {
    const client = new DaemonClient(socketPath);
    await client.connect();
    return client;
  } catch {
    return null;
  }
}
