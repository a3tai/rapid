/**
 * Wails Hook - Uses generated bindings to call Go backend (Wails v2)
 */
import { useCallback } from 'react';
import { useAppStore, type Task, type Message } from '../stores/app';
import * as AppService from '@wails/go/main/AppService';

/**
 * Hook to interact with Wails Go backend via generated bindings
 */
export function useWails() {
  const { setDaemonStatus, setAgents, setTasks, setMessages, setError, setConnecting } =
    useAppStore();

  // Fetch daemon status
  const fetchDaemonStatus = useCallback(async () => {
    try {
      const status = await AppService.GetDaemonStatus();
      if (status) {
        setDaemonStatus({
          running: status.running,
          pid: status.pid,
          socketPath: status.socketPath,
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
      setError(`Failed to get daemon status: ${err}`);
      setDaemonStatus({
        running: false,
        socketPath: '',
      });
    }
  }, [setDaemonStatus, setError]);

  // Fetch agents
  const fetchAgents = useCallback(async () => {
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
  }, [setAgents, setError]);

  // Fetch tasks
  const fetchTasks = useCallback(
    async (status = '') => {
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
    },
    [setTasks, setError]
  );

  // Fetch messages
  const fetchMessages = useCallback(
    async (limit = 20) => {
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
    },
    [setMessages, setError]
  );

  // Create task
  const createTask = useCallback(
    async (title: string, description: string, priority: string, tags: string[]) => {
      try {
        const result = await AppService.CreateTask(title, description, priority, tags);
        await fetchTasks();
        return { id: result?.id || `task-${Date.now()}` };
      } catch (err) {
        setError(`Failed to create task: ${err}`);
        throw err;
      }
    },
    [fetchTasks, setError]
  );

  // Spawn agent
  const spawnAgent = useCallback(
    async (persona: string, worktree: string) => {
      try {
        await AppService.SpawnAgent(persona, worktree);
        await fetchAgents();
      } catch (err) {
        setError(`Failed to spawn agent: ${err}`);
        throw err;
      }
    },
    [fetchAgents, setError]
  );

  // Stop agent
  const stopAgent = useCallback(
    async (agentId: string) => {
      try {
        await AppService.StopAgent(agentId);
        await fetchAgents();
      } catch (err) {
        setError(`Failed to stop agent: ${err}`);
        throw err;
      }
    },
    [fetchAgents, setError]
  );

  // Subscribe to real-time updates
  const subscribe = useCallback(
    async (eventType: string) => {
      try {
        const subId = await AppService.Subscribe(eventType);
        return subId;
      } catch (err) {
        setError(`Failed to subscribe: ${err}`);
        throw err;
      }
    },
    [setError]
  );

  // Unsubscribe from real-time updates
  const unsubscribe = useCallback(
    async (subId: string) => {
      try {
        await AppService.Unsubscribe(subId);
      } catch (err) {
        setError(`Failed to unsubscribe: ${err}`);
        throw err;
      }
    },
    [setError]
  );

  // Send message to agent
  const sendMessage = useCallback(
    async (targetAgent: string, messageType: string, content: string) => {
      try {
        const messageId = await AppService.SendMessage(targetAgent, messageType, content);
        await fetchMessages();
        return messageId;
      } catch (err) {
        setError(`Failed to send message: ${err}`);
        throw err;
      }
    },
    [fetchMessages, setError]
  );

  // Get chat history
  const getChatHistory = useCallback(
    async (agentId: string, limit: number = 50) => {
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
    },
    [setError]
  );

  // Initialize data on mount
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
    subscribe,
    unsubscribe,
    sendMessage,
    getChatHistory,
    createTask,
    spawnAgent,
    stopAgent,
  };
}

// Data polling is handled by useData hook
