/**
 * Session Manager
 *
 * Manages AI agent session lifecycle, state, and attach/detach operations.
 */

import { randomUUID } from 'node:crypto';
import type {
  Session,
  SessionState,
  CreateSessionOptions,
  EnvironmentProvider,
  EnvironmentHandle,
  DaemonEvent,
  EventListener,
  ExecuteOptions,
  ExecuteResult,
} from './types.js';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private handles: Map<string, EnvironmentHandle> = new Map();
  private providers: Map<string, EnvironmentProvider> = new Map();
  private eventListeners: Set<EventListener> = new Set();

  /**
   * Register an environment provider
   */
  registerProvider(provider: EnvironmentProvider): void {
    this.providers.set(provider.type, provider);
  }

  /**
   * Get a registered provider
   */
  getProvider(type: string): EnvironmentProvider | undefined {
    return this.providers.get(type);
  }

  /**
   * Add an event listener
   */
  addEventListener(listener: EventListener): void {
    this.eventListeners.add(listener);
  }

  /**
   * Remove an event listener
   */
  removeEventListener(listener: EventListener): void {
    this.eventListeners.delete(listener);
  }

  /**
   * Emit an event
   */
  private emit(event: DaemonEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    }
  }

  /**
   * Create a new session
   */
  async createSession(options: CreateSessionOptions): Promise<Session> {
    const id = randomUUID();
    const name = options.name || `session-${id.slice(0, 8)}`;
    const provider = options.provider || 'local';

    const session: Session = {
      id,
      name,
      projectDir: options.projectDir,
      provider,
      agent: options.agent,
      state: 'created',
      createdAt: new Date(),
    };
    if (options.config) {
      session.config = options.config;
    }
    if (options.sandboxConfig) {
      session.sandboxConfig = options.sandboxConfig;
    }
    if (options.env) {
      session.env = options.env;
    }

    this.sessions.set(id, session);

    this.emit({
      type: 'session.created',
      timestamp: new Date(),
      sessionId: id,
      data: { session },
    });

    return session;
  }

  /**
   * Start a session
   */
  async startSession(sessionId: string): Promise<Session> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.state === 'running') {
      return session;
    }

    const provider = this.providers.get(session.provider);
    if (!provider) {
      throw new Error(`Provider not found: ${session.provider}`);
    }

    if (!(await provider.isAvailable())) {
      throw new Error(`Provider not available: ${session.provider}`);
    }

    // Update state
    session.state = 'initializing';
    session.startedAt = new Date();

    try {
      // Create environment
      const handle = await provider.createEnvironment(session);
      this.handles.set(sessionId, handle);

      session.state = 'running';
      if (handle.pid !== undefined) {
        session.pid = handle.pid;
      }

      this.emit({
        type: 'session.started',
        timestamp: new Date(),
        sessionId,
        data: { session, handle },
      });

      return session;
    } catch (error) {
      session.state = 'error';
      session.error = error instanceof Error ? error.message : String(error);

      this.emit({
        type: 'session.error',
        timestamp: new Date(),
        sessionId,
        data: { session, error: session.error },
      });

      throw error;
    }
  }

  /**
   * Stop a session
   */
  async stopSession(sessionId: string): Promise<Session> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.state === 'stopped') {
      return session;
    }

    const handle = this.handles.get(sessionId);
    const provider = this.providers.get(session.provider);

    session.state = 'stopping';

    try {
      if (handle && provider) {
        await provider.stopEnvironment(handle);
      }

      session.state = 'stopped';
      session.stoppedAt = new Date();
      delete session.pid;

      this.handles.delete(sessionId);

      this.emit({
        type: 'session.stopped',
        timestamp: new Date(),
        sessionId,
        data: { session },
      });

      return session;
    } catch (error) {
      session.state = 'error';
      session.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions
   */
  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * List running sessions
   */
  listRunningSessions(): Session[] {
    return this.listSessions().filter((s) => s.state === 'running');
  }

  /**
   * Execute a command in a session
   */
  async execute(
    sessionId: string,
    command: string[],
    options?: ExecuteOptions
  ): Promise<ExecuteResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.state !== 'running') {
      throw new Error(`Session not running: ${sessionId}`);
    }

    const handle = this.handles.get(sessionId);
    if (!handle) {
      throw new Error(`No environment handle for session: ${sessionId}`);
    }

    const provider = this.providers.get(session.provider);
    if (!provider) {
      throw new Error(`Provider not found: ${session.provider}`);
    }

    return provider.execute(handle, command, options);
  }

  /**
   * Get session count
   */
  get count(): number {
    return this.sessions.size;
  }

  /**
   * Get running session count
   */
  get runningCount(): number {
    return this.listRunningSessions().length;
  }

  /**
   * Stop all sessions
   */
  async stopAllSessions(): Promise<void> {
    const runningSessions = this.listRunningSessions();
    await Promise.all(
      runningSessions.map((session) =>
        this.stopSession(session.id).catch((error) => {
          console.error(`Failed to stop session ${session.id}:`, error);
        })
      )
    );
  }

  /**
   * Clean up all sessions and providers
   */
  async cleanup(): Promise<void> {
    await this.stopAllSessions();

    for (const provider of this.providers.values()) {
      try {
        await provider.cleanup();
      } catch (error) {
        console.error(`Provider cleanup error:`, error);
      }
    }

    this.sessions.clear();
    this.handles.clear();
    this.eventListeners.clear();
  }

  /**
   * Update session state
   */
  updateSessionState(sessionId: string, state: SessionState, error?: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = state;
      if (error) {
        session.error = error;
      }
    }
  }

  /**
   * Remove a stopped session
   */
  removeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (session.state === 'running') {
      throw new Error('Cannot remove running session');
    }

    this.sessions.delete(sessionId);
    this.handles.delete(sessionId);
    return true;
  }
}
