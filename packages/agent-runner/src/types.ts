/**
 * Agent Runner Types
 *
 * Type definitions for the sophisticated agent runner system.
 */

export type AgentTool = 'claude' | 'gemini' | 'opencode' | 'aider';
export type ModelTier = 'opus' | 'sonnet' | 'haiku';

/**
 * Stream event types from AI coding CLIs
 */
export type StreamEventType =
  | 'init'
  | 'thinking'
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'diff'
  | 'commit'
  | 'complete'
  | 'error';

/**
 * Unified stream event from any supported CLI tool
 */
export interface StreamEvent {
  /** Source tool that generated this event */
  source: AgentTool;
  /** Event type */
  type: StreamEventType;
  /** Event content (text, thinking, etc.) */
  content?: string;
  /** ISO timestamp */
  timestamp: string;
  /** Unique event ID */
  eventId?: string;
  /** Tool name for tool_use events */
  toolName?: string;
  /** Tool input for tool_use events */
  toolInput?: Record<string, unknown>;
  /** Tool use ID for tool_result events */
  toolUseId?: string;
  /** Whether this is an error */
  isError?: boolean;
  /** Token usage information */
  usage?: TokenUsage;
  /** Original raw event for debugging */
  raw?: unknown;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Unique agent ID */
  agentId: string;
  /** Agent name/persona */
  agentName: string;
  /** AI tool to use */
  tool: AgentTool;
  /** Model tier */
  model?: ModelTier;
  /** Working directory */
  workdir: string;
  /** Initial prompt/task */
  task: string;
  /** MCP server URL */
  mcpUrl?: string;
  /** Redis URL for event streaming */
  redisUrl?: string;
  /** Max iterations before stopping */
  maxIterations?: number;
  /** Max idle iterations before stopping */
  maxIdleIterations?: number;
  /** Skip permission prompts */
  dangerouslySkipPermissions?: boolean;
  /** Additional CLI arguments */
  additionalArgs?: string[];
  /** Resource limits */
  limits?: ResourceLimits;
}

/**
 * Resource limits for agent
 */
export interface ResourceLimits {
  /** Max memory in MB */
  maxMemoryMb?: number;
  /** Max tokens per iteration */
  maxTokensPerIteration?: number;
  /** Max cost per session in USD */
  maxCostUsd?: number;
  /** Max errors before shutdown */
  maxErrors?: number;
}

/**
 * Agent metrics
 */
export interface AgentMetrics {
  /** Agent ID */
  agentId: string;
  /** Start time */
  startedAt: string;
  /** Current iteration */
  iteration: number;
  /** Total input tokens */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Number of errors */
  errorCount: number;
  /** Memory usage in MB */
  memoryMb: number;
  /** Last heartbeat */
  lastHeartbeat: string;
}

/**
 * Agent status
 */
export type AgentStatus =
  | 'starting'
  | 'running'
  | 'idle'
  | 'stopping'
  | 'stopped'
  | 'error';

/**
 * Agent state
 */
export interface AgentState {
  status: AgentStatus;
  config: AgentConfig;
  metrics: AgentMetrics;
  currentTaskId?: string;
  lastError?: string;
}

/**
 * CLI adapter interface for supporting multiple tools
 */
export interface CliAdapter {
  /** Tool name */
  name: AgentTool;
  /** Check if CLI is available */
  isAvailable(): Promise<boolean>;
  /** Build spawn arguments */
  buildArgs(config: AgentConfig): string[];
  /** Parse a line of output into a stream event */
  parseLine(line: string): StreamEvent | null;
  /** Whether this tool uses stream-json format */
  isStreamFormat: boolean;
}

/**
 * Raw Claude stream-json event types
 */
export interface ClaudeStreamEvent {
  type: string;
  subtype?: string;
  message?: {
    id: string;
    model: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  index?: number;
  content_block?: {
    type: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    text?: string;
    thinking?: string;
  };
  delta?: {
    type: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
  };
  error?: {
    type: string;
    message: string;
  };
}

/**
 * Runner event emitter types
 */
export interface RunnerEvents {
  event: (event: StreamEvent) => void;
  started: (config: AgentConfig) => void;
  stopped: (reason: string, exitCode?: number) => void;
  error: (error: Error) => void;
  metrics: (metrics: AgentMetrics) => void;
}
