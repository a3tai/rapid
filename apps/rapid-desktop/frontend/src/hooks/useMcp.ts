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

interface McpToolResult {
  content?: Array<{ type: string; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

/**
 * Hook to interact with RAPID MCP server directly
 */
export function useMcp() {
  const { setDaemonStatus, setAgents, setTasks, setMessages, setError, setConnecting } =
    useAppStore();

  const sessionId = useRef<string | null>(null);

  /**
   * Call an MCP tool on the server
   */
  const callTool = useCallback(
    async (toolName: string, args: Record<string, unknown> = {}): Promise<McpToolResult> => {
      const response = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`MCP request failed: ${response.status}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message || 'MCP call failed');
      }

      return result.result;
    },
    []
  );

  /**
   * Fetch agents from event bus
   */
  const fetchAgents = useCallback(async () => {
    try {
      const result = await callTool('bus_agents', { maxAgeSeconds: 300 });
      const data = result.structuredContent as { agents?: Agent[] };
      if (data?.agents) {
        setAgents(
          data.agents.map((a) => ({
            id: a.id,
            name: a.name,
            worktree: a.worktree,
            session: a.session,
          }))
        );
      } else {
        setAgents([]);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      setAgents([]);
      setError(`Failed to fetch agents: ${err}`);
    }
  }, [callTool, setAgents, setError]);

  /**
   * Fetch tasks
   */
  const fetchTasks = useCallback(async () => {
    try {
      const result = await callTool('task_list', {});
      const data = result.structuredContent as { tasks?: Task[] };
      setTasks(data?.tasks || []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setTasks([]);
      setError(`Failed to fetch tasks: ${err}`);
    }
  }, [callTool, setTasks, setError]);

  /**
   * Fetch messages from event bus
   */
  const fetchMessages = useCallback(
    async (limit = 20) => {
      try {
        const result = await callTool('bus_messages', {
          limit,
          brief: false,
        });
        const data = result.structuredContent as { messages?: Message[] };
        if (data?.messages) {
          setMessages(
            data.messages.map((m) => ({
              id: m.id,
              type: m.type,
              fromAgent: m.fromAgent,
              timestamp: m.timestamp,
              payload: m.payload,
            }))
          );
        } else {
          setMessages([]);
        }
      } catch (err) {
        console.error('Failed to fetch messages:', err);
        setMessages([]);
        setError(`Failed to fetch messages: ${err}`);
      }
    },
    [callTool, setMessages, setError]
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
    async (persona: string, worktree: string) => {
      try {
        await callTool('persona_spawn', {
          name: persona,
          task: `Work on ${worktree}`,
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
   * Initialize all data
   */
  const initialize = useCallback(async () => {
    setConnecting(true);
    try {
      await Promise.all([fetchDaemonStatus(), fetchAgents(), fetchTasks(), fetchMessages()]);
    } finally {
      setConnecting(false);
    }
  }, [fetchDaemonStatus, fetchAgents, fetchTasks, fetchMessages, setConnecting]);

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
  };
}
