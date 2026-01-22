/**
 * Evaluation Types
 *
 * Type definitions for the log tracking and evaluation system.
 * Used for capturing agent interactions for prompt improvement and A/B testing.
 */

/**
 * Tool call record for evaluation logging
 */
export interface ToolCallRecord {
  /** Tool call ID */
  id: string;
  /** Tool name */
  name: string;
  /** Tool input parameters */
  input: Record<string, unknown>;
  /** Tool output/result */
  output?: unknown;
  /** Whether the tool call succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** ISO timestamp when tool was invoked */
  startedAt: string;
  /** ISO timestamp when tool completed */
  completedAt: string;
}

/**
 * Outcome of an agent interaction
 */
export type EvaluationOutcome = 'success' | 'failure' | 'partial' | 'unknown';

/**
 * User feedback on agent response
 */
export interface UserFeedback {
  /** Numeric rating (1-5) */
  rating?: number;
  /** Qualitative feedback */
  comment?: string;
  /** Was the task completed correctly? */
  taskCompleted?: boolean;
  /** Categories of issues observed */
  issues?: FeedbackIssue[];
  /** Timestamp of feedback */
  timestamp: string;
}

/**
 * Categories of issues that can be flagged in feedback
 */
export type FeedbackIssue =
  | 'incorrect_code'
  | 'incomplete_response'
  | 'wrong_approach'
  | 'hallucination'
  | 'tool_misuse'
  | 'context_ignored'
  | 'slow_response'
  | 'other';

/**
 * Token usage breakdown
 */
export interface TokenUsage {
  /** Input tokens (prompt) */
  inputTokens: number;
  /** Output tokens (response) */
  outputTokens: number;
  /** Tokens used for cache creation */
  cacheCreationTokens?: number;
  /** Tokens read from cache */
  cacheReadTokens?: number;
  /** Total tokens */
  totalTokens: number;
}

/**
 * Cost breakdown
 */
export interface CostBreakdown {
  /** Cost for input tokens */
  inputCost: number;
  /** Cost for output tokens */
  outputCost: number;
  /** Total estimated cost in USD */
  totalCost: number;
  /** Pricing tier used for calculation */
  pricingTier: string;
}

/**
 * Main evaluation log entry
 */
export interface EvaluationLog {
  /** Unique log ID */
  id: string;
  /** Session ID (groups related interactions) */
  sessionId: string;
  /** Agent UUID */
  agentId: string;
  /** Persona name/type */
  persona: string;
  /** Task ID if associated with a task */
  taskId?: string;
  /** ISO timestamp */
  timestamp: string;

  // === Prompt Data ===

  /** System prompt sent to model */
  systemPrompt: string;
  /** User message/task */
  userMessage: string;
  /** List of context files/resources included */
  contextIncluded: string[];
  /** Conversation history (previous messages) */
  conversationHistory?: ConversationMessage[];
  /** Prompt template version/name for A/B testing */
  promptVersion?: string;
  /** A/B test variant identifier */
  experimentVariant?: string;

  // === Response Data ===

  /** Model's thinking/reasoning content (extended thinking) */
  thinkingContent?: string;
  /** Final response content */
  responseContent: string;
  /** Tool calls made during response */
  toolCalls: ToolCallRecord[];
  /** Model used for response */
  model: string;
  /** Stop reason (end_turn, tool_use, max_tokens, etc.) */
  stopReason?: string;

  // === Outcome ===

  /** Overall outcome assessment */
  outcome: EvaluationOutcome;
  /** User feedback if provided */
  userFeedback?: UserFeedback;
  /** Error message if failed */
  errorMessage?: string;
  /** Error type/code if applicable */
  errorType?: string;
  /** Stack trace for debugging */
  errorStack?: string;

  // === Metrics ===

  /** Token usage breakdown */
  tokens: TokenUsage;
  /** Time from request to first response byte */
  timeToFirstToken?: number;
  /** Total latency in milliseconds */
  latencyMs: number;
  /** Estimated cost breakdown */
  cost: CostBreakdown;

  // === Metadata ===

