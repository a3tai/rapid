# Agent Runner v2 Architecture

<<<<<<< HEAD
This document defines the architecture for the next-generation RAPID Agent Runner, replacing the shell-based agent-loop.sh with a sophisticated TypeScript runner that provides proper I/O control, event streaming, and lifecycle management.

## Executive Summary

**Recommended Architecture**: TypeScript/Node.js Runner

After evaluating the three options:
- A) Node.js runner (TypeScript) - **Recommended**
- B) Go runner
- C) Rust runner

The TypeScript option is recommended because:
1. **Stack alignment** - Matches existing RAPID codebase (packages/*, daemon, rapid-mcp)
2. **Existing foundation** - `packages/agent-runner` already implements core features
3. **Stream processing** - Node.js excels at real-time stream parsing
4. **XState integration** - State machine library recommended in agent-state-machine.md
5. **Developer familiarity** - Same language as rest of RAPID ecosystem
6. **Package reuse** - Can leverage existing `@a3t/rapid-eventbus`, `@a3t/rapid-core`

## Current State Analysis

### Existing `packages/agent-runner`

The current implementation provides:
- Multi-tool adapters: Claude, Gemini, OpenCode, Aider
- Stream event parsing from CLI output
- Redis event streaming
- Token/cost tracking
- Resource monitoring with limits
- Evaluation logging integration

### Gaps to Address

1. **No XState integration** - Uses simple status strings instead of state machine
2. **No event bus integration** - Streams to Redis but doesn't use bus_* protocol
3. **Missing task workflow** - No task_claim/task_progress/task_complete cycle
4. **Limited signal handling** - Basic SIGTERM/SIGINT without cleanup coordination
5. **No worktree management** - Expects worktree to be pre-created
6. **No heartbeat system** - Relies on daemon for health monitoring

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Agent Runner v2 Architecture                          │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────────┐
                              │  Agent Runner    │
                              │  Entry Point     │
                              └────────┬─────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
           ┌────────▼───────┐ ┌────────▼───────┐ ┌───────▼────────┐
           │ Process Manager│ │  State Machine │ │ Event Dispatcher│
           │   (node-pty)   │ │    (XState)    │ │    (Redis)      │
           └────────┬───────┘ └────────┬───────┘ └───────┬────────┘
                    │                  │                  │
                    │         ┌────────▼───────┐         │
                    └────────►│  Stream Parser  │◄───────┘
                              │  (JSON Lines)   │
                              └────────┬───────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
   ┌───────▼───────┐          ┌───────▼───────┐          ┌────────▼───────┐
   │   Heartbeat   │          │   Resource    │          │    Worktree    │
   │    Manager    │          │    Tracker    │          │    Manager     │
   └───────────────┘          └───────────────┘          └────────────────┘
=======
This document describes the architecture for a new sophisticated agent runner to replace `agent-loop.sh` with proper I/O control, real-time stream parsing, and full integration with the RAPID ecosystem.

## Executive Summary

The current `agent-loop.sh` implementation is a bash script that:
- Runs Claude Code in a loop with prompt injection
- Uses curl to communicate with the MCP server
- Has basic heartbeat and shutdown handling
- Works but lacks proper I/O streaming, resource tracking, and recovery

The new Agent Runner v2 will be a TypeScript-based process manager that provides:
- Real-time parsing of Claude Code's stream-json output
- Event forwarding to Redis/event bus with rich metadata
- Proper signal handling with graceful shutdown
- Health monitoring with heartbeats
- Resource tracking (memory, tokens, cost)
- Task claiming and completion workflow
- Git worktree management
- Integration with XState for state machine management

## Architecture Decision: TypeScript (Node.js)

### Recommendation: Node.js Runner (TypeScript)

After analyzing the options, **TypeScript/Node.js** is the recommended choice:

| Criteria | Node.js (TS) | Go | Rust |
|----------|--------------|-----|------|
| **Stack Alignment** | ✅ Perfect match | ⚠️ Partial (Wails) | ❌ New stack |
| **Event Bus Integration** | ✅ Native ioredis | ⚠️ go-redis | ⚠️ redis-rs |
| **Stream Parsing** | ✅ Native streams | ⚠️ Manual | ⚠️ Manual |
| **Type Safety** | ✅ Zod schemas | ⚠️ Manual | ✅ Strong |
| **Development Speed** | ✅ Fast iteration | ⚠️ Medium | ❌ Slower |
| **Team Knowledge** | ✅ Core stack | ⚠️ Some knowledge | ❌ Limited |
| **Binary Distribution** | ⚠️ Node required | ✅ Single binary | ✅ Single binary |
| **Process Control** | ✅ node-pty/execa | ✅ os/exec | ✅ nix |

### Rationale

1. **Stack Alignment**: RAPID is a TypeScript monorepo. The existing event bus (`@a3t/rapid-eventbus`), MCP server, and daemon are all TypeScript. This ensures:
   - Shared type definitions (Zod schemas)
   - Consistent error handling patterns
   - Easy code reuse and integration
   - Unified testing infrastructure

2. **Stream Processing**: Node.js excels at stream processing with built-in `stream.Transform` classes. Parsing Claude Code's stream-json output is straightforward.

3. **XState Integration**: The recommended state machine library (XState v5) is TypeScript-first with excellent type inference.

4. **Existing Patterns**: The `SessionManager` and `EnvironmentProvider` interfaces already exist in the daemon package and can be leveraged.

### Alternative Consideration: Go

Go could be considered for a future v3 if:
- Binary distribution becomes critical
- Performance profiling shows Node.js bottlenecks
- The Wails desktop app needs deep integration

However, the development cost of maintaining two stacks outweighs the benefits for now.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RAPID Agent Runner v2                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Agent Runner Process                              │    │
│  │  ┌───────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │    │
│  │  │ Process       │  │ Stream       │  │ State Machine (XState)   │   │    │
│  │  │ Manager       │  │ Parser       │  │                          │   │    │
│  │  │               │  │              │  │  idle → claiming →       │   │    │
│  │  │ - spawn       │  │ - JSON lines │  │  working → completed     │   │    │
│  │  │ - stdin/out   │  │ - events     │  │                          │   │    │
│  │  │ - signals     │  │ - metrics    │  │  error → recovering      │   │    │
│  │  └───────┬───────┘  └──────┬───────┘  └────────────┬────────────┘   │    │
│  │          │                 │                        │                 │    │
│  │          └────────────────┴────────────┬───────────┘                 │    │
│  │                                         │                             │    │
│  │  ┌─────────────────────────────────────▼─────────────────────────┐   │    │
│  │  │                    Event Dispatcher                            │   │    │
│  │  │                                                                │   │    │
│  │  │  Events → Redis Streams → Event Bus → Other Agents            │   │    │
│  │  └───────────────────────────────────────────────────────────────┘   │    │
│  │                                                                       │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │    │
│  │  │ Heartbeat       │  │ Resource        │  │ Worktree            │   │    │
│  │  │ Manager         │  │ Tracker         │  │ Manager             │   │    │
│  │  │                 │  │                 │  │                     │   │    │
│  │  │ - 30s interval  │  │ - Memory usage  │  │ - Create branch     │   │    │
│  │  │ - Failure count │  │ - Token count   │  │ - Cleanup on done   │   │    │
│  │  │ - Auto-recover  │  │ - Cost estimate │  │ - PR integration    │   │    │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘   │    │
│  └───────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│                              ▲                                               │
│                              │ IPC (JSON-RPC over stdio/socket)             │
│                              ▼                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐    │
│  │                        RAPID Daemon                                    │    │
│  │  - Session management                                                 │    │
│  │  - Environment providers (Docker, Lima, Local)                        │    │
│  │  - Secrets caching                                                    │    │
│  │  - Gateway routing                                                    │    │
│  └───────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
```

## Core Components

### 1. Process Manager

<<<<<<< HEAD
Manages the spawning and lifecycle of the AI CLI process using `node-pty` for proper PTY emulation.

```typescript
interface ProcessManager {
  // Spawn the AI CLI process
  spawn(config: AgentConfig): Promise<void>;

  // Send input to the process
  write(data: string): void;

  // Signal handling
  sendSignal(signal: NodeJS.Signals): void;

  // Graceful shutdown with timeout
  stop(timeout?: number): Promise<ExitInfo>;

  // Process state
  readonly pid: number | null;
  readonly isRunning: boolean;

  // Events
  on(event: 'data', handler: (data: string) => void): void;
  on(event: 'exit', handler: (code: number, signal: string) => void): void;
}
```

**Implementation Notes:**
- Use `node-pty` instead of `child_process.spawn` for proper terminal emulation
- Required for Claude Code's interactive features (progress bars, colored output)
- Handles resize events for responsive terminal output
- Provides raw data stream for parsing

### 2. Stream Parser

Parses the JSON Lines output from AI CLIs into structured events.

```typescript
interface StreamParser {
  // Process a line of output
  parseLine(line: string): StreamEvent | null;

  // Batch processing
  parseChunk(chunk: string): StreamEvent[];

  // Handle partial JSON (streaming)
  appendPartial(data: string): StreamEvent[];

  // Reset parser state
  reset(): void;
}

interface StreamEvent {
  // Unique event identifier
  eventId: string;

  // Event classification
  type: StreamEventType;
  source: 'claude' | 'gemini' | 'opencode' | 'aider';

  // Content and metadata
  content?: string;
  timestamp: string;

  // Tool-specific fields
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;

  // Token usage (when available)
  usage?: TokenUsage;

  // Error flag
  isError?: boolean;

  // Original data for debugging
  raw?: unknown;
}

type StreamEventType =
  | 'init'           // Agent initialization
  | 'thinking'       // Extended thinking/reasoning
  | 'text'           // Regular text output
  | 'tool_use'       // Tool invocation start
  | 'tool_result'    // Tool execution result
  | 'diff'           // Code diff display
  | 'commit'         // Git commit event
  | 'complete'       // Iteration complete
  | 'error';         // Error occurred
=======
Responsible for spawning, monitoring, and controlling the Claude Code process.

```typescript
interface ProcessManager {
  // Spawn Claude Code with given configuration
  spawn(config: SpawnConfig): Promise<RunningProcess>;

  // Send input to the process
  sendInput(process: RunningProcess, input: string): void;

  // Signal handling
  sendSignal(process: RunningProcess, signal: 'SIGTERM' | 'SIGINT' | 'SIGHUP'): void;

  // Kill the process
  kill(process: RunningProcess, force?: boolean): Promise<void>;
}

interface SpawnConfig {
  // Agent configuration
  agentName: string;
  worktree: string;
  model: 'opus' | 'sonnet' | 'haiku' | string;

  // Prompt configuration
  systemPrompt?: string;
  initialTask: string;

  // Process options
  cwd: string;
  env: Record<string, string>;
  timeout?: number; // Max runtime in ms

  // Permissions
  dangerouslySkipPermissions?: boolean;
  allowedTools?: string[];
}

interface RunningProcess {
  pid: number;
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  exitPromise: Promise<number>;
}
```

### 2. Stream Parser

Parses Claude Code's stream-json output format in real-time.

```typescript
interface StreamParser {
  // Parse incoming stream, emit events
  parse(stream: Readable): AsyncIterable<ParsedEvent>;
}

// Event types from Claude Code's stream-json output
type ParsedEvent =
  | { type: 'init'; sessionId: string; model: string }
  | { type: 'system'; content: string }
  | { type: 'assistant'; messageId: string; content: ContentBlock[] }
  | { type: 'tool_use'; toolUseId: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: unknown; isError?: boolean }
  | { type: 'user'; content: string }
  | { type: 'result'; exitCode: number; stats: ResultStats }
  | { type: 'error'; code: string; message: string }
  | { type: 'heartbeat'; timestamp: string };

interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  text?: string;
  thinking?: string;
  toolName?: string;
  toolInput?: unknown;
}

interface ResultStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalCost: number;
  duration: number;
}
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
```

### 3. State Machine (XState)

<<<<<<< HEAD
Implements the agent lifecycle using XState v5, following the design in `docs/architecture/agent-state-machine.md`.

```
                          ┌──────────────────────────────────────┐
                          │         Agent State Machine          │
                          └──────────────────────────────────────┘

     ┌──────────────────────────────────────────────────────────────────┐
     │                                                                   │
     │   ┌────────┐     ┌──────────┐     ┌─────────┐     ┌───────────┐ │
     │   │  Idle  │────►│ Claiming │────►│ Working │────►│ Completed │ │
     │   └────────┘     └──────────┘     └─────────┘     └───────────┘ │
     │        ▲              │                │                │        │
     │        │              │                │                │        │
     │        │         ┌────▼────┐      ┌────▼────┐          │        │
     │        └─────────│  Retry  │◄─────│  Error  │◄─────────┘        │
     │                  └─────────┘      └─────────┘                    │
     │                                        │                         │
     │                                   ┌────▼────┐                    │
     │                                   │Shutdown │                    │
     │                                   └─────────┘                    │
     └──────────────────────────────────────────────────────────────────┘
```

**State Definitions:**

| State | Description | Entry Actions | Exit Actions |
|-------|-------------|---------------|--------------|
| idle | Ready for tasks | Send heartbeat, watch task queue | Stop heartbeat |
| claiming | Attempting to claim task | Call task_claim | - |
| working | Executing assigned task | Start progress timer, spawn CLI | Stop progress timer |
| completed | Task finished | Call task_complete, request merge | Cleanup temp files |
| error | Error occurred | Log error, notify bus | - |
| shutdown | Graceful termination | Return task, deregister | - |

**XState Machine Definition:**

```typescript
import { setup, assign, fromPromise } from 'xstate';
=======
Manages agent lifecycle with predictable state transitions.

```typescript
import { setup, assign } from 'xstate';

interface AgentContext {
  agentId: string;
  agentName: string;
  worktree: string;
  capabilities: string[];

  // Current task
  taskId: string | null;
  taskStartedAt: number | null;

  // Process reference
  process: RunningProcess | null;

  // Metrics
  stats: {
    tasksCompleted: number;
    totalTokens: number;
    totalCost: number;
    errors: number;
  };

  // Error state
  error: {
    code: string;
    message: string;
    retryCount: number;
  } | null;
}
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)

const agentMachine = setup({
  types: {
    context: {} as AgentContext,
    events: {} as AgentEvent,
  },
<<<<<<< HEAD
  actors: {
    claimTask: fromPromise(claimTaskActor),
    executeTask: fromPromise(executeTaskActor),
    completeTask: fromPromise(completeTaskActor),
  },
  guards: {
    canClaim: ({ context }) => context.capabilities.length > 0,
    withinRetryLimit: ({ context }) => context.retryCount < 3,
    hasTask: ({ context }) => context.currentTaskId !== null,
  },
  delays: {
    HEARTBEAT_INTERVAL: 30_000,
    CLAIM_TIMEOUT: 10_000,
    PROGRESS_INTERVAL: 60_000,
  },
}).createMachine({
  id: 'agent',
  initial: 'idle',
  context: ({ input }) => ({
    agentId: input.agentId,
    agentName: input.agentName,
    worktree: input.worktree,
    capabilities: input.capabilities || [],
    currentTaskId: null,
    retryCount: 0,
  }),

  states: {
    idle: {
      entry: ['sendHeartbeat'],
      after: {
        HEARTBEAT_INTERVAL: { target: 'idle', reenter: true },
      },
      on: {
        TASK_AVAILABLE: { target: 'claiming', guard: 'canClaim' },
        STOP: 'shutdown',
=======
  // ... actions, guards, delays
}).createMachine({
  id: 'agentRunner',
  initial: 'idle',

  states: {
    idle: {
      entry: ['sendHeartbeat', 'clearTaskContext'],
      on: {
        TASK_AVAILABLE: {
          target: 'claiming',
          guard: 'canClaimTask',
        },
        SHUTDOWN: 'shuttingDown',
      },
      after: {
        HEARTBEAT_INTERVAL: {
          target: 'idle',
          reenter: true,
        },
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
      },
    },

    claiming: {
<<<<<<< HEAD
      invoke: {
        src: 'claimTask',
        onDone: {
          target: 'working',
          actions: assign({ currentTaskId: ({ event }) => event.output.taskId }),
        },
        onError: { target: 'idle' },
=======
      entry: 'claimTask',
      on: {
        TASK_CLAIMED: {
          target: 'spawning',
          actions: 'setTaskContext',
        },
        CLAIM_FAILED: 'idle',
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
      },
      after: {
        CLAIM_TIMEOUT: 'idle',
      },
    },

<<<<<<< HEAD
    working: {
      invoke: {
        src: 'executeTask',
        onDone: 'completed',
        onError: 'error',
      },
      after: {
        PROGRESS_INTERVAL: {
          actions: 'sendProgress',
          target: 'working',
          reenter: true,
        },
      },
      on: {
        STOP: { target: 'shutdown', actions: 'saveCheckpoint' },
      },
    },

    completed: {
      invoke: {
        src: 'completeTask',
        onDone: 'idle',
        onError: 'error',
      },
    },

    error: {
      on: {
        RETRY: { target: 'claiming', guard: 'withinRetryLimit' },
        RESET: 'idle',
        STOP: 'shutdown',
      },
    },

    shutdown: {
      entry: ['returnTask', 'deregisterFromBus'],
=======
    spawning: {
      entry: 'spawnProcess',
      on: {
        PROCESS_STARTED: 'working',
        SPAWN_ERROR: 'error',
      },
    },

    working: {
      type: 'parallel',
      states: {
        execution: {
          initial: 'running',
          states: {
            running: {
              on: {
                STREAM_EVENT: {
                  actions: 'forwardEvent',
                },
                PROCESS_EXITED: 'completed',
                PROCESS_ERROR: 'failed',
              },
            },
            completed: { type: 'final' },
            failed: { type: 'final' },
          },
        },
        monitoring: {
          initial: 'active',
          states: {
            active: {
              after: {
                PROGRESS_INTERVAL: {
                  target: 'active',
                  reenter: true,
                  actions: 'sendProgress',
                },
              },
            },
          },
        },
      },
      onDone: [
        { target: 'completed', guard: 'taskSucceeded' },
        { target: 'error' },
      ],
    },

    completed: {
      entry: ['completeTask', 'updateStats'],
      always: 'idle',
    },

    error: {
      entry: ['logError', 'reportError'],
      on: {
        RETRY: {
          target: 'recovering',
          guard: 'canRetry',
        },
        RESET: 'idle',
        FATAL: 'shuttingDown',
      },
    },

    recovering: {
      entry: 'attemptRecovery',
      on: {
        RECOVERY_SUCCESS: 'spawning',
        RECOVERY_FAILED: 'error',
      },
    },

    shuttingDown: {
      entry: ['returnTask', 'deregister', 'killProcess'],
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
      type: 'final',
    },
  },
});
```

### 4. Event Dispatcher

<<<<<<< HEAD
Integrates with RAPID's event bus for agent coordination.

```typescript
interface EventDispatcher {
  // Bus registration
  register(agentId: string, agentName: string, worktree: string): Promise<void>;
  deregister(): Promise<void>;

  // Message operations
  send(message: BusMessage): Promise<void>;
  poll(cursor?: string): Promise<BusMessage[]>;
  waitForMessage(types: string[], timeout: number): Promise<BusMessage | null>;

  // Heartbeat
  startHeartbeat(interval: number): void;
  stopHeartbeat(): void;

  // Stream events to Redis
  streamEvent(event: StreamEvent): Promise<void>;
}

interface BusMessage {
  type: 'coordination' | 'completion' | 'error' | 'discovery' | 'learning' | 'question' | 'heartbeat';
  agentId: string;
  agentName: string;
  title: string;
  content: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  actionable?: boolean;
  context?: {
    file?: string;
    function?: string;
    line?: number;
    error?: string;
    code?: string;
  };
}
=======
Forwards events from the stream parser to Redis/event bus.

```typescript
interface EventDispatcher {
  // Dispatch a parsed event to the event bus
  dispatch(event: ParsedEvent, context: DispatchContext): Promise<void>;

  // Buffer events for batch sending
  buffer(events: ParsedEvent[]): void;

  // Flush buffered events
  flush(): Promise<void>;
}

interface DispatchContext {
  agentId: string;
  agentName: string;
  worktree: string;
  taskId: string | null;
  sessionId: string;
}

// Event types to send to Redis
type BusEvent =
  | AgentStreamEvent      // Raw stream data for observability
  | AgentToolCallEvent    // Tool invocations
  | AgentProgressEvent    // Progress updates
  | AgentCompletionEvent  // Task completion
  | AgentErrorEvent;      // Errors
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
```

### 5. Heartbeat Manager

<<<<<<< HEAD
Maintains agent presence and health signals.

```typescript
interface HeartbeatManager {
  // Start sending heartbeats
  start(interval: number): void;

  // Stop heartbeats
  stop(): void;

  // Manual heartbeat
  beat(): Promise<void>;

  // Check if heartbeat is active
  readonly isActive: boolean;

  // Last heartbeat time
  readonly lastBeat: Date | null;
}
```

**Heartbeat Protocol:**
- Default interval: 30 seconds
- Includes: agentId, state, capabilities, currentTaskId
- On failure: 3 retries with exponential backoff
- After max retries: trigger shutdown

### 6. Resource Tracker

Monitors and enforces resource limits (extends existing ResourceMonitor).

```typescript
interface ResourceTracker {
  // Track token usage
  trackTokens(usage: TokenUsage, model: string): void;

  // Track API call
  trackApiCall(success: boolean): void;

  // Track error
  trackError(error?: Error): void;

  // Get current metrics
  getMetrics(): ResourceMetrics;

  // Check limits
  checkLimits(): LimitStatus;

  // Reset for new task
  reset(): void;
}

interface ResourceMetrics {
  // Token metrics
  totalInputTokens: number;
  totalOutputTokens: number;

  // Cost metrics
  estimatedCostUsd: number;
  costBreakdown: CostBreakdown;

  // Performance metrics
  apiCallCount: number;
  errorCount: number;
  successRate: number;

  // Memory
  memoryMb: number;
  peakMemoryMb: number;

  // Timing
  uptimeSeconds: number;
  lastApiCallAt: Date | null;
}

interface LimitStatus {
  withinLimits: boolean;
  warnings: LimitWarning[];
  violations: LimitViolation[];
=======
Maintains agent presence in the event bus registry.

```typescript
interface HeartbeatManager {
  // Start heartbeat loop
  start(agentId: string, interval?: number): void;

  // Stop heartbeat loop
  stop(): void;

  // Check heartbeat health
  isHealthy(): boolean;

  // Get failure count
  getFailureCount(): number;
}

// Configuration
const HEARTBEAT_INTERVAL = 30_000;    // 30 seconds
const MAX_FAILURES_BEFORE_ALERT = 5;  // Alert after 5 failures
const MAX_FAILURES_BEFORE_RESTART = 10; // Restart after 10 failures
```

### 6. Resource Tracker

Monitors resource usage and costs.

```typescript
interface ResourceTracker {
  // Record token usage
  recordTokens(usage: TokenUsage): void;

  // Record cost
  recordCost(cost: number): void;

  // Get current memory usage
  getMemoryUsage(): MemoryUsage;

  // Get cumulative stats
  getStats(): ResourceStats;

  // Check against limits
  checkLimits(limits: ResourceLimits): LimitCheckResult;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

interface ResourceStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  totalCost: number;
  peakMemory: number;
  uptime: number;
}

interface ResourceLimits {
  maxTokens?: number;
  maxCost?: number;
  maxMemory?: number;
  maxDuration?: number;
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
}
```

### 7. Worktree Manager

<<<<<<< HEAD
Handles Git worktree lifecycle for isolated agent work.

```typescript
interface WorktreeManager {
  // Create isolated worktree
  create(name: string, baseBranch?: string): Promise<string>;

  // Check worktree status
  status(name: string): Promise<WorktreeStatus>;

  // Commit changes
  commit(message: string): Promise<string>;

  // Push to remote
  push(): Promise<void>;

  // Request merge approval
  requestMerge(taskId: string): Promise<MergeRequest>;

  // Clean up worktree
  cleanup(): Promise<void>;

  // Get current worktree path
  readonly path: string;
}

interface WorktreeStatus {
  branch: string;
  clean: boolean;
  ahead: number;
  behind: number;
  changes: GitChange[];
}

interface MergeRequest {
  id: string;
  worktree: string;
  branch: string;
  commitCount: number;
  status: 'pending' | 'approved' | 'rejected' | 'merged';
=======
Manages Git worktrees for agent isolation.

```typescript
interface WorktreeManager {
  // Create a worktree for an agent
  create(options: CreateWorktreeOptions): Promise<Worktree>;

  // List existing worktrees
  list(): Promise<Worktree[]>;

  // Remove a worktree
  remove(worktree: string): Promise<void>;

  // Clean up orphaned worktrees
  cleanup(maxAge?: number): Promise<string[]>;

  // Get worktree status
  getStatus(worktree: string): Promise<WorktreeStatus>;
}

interface CreateWorktreeOptions {
  name: string;
  baseBranch?: string;
  branchPrefix?: string;
}

interface Worktree {
  name: string;
  path: string;
  branch: string;
  createdAt: Date;
  agentId?: string;
}

interface WorktreeStatus {
  clean: boolean;
  modified: string[];
  untracked: string[];
  ahead: number;
  behind: number;
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
}
```

## Event Schema Definitions

<<<<<<< HEAD
### Lifecycle Events

```typescript
// Agent spawned and ready
interface AgentSpawnedEvent {
  type: 'agent.spawned';
=======
### 1. Agent Lifecycle Events

```typescript
// Events sent to the event bus during agent lifecycle

interface AgentRegisteredEvent {
  type: 'agent.registered';
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
  agentId: string;
  agentName: string;
  worktree: string;
  capabilities: string[];
<<<<<<< HEAD
  timestamp: string;
}

// Agent state changed
interface AgentStateChangedEvent {
  type: 'agent.state_changed';
  agentId: string;
  previousState: string;
  currentState: string;
  taskId?: string;
  timestamp: string;
}

// Agent terminating
interface AgentShutdownEvent {
  type: 'agent.shutdown';
  agentId: string;
  reason: 'manual' | 'limit_exceeded' | 'error' | 'task_complete';
  metrics: ResourceMetrics;
=======
  model: string;
  timestamp: string;
}

interface AgentHeartbeatEvent {
  type: 'agent.heartbeat';
  agentId: string;
  state: AgentState;
  taskId: string | null;
  uptime: number;
  stats: ResourceStats;
  timestamp: string;
}

interface AgentShutdownEvent {
  type: 'agent.shutdown';
  agentId: string;
  reason: 'graceful' | 'error' | 'timeout' | 'signal';
  taskId: string | null;
  stats: ResourceStats;
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
  timestamp: string;
}
```

<<<<<<< HEAD
### Task Events

```typescript
// Task claimed
=======
### 2. Task Events

```typescript
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
interface TaskClaimedEvent {
  type: 'task.claimed';
  taskId: string;
  agentId: string;
<<<<<<< HEAD
  timestamp: string;
}

// Task progress
=======
  agentName: string;
  worktree: string;
  timestamp: string;
}

>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
interface TaskProgressEvent {
  type: 'task.progress';
  taskId: string;
  agentId: string;
  progress: number; // 0.0 - 1.0
<<<<<<< HEAD
  message: string;
  timestamp: string;
}

// Task completed
=======
  phase: string;
  message?: string;
  tokens: TokenUsage;
  cost: number;
  timestamp: string;
}

>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
interface TaskCompletedEvent {
  type: 'task.completed';
  taskId: string;
  agentId: string;
<<<<<<< HEAD
  summary: string;
  worktree?: string;
  metrics: {
    durationSeconds: number;
    tokensUsed: number;
    costUsd: number;
  };
  timestamp: string;
}

// Task failed
=======
  result: TaskResult;
  duration: number;
  stats: ResourceStats;
  timestamp: string;
}

>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
interface TaskFailedEvent {
  type: 'task.failed';
  taskId: string;
  agentId: string;
<<<<<<< HEAD
  error: string;
  canRetry: boolean;
  timestamp: string;
}
```

### Stream Events

```typescript
// CLI output event (streamed to Redis)
interface StreamOutputEvent {
  type: 'stream.output';
  eventId: string;
  agentId: string;
  streamType: StreamEventType;
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  usage?: TokenUsage;
  timestamp: string;
}

// Token usage update
interface TokenUsageEvent {
  type: 'stream.usage';
  agentId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  timestamp: string;
}
```

### System Events

```typescript
// Heartbeat
interface HeartbeatEvent {
  type: 'system.heartbeat';
  agentId: string;
  state: string;
  taskId?: string;
  metrics: {
    uptimeSeconds: number;
    memoryMb: number;
    tokensUsed: number;
  };
  timestamp: string;
}

// Resource limit warning
interface LimitWarningEvent {
  type: 'system.limit_warning';
  agentId: string;
  limitType: 'tokens' | 'cost' | 'memory' | 'errors';
  current: number;
  limit: number;
  percentage: number;
  timestamp: string;
}

// Resource limit violation
interface LimitViolationEvent {
  type: 'system.limit_violation';
  agentId: string;
  limitType: 'tokens' | 'cost' | 'memory' | 'errors';
  current: number;
  limit: number;
  action: 'warning' | 'stopping';
=======
  error: {
    code: string;
    message: string;
    stack?: string;
  };
  recoverable: boolean;
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
  timestamp: string;
}
```

<<<<<<< HEAD
## Process Lifecycle Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Agent Runner Process Lifecycle                         │
└──────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────┐
    │   START     │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐     ┌──────────────────────────────────────────────────┐
    │ Initialize  │────►│ 1. Parse CLI arguments                          │
    │             │     │ 2. Load configuration from environment           │
    │             │     │ 3. Connect to Redis                              │
    │             │     │ 4. Initialize worktree manager                   │
    └──────┬──────┘     └──────────────────────────────────────────────────┘
           │
           ▼
    ┌─────────────┐     ┌──────────────────────────────────────────────────┐
    │  Register   │────►│ 1. Call bus_register with agentId, name, worktree│
    │  on Bus     │     │ 2. Start heartbeat timer (30s interval)          │
    │             │     │ 3. Emit agent.spawned event                      │
    └──────┬──────┘     └──────────────────────────────────────────────────┘
           │
           ▼
    ┌─────────────┐     ┌──────────────────────────────────────────────────┐
    │  Watch for  │────►│ 1. Poll task_list for pending tasks              │
    │   Tasks     │◄───┐│ 2. Filter by capabilities match                  │
    │             │    ││ 3. Wait for task_available event                 │
    └──────┬──────┘    │└──────────────────────────────────────────────────┘
           │           │
           ▼           │
    ┌─────────────┐    │┌──────────────────────────────────────────────────┐
    │ Claim Task  │────┴│ 1. Call task_claim with taskId, agentId          │
    │             │     │ 2. On success: transition to working             │
    │             │     │ 3. On failure: return to watching                │
    └──────┬──────┘     └──────────────────────────────────────────────────┘
           │
           ▼
    ┌─────────────┐     ┌──────────────────────────────────────────────────┐
    │  Execute    │────►│ 1. Spawn CLI process (claude/gemini/etc)         │
    │   Task      │     │ 2. Stream output to Redis                        │
    │             │     │ 3. Track tokens/cost/memory                      │
    │             │     │ 4. Send progress updates (60s interval)          │
    └──────┬──────┘     └──────────────────────────────────────────────────┘
           │
           │ ◄──────────────── SIGTERM/SIGINT ────────────────────────────┐
           │                                                               │
           ▼                                                               │
    ┌─────────────┐     ┌──────────────────────────────────────────────────┐
    │  Complete   │────►│ 1. Call task_complete with summary               │
    │   Task      │     │ 2. Commit changes to worktree                    │
    │             │     │ 3. Request merge approval                        │
    │             │     │ 4. Return to watching for tasks                  │
    └──────┬──────┘     └──────────────────────────────────────────────────┘
           │
           │ (no more tasks OR stop signal)
           ▼
    ┌─────────────┐     ┌──────────────────────────────────────────────────┐
    │  Shutdown   │────►│ 1. Stop heartbeat timer                          │
    │             │     │ 2. Return uncompleted task to queue              │
    │             │     │ 3. Deregister from event bus                     │
    │             │     │ 4. Save checkpoint if mid-task                   │
    │             │     │ 5. Cleanup worktree (optional)                   │
    └──────┬──────┘     └──────────────────────────────────────────────────┘
           │
           ▼
    ┌─────────────┐
    │    EXIT     │
    └─────────────┘
=======
### 3. Stream Events

```typescript
// Real-time stream events for observability

interface AgentStreamStartEvent {
  type: 'stream.start';
  agentId: string;
  sessionId: string;
  model: string;
  timestamp: string;
}

interface AgentStreamMessageEvent {
  type: 'stream.message';
  agentId: string;
  sessionId: string;
  messageId: string;
  role: 'assistant' | 'user';
  content: ContentBlock[];
  timestamp: string;
}

interface AgentStreamToolUseEvent {
  type: 'stream.tool_use';
  agentId: string;
  sessionId: string;
  toolUseId: string;
  toolName: string;
  input: unknown;
  timestamp: string;
}

interface AgentStreamToolResultEvent {
  type: 'stream.tool_result';
  agentId: string;
  sessionId: string;
  toolUseId: string;
  output: unknown;
  isError: boolean;
  duration: number;
  timestamp: string;
}

interface AgentStreamEndEvent {
  type: 'stream.end';
  agentId: string;
  sessionId: string;
  exitCode: number;
  stats: ResultStats;
  timestamp: string;
}
```

### 4. System Events

```typescript
interface SystemResourceAlertEvent {
  type: 'system.resource_alert';
  agentId: string;
  alertType: 'memory' | 'tokens' | 'cost' | 'duration';
  current: number;
  limit: number;
  timestamp: string;
}

interface SystemErrorEvent {
  type: 'system.error';
  agentId?: string;
  error: {
    code: string;
    message: string;
    stack?: string;
  };
  severity: 'warning' | 'error' | 'fatal';
  timestamp: string;
}
```

## Process Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Agent Runner Process Lifecycle                          │
└─────────────────────────────────────────────────────────────────────────────────┘

   ┌─────────┐
   │  START  │
   └────┬────┘
        │
        ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                      INITIALIZATION                              │
   │  1. Parse CLI arguments (agent name, worktree, model, task)     │
   │  2. Load configuration from rapid.json                           │
   │  3. Create worktree if needed                                    │
   │  4. Initialize Redis connection                                  │
   │  5. Register with event bus                                      │
   │  6. Initialize state machine                                     │
   └─────────────────────────────────────┬───────────────────────────┘
                                         │
                                         ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                        IDLE STATE                                 │
   │                                                                   │
   │  ┌─────────────────────────────────────────────────────────┐     │
   │  │  Heartbeat Loop (every 30s)                             │     │
   │  │  - Send heartbeat to event bus                          │     │
   │  │  - Check for assigned tasks                             │     │
   │  │  - Process incoming messages                            │     │
   │  └─────────────────────────────────────────────────────────┘     │
   │                                                                   │
   │  Events:                                                          │
   │  - TASK_AVAILABLE → CLAIMING                                     │
   │  - SHUTDOWN → SHUTTING_DOWN                                      │
   └─────────────────────────────────────┬────────────────────────────┘
                                         │
                                         ▼ task_available
   ┌──────────────────────────────────────────────────────────────────┐
   │                      CLAIMING STATE                               │
   │                                                                   │
   │  1. Call task_claim MCP tool                                     │
   │  2. Wait for claim response (timeout: 10s)                       │
   │                                                                   │
   │  Events:                                                          │
   │  - TASK_CLAIMED → SPAWNING                                       │
   │  - CLAIM_FAILED → IDLE                                           │
   │  - TIMEOUT → IDLE                                                │
   └─────────────────────────────────────┬────────────────────────────┘
                                         │
                                         ▼ task_claimed
   ┌──────────────────────────────────────────────────────────────────┐
   │                      SPAWNING STATE                               │
   │                                                                   │
   │  1. Build prompt with task details and agent instructions        │
   │  2. Configure environment variables                              │
   │  3. Spawn Claude Code process with node-pty                      │
   │  4. Set up stream parser on stdout                               │
   │  5. Start resource tracking                                      │
   │                                                                   │
   │  Events:                                                          │
   │  - PROCESS_STARTED → WORKING                                     │
   │  - SPAWN_ERROR → ERROR                                           │
   └─────────────────────────────────────┬────────────────────────────┘
                                         │
                                         ▼ process_started
   ┌──────────────────────────────────────────────────────────────────┐
   │                       WORKING STATE                               │
   │                                                                   │
   │  ┌────────────────────────────────────────────────────────┐      │
   │  │  Parallel: Execution Thread                             │      │
   │  │  - Read stream-json output from Claude Code             │      │
   │  │  - Parse JSON events                                    │      │
   │  │  - Forward events to event bus                          │      │
   │  │  - Track resource usage                                 │      │
   │  └────────────────────────────────────────────────────────┘      │
   │                                                                   │
   │  ┌────────────────────────────────────────────────────────┐      │
   │  │  Parallel: Monitoring Thread                            │      │
   │  │  - Send progress updates (every 60s)                    │      │
   │  │  - Check resource limits                                │      │
   │  │  - Monitor for external signals                         │      │
   │  └────────────────────────────────────────────────────────┘      │
   │                                                                   │
   │  Events:                                                          │
   │  - PROCESS_EXITED (exit 0) → COMPLETED                           │
   │  - PROCESS_EXITED (exit ≠0) → ERROR                             │
   │  - RESOURCE_LIMIT_EXCEEDED → ERROR                               │
   │  - SHUTDOWN → SHUTTING_DOWN                                      │
   └─────────────────────────────────────┬────────────────────────────┘
                                         │
            ┌────────────────────────────┼────────────────────────────┐
            │                            │                            │
            ▼ exit 0                     ▼ exit ≠0                   ▼ error
   ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
   │   COMPLETED STATE   │    │     ERROR STATE      │    │  RECOVERING STATE  │
   │                     │    │                      │    │                     │
   │ 1. Call task_complete│   │ 1. Log error        │    │ 1. Increment retry  │
   │ 2. Update stats      │   │ 2. Report to bus    │    │ 2. Clean up process │
   │ 3. Clean up process  │   │ 3. Check retry      │    │ 3. Wait backoff     │
   │                     │    │                      │    │ 4. Re-spawn         │
   │ → IDLE              │    │ Events:             │    │                     │
   └──────────┬──────────┘    │ - RETRY → RECOVERING│    │ Events:             │
              │               │ - RESET → IDLE      │    │ - SUCCESS → WORKING │
              │               │ - FATAL → SHUTDOWN  │    │ - FAILED → ERROR    │
              │               └──────────┬──────────┘    └──────────┬──────────┘
              │                          │                          │
              └──────────────────────────┼──────────────────────────┘
                                         │
                                         ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                     SHUTTING_DOWN STATE                          │
   │                                                                   │
   │  1. Send SIGTERM to Claude Code process                          │
   │  2. Wait for graceful exit (timeout: 5s)                         │
   │  3. If still running, send SIGKILL                               │
   │  4. Return incomplete task to queue                              │
   │  5. Deregister from event bus                                    │
   │  6. Clean up worktree (if configured)                            │
   │  7. Exit process                                                 │
   └─────────────────────────────────────┬────────────────────────────┘
                                         │
                                         ▼
                                    ┌─────────┐
                                    │   END   │
                                    └─────────┘
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
```

## Daemon Communication API

<<<<<<< HEAD
The Agent Runner communicates with the RAPID daemon using JSON-RPC 2.0 over HTTP.

### JSON-RPC Endpoint

```
POST http://localhost:3200/
Content-Type: application/json
```

### Methods

#### agent.spawn

Spawn a new agent with persona configuration.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "uuid",
  "method": "agent.spawn",
  "params": {
    "projectDir": "/path/to/project",
    "persona": "worker",
    "task": "Implement user authentication",
    "model": "sonnet",
    "systemPrompt": "...",
    "worktree": "worker-123456",
    "env": {
      "RAPID_AGENT_ID": "uuid",
      "RAPID_PERSONA": "worker",
      "RAPID_WORKTREE": "worker-123456"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "uuid",
  "result": {
    "sessionId": "uuid",
    "containerId": "abc123...",
    "status": "running"
  }
}
```

#### agent.status

Get agent status and metrics.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "uuid",
  "method": "agent.status",
  "params": {
    "agentId": "uuid"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "uuid",
  "result": {
    "agentId": "uuid",
    "state": "working",
    "taskId": "task-uuid",
    "metrics": {
      "uptimeSeconds": 3600,
      "tokensUsed": 50000,
      "costUsd": 0.75,
      "memoryMb": 256
    }
  }
}
```

#### agent.stop

Stop an agent gracefully.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "uuid",
  "method": "agent.stop",
  "params": {
    "agentId": "uuid",
    "reason": "manual",
    "graceful": true,
    "timeout": 30000
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "uuid",
  "result": {
    "stopped": true,
    "finalState": "shutdown",
    "metrics": {...}
  }
}
```

#### agent.logs

Get agent output logs.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "uuid",
  "method": "agent.logs",
  "params": {
    "agentId": "uuid",
    "tail": 100,
    "since": "2026-01-22T00:00:00Z"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "uuid",
  "result": {
    "logs": [
      {"timestamp": "...", "level": "info", "message": "..."},
      ...
    ],
    "cursor": "..."
  }
}
```

### SSE Stream Endpoint

Real-time event streaming for agent output.

```
GET /agents/stream/:agentId
Accept: text/event-stream
```

**Event Types:**
- `output` - CLI output line
- `state` - State machine transition
- `progress` - Task progress update
- `error` - Error occurred
- `complete` - Task completed

**Event Format:**
```
event: output
data: {"type":"text","content":"Analyzing the codebase...","timestamp":"..."}

event: state
data: {"from":"idle","to":"working","taskId":"..."}

event: progress
data: {"taskId":"...","progress":0.5,"message":"Running tests"}
```

## Implementation Plan

### Phase 1: Foundation (Week 1)

1. **Upgrade Process Manager**
   - Replace `child_process` with `node-pty`
   - Add resize handling
   - Improve signal handling

2. **Add XState Integration**
   - Define machine configuration
   - Implement actors for task operations
   - Add state persistence

3. **Event Bus Integration**
   - Connect to Redis event bus
   - Implement bus_register/deregister
   - Add message polling

### Phase 2: Task Workflow (Week 2)

4. **Task Claiming**
   - Implement capability matching
   - Add task_claim integration
   - Handle claim conflicts

5. **Progress Tracking**
   - Periodic progress updates
   - Checkpoint saving
   - Recovery from checkpoints

6. **Task Completion**
   - Automatic commit workflow
   - Merge request creation
   - Cleanup procedures

### Phase 3: Reliability (Week 3)

7. **Enhanced Heartbeat**
   - Configurable intervals
   - Failure detection
   - Auto-recovery

8. **Resource Limits**
   - Integrate existing ResourceMonitor
   - Add warning thresholds
   - Implement hard stops

9. **Signal Handling**
   - SIGTERM graceful shutdown
   - SIGINT interrupt handling
   - SIGUSR1 for status dump

### Phase 4: Integration (Week 4)

10. **Daemon Updates**
    - Update DockerProvider to use new runner
    - Add JSON-RPC methods
    - SSE streaming endpoint

11. **Docker Image**
    - Create Dockerfile.agent-runner
    - Include all dependencies
    - Health check integration

12. **Testing & Documentation**
    - Unit tests for all components
    - Integration tests with daemon
    - Update architecture docs
=======
The Agent Runner communicates with the RAPID daemon via JSON-RPC over Unix socket or HTTP.

### Agent Runner → Daemon

```typescript
// Session management
interface DaemonAPI {
  // Register a new agent session
  'agent.register': (params: {
    agentId: string;
    agentName: string;
    worktree: string;
    pid: number;
    capabilities: string[];
  }) => Promise<{ sessionId: string }>;

  // Heartbeat
  'agent.heartbeat': (params: {
    agentId: string;
    state: AgentState;
    stats: ResourceStats;
  }) => Promise<{ ack: true }>;

  // Deregister
  'agent.deregister': (params: {
    agentId: string;
    reason: string;
  }) => Promise<{ ack: true }>;

  // Get secrets
  'secrets.get': (params: {
    key: string;
    ttl?: number;
  }) => Promise<{ value: string; masked: string }>;

  // Forward event to bus
  'bus.send': (params: {
    type: MessageType;
    title: string;
    content: string;
    context?: MessageContext;
  }) => Promise<{ messageId: string }>;

  // Get messages
  'bus.messages': (params: {
    since?: string;
    types?: MessageType[];
    limit?: number;
    forAgent?: string;
  }) => Promise<{ messages: Message[]; cursor: string }>;

  // Task operations
  'task.claim': (params: {
    taskId: string;
    agentId: string;
  }) => Promise<{ claimed: boolean; task?: Task }>;

  'task.progress': (params: {
    taskId: string;
    progress: number;
    message?: string;
  }) => Promise<{ ack: true }>;

  'task.complete': (params: {
    taskId: string;
    summary: string;
    result?: unknown;
  }) => Promise<{ ack: true }>;

  'task.fail': (params: {
    taskId: string;
    error: string;
    canRetry: boolean;
  }) => Promise<{ ack: true }>;

  // Worktree operations
  'worktree.create': (params: {
    name: string;
    baseBranch?: string;
  }) => Promise<{ path: string; branch: string }>;

  'worktree.remove': (params: {
    name: string;
  }) => Promise<{ ack: true }>;
}
```

### Daemon → Agent Runner (Notifications)

```typescript
// The daemon can send notifications to the agent runner
interface DaemonNotifications {
  // Request graceful shutdown
  'shutdown.request': {
    reason: string;
    gracePeriod: number;
  };

  // New task assigned
  'task.assigned': {
    taskId: string;
    title: string;
    priority: string;
  };

  // Configuration changed
  'config.changed': {
    changedKeys: string[];
  };

  // Resource limit warning
  'resource.warning': {
    type: 'memory' | 'tokens' | 'cost';
    current: number;
    limit: number;
  };
}
```

## Implementation Plan

### Phase 1: Core Framework (Week 1)

1. **Process Manager**
   - Spawn Claude Code with node-pty
   - Handle stdin/stdout/stderr
   - Signal handling (SIGTERM, SIGINT, SIGHUP)

2. **Stream Parser**
   - Parse stream-json format
   - Emit typed events
   - Handle errors and incomplete JSON

3. **Basic State Machine**
   - Idle, Spawning, Working, Completed states
   - Task claim/complete workflow

### Phase 2: Integration (Week 2)

4. **Event Dispatcher**
   - Redis integration via existing EventBus class
   - Event schema implementation
   - Buffering and batch sending

5. **Heartbeat Manager**
   - 30-second heartbeat loop
   - Failure detection and recovery

6. **Resource Tracker**
   - Token counting from stream
   - Cost estimation
   - Memory monitoring

### Phase 3: Advanced Features (Week 3)

7. **Worktree Manager**
   - Create/remove worktrees
   - Status checking
   - Cleanup on completion

8. **Error Recovery**
   - Retry logic with backoff
   - Checkpoint/resume
   - Task return to queue

9. **Daemon Integration**
   - JSON-RPC client
   - Notification handling
   - Configuration sync

### Phase 4: Testing & Documentation (Week 4)

10. **Testing**
    - Unit tests for each component
    - Integration tests with mock Claude
    - End-to-end tests

11. **Documentation**
    - API documentation
    - Configuration guide
    - Migration guide from agent-loop.sh
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)

## File Structure

```
packages/agent-runner/
├── src/
<<<<<<< HEAD
│   ├── index.ts              # Public exports
│   ├── bin.ts                # CLI entry point
│   ├── runner.ts             # Main AgentRunner class (update)
│   ├── types.ts              # Type definitions (update)
│   │
│   ├── process/
│   │   ├── manager.ts        # Process spawning with node-pty
│   │   └── signals.ts        # Signal handling utilities
│   │
│   ├── parser/
│   │   ├── stream.ts         # Stream parser
│   │   └── events.ts         # Event type definitions
│   │
│   ├── state/
│   │   ├── machine.ts        # XState machine definition
│   │   ├── actors.ts         # Task actors
│   │   ├── guards.ts         # Transition guards
│   │   └── actions.ts        # State entry/exit actions
│   │
│   ├── bus/
│   │   ├── dispatcher.ts     # Event bus integration
│   │   ├── heartbeat.ts      # Heartbeat manager
│   │   └── messages.ts       # Message types
│   │
│   ├── resources/
│   │   ├── tracker.ts        # Resource tracking
│   │   └── limits.ts         # Limit enforcement
│   │
│   ├── worktree/
│   │   ├── manager.ts        # Git worktree operations
│   │   └── merge.ts          # Merge request handling
│   │
│   └── adapters/             # CLI adapters (existing)
│       ├── index.ts
│       ├── claude.ts
│       ├── gemini.ts
│       ├── opencode.ts
│       └── aider.ts
│
├── tests/
│   ├── runner.test.ts
│   ├── state-machine.test.ts
│   ├── stream-parser.test.ts
│   └── integration/
│       └── daemon.test.ts
│
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## Dependencies

### New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `node-pty` | ^1.0.0 | PTY process spawning |
| `xstate` | ^5.x | State machine |
| `@xstate/inspect` | ^0.8.0 | State visualization (dev) |

### Existing Dependencies (reuse)

| Package | Purpose |
|---------|---------|
| `ioredis` | Redis client |
| `uuid` | Unique ID generation |
| `@a3t/rapid-eventbus` | Event bus client |
| `@a3t/rapid-core` | Core utilities |

## Migration Path

1. **Parallel Development**: New runner developed alongside existing shell-based loop
2. **Feature Flag**: `RAPID_USE_RUNNER_V2=true` to enable new runner
3. **Gradual Rollout**: Test with single agents before full deployment
4. **Backwards Compatible**: Existing adapters and stream format preserved

## Success Criteria

- [ ] State machine correctly handles all lifecycle transitions
- [ ] Task claiming/completion workflow works end-to-end
- [ ] Heartbeat keeps agent registered during long tasks
- [ ] Resource limits properly enforced with warnings
- [ ] Graceful shutdown preserves work in progress
- [ ] Event streaming provides real-time output
- [ ] Docker integration works with daemon
- [ ] All existing adapter tests pass

## References

- [Agent State Machine Architecture](./agent-state-machine.md)
- [Multi-Agent System Architecture](./multi-agent-system.md)
- [HITL Workflow](./hitl-workflow.md)
- [XState Documentation](https://stately.ai/docs)
=======
│   ├── index.ts              # Main entry point
│   ├── bin.ts                # CLI binary
│   │
│   ├── process/
│   │   ├── manager.ts        # Process spawning and control
│   │   ├── stream-parser.ts  # JSON stream parsing
│   │   └── pty.ts            # PTY wrapper
│   │
│   ├── state/
│   │   ├── machine.ts        # XState machine definition
│   │   ├── actions.ts        # State machine actions
│   │   ├── guards.ts         # Transition guards
│   │   └── context.ts        # Context types
│   │
│   ├── events/
│   │   ├── dispatcher.ts     # Event bus integration
│   │   ├── schemas.ts        # Event type definitions
│   │   └── buffer.ts         # Event buffering
│   │
│   ├── monitoring/
│   │   ├── heartbeat.ts      # Heartbeat manager
│   │   ├── resources.ts      # Resource tracking
│   │   └── health.ts         # Health checks
│   │
│   ├── worktree/
│   │   ├── manager.ts        # Worktree operations
│   │   └── git.ts            # Git commands
│   │
│   ├── daemon/
│   │   ├── client.ts         # Daemon RPC client
│   │   └── notifications.ts  # Notification handler
│   │
│   └── utils/
│       ├── logger.ts         # Logging
│       ├── config.ts         # Configuration
│       └── signals.ts        # Signal handling
│
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

## Comparison: Current vs. New

| Aspect | agent-loop.sh | Agent Runner v2 |
|--------|---------------|-----------------|
| **Language** | Bash | TypeScript |
| **Process Control** | `exec > >(tee)` | node-pty |
| **Stream Parsing** | None | Real-time JSON |
| **State Management** | Variables | XState FSM |
| **Event Bus** | curl JSON-RPC | Native ioredis |
| **Heartbeat** | Background loop | Integrated timer |
| **Resource Tracking** | None | Token/cost/memory |
| **Error Recovery** | Basic | Retry with backoff |
| **Worktree** | Basic creation | Full management |
| **Testing** | None | Vitest suite |
| **Type Safety** | None | Full TypeScript |

## Migration Path

1. **Parallel Deployment**: Run both agent-loop.sh and Agent Runner v2 initially
2. **Feature Parity**: Ensure v2 handles all current use cases
3. **Gradual Migration**: Move agents one by one
4. **Deprecation**: Remove agent-loop.sh after full migration

## Conclusion

The Agent Runner v2 architecture provides a robust, type-safe, and observable solution for managing AI agent processes in RAPID. By leveraging TypeScript, XState, and the existing RAPID infrastructure, we can achieve:

- **Real-time Observability**: Stream parsing enables live monitoring of agent activity
- **Predictable Behavior**: State machine ensures consistent lifecycle management
- **Resource Control**: Token and cost tracking prevents runaway usage
- **Clean Integration**: Native TypeScript integration with existing codebase
- **Maintainability**: Clear component boundaries and comprehensive testing

The phased implementation plan allows for incremental delivery and validation at each stage.
>>>>>>> f49c236 (docs(architecture): add agent-runner-v2, error handling, and storage adapter docs)
