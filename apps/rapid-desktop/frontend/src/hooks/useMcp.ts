/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MCP Server Connection Hook
 *
 * Connects directly to the RAPID MCP server for live data,
 * bypassing the Wails Go backend when not available.
 */

import { useCallback, useRef } from 'react';
import { useAppStore, type Task, type Message, type Agent } from '../stores/app';

// MCP server endpoint - can be configured via env var
const MCP_ENDPOINT = import.meta.env.VITE_MCP_URL || 'http://localhost:3100/mcp';

/**
 * Centralized Polling Manager
 *
 * Prevents race conditions from multiple competing polling intervals.
 * All components share a single polling instance per data type.
 */
type PollingCallback = (data: any) => void;
type FetchFunction = () => Promise<any>;

interface PollingSubscription {
  callbacks: Set<PollingCallback>;
  interval: NodeJS.Timeout | null;
  cache: { data: any; timestamp: number } | null;
  fetcher: FetchFunction | null;
}

class PollingManager {
  private subscriptions: Map<string, PollingSubscription> = new Map();
  private defaultIntervalMs = 3000;

  /**
   * Subscribe to a polling key with a callback
   * Returns an unsubscribe function
   */
  subscribe(
    key: string,
    callback: PollingCallback,
    fetcher: FetchFunction,
    intervalMs: number = this.defaultIntervalMs
  ): () => void {
    let sub = this.subscriptions.get(key);

    if (!sub) {
      sub = {
        callbacks: new Set(),
        interval: null,
        cache: null,
        fetcher,
      };
      this.subscriptions.set(key, sub);
    }

    sub.callbacks.add(callback);
    sub.fetcher = fetcher;

    // Return cached data immediately if fresh
    if (sub.cache && Date.now() - sub.cache.timestamp < intervalMs) {
      callback(sub.cache.data);
    }

    // Start polling if not already running
    if (!sub.interval) {
      this.startPolling(key, intervalMs);
    }

    // Return unsubscribe function
    return () => this.unsubscribe(key, callback);
  }

  private unsubscribe(key: string, callback: PollingCallback): void {
    const sub = this.subscriptions.get(key);
    if (!sub) return;

    sub.callbacks.delete(callback);

    // Stop polling if no more subscribers
    if (sub.callbacks.size === 0 && sub.interval) {
      clearInterval(sub.interval);
      sub.interval = null;
    }
  }

  private startPolling(key: string, intervalMs: number): void {
    const sub = this.subscriptions.get(key);
    if (!sub || !sub.fetcher) return;

    // Initial fetch
    this.poll(key);

    // Set up interval
    sub.interval = setInterval(() => this.poll(key), intervalMs);
  }

  private async poll(key: string): Promise<void> {
    const sub = this.subscriptions.get(key);
    if (!sub || !sub.fetcher) return;

    try {
      const data = await sub.fetcher();
      sub.cache = { data, timestamp: Date.now() };
      sub.callbacks.forEach(cb => cb(data));
    } catch (err) {
      console.error(`[PollingManager] Error polling ${key}:`, err);
    }
  }

  /**
   * Force an immediate refresh of a key
   */
  async refresh(key: string): Promise<void> {
    await this.poll(key);
  }

  /**
   * Stop all polling (cleanup)
   */
  stopAll(): void {
    for (const [, sub] of this.subscriptions) {
      if (sub.interval) {
        clearInterval(sub.interval);
        sub.interval = null;
      }
    }
    this.subscriptions.clear();
  }
}

// Singleton polling manager
export const pollingManager = new PollingManager();

interface McpToolResult {
  content?: Array<{ type: string; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

/**
 * Hook to interact with RAPID MCP server directly
 */
export function useMcp() {
  const { setDaemonStatus, mergeAgents, mergeTasks, mergeMessages, setError, setConnecting } =
    useAppStore();

  const mcpSessionId = useRef<string | null>(null);
  const sessionId = useRef<string | null>(null);

  /**
   * Make an MCP request with proper session handling
   */
  const mcpRequest = useCallback(
    async (method: string, params: Record<string, unknown> = {}): Promise<any> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      };

      // Include session ID if we have one
      if (mcpSessionId.current) {
        headers['mcp-session-id'] = mcpSessionId.current;
      }

      const response = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
      });