  /** Project/repo identifier */
  projectId?: string;
  /** Git branch at time of interaction */
  gitBranch?: string;
  /** Git commit SHA */
  gitCommit?: string;
  /** Environment (dev, staging, prod) */
  environment?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Conversation message in history
 */
export interface ConversationMessage {
  /** Role (user, assistant, system) */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * Configuration for the evaluation logger
 */
export interface EvaluationLoggerConfig {
  /** Storage backend configuration */
  storage: EvaluationStorageConfig;
  /** Whether to capture thinking content */
  captureThinking?: boolean;
  /** Whether to capture full tool I/O */
  captureToolDetails?: boolean;
  /** Maximum length for response content (truncate if exceeded) */
  maxResponseLength?: number;
  /** Maximum length for thinking content */
  maxThinkingLength?: number;
  /** Whether to capture conversation history */
  captureHistory?: boolean;
  /** Sampling rate (0-1) for logging - useful for high-volume scenarios */
  samplingRate?: number;
  /** Tags to add to all logs */
  defaultTags?: Record<string, string>;
}

/**
 * Storage backend configuration
 */
export interface EvaluationStorageConfig {
  /** Storage type */
  type: 'sqlite' | 'redis' | 'file' | 'memory';
  /** SQLite database path */
  sqlitePath?: string;
  /** Redis connection options */
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  /** File storage directory */
  fileDir?: string;
  /** Maximum logs to keep in memory storage */
  memoryLimit?: number;
}

/**
 * Query options for analyzing logs
 */
export interface EvaluationQueryOptions {
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by session ID */
  sessionId?: string;
  /** Filter by persona */
  persona?: string;
  /** Filter by task ID */
  taskId?: string;
  /** Filter by outcome */
  outcome?: EvaluationOutcome;
  /** Filter by prompt version */
  promptVersion?: string;
  /** Filter by experiment variant */
  experimentVariant?: string;
  /** Filter by date range start */
  startDate?: Date;
  /** Filter by date range end */
  endDate?: Date;
  /** Filter by minimum cost */
  minCost?: number;
  /** Filter by maximum cost */
  maxCost?: number;
  /** Filter by minimum latency */
  minLatency?: number;
  /** Filter by maximum latency */
  maxLatency?: number;
  /** Order by field */
  orderBy?: 'timestamp' | 'latencyMs' | 'totalCost' | 'totalTokens';
  /** Order direction */
  orderDir?: 'asc' | 'desc';
  /** Pagination offset */
  offset?: number;
  /** Pagination limit */
  limit?: number;
}

/**
 * Aggregated metrics for analysis
 */
export interface EvaluationMetrics {
  /** Total number of logs */
  totalLogs: number;
  /** Outcome distribution */
  outcomeDistribution: Record<EvaluationOutcome, number>;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** P50 latency */
  p50LatencyMs: number;
  /** P95 latency */
  p95LatencyMs: number;
  /** P99 latency */
  p99LatencyMs: number;
  /** Average input tokens */
  avgInputTokens: number;
  /** Average output tokens */
  avgOutputTokens: number;
  /** Total cost */
  totalCost: number;
  /** Average cost per interaction */
  avgCost: number;
  /** Error rate */
  errorRate: number;
  /** Average user rating (if feedback present) */
  avgUserRating?: number;
  /** Tool usage frequency */
  toolUsageFrequency: Record<string, number>;
  /** Time period covered */
  periodStart: string;
  /** Time period end */
  periodEnd: string;
}

/**
 * A/B test comparison results
 */
export interface ABTestComparison {
  /** Variant A identifier */
  variantA: string;
  /** Variant B identifier */
  variantB: string;
  /** Sample size for variant A */
  sampleSizeA: number;
  /** Sample size for variant B */
  sampleSizeB: number;
  /** Metrics for variant A */
  metricsA: EvaluationMetrics;
  /** Metrics for variant B */
  metricsB: EvaluationMetrics;
  /** Statistical significance (p-value) for outcome */
  outcomePValue?: number;
  /** Statistical significance for latency */
  latencyPValue?: number;
  /** Statistical significance for cost */
  costPValue?: number;
  /** Recommendation based on analysis */
  recommendation?: 'A' | 'B' | 'inconclusive';
}

/**
 * Export format for training data generation
 */
export interface TrainingExport {
  /** Export format version */
  version: string;
  /** Export timestamp */
  exportedAt: string;
  /** Number of examples */
  count: number;
  /** Training examples */
  examples: TrainingExample[];
}

/**
 * Single training example for fine-tuning
 */
export interface TrainingExample {
  /** System prompt */
  system: string;
  /** User message */
  user: string;
  /** Assistant response */
  assistant: string;
  /** Outcome for filtering */
  outcome: EvaluationOutcome;
  /** User rating if available */
  rating?: number;
  /** Tools used */
  toolsUsed: string[];
  /** Original log ID for reference */
  sourceLogId: string;
}

/**
 * Builder for creating evaluation log entries
 */
export interface EvaluationLogBuilder {
  /** Set session info */
  setSession(sessionId: string, agentId: string, persona: string): this;
  /** Set task info */
  setTask(taskId: string): this;
  /** Set prompt data */
  setPrompt(systemPrompt: string, userMessage: string): this;
  /** Add context file */
  addContext(contextPath: string): this;
  /** Set response data */
  setResponse(content: string, thinkingContent?: string): this;
  /** Add tool call */
  addToolCall(toolCall: ToolCallRecord): this;
  /** Set outcome */
  setOutcome(outcome: EvaluationOutcome, errorMessage?: string): this;
  /** Set metrics */
  setMetrics(tokens: TokenUsage, latencyMs: number, cost: CostBreakdown): this;
  /** Set model info */
  setModel(model: string, stopReason?: string): this;
  /** Set prompt version for A/B testing */
  setPromptVersion(version: string, variant?: string): this;
  /** Add metadata */
  addMetadata(key: string, value: unknown): this;
  /** Build the final log entry */
  build(): EvaluationLog;
}

/**
 * Pricing configuration for cost calculation
 */
export interface PricingConfig {
  /** Model name pattern */
  modelPattern: string;
  /** Cost per 1M input tokens */
  inputPer1M: number;
  /** Cost per 1M output tokens */
  outputPer1M: number;
  /** Tier name */
  tier: string;
}

/**
 * Default pricing configurations
 */
export const DEFAULT_PRICING: PricingConfig[] = [
  { modelPattern: 'opus', inputPer1M: 15, outputPer1M: 75, tier: 'opus' },
  { modelPattern: 'sonnet', inputPer1M: 3, outputPer1M: 15, tier: 'sonnet' },
  { modelPattern: 'haiku', inputPer1M: 0.25, outputPer1M: 1.25, tier: 'haiku' },
  { modelPattern: 'gpt-4o', inputPer1M: 5, outputPer1M: 15, tier: 'gpt-4o' },
  { modelPattern: 'gpt-4', inputPer1M: 30, outputPer1M: 60, tier: 'gpt-4' },
  { modelPattern: 'gpt-3.5', inputPer1M: 0.5, outputPer1M: 1.5, tier: 'gpt-3.5' },
  { modelPattern: 'gemini-pro', inputPer1M: 1.25, outputPer1M: 5, tier: 'gemini-pro' },
];
