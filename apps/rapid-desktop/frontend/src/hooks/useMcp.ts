/**
 * MCP Server Connection Hook
 *
 * Connects directly to the RAPID MCP server for live data,
 * bypassing the Wails Go backend when not available.
 */

import { useCallback, useRef } from 'react'
import { useAppStore, type Task, type Message, type Agent } from '../stores/app'

// MCP server endpoint - can be configured via env var
const MCP_ENDPOINT = import.meta.env.VITE_MCP_URL || 'http://localhost:3100/mcp'

interface McpToolResult {
  content?: Array<{ type: string; text: string }>
  structuredContent?: unknown
  isError?: boolean
}

/**
 * Hook to interact with RAPID MCP server directly
 */
export function useMcp() {
  const {
    setDaemonStatus,
    setAgents,
    setTasks,
    setMessages,
    setError,
    setConnecting,
  } = useAppStore()

  const sessionId = useRef<string | null>(null)

  /**
   * Call an MCP tool on the server
   */
  const callTool = useCallback(async (
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<McpToolResult> => {
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
    })

    if (!response.ok) {
      throw new Error(`MCP request failed: ${response.status}`)
    }

    const result = await response.json()
    if (result.error) {
      throw new Error(result.error.message || 'MCP call failed')
    }

    return result.result
  }, [])

  /**
   * Fetch agents from event bus
   */
  const fetchAgents = useCallback(async () => {
    try {
      const result = await callTool('bus_agents', { maxAgeSeconds: 300 })
      const data = result.structuredContent as { agents?: Agent[] }
      if (data?.agents) {
        setAgents(data.agents.map(a => ({
          id: a.id,
          name: a.name,
          worktree: a.worktree,
          session: a.session,
        })))
      }
    } catch (err) {
      console.warn('Failed to fetch agents:', err)
      // Fall back to mock data on error
      setAgents([
        { id: 'orchestrator-1', name: 'orchestrator', worktree: 'main' },
        { id: 'worker-1', name: 'worker', worktree: 'feat/auth' },
      ])
    }
  }, [callTool, setAgents])

  /**
   * Fetch tasks
   */
  const fetchTasks = useCallback(async () => {
    try {
      const result = await callTool('task_list', {})
      const data = result.structuredContent as { tasks?: Task[] }
      if (data?.tasks) {
        setTasks(data.tasks)
      }
    } catch (err) {
      console.warn('Failed to fetch tasks:', err)
      // Fall back to mock data
      setTasks([
        {
          id: 'task-1',
          title: 'Implement authentication',
          status: 'in_progress',
          priority: 'high',
          assignedTo: 'worker-1',
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          updatedAt: new Date(Date.now() - 1800000).toISOString(),
          tags: ['feature', 'auth'],
        },
        {
          id: 'task-2',
          title: 'Review PR #42',
          status: 'pending',
          priority: 'normal',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 3600000).toISOString(),
          tags: ['review'],
        },
      ])
    }
  }, [callTool, setTasks])

  /**
   * Fetch messages from event bus
   */
  const fetchMessages = useCallback(async (limit = 20) => {
    try {
      const result = await callTool('bus_messages', {
        limit,
        brief: false,
      })
      const data = result.structuredContent as { messages?: Message[] }
      if (data?.messages) {
        setMessages(data.messages.map(m => ({
          id: m.id,
          type: m.type,
          fromAgent: m.fromAgent,
          timestamp: m.timestamp,
          payload: m.payload,
        })))
      }
    } catch (err) {
      console.warn('Failed to fetch messages:', err)
      // Fall back to mock data
      setMessages([
        {
          id: 'msg-1',
          type: 'completion',
          fromAgent: { id: 'worker-1', name: 'worker' },
          timestamp: new Date(Date.now() - 300000).toISOString(),
          payload: {
            title: 'Task completed',
            content: 'Implemented user authentication module',
          },
        },
      ])
    }
  }, [callTool, setMessages])

  /**
   * Fetch event bus status as daemon status
   */
  const fetchDaemonStatus = useCallback(async () => {
    try {
      const result = await callTool('bus_status', {})
      const data = result.structuredContent as {
        running?: boolean
        messageCount?: number
        agentCount?: number
      }

      setDaemonStatus({
        running: data?.running !== false,
        socketPath: MCP_ENDPOINT,
        version: '0.1.0',
        uptime: 3600, // Mock uptime
        sessions: data?.agentCount || 0,
      })
    } catch (err) {
      console.warn('Failed to fetch daemon status:', err)
      setDaemonStatus({
        running: false,
        socketPath: MCP_ENDPOINT,
      })
    }
  }, [callTool, setDaemonStatus])

  /**
   * Create a new task
   */
  const createTask = useCallback(async (
    title: string,
    description: string,
    priority: string,
    tags: string[]
  ) => {
    try {
      const result = await callTool('task_create', {
        title,
        description,
        priority,
        tags,
        createdBy: 'desktop-ui',
      })
      const data = result.structuredContent as { id?: string }
      await fetchTasks()
      return { id: data?.id || `task-${Date.now()}` }
    } catch (err) {
      setError(`Failed to create task: ${err}`)
      throw err
    }
  }, [callTool, fetchTasks, setError])

  /**
   * Update task status
   */
  const updateTaskStatus = useCallback(async (
    taskId: string,
    status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
  ) => {
    try {
      await callTool('task_update', {
        id: taskId,
        status,
      })
      await fetchTasks()
    } catch (err) {
      setError(`Failed to update task: ${err}`)
      throw err
    }
  }, [callTool, fetchTasks, setError])

  /**
   * Mark task as complete
   */
  const completeTask = useCallback(async (
    taskId: string,
    summary?: string
  ) => {
    try {
      await callTool('task_complete', {
        id: taskId,
        summary,
      })
      await fetchTasks()
    } catch (err) {
      setError(`Failed to complete task: ${err}`)
      throw err
    }
  }, [callTool, fetchTasks, setError])

  /**
   * Spawn a new agent
   */
  const spawnAgent = useCallback(async (persona: string, worktree: string) => {
    try {
      await callTool('persona_spawn', {
        name: persona,
        task: `Work on ${worktree}`,
        background: true,
        connectToBus: true,
      })
      await fetchAgents()
    } catch (err) {
      setError(`Failed to spawn agent: ${err}`)
      throw err
    }
  }, [callTool, fetchAgents, setError])

  /**
   * Stop a running agent
   */
  const stopAgent = useCallback(async (agentId: string) => {
    try {
      await callTool('persona_stop', { agentId })
      await fetchAgents()
    } catch (err) {
      setError(`Failed to stop agent: ${err}`)
      throw err
    }
  }, [callTool, fetchAgents, setError])

  /**
   * Send a message on the event bus
   */
  const sendMessage = useCallback(async (
    type: string,
    title: string,
    content: string
  ) => {
    try {
      // Register if needed
      if (!sessionId.current) {
        const regResult = await callTool('bus_register', {
          agentName: 'desktop-ui',
          session: 'desktop',
        })
        const regData = regResult.structuredContent as { agentId?: string }
        sessionId.current = regData?.agentId || 'desktop-ui'
      }

      await callTool('bus_send', {
        type,
        agentId: sessionId.current,
        agentName: 'desktop-ui',
        title,
        content,
        priority: 'normal',
      })

      await fetchMessages()
    } catch (err) {
      setError(`Failed to send message: ${err}`)
      throw err
    }
  }, [callTool, fetchMessages, setError])

  /**
   * Initialize all data
   */
  const initialize = useCallback(async () => {
    setConnecting(true)
    try {
      await Promise.all([
        fetchDaemonStatus(),
        fetchAgents(),
        fetchTasks(),
        fetchMessages(),
      ])
    } finally {
      setConnecting(false)
    }
  }, [fetchDaemonStatus, fetchAgents, fetchTasks, fetchMessages, setConnecting])

  return {
    initialize,
    fetchDaemonStatus,
    fetchAgents,
    fetchTasks,
    fetchMessages,
    createTask,
    updateTaskStatus,
    completeTask,
    spawnAgent,
    stopAgent,
    sendMessage,
    callTool,
  }
}
