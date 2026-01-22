import { create } from 'zustand';

// Types matching Go backend
export interface Agent {
  id: string;
  name: string;
  worktree?: string;
  session?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface Message {
  id: string;
  type:
    | 'discovery'
    | 'error'
    | 'completion'
    | 'question'
    | 'learning'
    | 'coordination'
    | 'heartbeat'
    | 'suggestion'
    | 'vote';
  fromAgent: Agent;
  timestamp: string;
  payload: {
    title?: string;
    content?: string;
    [key: string]: unknown;
  };
}

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  category: 'feature' | 'fix' | 'improvement' | 'refactor' | 'docs';
  proposedBy: string;
  proposedByName: string;
  status:
    | 'proposed'
    | 'voting'
    | 'approved'
    | 'rejected'
    | 'orchestrator_approved'
    | 'orchestrator_vetoed'
    | 'implemented';
  createdAt: string;
  votingEndsAt?: string;
  approveCount: number;
  rejectCount: number;
  abstainCount: number;
  orchestratorDecision?: {
    decision: 'approved' | 'vetoed';
    reason: string;
    decidedAt: string;
  };
}

export interface DaemonStatus {
  running: boolean;
  pid?: number;
  socketPath: string;
  version?: string;
  uptime?: number;
  sessions?: number;
}

export type AgentDetailTab = 'overview' | 'logs' | 'metrics';

interface AppState {
  // Connection state
  daemonStatus: DaemonStatus | null;
  isConnecting: boolean;
  lastError: string | null;

  // Data
  agents: Agent[];
  tasks: Task[];
  messages: Message[];
  suggestions: Suggestion[];

  // UI state
  activeView:
    | 'dashboard'
    | 'agents'
    | 'agent-detail'
    | 'tasks'
    | 'events'
    | 'chat'
    | 'knowledge'
    | 'suggestions'
    | 'approvals'
    | 'config';
  selectedAgent: string | null;
  selectedTask: string | null;
  agentDetailTab: AgentDetailTab;

  // Actions
  setDaemonStatus: (status: DaemonStatus | null) => void;
  setAgents: (agents: Agent[]) => void;
  mergeAgents: (agents: Agent[]) => void;
  setTasks: (tasks: Task[]) => void;
  mergeTasks: (tasks: Task[]) => void;
  setMessages: (messages: Message[]) => void;
  mergeMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setSuggestions: (suggestions: Suggestion[]) => void;
  addSuggestion: (suggestion: Suggestion) => void;
  setActiveView: (view: AppState['activeView']) => void;
  setSelectedAgent: (id: string | null) => void;
  setSelectedTask: (id: string | null) => void;
  setAgentDetailTab: (tab: AgentDetailTab) => void;
  setError: (error: string | null) => void;
  setConnecting: (connecting: boolean) => void;
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
  agentDetailTab: 'overview',

  // Actions
  setDaemonStatus: (status) => set({ daemonStatus: status }),
  setAgents: (agents) => set({ agents }),
  // Merge new agents with existing ones (preserves local cache, prevents flickering)
  mergeAgents: (newAgents) =>
    set((state) => {
      const existingMap = new Map(state.agents.map((a) => [a.id, a]));
      for (const agent of newAgents) {
        existingMap.set(agent.id, agent);
      }
      return { agents: Array.from(existingMap.values()) };
    }),
  setTasks: (tasks) => set({ tasks }),
  // Merge new tasks with existing ones (preserves local cache, prevents flickering)
  mergeTasks: (newTasks) =>
    set((state) => {
      const existingMap = new Map(state.tasks.map((t) => [t.id, t]));
      for (const task of newTasks) {
        existingMap.set(task.id, task);
      }
      // Sort by updatedAt (newest first)
      const merged = Array.from(existingMap.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      return { tasks: merged };
    }),
  setMessages: (messages) => set({ messages }),
  // Merge new messages with existing ones (preserves local cache)
  mergeMessages: (newMessages) =>
    set((state) => {
      // Create a map of existing messages by ID for fast lookup
      const existingMap = new Map(state.messages.map((m) => [m.id, m]));

      // Add new messages, updating existing ones
      for (const msg of newMessages) {
        existingMap.set(msg.id, msg);
      }

      // Convert back to array and sort by timestamp (newest first)
      const merged = Array.from(existingMap.values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 200); // Keep last 200 messages

      return { messages: merged };
    }),
  addMessage: (message) =>
    set((state) => ({
      messages: [message, ...state.messages].slice(0, 200), // Keep last 200
    })),
  setSuggestions: (suggestions) => set({ suggestions }),
  addSuggestion: (suggestion) =>
    set((state) => ({
      suggestions: [suggestion, ...state.suggestions].slice(0, 50), // Keep last 50
    })),
  setActiveView: (activeView) => set({ activeView }),
  setSelectedAgent: (selectedAgent) => set({ selectedAgent }),
  setSelectedTask: (selectedTask) => set({ selectedTask }),
  setAgentDetailTab: (agentDetailTab) => set({ agentDetailTab }),
  setError: (lastError) => set({ lastError }),
  setConnecting: (isConnecting) => set({ isConnecting }),
}));

// Selector hooks for common patterns
export const useAgents = () => useAppStore((state) => state.agents);
export const useTasks = () => useAppStore((state) => state.tasks);
export const useMessages = () => useAppStore((state) => state.messages);
export const useSuggestions = () => useAppStore((state) => state.suggestions);
export const useDaemonStatus = () => useAppStore((state) => state.daemonStatus);
export const useActiveView = () => useAppStore((state) => state.activeView);
