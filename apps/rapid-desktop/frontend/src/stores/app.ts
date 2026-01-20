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
  type: 'discovery' | 'error' | 'completion' | 'question' | 'learning' | 'coordination' | 'heartbeat' | 'suggestion' | 'vote'
  fromAgent: Agent
  timestamp: string
  payload: {
    title?: string
    content?: string
    [key: string]: unknown
  }
}

export interface Suggestion {
  id: string
  title: string
  description: string
  category: 'feature' | 'fix' | 'improvement' | 'refactor' | 'docs'
  proposedBy: string
  proposedByName: string
  status: 'proposed' | 'voting' | 'approved' | 'rejected' | 'orchestrator_approved' | 'orchestrator_vetoed' | 'implemented'
  createdAt: string
  votingEndsAt?: string
  approveCount: number
  rejectCount: number
  abstainCount: number
  orchestratorDecision?: {
    decision: 'approved' | 'vetoed'
    reason: string
    decidedAt: string
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
  suggestions: Suggestion[]

  // UI state
  activeView: 'dashboard' | 'agents' | 'tasks' | 'events' | 'knowledge' | 'approvals' | 'config'
  selectedAgent: string | null
  selectedTask: string | null

  // Actions
  setDaemonStatus: (status: DaemonStatus | null) => void
  setAgents: (agents: Agent[]) => void
  setTasks: (tasks: Task[]) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  setSuggestions: (suggestions: Suggestion[]) => void
  addSuggestion: (suggestion: Suggestion) => void
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
  suggestions: [],
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
  setSuggestions: (suggestions) => set({ suggestions }),
  addSuggestion: (suggestion) =>
    set((state) => ({
      suggestions: [suggestion, ...state.suggestions].slice(0, 50), // Keep last 50
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
export const useSuggestions = () => useAppStore((state) => state.suggestions)
export const useDaemonStatus = () => useAppStore((state) => state.daemonStatus)
export const useActiveView = () => useAppStore((state) => state.activeView)
