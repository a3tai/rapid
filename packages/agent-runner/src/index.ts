/**
 * @a3t/agent-runner
 *
 * Sophisticated agent runner for RAPID with streaming output and multi-tool support.
 *
 * Features:
 * - Multi-tool support: Claude, Gemini, OpenCode, Aider
 * - Unified stream event format
 * - Redis streaming for real-time updates
 * - Token usage tracking and cost estimation
 * - Resource limits and error handling
 *
 * @example
 * ```typescript
 * import { AgentRunner } from '@a3t/agent-runner';
 *
 * const runner = new AgentRunner({
 *   agentId: 'my-agent',
 *   agentName: 'Worker',
 *   tool: 'claude',
 *   model: 'sonnet',
 *   workdir: '/path/to/project',
 *   task: 'Implement the user authentication feature',
 * });
 *
 * runner.on('event', (event) => {
 *   console.log(`[${event.type}] ${event.content}`);
 * });
 *
 * await runner.start();
 * ```
 */

// Types
export type {
  AgentTool,
  ModelTier,
  StreamEventType,
  StreamEvent,
  TokenUsage,
  AgentConfig,
  ResourceLimits,
  AgentMetrics,
  AgentStatus,
  AgentState,
  CliAdapter,
  ClaudeStreamEvent,
  RunnerEvents,
} from './types.js';

// Runner
export { AgentRunner, type AgentRunnerOptions } from './runner.js';

// Adapters
export {
  ClaudeAdapter,
  GeminiAdapter,
  AiderAdapter,
  OpenCodeAdapter,
  getAdapter,
  getAvailableTools,
} from './adapters/index.js';
