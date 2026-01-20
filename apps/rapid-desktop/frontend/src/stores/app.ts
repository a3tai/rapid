import { create } from 'zustand'

// Types matching Go backend
export interface Agent {
  id: string
  name: string
  worktree?: string
  session?: string
}

export interface Task {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  assignedTo?: string
  createdAt: string
  updatedAt: string
  tags?: string[]
}

export interface Message {
  id: string
  type: 'discovery' | 'error' | 'completion' | 'question' | 'learning' | 'coordination' | 'heartbeat'
  fromAgent: Agent
  timestamp: string
  payload: {
    title?: string
    content?: string
    [key: string]: unknown
  }
}

export interface DaemonStatus {
  running: boolean
  pid?: number
  socketPath: string
  version?: string
  uptime?: number
  sessions?: number
}

interface AppState {
  // Connection state
  daemonStatus: DaemonStatus | null
  isConnecting: boolean
  lastError: string | null

  // Data
  agents: Agent[]
  tasks: Task[]
  messages: Message[]

  // UI state
  activeView: 'dashboard' | 'agents' | 'tasks' | 'events' | 'config'
  selectedAgent: string | null
  selectedTask: string | null

  // Actions
  setDaemonStatus: (status: DaemonStatus | null) => void
  setAgents: (agents: Agent[]) => void
  setTasks: (tasks: Task[]) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  setActiveView: (view: AppState['activeView']) => void
  setSelectedAgent: (id: string | null) => void
  setSelectedTask: (id: string | null) => void
  setError: (error: string | null) => void
  setConnecting: (connecting: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  daemonStatus: null,
  isConnecting: false,
  lastError: null,
  agents: [],
  tasks: [],
  messages: [],
  activeView: 'dashboard',
  selectedAgent: null,
  selectedTask: null,

  // Actions
  setDaemonStatus: (status) => set({ daemonStatus: status }),
  setAgents: (agents) => set({ agents }),
  setTasks: (tasks) => set({ tasks }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({
      messages: [message, ...state.messages].slice(0, 100), // Keep last 100
    })),
  setActiveView: (activeView) => set({ activeView }),
  setSelectedAgent: (selectedAgent) => set({ selectedAgent }),
  setSelectedTask: (selectedTask) => set({ selectedTask }),
  setError: (lastError) => set({ lastError }),
  setConnecting: (isConnecting) => set({ isConnecting }),
}))

// Selector hooks for common patterns
export const useAgents = () => useAppStore((state) => state.agents)
export const useTasks = () => useAppStore((state) => state.tasks)
export const useMessages = () => useAppStore((state) => state.messages)
export const useDaemonStatus = () => useAppStore((state) => state.daemonStatus)
export const useActiveView = () => useAppStore((state) => state.activeView)
