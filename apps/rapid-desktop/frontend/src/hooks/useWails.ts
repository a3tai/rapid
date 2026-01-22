/**
 * Wails Hook - Uses generated bindings to call Go backend (Wails v3)
 */
import { useCallback } from 'react';
import { useAppStore, type Task, type Message } from '../stores/app';
import * as AppService from '@bindings/rapid-desktop/appservice';

// Get store actions directly to avoid re-renders (these don't change)
const getActions = () => useAppStore.getState();

/**
 * Hook to interact with Wails Go backend via generated bindings
 */
export function useWails() {

  // Fetch daemon status
  const fetchDaemonStatus = useCallback(async () => {
    const { setDaemonStatus, setError } = getActions();
    try {
      const status = await AppService.GetDaemonStatus();
      if (status) {
        setDaemonStatus({
          running: status.running,
          pid: status.pid,
          socketPath: status.socketPath || '',
          version: status.version,
          uptime: status.uptime,
          sessions: status.sessions,
        });
      } else {
        setDaemonStatus({
          running: false,
          socketPath: '',
        });
      }
    } catch (err) {
      console.error('[Wails] Failed to get daemon status:', err);
      setError(`Failed to get daemon status: ${err}`);
      setDaemonStatus({
        running: false,
        socketPath: '',
      });
    }
  }, []);

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    const { setAgents, setError } = getActions();
    try {
      const agents = await AppService.GetAgents();
      setAgents(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        agents.map((a: any) => ({
          id: a.id,
          name: a.name,
          worktree: a.worktree,
          session: a.session,
        }))
      );
    } catch (err) {
      setError(`Failed to get agents: ${err}`);
      setAgents([]);
    }
  }, []);

  // Fetch tasks
  const fetchTasks = useCallback(async (status = '') => {
    const { setTasks, setError } = getActions();
    try {
      const tasks = await AppService.GetTasks(status);
      setTasks(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tasks.map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status as Task['status'],
          priority: t.priority as Task['priority'],
          assignedTo: t.assignedTo,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          tags: t.tags,
        }))
      );
    } catch (err) {
      setError(`Failed to get tasks: ${err}`);
      setTasks([]);
    }
  }, []);

  // Fetch messages
  const fetchMessages = useCallback(async (limit = 20) => {
    const { setMessages, setError } = getActions();
    try {
      const messages = await AppService.GetMessages(limit);
      setMessages(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages.map((m: any) => ({
          id: m.id,
          type: m.type as Message['type'],
          fromAgent: {
            id: m.fromAgent.id,
            name: m.fromAgent.name,
            worktree: m.fromAgent.worktree,
            session: m.fromAgent.session,
          },
          timestamp: m.timestamp,
          payload: m.payload as Message['payload'],
        }))
      );
    } catch (err) {
      setError(`Failed to get messages: ${err}`);
      setMessages([]);
    }
  }, []);

  // Create task
  const createTask = useCallback(
    async (title: string, description: string, priority: string, tags: string[]) => {
      const { setError } = getActions();
      try {
        const result = await AppService.CreateTask(title, description, priority, tags);
        await fetchTasks();
        return { id: result?.id || `task-${Date.now()}` };
      } catch (err) {
        setError(`Failed to create task: ${err}`);
        throw err;
      }
    },
    [fetchTasks]
  );

  // Spawn agent
  const spawnAgent = useCallback(
    async (persona: string, worktree: string) => {
      const { setError } = getActions();
      try {
        await AppService.SpawnAgent(persona, worktree);
        await fetchAgents();
      } catch (err) {
        setError(`Failed to spawn agent: ${err}`);
        throw err;
      }
    },
    [fetchAgents]
  );

  // Stop agent
  const stopAgent = useCallback(
    async (agentId: string) => {
      const { setError } = getActions();
      try {
        await AppService.StopAgent(agentId);
        await fetchAgents();
      } catch (err) {
        setError(`Failed to stop agent: ${err}`);
        throw err;
      }
    },
    [fetchAgents]
  );

  // Subscribe to real-time updates
  const subscribe = useCallback(async (eventType: string) => {
    const { setError } = getActions();
    try {
      const subId = await AppService.Subscribe(eventType);
      return subId;
    } catch (err) {
      setError(`Failed to subscribe: ${err}`);
      throw err;
    }
  }, []);

  // Unsubscribe from real-time updates
  const unsubscribe = useCallback(async (subId: string) => {
    const { setError } = getActions();
    try {
      await AppService.Unsubscribe(subId);
    } catch (err) {
      setError(`Failed to unsubscribe: ${err}`);
      throw err;
    }
  }, []);

  // Send message to agent
  const sendMessage = useCallback(
    async (targetAgent: string, messageType: string, content: string) => {
      const { setError } = getActions();
      try {
        const messageId = await AppService.SendMessage(targetAgent, messageType, content);
        await fetchMessages();
        return messageId;
      } catch (err) {
        setError(`Failed to send message: ${err}`);
        throw err;
      }
    },
    [fetchMessages]
  );

  // Get chat history
  const getChatHistory = useCallback(async (agentId: string, limit: number = 50) => {
    const { setError } = getActions();
    try {
      const history = await AppService.GetChatHistory(agentId, limit);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return history.map((m: any) => ({
        id: m.id,
        type: m.type as Message['type'],
        fromAgent: {
          id: m.fromAgent.id,
          name: m.fromAgent.name,
          worktree: m.fromAgent.worktree,
          session: m.fromAgent.session,
        },
        timestamp: m.timestamp,
        payload: m.payload as Message['payload'],
      }));
    } catch (err) {
      setError(`Failed to get chat history: ${err}`);
      return [];
    }
  }, []);

  // Initialize data on mount
  const initialize = useCallback(async () => {
    const { setConnecting } = getActions();
    setConnecting(true);
    try {
      await Promise.all([fetchDaemonStatus(), fetchAgents(), fetchTasks(), fetchMessages()]);
    } finally {
      setConnecting(false);
    }
  }, [fetchDaemonStatus, fetchAgents, fetchTasks, fetchMessages]);

  // Generic MCP tool call via Go backend (avoids CORS issues in WebView)
  const callTool = useCallback(async (toolName: string, args: Record<string, unknown> = {}) => {
    const { setError } = getActions();
    try {
      const result = await AppService.CallTool(toolName, args);
      return result;
    } catch (err) {
      setError(`Failed to call tool ${toolName}: ${err}`);
      throw err;
    }
  }, []);

  // Update task status
  const updateTaskStatus = useCallback(
    async (taskId: string, status: string) => {
      const { setError } = getActions();
      try {
        await AppService.UpdateTaskStatus(taskId, status);
        await fetchTasks();
      } catch (err) {
        setError(`Failed to update task status: ${err}`);
        throw err;
      }
    },
    [fetchTasks]
  );

  // Fetch approvals
  const fetchApprovals = useCallback(async (status = 'pending', agentId = '', limit = 50) => {
    const { setError } = getActions();
    try {
      const approvals = await AppService.FetchApprovals(status, agentId, limit);
      return approvals;
    } catch (err) {
      setError(`Failed to fetch approvals: ${err}`);
      return [];
    }
  }, []);

  // Approve request
  const approveRequest = useCallback(async (requestId: string, reason = '') => {
    const { setError } = getActions();
    try {
      await AppService.ApproveRequest(requestId, reason);
    } catch (err) {
      setError(`Failed to approve request: ${err}`);
      throw err;
    }
  }, []);

  // Reject request
  const rejectRequest = useCallback(async (requestId: string, reason = '') => {
    const { setError } = getActions();
    try {
      await AppService.RejectRequest(requestId, reason);
    } catch (err) {
      setError(`Failed to reject request: ${err}`);
      throw err;
    }
  }, []);

  // Submit vote on a suggestion
  const submitVote = useCallback(
    async (suggestionId: string, vote: 'approve' | 'reject' | 'abstain') => {
      const { setError } = getActions();
      try {
        await AppService.SubmitVote(suggestionId, vote);
      } catch (err) {
        setError(`Failed to submit vote: ${err}`);
        throw err;
      }
    },
    []
  );

  // Override suggestion (orchestrator decision)
  const overrideSuggestion = useCallback(
    async (suggestionId: string, decision: 'approved' | 'vetoed', reason: string) => {
      const { setError } = getActions();
      try {
        await AppService.OverrideSuggestion(suggestionId, decision, reason);
      } catch (err) {
        setError(`Failed to override suggestion: ${err}`);
        throw err;
      }
    },
    []
  );

  return {
    initialize,
    fetchDaemonStatus,
    fetchAgents,
    fetchTasks,
    fetchMessages,
    subscribe,
    unsubscribe,
    sendMessage,
    getChatHistory,
    createTask,
    spawnAgent,
    stopAgent,
    // MCP tool calling
    callTool,
    updateTaskStatus,
    fetchApprovals,
    approveRequest,
    rejectRequest,
    submitVote,
    overrideSuggestion,
  };
}

// Data polling is handled by useData hook
