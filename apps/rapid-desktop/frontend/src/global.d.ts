/**
 * Global Type Declarations
 */

// Build-time constant from Vite
declare const __IS_WAILS_BUILD__: boolean;

// Wails v3 runtime types
interface Window {
  wails?: unknown;
  chrome?: {
    webview?: unknown;
  };
}

// Wails v3 generated bindings - these are JS files without type declarations
declare module '@bindings/rapid-desktop/appservice' {
  interface DaemonStatus {
    running: boolean;
    pid?: number;
    socketPath?: string;
    version?: string;
    uptime?: number;
    sessions?: number;
  }

  interface Agent {
    id: string;
    name: string;
    worktree?: string;
    session?: string;
  }

  interface Task {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    assignedTo?: string;
    createdAt: string;
    updatedAt: string;
    tags?: string[];
  }

  interface Message {
    id: string;
    type: string;
    fromAgent: Agent;
    timestamp: string;
    payload: Record<string, unknown>;
  }

  interface LogEntry {
    content?: string;
    line?: string;
    timestamp?: string;
  }

  export function GetDaemonStatus(): Promise<DaemonStatus | null>;
  export function GetAgents(): Promise<Agent[]>;
  export function GetTasks(status: string): Promise<Task[]>;
  export function GetMessages(limit: number): Promise<Message[]>;
  export function CreateTask(title: string, description: string, priority: string, tags: string[]): Promise<Task | null>;
  export function SpawnAgent(persona: string, worktree: string): Promise<void>;
  export function StopAgent(agentId: string): Promise<void>;
  export function Subscribe(eventType: string): Promise<string>;
  export function Unsubscribe(subId: string): Promise<void>;
  export function SendMessage(targetAgent: string, messageType: string, content: string): Promise<string>;
  export function GetChatHistory(agentId: string, limit: number): Promise<Message[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function CallTool(toolName: string, args: Record<string, unknown>): Promise<any>;
  export function UpdateTaskStatus(taskId: string, status: string): Promise<void>;
  export function FetchApprovals(status: string, agentId: string, limit: number): Promise<Record<string, unknown>[]>;
  export function ApproveRequest(requestId: string, reason: string): Promise<void>;
  export function RejectRequest(requestId: string, reason: string): Promise<void>;
  export function SubmitVote(suggestionId: string, vote: string): Promise<void>;
  export function OverrideSuggestion(suggestionId: string, decision: string, reason: string): Promise<void>;
  export function GetConfig(): Promise<Record<string, unknown>>;
  export function SaveConfig(config: Record<string, unknown>): Promise<void>;
  export function GetAgentLogs(agentId: string, limit: number): Promise<LogEntry[]>;
  export function GetLogsDirectory(): Promise<string[]>;
}