      // Store session ID from response
      const responseSessionId = response.headers.get('mcp-session-id');
      if (responseSessionId) {
        mcpSessionId.current = responseSessionId;
      }

      if (!response.ok) {
        throw new Error(`MCP request failed: ${response.status}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message || 'MCP call failed');
      }

      return result;
    },
    []
  );

  /**
   * Call an MCP tool on the server
   */
  const callTool = useCallback(
    async (toolName: string, args: Record<string, unknown> = {}): Promise<McpToolResult> => {
      const result = await mcpRequest('tools/call', {
        name: toolName,
        arguments: args,
      });
      return result.result;
    },
    [mcpRequest]
  );

  /**
   * Fetch agents from event bus
   * Uses mergeAgents to preserve local cache and prevent flickering
   */
  const fetchAgents = useCallback(async () => {
    try {
      // Use maxAgeSeconds: 60 to get active agents (heartbeat within last minute)
      const result = await callTool('bus_agents', { maxAgeSeconds: 60 });
      const data = result.structuredContent as { agents?: Agent[] };
      if (data?.agents && data.agents.length > 0) {
        // Merge with existing agents instead of replacing
        mergeAgents(
          data.agents.map((a) => ({
            id: a.id,
            name: a.name,
            worktree: a.worktree,
            session: a.session,
          }))
        );
      }
      // Don't clear agents on empty result - they may just not have heartbeat yet
    } catch (err) {
      // Don't clear agents on error - keep showing what we had
      console.error('Failed to fetch agents:', err);
    }
  }, [callTool, mergeAgents]);

  /**
   * Fetch tasks
   * Uses mergeTasks to preserve local cache and prevent flickering
   */
  const fetchTasks = useCallback(async () => {
    try {
      const result = await callTool('task_list', {});
      const data = result.structuredContent as { tasks?: Task[] };
      if (data?.tasks && data.tasks.length > 0) {
        // Merge with existing tasks instead of replacing
        mergeTasks(data.tasks);
      }
      // Don't clear tasks on empty result - keep cache for stability
    } catch (err) {
      // Don't clear tasks on error - keep cache for stability
      console.error('Failed to fetch tasks:', err);
    }
  }, [callTool, mergeTasks]);

  /**
   * Fetch messages from event bus
   * Uses mergeMessages to preserve local cache and avoid flicker
   */
  const fetchMessages = useCallback(
    async (limit = 50) => {
      try {
        const result = await callTool('bus_messages', {
          limit,
          brief: false,
        });
        const data = result.structuredContent as { messages?: Message[] };
        if (data?.messages && data.messages.length > 0) {
          // Merge with existing messages instead of replacing
          mergeMessages(
            data.messages.map((m) => ({
              id: m.id,
              type: m.type,
              fromAgent: m.fromAgent,
              timestamp: m.timestamp,
              payload: m.payload,
            }))
          );
        }
        // Don't clear messages if fetch returns empty - keep cache
      } catch (err) {
        // Don't clear messages on error - keep cache for stability
        console.error('Failed to fetch messages:', err);
      }
    },
    [callTool, mergeMessages]
  );

  /**
   * Fetch event bus status as daemon status
   */
  const fetchDaemonStatus = useCallback(async () => {
    try {
      const result = await callTool('bus_status', {});
      const data = result.structuredContent as {
        running?: boolean;
        messageCount?: number;
        agentCount?: number;
      };

      setDaemonStatus({
        running: true,
        socketPath: MCP_ENDPOINT,
        version: '1.0.0',
        sessions: data?.agentCount || 0,
      });
    } catch (err) {
      console.error('Failed to fetch daemon status:', err);
      setDaemonStatus({
        running: false,
        socketPath: MCP_ENDPOINT,
      });
      setError(`Daemon not responding: ${err}`);
    }
  }, [callTool, setDaemonStatus, setError]);

  /**
   * Create a new task
   */
  const createTask = useCallback(
    async (title: string, description: string, priority: string, tags: string[]) => {
      try {
        const result = await callTool('task_create', {
          title,
          description,
          priority,
          tags,
          createdBy: 'desktop-ui',
        });
        const data = result.structuredContent as { id?: string };
        await fetchTasks();
        return { id: data?.id || `task-${Date.now()}` };
      } catch (err) {
        setError(`Failed to create task: ${err}`);
        throw err;
      }
    },
    [callTool, fetchTasks, setError]
  );

  /**
   * Update task status
   */
  const updateTaskStatus = useCallback(
    async (
      taskId: string,
      status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
    ) => {
      try {
        await callTool('task_update', {
          id: taskId,
          status,
        });
        await fetchTasks();
      } catch (err) {
        setError(`Failed to update task: ${err}`);
        throw err;
      }
    },
    [callTool, fetchTasks, setError]
  );

  /**
   * Mark task as complete
   */
  const completeTask = useCallback(
    async (taskId: string, summary?: string) => {
      try {
        await callTool('task_complete', {
          id: taskId,
          summary,
        });
        await fetchTasks();
      } catch (err) {
        setError(`Failed to complete task: ${err}`);
        throw err;
      }
    },
    [callTool, fetchTasks, setError]
  );

  /**
   * Fetch approval requests from event bus or backend
   */
  const fetchApprovals = useCallback(async () => {
    try {
      // Try to fetch from MCP, falls back to empty if not available
      const result = await callTool('approval_list', {
        status: 'all',
        limit: 50,
      });
      const data = result.structuredContent as { approvals?: Array<any> };
      // Return approvals if available, empty array otherwise
      return data?.approvals || [];
    } catch (err) {
      console.warn('Failed to fetch approvals:', err);
      return [];
    }
  }, [callTool]);

  /**
   * Approve an approval request
   */
  const approveRequest = useCallback(
    async (requestId: string, reason?: string) => {
      try {
        await callTool('approval_respond', {
          id: requestId,
          decision: 'approved',
          reason,
        });
      } catch (err) {
        setError(`Failed to approve request: ${err}`);
        throw err;
      }
    },
    [callTool, setError]
  );

  /**
   * Reject an approval request
   */
  const rejectRequest = useCallback(
    async (requestId: string, reason?: string) => {
      try {
        await callTool('approval_respond', {
          id: requestId,
          decision: 'rejected',
          reason,
        });
      } catch (err) {
        setError(`Failed to reject request: ${err}`);
        throw err;
      }
    },
    [callTool, setError]
  );

  /**
   * Submit a vote on a suggestion
   */
  const submitVote = useCallback(
    async (suggestionId: string, vote: 'approve' | 'reject' | 'abstain') => {
      try {
        await callTool('bus_send', {
          type: 'vote',
          agentId: sessionId.current || 'desktop-ui',
          agentName: 'desktop-ui',
          title: `Vote: ${vote}`,
          content: `Voted ${vote} on suggestion ${suggestionId}`,
          targetSuggestion: suggestionId,
          voteValue: vote,
        });
      } catch (err) {
        setError(`Failed to submit vote: ${err}`);
        throw err;
      }
    },
    [callTool, setError]
  );

  /**
   * Override a suggestion as orchestrator (approve or veto)
   */
  const overrideSuggestion = useCallback(
    async (suggestionId: string, decision: 'approved' | 'vetoed', reason: string) => {
      try {
        await callTool('bus_send', {
          type: 'coordination',
          agentId: sessionId.current || 'desktop-ui',
          agentName: 'orchestrator',
          title: `Orchestrator ${decision}`,
          content: `${decision}: ${reason}`,
          targetSuggestion: suggestionId,
          decision,
          reason,
        });
      } catch (err) {
        setError(`Failed to override suggestion: ${err}`);
        throw err;
      }
    },
    [callTool, setError]
  );

  /**
   * Spawn a new agent
   */
  const spawnAgent = useCallback(
    async (persona: string, task: string) => {
      try {
        await callTool('persona_spawn', {
          name: persona,
          task,
          background: true,
          connectToBus: true,
        });
        await fetchAgents();
      } catch (err) {
        setError(`Failed to spawn agent: ${err}`);
        throw err;
      }
    },
    [callTool, fetchAgents, setError]
  );

  /**
   * Stop a running agent
   */
  const stopAgent = useCallback(
    async (agentId: string) => {
      try {
        await callTool('persona_stop', { agentId });
        await fetchAgents();
      } catch (err) {
        setError(`Failed to stop agent: ${err}`);
        throw err;
      }
    },
    [callTool, fetchAgents, setError]
  );

  /**
   * Send a message on the event bus
   */
  const sendMessage = useCallback(
    async (type: string, title: string, content: string) => {
      try {
        // Register if needed
        if (!sessionId.current) {
          const regResult = await callTool('bus_register', {
            agentName: 'desktop-ui',
            session: 'desktop',
          });
          const regData = regResult.structuredContent as { agentId?: string };
          sessionId.current = regData?.agentId || 'desktop-ui';
        }

        await callTool('bus_send', {
          type,
          agentId: sessionId.current,
          agentName: 'desktop-ui',
          title,
          content,
          priority: 'normal',
        });

        await fetchMessages();
      } catch (err) {
        setError(`Failed to send message: ${err}`);
        throw err;
      }
    },
    [callTool, fetchMessages, setError]
  );

  /**
   * Initialize MCP session and all data
   */
  const initialize = useCallback(async () => {
    setConnecting(true);
    try {
      // First, initialize the MCP session if we don't have one
      if (!mcpSessionId.current) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        };

        const response = await fetch(MCP_ENDPOINT, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'rapid-desktop', version: '1.0.0' },
            },
          }),
        });

        // Store session ID from response
        const responseSessionId = response.headers.get('mcp-session-id');
        if (responseSessionId) {
          mcpSessionId.current = responseSessionId;
          console.log('[MCP] Session initialized:', responseSessionId.slice(0, 8));
        }
      }

      // Now fetch all data
      await Promise.all([fetchDaemonStatus(), fetchAgents(), fetchTasks(), fetchMessages()]);
    } catch (err) {
      console.error('[MCP] Initialization failed:', err);
      setError(`MCP initialization failed: ${err}`);
    } finally {
      setConnecting(false);
    }
  }, [fetchDaemonStatus, fetchAgents, fetchTasks, fetchMessages, setConnecting, setError]);

  /**
   * Start unified polling for all data types
   * Uses the centralized PollingManager to prevent race conditions
   * Returns an unsubscribe function to stop polling
   */
  const startPolling = useCallback(
    (intervalMs: number = 3000): (() => void) => {
      const unsubAgents = pollingManager.subscribe(
        'agents',
        () => {},
        fetchAgents,
        intervalMs
      );
      const unsubTasks = pollingManager.subscribe(
        'tasks',
        () => {},
        fetchTasks,
        intervalMs
      );
      const unsubMessages = pollingManager.subscribe(
        'messages',
        () => {},
        () => fetchMessages(50),
        intervalMs
      );
      const unsubStatus = pollingManager.subscribe(
        'status',
        () => {},
        fetchDaemonStatus,
        intervalMs * 2 // Status can poll less frequently
      );

      // Return cleanup function
      return () => {
        unsubAgents();
        unsubTasks();
        unsubMessages();
        unsubStatus();
      };
    },
    [fetchAgents, fetchTasks, fetchMessages, fetchDaemonStatus]
  );

  return {
    initialize,
    fetchDaemonStatus,
    fetchAgents,
    fetchTasks,
    fetchMessages,
    createTask,
    updateTaskStatus,
    completeTask,
    fetchApprovals,
    approveRequest,
    rejectRequest,
    submitVote,
    overrideSuggestion,
    spawnAgent,
    stopAgent,
    sendMessage,
    callTool,
    startPolling,
    pollingManager,
  };
}
