# Concurrent Task Execution Guide

Complete guide to coordinating multiple AI agents working in parallel on RAPID projects.

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [Task Dependency Resolution](#task-dependency-resolution)
- [Parallel Task Patterns](#parallel-task-patterns)
- [Worktree Isolation](#worktree-isolation)
- [Multi-Worker Coordination](#multi-worker-coordination)
- [Performance Considerations](#performance-considerations)
- [Debugging Concurrent Workflows](#debugging-concurrent-workflows)
- [Common Pitfalls](#common-pitfalls)
- [Best Practices](#best-practices)

---

## Overview

RAPID enables multiple AI agents to work concurrently on different tasks using:

- **Event Bus** - Real-time coordination and messaging
- **Task Management** - Distributed task queue with dependencies
- **Worktree Isolation** - Separate git branches for conflict-free parallel work
- **Agent Registry** - Track agent capabilities and availability

### Benefits of Concurrent Execution

✅ **Faster Development** - Multiple features developed in parallel
✅ **Specialization** - Different agents tackle tasks matching their strengths
✅ **No Conflicts** - Isolated worktrees prevent merge collisions
✅ **Resource Efficiency** - Cheaper models (Haiku) for simple tasks, Sonnet/Opus for complex work
✅ **Automatic Coordination** - Event bus handles communication without manual orchestration

### When to Use Concurrent Execution

**Good Use Cases:**

- Developing multiple independent features simultaneously
- Running tests while implementing new functionality
- Parallel documentation updates across multiple files
- Security review + performance optimization (different aspects of same codebase)
- Refactoring + test suite expansion

**Not Recommended:**

- Single-file edits where merge conflicts are inevitable
- Tasks with tight coupling (one depends on another's output)
- Small projects where overhead exceeds benefits
- Tasks requiring real-time human supervision

---

## Core Concepts

### 1. Event Bus Communication

All agents communicate via Redis-backed event bus:

```typescript
// Agent registers on bus
await bus_register({
  agentName: 'claude-worker-1',
});

// Send coordination message
await bus_send({
  type: 'coordination',
  agentId: myAgentId,
  agentName: 'claude-worker-1',
  title: 'Starting auth feature',
  content: 'Working on feat/auth branch in .worktrees/auth-123',
  priority: 'normal',
  actionable: false,
});

// Poll for messages
const messages = await bus_poll({
  limit: 10,
});
```

**Message Types:**

- `coordination` - Inter-agent communication
- `completion` - Task finished notifications
- `error` - Error reporting
- `question` - Queries to other agents
- `discovery` - System state changes
- `heartbeat` - Keep-alive signals

### 2. Task Assignment Protocol

Tasks are created with dependencies, capabilities, and deadlines:

```typescript
// Orchestrator creates task
await task_create({
  title: 'Implement authentication API',
  description: 'Add JWT-based auth with refresh tokens',
  priority: 'high',
  createdBy: 'orchestrator',
  requiredCapabilities: ['read', 'write', 'bash', 'test'],
  estimatedDuration: 3600,
  dependencies: ['task-id-for-user-model'],
  deadline: '2026-01-20T18:00:00Z',
});

// Worker claims task
await task_claim({
  id: 'task-id',
  agentId: myAgentId,
});

// Worker completes task
await task_complete({
  id: 'task-id',
  summary: 'Auth API implemented with tests passing',
});
```

### 3. Worktree Isolation

Each agent works in isolated git worktree:

```bash
# Project structure
project/
├── .git/
├── main/                     ← Main worktree (orchestrator)
├── .worktrees/
│   ├── auth-feat-abc123/    ← Worker 1 (feat/auth)
│   ├── perf-fix-def456/     ← Worker 2 (fix/perf)
│   └── docs-update-ghi789/  ← Designer (docs/update)
```

**Key Benefits:**

- No merge conflicts during parallel development
- Independent dependency installation
- Isolated testing and builds
- Clean branch history per feature

---

## Task Dependency Resolution

### Defining Dependencies

Tasks can depend on other tasks completing first:

```typescript
// Task 1: Create database schema
const schemaTask = await task_create({
  title: 'Create user database schema',
  createdBy: 'orchestrator',
  estimatedDuration: 900,
});

// Task 2: Depends on Task 1
const apiTask = await task_create({
  title: 'Implement user API endpoints',
  createdBy: 'orchestrator',
  dependencies: [schemaTask.task.id],
  estimatedDuration: 1800,
});

// Task 3: Depends on Task 2
const testTask = await task_create({
  title: 'Add API integration tests',
  createdBy: 'orchestrator',
  dependencies: [apiTask.task.id],
  estimatedDuration: 1200,
});
```

### Dependency Graph Example

```
[Create Schema]
       ↓
[Implement API]
       ↓
[Add Tests]
```

### Parallel Dependencies

Multiple tasks can depend on the same prerequisite:

```typescript
const coreTask = await task_create({
  title: 'Implement core auth logic',
  createdBy: 'orchestrator',
});

// Both can run in parallel after coreTask completes
const apiTask = await task_create({
  title: 'Add API endpoints',
  dependencies: [coreTask.task.id],
});

const testsTask = await task_create({
  title: 'Add unit tests',
  dependencies: [coreTask.task.id],
});
```

```
      [Core Auth Logic]
          ↙      ↘
   [API Endpoints]  [Unit Tests]
```

### Capability Matching

Tasks require specific agent capabilities:

```typescript
// Task requiring bash execution
await task_create({
  title: 'Run integration tests',
  requiredCapabilities: ['bash', 'read'],
  createdBy: 'orchestrator',
});

// Task requiring web search
await task_create({
  title: 'Research latest security best practices',
  requiredCapabilities: ['web_search', 'write'],
  createdBy: 'orchestrator',
});
```

Agents claim tasks only if they have required capabilities.

---

## Parallel Task Patterns

### Pattern 1: Independent Feature Development

Multiple features developed simultaneously with no dependencies:

```typescript
// Orchestrator creates parallel tasks
const tasks = await Promise.all([
  task_create({
    title: 'Implement user authentication',
    createdBy: 'orchestrator',
    requiredCapabilities: ['read', 'write', 'bash'],
  }),
  task_create({
    title: 'Add email notification system',
    createdBy: 'orchestrator',
    requiredCapabilities: ['read', 'write'],
  }),
  task_create({
    title: 'Create admin dashboard UI',
    createdBy: 'orchestrator',
    requiredCapabilities: ['read', 'write', 'web_fetch'],
  }),
]);
```

**Timeline:**

```
Worker 1: [========== Auth Feature ==========]
Worker 2: [====== Email System ======]
Worker 3: [============ Dashboard ============]
          ^                                   ^
          T0                                 T60min
```

### Pattern 2: Pipeline Workflow

Tasks flow through stages with dependencies:

```typescript
// Stage 1: Design
const designTask = await task_create({
  title: 'Design API schema',
  createdBy: 'orchestrator',
});

// Stage 2: Implementation (depends on design)
const implTask = await task_create({
  title: 'Implement API',
  dependencies: [designTask.id],
  createdBy: 'orchestrator',
});

// Stage 3: Testing (depends on implementation)
const testTask = await task_create({
  title: 'Add tests',
  dependencies: [implTask.id],
  createdBy: 'orchestrator',
});

// Stage 4: Documentation (depends on implementation)
const docsTask = await task_create({
  title: 'Write API documentation',
  dependencies: [implTask.id],
  createdBy: 'orchestrator',
});
```

**Timeline:**

```
Designer:  [Design]
Worker 1:          [========= Implement =========]
Worker 2:                                         [== Tests ==]
Worker 3:                                         [=== Docs ===]
           ^       ^                             ^             ^
           T0      T15min                        T60min       T75min
```

### Pattern 3: Map-Reduce

Parallel processing with aggregation:

```typescript
// Map: Parallel code reviews
const files = ['auth.ts', 'api.ts', 'db.ts', 'util.ts'];
const reviewTasks = await Promise.all(
  files.map((file) =>
    task_create({
      title: `Review ${file}`,
      description: `Security and quality review of ${file}`,
      createdBy: 'orchestrator',
      requiredCapabilities: ['read', 'grep'],
      tags: ['review', 'security'],
    })
  )
);

// Reduce: Aggregate results
const aggregateTask = await task_create({
  title: 'Aggregate code review findings',
  dependencies: reviewTasks.map((t) => t.task.id),
  createdBy: 'orchestrator',
});
```

**Timeline:**

```
Worker 1: [Review auth.ts]
Worker 2: [Review api.ts]
Worker 3: [Review db.ts]
Worker 4: [Review util.ts]
                           ↓
Orchestrator:              [Aggregate findings]
```

### Pattern 4: Continuous Integration

One agent runs tests while others implement features:

```typescript
// Continuous test runner (runs after each feature PR)
const testRunnerTask = await task_create({
  title: 'Run full test suite',
  createdBy: 'orchestrator',
  requiredCapabilities: ['bash'],
  priority: 'high',
  // Re-create this task after completion
  metadata: { recurring: true },
});

// Feature development (parallel)
const featureTasks = await Promise.all([
  task_create({ title: 'Add login endpoint', createdBy: 'orchestrator' }),
  task_create({ title: 'Add logout endpoint', createdBy: 'orchestrator' }),
]);
```

---

## Worktree Isolation

### Creating Worktrees

```bash
# List existing worktrees
rapid worktree list

# Create worktree for feature branch
rapid worktree create feat/auth

# Spawn agent in specific worktree
rapid worktree spawn feat/auth --agent claude-worker
```

### Worktree Structure

```
project/
├── .git/                    # Main git directory
├── main/                    # Main worktree (read-only reference)
│   ├── src/
│   ├── tests/
│   └── rapid.json
├── .worktrees/
│   ├── auth-feat-abc123/   # Worker 1's isolated environment
│   │   ├── src/            # Modified independently
│   │   ├── tests/          # New tests
│   │   ├── node_modules/   # Separate dependencies
│   │   └── .rapid/
│   │       └── agent.log
│   ├── perf-fix-def456/    # Worker 2's isolated environment
│   │   ├── src/            # Different modifications
│   │   ├── benchmarks/     # Performance tests
│   │   └── node_modules/
│   └── docs-ghi789/        # Designer's isolated environment
│       ├── docs/           # Documentation updates
│       └── README.md
```

### Benefits of Worktree Isolation

#### 1. No Merge Conflicts During Development

Agents work on separate branches that don't interfere:

```bash
# Worker 1 in .worktrees/auth-feat-abc123/
$ git branch
* feat/auth

# Worker 2 in .worktrees/perf-fix-def456/
$ git branch
* fix/perf

# No conflicts until merge time
```

#### 2. Independent Dependencies

Each worktree can have different dependencies installed:

```bash
# Auth feature needs new JWT library
.worktrees/auth-feat-abc123/
└── node_modules/
    └── jsonwebtoken@9.0.0

# Perf optimization needs profiling tools
.worktrees/perf-fix-def456/
└── node_modules/
    └── clinic@13.0.0
```

#### 3. Isolated Testing

Tests run independently without interfering:

```bash
# Worker 1 runs auth tests
cd .worktrees/auth-feat-abc123
npm test -- auth.test.ts

# Worker 2 runs perf tests (simultaneously!)
cd .worktrees/perf-fix-def456
npm test -- performance.test.ts
```

#### 4. Clean Branch History

Each feature branch has atomic, focused commits:

```bash
# feat/auth branch (Worker 1)
commit abc123 "Add JWT authentication middleware"
commit def456 "Add login endpoint with tests"
commit ghi789 "Add refresh token rotation"

# fix/perf branch (Worker 2)
commit jkl012 "Optimize database query performance"
commit mno345 "Add connection pooling"
```

### Managing Worktrees

```bash
# Check worktree status
rapid worktree status

# Remove completed worktree
rapid worktree remove .worktrees/auth-feat-abc123

# Clean up merged branches
rapid worktree cleanup

# Prune stale worktrees
rapid worktree prune
```

---

## Multi-Worker Coordination

### Example: Multi-Agent Code Review

**Scenario**: Review large codebase for security, performance, and style.

**Setup:**

```typescript
// Orchestrator creates review tasks
const files = await glob('src/**/*.ts');
const securityReviews = [];
const perfReviews = [];

for (const file of files) {
  // Security review task
  securityReviews.push(
    task_create({
      title: `Security review: ${file}`,
      description: `Check for security vulnerabilities in ${file}`,
      createdBy: 'orchestrator',
      requiredCapabilities: ['read', 'grep'],
      tags: ['security', 'review'],
      priority: 'high',
    })
  );

  // Performance review task
  perfReviews.push(
    task_create({
      title: `Performance review: ${file}`,
      description: `Identify performance bottlenecks in ${file}`,
      createdBy: 'orchestrator',
      requiredCapabilities: ['read', 'grep'],
      tags: ['performance', 'review'],
      priority: 'normal',
    })
  );
}

// Aggregate findings
const aggregateTask = await task_create({
  title: 'Aggregate review findings',
  dependencies: [...securityReviews.map((t) => t.task.id), ...perfReviews.map((t) => t.task.id)],
  createdBy: 'orchestrator',
});
```

**Agent Assignment:**

```
Security Reviewer 1: [Reviews 1-10]
Security Reviewer 2: [Reviews 11-20]
Performance Reviewer 1: [Reviews 1-10]
Performance Reviewer 2: [Reviews 11-20]
                                      ↓
Orchestrator:                    [Aggregate]
```

**Coordination via Event Bus:**

```typescript
// Security reviewer finds issue
await bus_send({
  type: 'coordination',
  agentId: 'security-reviewer-1',
  title: 'Critical security issue found',
  content: 'SQL injection vulnerability in auth.ts:142',
  priority: 'urgent',
  actionable: true,
});

// Orchestrator receives and creates fix task
const messages = await bus_messages({
  types: ['coordination'],
  limit: 10,
});

if (messages.find((m) => m.priority === 'urgent')) {
  await task_create({
    title: 'Fix SQL injection in auth.ts',
    priority: 'urgent',
    createdBy: 'orchestrator',
  });
}
```

### Example: Parallel Feature Development

**Scenario**: Build e-commerce checkout flow with multiple components.

**Task Breakdown:**

```typescript
// 1. Database schema (foundation)
const schemaTask = await task_create({
  title: 'Create checkout database schema',
  estimatedDuration: 900,
  createdBy: 'orchestrator',
});

// 2. Parallel API implementations (depend on schema)
const [cartAPI, paymentAPI, orderAPI] = await Promise.all([
  task_create({
    title: 'Implement cart API',
    dependencies: [schemaTask.task.id],
    createdBy: 'orchestrator',
  }),
  task_create({
    title: 'Implement payment API',
    dependencies: [schemaTask.task.id],
    createdBy: 'orchestrator',
  }),
  task_create({
    title: 'Implement order API',
    dependencies: [schemaTask.task.id],
    createdBy: 'orchestrator',
  }),
]);

// 3. Parallel testing (depend on APIs)
const [cartTests, paymentTests, orderTests] = await Promise.all([
  task_create({
    title: 'Add cart API tests',
    dependencies: [cartAPI.task.id],
    createdBy: 'orchestrator',
  }),
  task_create({
    title: 'Add payment API tests',
    dependencies: [paymentAPI.task.id],
    createdBy: 'orchestrator',
  }),
  task_create({
    title: 'Add order API tests',
    dependencies: [orderAPI.task.id],
    createdBy: 'orchestrator',
  }),
]);

// 4. Integration (depend on all tests)
const integrationTask = await task_create({
  title: 'Integrate checkout flow end-to-end',
  dependencies: [cartTests.task.id, paymentTests.task.id, orderTests.task.id],
  createdBy: 'orchestrator',
});
```

**Timeline Visualization:**

```
T0-15min:  Worker 1: [DB Schema]
T15-45min: Worker 2:            [Cart API]
           Worker 3:            [Payment API]
           Worker 4:            [Order API]
T45-60min: Worker 2:                        [Cart Tests]
           Worker 3:                        [Payment Tests]
           Worker 4:                        [Order Tests]
T60-90min: Worker 1:                                       [Integration]
```

**Total time**: ~90 minutes (vs 225 minutes sequential!)

---

## Performance Considerations

### 1. Agent Model Selection

Choose the right model for each task type:

| Task Type                | Model  | Cost | Speed  | Use Case                     |
| ------------------------ | ------ | ---- | ------ | ---------------------------- |
| Simple fixes, formatting | Haiku  | $    | ⚡⚡⚡ | High-volume, low-complexity  |
| Feature development      | Sonnet | $$   | ⚡⚡   | Balanced capability          |
| Complex architecture     | Opus   | $$$  | ⚡     | High-stakes design decisions |

**Example Configuration:**

```typescript
// rapid.json
{
  "personas": {
    "team": ["orchestrator", "worker-haiku", "worker-sonnet", "architect-opus"],
    "definitions": {
      "worker-haiku": {
        "model": "haiku",
        "systemPrompt": "Fast worker for simple tasks",
        "tools": ["read", "write", "edit", "bash"]
      },
      "worker-sonnet": {
        "model": "sonnet",
        "systemPrompt": "Balanced worker for complex features",
        "tools": ["read", "write", "edit", "bash", "grep", "glob"]
      },
      "architect-opus": {
        "model": "opus",
        "systemPrompt": "Architect for critical design decisions",
        "tools": ["read", "grep", "glob", "web_search"]
      }
    }
  }
}
```

### 2. Task Granularity

**Too Coarse** (inefficient parallelization):

```typescript
// Bad: One huge task that blocks everything
await task_create({
  title: 'Build entire authentication system',
  estimatedDuration: 14400, // 4 hours!
});
```

**Too Fine** (excessive overhead):

```typescript
// Bad: Too many tiny tasks
await task_create({ title: 'Add import statement' });
await task_create({ title: 'Define function signature' });
await task_create({ title: 'Implement function body' });
```

**Just Right** (optimal parallelization):

```typescript
// Good: Balanced task granularity
await task_create({ title: 'Implement login endpoint with tests' }); // ~30min
await task_create({ title: 'Implement logout endpoint with tests' }); // ~30min
await task_create({ title: 'Add JWT token refresh logic' }); // ~20min
```

**Rule of thumb**: Tasks should take 15-60 minutes for optimal balance.

### 3. Event Bus Optimization

**Efficient polling:**

```typescript
// Bad: Tight polling loop (wastes CPU)
while (true) {
  const messages = await bus_poll({ limit: 10 });
  // Process immediately
}

// Good: Poll with delay
while (true) {
  const messages = await bus_poll({ limit: 10 });
  // Process messages
  await sleep(5000); // Wait 5 seconds between polls
}

// Better: Use cursor-based polling
let cursor = undefined;
while (true) {
  const result = await bus_poll({ limit: 10, cursor });
  cursor = result.cursor; // Resume from last position
  await sleep(5000);
}
```

**Message batching:**

```typescript
// Bad: Send many small messages
for (const file of files) {
  await bus_send({
    type: 'completion',
    content: `Reviewed ${file}`,
  });
}

// Good: Batch completion messages
const results = files.map((file) => `Reviewed ${file}`);
await bus_send({
  type: 'completion',
  content: `Reviewed ${files.length} files:\n${results.join('\n')}`,
});
```

### 4. Worktree Cleanup

Clean up completed worktrees to save disk space:

```bash
# After merging feature branch
rapid worktree remove .worktrees/auth-feat-abc123

# Automatic cleanup of merged branches
rapid worktree cleanup

# Prune stale references
rapid worktree prune
```

### 5. Resource Limits

Monitor and limit concurrent agents:

```typescript
// rapid.json
{
  "personas": {
    "team": ["orchestrator", "worker-1", "worker-2", "worker-3"],
    "maxConcurrent": 3, // Limit to 3 concurrent workers
    "orchestrator": "orchestrator"
  }
}
```

---

## Debugging Concurrent Workflows

### 1. Event Bus Message Tracing

View all messages between agents:

```typescript
// Get recent messages
const messages = await bus_messages({
  types: ['coordination', 'completion', 'error'],
  limit: 50,
  brief: false,
});

messages.forEach((msg) => {
  console.log(`[${msg.timestamp}] ${msg.fromAgent.name}: ${msg.payload.title}`);
  console.log(`  ${msg.payload.content}`);
});
```

**CLI command:**

```bash
# View event bus messages
rapid bus messages --types coordination,error --limit 20

# Follow messages in real-time
rapid bus messages --follow
```

### 2. Task Status Monitoring

Check task progress:

```typescript
// List tasks by status
const pending = await task_list({ status: 'pending' });
const inProgress = await task_list({ status: 'in_progress' });
const completed = await task_list({ status: 'completed' });

console.log(`Pending: ${pending.tasks.length}`);
console.log(`In Progress: ${inProgress.tasks.length}`);
console.log(`Completed: ${completed.tasks.length}`);
```

**CLI command:**

```bash
# View task status
rapid tasks list --status in_progress

# View task dependencies
rapid tasks show <task-id> --show-dependencies
```

### 3. Agent Status Tracking

Monitor active agents:

```typescript
// Get active agents
const agents = await bus_agents({
  maxAgeSeconds: 300, // Active in last 5 minutes
});

agents.forEach((agent) => {
  console.log(`${agent.name} (${agent.id})`);
  console.log(`  Last seen: ${agent.lastSeen}`);
  console.log(`  Worktree: ${agent.worktree || 'none'}`);
});
```

**CLI command:**

```bash
# View active agents
rapid bus agents

# View agent status
rapid status --agents
```

### 4. Worktree State Inspection

Check which agents are working where:

```bash
# List all worktrees with branches
rapid worktree list

# Show which agents are in which worktrees
rapid worktree status
```

### 5. Logging and Observability

Enable verbose logging:

```bash
# Enable debug logging
export RAPID_LOG_LEVEL=debug
rapid dev

# View agent logs
tail -f .worktrees/auth-feat-abc123/.rapid/agent.log

# View orchestrator logs
tail -f .rapid/orchestrator.log
```

**Structured logging in agents:**

```typescript
// Log task start
console.error(`[task:${taskId}] Starting: ${task.title}`);

// Log progress
console.error(`[task:${taskId}] Progress: Implemented auth logic`);

// Log completion
console.error(`[task:${taskId}] Completed in ${duration}ms`);
```

---

## Common Pitfalls

### 1. Circular Dependencies

**Problem**: Task A depends on Task B, Task B depends on Task A.

```typescript
// Bad: Circular dependency
const taskA = await task_create({
  title: 'Task A',
  dependencies: [taskB.task.id], // References B
});

const taskB = await task_create({
  title: 'Task B',
  dependencies: [taskA.task.id], // References A - CIRCULAR!
});
```

**Solution**: Break circular dependencies into linear flow:

```typescript
// Good: Linear dependency chain
const taskA = await task_create({ title: 'Task A' });
const taskB = await task_create({
  title: 'Task B',
  dependencies: [taskA.task.id],
});
const taskC = await task_create({
  title: 'Task C',
  dependencies: [taskB.task.id],
});
```

### 2. Missing Capabilities

**Problem**: Agent claims task but lacks required tools.

```typescript
// Task requires bash
await task_create({
  title: 'Run integration tests',
  requiredCapabilities: ['bash', 'read'],
});

// Agent without bash tries to claim it - FAILS!
```

**Solution**: Ensure agents have required capabilities:

```yaml
# .rapid/personas/worker.yaml
tools:
  - read
  - write
  - bash # Required for test execution
  - grep
  - glob
```

### 3. Race Conditions on Shared Files

**Problem**: Two agents modify the same file simultaneously.

```typescript
// Worker 1 in main branch
// Worker 2 in main branch
// Both edit src/config.ts - CONFLICT!
```

**Solution**: Use worktrees for isolation:

```bash
# Worker 1 in isolated worktree
rapid worktree create feat/config-update-1

# Worker 2 in different isolated worktree
rapid worktree create feat/config-update-2
```

### 4. Stale Task Claims

**Problem**: Agent claims task but crashes without completing it.

```typescript
// Worker claims task
await task_claim({ id: taskId, agentId: myAgentId });

// Worker crashes - task stuck as "in_progress"!
```

**Solution**: Implement claim timeouts:

```typescript
// Create task with claim deadline
await task_create({
  title: 'Task with timeout',
  claimDeadline: Date.now() + 300000, // 5 minutes
});

// Orchestrator reclaims stale tasks
const staleTasks = tasks.filter(
  (t) => t.status === 'in_progress' && t.claimDeadline && Date.now() > t.claimDeadline
);

for (const task of staleTasks) {
  await task_update({
    id: task.id,
    status: 'pending',
    assignedTo: undefined,
  });
}
```

### 5. Dependency Deadlock

**Problem**: Task dependencies form a cycle preventing progress.

```typescript
// Task A waits for Task B
// Task B waits for Task C
// Task C waits for Task A
// Nothing can proceed!
```

**Solution**: Use topological sort to detect cycles:

```typescript
function detectCycles(tasks: Task[]): string[] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycles: string[] = [];

  function visit(taskId: string) {
    if (stack.has(taskId)) {
      cycles.push(taskId);
      return;
    }
    if (visited.has(taskId)) return;

    visited.add(taskId);
    stack.add(taskId);

    const task = tasks.find((t) => t.id === taskId);
    for (const depId of task?.dependencies || []) {
      visit(depId);
    }

    stack.delete(taskId);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return cycles;
}
```

### 6. Insufficient Event Bus Polling

**Problem**: Agents don't check messages frequently enough.

```typescript
// Bad: Check once per minute
setInterval(async () => {
  const messages = await bus_poll();
}, 60000);
```

**Solution**: Poll more frequently (5-10 seconds):

```typescript
// Good: Check every 5 seconds
setInterval(async () => {
  const messages = await bus_poll();
}, 5000);
```

---

## Best Practices

### 1. Design for Parallelism

Break work into independent, parallelizable tasks:

```typescript
// Good: Independent tasks
const tasks = [
  { title: 'Add login endpoint', file: 'auth.ts' },
  { title: 'Add logout endpoint', file: 'auth.ts' },
  { title: 'Add user profile endpoint', file: 'users.ts' },
];
```

### 2. Use Appropriate Task Granularity

Aim for 15-60 minute tasks:

```typescript
// Too large (4 hours)
{
  title: 'Build entire authentication system';
}

// Too small (2 minutes)
{
  title: 'Add import statement';
}

// Just right (30 minutes)
{
  title: 'Implement login endpoint with validation and tests';
}
```

### 3. Explicit Capability Requirements

Always specify required capabilities:

```typescript
await task_create({
  title: 'Run performance benchmarks',
  requiredCapabilities: ['bash', 'read', 'write'],
  createdBy: 'orchestrator',
});
```

### 4. Clear Coordination Messages

Send informative event bus messages:

```typescript
// Bad: Vague message
await bus_send({
  type: 'completion',
  content: 'Done',
});

// Good: Detailed message
await bus_send({
  type: 'completion',
  agentId: myAgentId,
  title: 'Authentication API completed',
  content: `Implemented login/logout endpoints with JWT tokens.
  - Added src/auth/controller.ts
  - Added tests with 95% coverage
  - Updated API documentation

  Ready for security review.`,
  priority: 'normal',
});
```

### 5. Monitor Task Progress

Send progress updates for long-running tasks:

```typescript
// Start task
await task_claim({ id: taskId, agentId: myAgentId });

// Progress update
await bus_send({
  type: 'coordination',
  title: `Progress on ${task.title}`,
  content: 'Completed database schema, starting API implementation',
});

// Completion
await task_complete({
  id: taskId,
  summary: 'API implementation complete with tests',
});
```

### 6. Clean Up Resources

Remove completed worktrees and prune tasks:

```bash
# After merging
git worktree remove .worktrees/feat-auth-abc123

# Cleanup old tasks
rapid tasks cleanup --older-than 7d
```

### 7. Use Orchestrator Pattern

Central orchestrator coordinates workers:

```typescript
// Orchestrator creates and assigns tasks
while (true) {
  // Check for available workers
  const workers = await bus_agents();

  // Create tasks based on project needs
  const tasks = await createTasksFromBacklog();

  // Assign to capable workers
  for (const task of tasks) {
    const worker = findCapableWorker(workers, task);
    if (worker) {
      await task_update({
        id: task.id,
        assignedTo: worker.id,
      });
    }
  }

  // Wait before next cycle
  await sleep(10000);
}
```

### 8. Handle Errors Gracefully

Implement retry logic for failed tasks:

```typescript
// Task creation with retry support
await task_create({
  title: 'Deploy to staging',
  canRetry: true,
  attemptNumber: 1,
  createdBy: 'orchestrator',
});

// Retry on failure
if (taskFailed && task.canRetry && task.attemptNumber < 3) {
  await task_update({
    id: task.id,
    status: 'pending',
    attemptNumber: task.attemptNumber + 1,
  });
}
```

### 9. Document Dependencies

Add clear descriptions to tasks:

```typescript
await task_create({
  title: 'Implement payment processing',
  description: `Add Stripe payment integration.

  Dependencies:
  - User model must exist (task: ${userModelTaskId})
  - Database schema ready (task: ${schemaTaskId})

  Deliverables:
  - Payment controller with charge/refund methods
  - Integration tests with Stripe test mode
  - Error handling for failed payments`,
  dependencies: [userModelTaskId, schemaTaskId],
});
```

### 10. Load Balance Workers

Distribute work evenly across agents:

```typescript
// Track worker load
const workerLoad = new Map<string, number>();

// Assign to least-loaded worker
function assignTask(task: Task, workers: Agent[]) {
  const leastLoaded = workers.reduce((min, worker) =>
    (workerLoad.get(worker.id) || 0) < (workerLoad.get(min.id) || 0) ? worker : min
  );

  workerLoad.set(leastLoaded.id, (workerLoad.get(leastLoaded.id) || 0) + 1);
  return leastLoaded;
}
```

---

## Summary

Concurrent execution in RAPID enables:

- **Faster development** through parallel work
- **Better resource utilization** with specialized agents
- **Conflict-free collaboration** via worktree isolation
- **Automatic coordination** using the event bus

**Key Takeaways:**

1. Use task dependencies to define execution order
2. Isolate work in git worktrees to prevent conflicts
3. Match agent capabilities to task requirements
4. Choose appropriate task granularity (15-60 minutes)
5. Monitor progress via event bus messages
6. Clean up resources after task completion

**Next Steps:**

- [Multi-Agent System Architecture](../architecture/multi-agent-system.md)
- [Event Bus Documentation](../../packages/rapid-eventbus/README.md)
- [Persona Configuration Guide](rapid-json-config.md#personas)
- [Error Handling Patterns](error-handling-patterns.md)
