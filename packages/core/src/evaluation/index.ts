/**
 * Evaluation Module
 *
 * Log tracking and evaluation system for RAPID that captures agent interactions
 * for prompt improvement and A/B testing.
 *
 * @example
 * ```typescript
 * import {
 *   createEvaluationLogger,
 *   createEvaluationAnalyzer,
 *   calculateCost,
 * } from '@a3t/rapid-core';
 *
 * // Create a logger with file storage
 * const logger = createEvaluationLogger({
 *   storage: { type: 'file', fileDir: './eval-logs' },
 *   captureThinking: true,
 *   captureToolDetails: true,
 * });
 *
 * // Start logging an interaction
 * const builder = logger.startLog(sessionId, agentId, 'architect');
 * builder.setPrompt(systemPrompt, userMessage);
 * builder.setModel('claude-sonnet-4-20250514');
 *
 * // ... agent interaction happens ...
 *
 * builder.setResponse(responseContent, thinkingContent);
 * builder.addToolCall({
 *   id: 'tool_1',
 *   name: 'Read',
 *   input: { file_path: '/path/to/file' },
 *   output: fileContent,
 *   success: true,
 *   durationMs: 50,
 *   startedAt: new Date().toISOString(),
 *   completedAt: new Date().toISOString(),
 * });
 *
 * builder.setOutcome('success');
 * builder.setMetrics(
 *   { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
 *   latencyMs,
 *   calculateCost({ inputTokens: 1000, outputTokens: 500, totalTokens: 1500 }, 'claude-sonnet-4-20250514')
 * );
 *
 * const log = await logger.completeLog(builder);
 *
 * // Analyze logs
 * const analyzer = createEvaluationAnalyzer(logger);
 * const metrics = await analyzer.calculateMetrics();
 * const comparison = await analyzer.compareVariants('prompt-v1', 'prompt-v2');
 * const trainingData = await analyzer.exportForTraining({ successOnly: true });
 * ```
 */

// Types
export type {
  EvaluationLog,
  EvaluationLoggerConfig,
  EvaluationStorageConfig,
  ToolCallRecord,
  TokenUsage,
  CostBreakdown,
  EvaluationOutcome,
  EvaluationLogBuilder,
  PricingConfig,
  UserFeedback,
  FeedbackIssue,
  ConversationMessage,
  EvaluationQueryOptions,
  EvaluationMetrics,
  ABTestComparison,
  TrainingExport,
  TrainingExample,
} from './types.js';

// Constants
export { DEFAULT_PRICING } from './types.js';

// Logger
export {
  EvaluationLogger,
  createEvaluationLogger,
  createLogBuilder,
  calculateCost,
} from './logger.js';

// Analyzer
export { EvaluationAnalyzer, createEvaluationAnalyzer } from './analyzer.js';
