# Agent Runner v2 Architecture

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
```

## Core Components

### 1. Process Manager

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
```

### 3. State Machine (XState)

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

const agentMachine = setup({
  types: {
    context: {} as AgentContext,
    events: {} as AgentEvent,
  },
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
      },
    },

    claiming: {
      invoke: {
        src: 'claimTask',
        onDone: {
          target: 'working',
          actions: assign({ currentTaskId: ({ event }) => event.output.taskId }),
        },
        onError: { target: 'idle' },
      },
      after: {
        CLAIM_TIMEOUT: 'idle',
      },
    },

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
      type: 'final',
    },
  },
});
```

### 4. Event Dispatcher

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
```

### 5. Heartbeat Manager

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
}
```

### 7. Worktree Manager

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
}
```

## Event Schema Definitions

### Lifecycle Events

```typescript
// Agent spawned and ready
interface AgentSpawnedEvent {
  type: 'agent.spawned';
  agentId: string;
  agentName: string;
  worktree: string;
  capabilities: string[];
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
  timestamp: string;
}
```

### Task Events

```typescript
// Task claimed
interface TaskClaimedEvent {
  type: 'task.claimed';
  taskId: string;
  agentId: string;
  timestamp: string;
}

// Task progress
interface TaskProgressEvent {
  type: 'task.progress';
  taskId: string;
  agentId: string;
  progress: number; // 0.0 - 1.0
  message: string;
  timestamp: string;
}

// Task completed
interface TaskCompletedEvent {
  type: 'task.completed';
  taskId: string;
  agentId: string;
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
interface TaskFailedEvent {
  type: 'task.failed';
  taskId: string;
  agentId: string;
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
  timestamp: string;
}
```

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
```

## Daemon Communication API

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

## File Structure

```
packages/agent-runner/
├── src/
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
