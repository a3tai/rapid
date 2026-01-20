# RAPID Multi-Agent System Architecture

Complete system architecture for multi-agent development in RAPID with event bus coordination, isolated worktrees, and dynamic personas.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RAPID Multi-Agent System                         │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌────────────────────────────┐
                    │   Orchestrator Agent       │
                    │  (Task Assignment &        │
                    │   Coordination)            │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │     Event Bus (Redis)      │
                    │  • Message Routing         │
                    │  • Agent Registry          │
                    │  • Task Coordination       │
                    └────────┬──────────┬────────┘
                             │          │
        ┌────────────────────┘          └─────────────────┐
        │                                                  │
   ┌────▼──────────────┐                    ┌────────────▼────┐
   │  Worker Agent 1   │                    │  Designer Agent │
   │  (Haiku - High    │   ...              │  (Design &      │
   │   Throughput)     │                    │   Architecture) │
   └────┬──────────────┘                    └────────────┬────┘
        │                                               │
        │            Git Worktree Isolation            │
        │                                               │
   ┌────▼──────────────┐                    ┌────────────▼────┐
   │ .worktrees/       │                    │ .worktrees/     │
   │ feat-auth-12345   │                    │ design-sys-67890│
   │ (Branch: feat/auth)                   │ (Branch: design)│
   └───────────────────┘                    └─────────────────┘
```

## Component Architecture

### 1. Event Bus (Central Coordination)

**Technology**: Redis (with in-memory fallback)

**Functions**:
- Message routing between agents
- Agent registration and discovery
- Task management and assignment
- Real-time status updates

**Message Types**:
- `coordination` - Agent-to-agent communication
- `completion` - Task completion notifications
- `error` - Error reporting and logging
- `discovery` - System state changes
- `learning` - Knowledge sharing between agents
- `question` - Agent queries
- `heartbeat` - Keep-alive signals

```
┌─────────────────────────────────┐
│      Event Bus (Redis)          │
├─────────────────────────────────┤
│ Message Queue                   │
│ ├─ coordination: agent → agent │
│ ├─ completion: worker → orch   │
│ ├─ error: any agent → all      │
│ ├─ discovery: system events    │
│ └─ heartbeat: agents → bus     │
│                                │
│ Agent Registry                  │
│ ├─ claude-haiku-xxxxx: active  │
│ ├─ claude-designer-yyyyy: idle │
│ └─ claude-orchestrator: active │
│                                │
│ Task Management                 │
│ ├─ pending tasks: []           │
│ ├─ in_progress tasks: []       │
│ └─ completed tasks: []         │
└─────────────────────────────────┘
```

### 2. Orchestrator Agent

**Role**: Central coordinator and task manager

**Responsibilities**:
- Monitor all agents and system health
- Create and assign tasks based on project needs
- Collect results and coordinate multi-agent workflows
- Manage event bus state

**Flow**:
```
1. Read rapid.json for project configuration
2. Create tasks (detected from codebase, user requests, or planned phases)
3. Poll event bus for agent availability
4. Assign high-priority tasks to workers
5. Monitor task completion
6. Coordinate worker output and next steps
7. Adjust assignments based on workload
```

### 3. Worker Agents

**Role**: Task execution and implementation

**Types**:
- **Haiku Worker** (High throughput, fast operations)
  - CLI command implementation
  - Small features and fixes
  - Testing and validation
  - Documentation updates

- **Sonnet Worker** (Balanced capability)
  - Complex feature development
  - Architecture decisions
  - Code review and refactoring
  - Test suite creation

- **Custom Workers** (Specialized)
  - Designer: Architecture, documentation, UX
  - Reviewer: Code quality, testing
  - Researcher: Investigation, exploration

**Execution Model**:
```
Worker Lifecycle:
1. Register with event bus (get agent ID)
2. Send heartbeat: "Ready for tasks"
3. Poll task queue for assignments
4. Claim task → mark in_progress
5. Execute task (use MCP tools available)
6. Generate output/changes
7. Mark complete → send completion message
8. Poll for next task
9. Continue until coordinator stops or ralph-loop max_iterations reached
```

### 4. Worktree Isolation

**Purpose**: Each agent works in isolated git worktree to prevent conflicts

**Structure**:
```
Project Root
├── .git/
├── main/                    ← Main worktree (orchestrator/reference)
├── .worktrees/
│   ├── feat-auth-1234567/  ← Worker 1 (branch: feat/auth)
│   ├── fix-perf-2345678/   ← Worker 2 (branch: fix/perf)
│   └── design-sys-3456789/ ← Designer (branch: design/system)
├── rapid.json
├── .rapid/
│   └── personas/
│       ├── orchestrator.yaml
│       ├── worker-haiku.yaml
│       └── designer.yaml
└── src/, tests/, docs/     ← Shared (symlink or monorepo)
```

**Benefits**:
- No merge conflicts during parallel work
- Independent dependency installation per worktree
- Isolated testing and validation
- Clean branch history
- Easy to merge or discard work

### 5. Configuration Flow

```
rapid.json (Project Configuration)
│
├─ agents: { default, available }
│  └─ defines which agents can run
│
├─ personas: { definitions, team, autoSpawn }
│  ├─ definitions: { name → YAML file }
│  ├─ team: [orchestrator, worker-1, designer]
│  └─ autoSpawn: true (spawn on rapid start)
│
├─ eventBus: { enabled, redis }
│  └─ configuration for coordination
│
├─ container: { devcontainer, autoStart }
│  └─ isolated development environment
│
└─ secrets: { provider, items, vault }
   └─ secure credential management

.rapid/personas/*.yaml (Agent Definitions)
│
├─ orchestrator.yaml
│  └─ system: "You are the orchestrator..."
│
├─ worker.yaml
│  └─ system: "You are a worker..."
│
└─ designer.yaml
   └─ system: "You are designing architecture..."
```

### 6. MCP Tools Available to Agents

```
┌────────────────────────────────────────────┐
│  MCP Server Tools (Available to All)      │
├────────────────────────────────────────────┤
│                                            │
│ Filesystem Operations                     │
│ ├─ read_file(path)                       │
│ ├─ write_file(path, content)             │
│ ├─ list_files(path, pattern)             │
│ └─ Security: read/write path restrictions│
│                                            │
│ Command Execution                         │
│ ├─ secure_exec(command, sandbox_mode)    │
│ ├─ Modes: strict, balanced, permissive   │
│ └─ Capture stdout/stderr                 │
│                                            │
│ Network                                   │
│ ├─ fetch_via_proxy(url, headers)         │
│ ├─ Domain whitelist enforcement           │
│ └─ SSRF prevention                        │
│                                            │
│ Secrets Management                        │
│ ├─ get_secret(key)                       │
│ ├─ Sources: 1Password, Vault, env        │
│ └─ Secure caching                        │
│                                            │
│ Event Bus Communication                   │
│ ├─ bus_send(message, type, content)      │
│ ├─ bus_messages(filter, limit)           │
│ ├─ bus_poll(cursor)                      │
│ ├─ bus_agents()                          │
│ └─ bus_status()                          │
│                                            │
│ Agent/Persona Management                  │
│ ├─ persona_list()                        │
│ ├─ persona_get(name)                     │
│ ├─ persona_spawn(name, task)             │
│ ├─ persona_agents()                      │
│ └─ persona_stop(agent_id)                │
│                                            │
│ Task Management                           │
│ ├─ task_create(title, description)       │
│ ├─ task_list(filters)                    │
│ ├─ task_claim(id)                        │
│ ├─ task_complete(id, summary)            │
│ └─ task_update(id, changes)              │
│                                            │
│ Security Operations                       │
│ ├─ check_security(type)                  │
│ ├─ Types: secrets, dependencies, sast    │
│ └─ Returns: vulnerabilities, fixes       │
│                                            │
└────────────────────────────────────────────┘
```

## Workflow Examples

### Parallel Feature Development

```
Orchestrator Creates Two Features:
│
├─ Task A: "Add user auth"  → Worker 1 (Haiku)
│  └─ Executes in .worktrees/feat-auth-xxx/
│
└─ Task B: "Add API docs" → Worker 2 (Sonnet)
   └─ Executes in .worktrees/docs-api-yyy/

Both workers run simultaneously:
1. Worker 1: implements auth, tests, commits to feat/auth
2. Worker 2: writes docs, commits to docs/api
3. Orchestrator: collects both, verifies no conflicts
4. Merges both branches to main

Timeline: Sequential tasks now run in parallel!
```

### Multi-Stage Task

```
Designer Proposes Architecture:
1. Designer Agent → Sends architecture design via bus
2. Orchestrator receives → Creates implementation tasks
3. Worker 1 → Implements component A
4. Worker 2 → Implements component B
5. Designer → Reviews and provides feedback
6. Workers → Fix based on feedback
7. Orchestrator → Coordinates final merge

All stages coordinated through event bus!
```

### Error Recovery

```
Worker encounters error:
1. Worker sends error message: type=error via bus_send
2. Orchestrator receives and analyzes
3. Options:
   - Auto-retry with adjusted task
   - Assign to different worker
   - Escalate to designer for strategy change
   - Create sub-tasks for investigation

Error is captured in event bus history!
```

## Ralph-Loop (Continuous Execution)

The system can run in "ralph-loop" mode for indefinite operation:

```
Ralph-Loop Flow:
1. Worker registers: "Ready for work"
2. Ralph-loop started:
   ├─ max_iterations: 0 (unlimited)
   ├─ completion_promise: null (no auto-stop)
   └─ Active: true
3. Worker polls indefinitely:
   → Event bus for new messages
   → Task queue for assignments
   → Other agents for coordination
4. Ralph-loop restart:
   ├─ If worker tries to exit: RESTART with same task
   ├─ Re-registers on bus
   ├─ Continues indefinitely
   └─ Only stops if orchestrator sends stop signal

Perfect for:
- Continuous integration workflows
- Long-running validations
- Self-healing systems
- Production deployment
```

## System State Example

```
Time: 2026-01-20T02:06:57Z

Event Bus State:
┌────────────────────────────────┐
│ Active Agents (3)              │
├────────────────────────────────┤
│ claude-haiku-1768873566218     │
│   Status: active               │
│   Assigned: Task 6126550e      │
│   Last heartbeat: 0.5s ago     │
│                                │
│ claude-designer-1768874817438  │
│   Status: active               │
│   Assigned: Task f8649022      │
│   Last heartbeat: 1.2s ago     │
│                                │
│ claude-orchestrator-app        │
│   Status: active               │
│   Assigned: Coordination       │
│   Last heartbeat: 0.1s ago     │
└────────────────────────────────┘

Task Queue State:
┌────────────────────────────────┐
│ 17 Total Tasks                 │
├────────────────────────────────┤
│ Completed: 15 ✓                │
│ In Progress: 2                 │
│ Pending: 0                     │
└────────────────────────────────┘

Worktree Isolation:
┌────────────────────────────────┐
│ .worktrees/ contains:          │
│ ├─ feat-auth/ (Worker 1)       │
│ └─ design-sys/ (Designer)      │
│                                │
│ Each agent operates in:        │
│ • Isolated worktree            │
│ • Own git branch               │
│ • Independent dependencies     │
│ • Separate environment         │
└────────────────────────────────┘
```

## Benefits of Multi-Agent Architecture

✅ **Parallelism** - Multiple tasks run simultaneously
✅ **Isolation** - Worktrees prevent conflicts
✅ **Coordination** - Event bus enables communication
✅ **Scalability** - Add more agents for more throughput
✅ **Flexibility** - Different agent types for different tasks
✅ **Resilience** - Agents can fail, others continue
✅ **Transparency** - Full event history and task tracking
✅ **Automation** - Self-managing task distribution

## Integration Points

- **GitHub**: PR/Issue triggers → Orchestrator creates tasks
- **GitLab**: CI/CD pipeline → Task assignments
- **Linear**: Project management → Task sync
- **Slack**: Status updates, alerts, coordination
- **Email**: Notifications, approvals
- **Webhooks**: Custom integrations

## Future Enhancements

- [ ] Agent specialization by repository region
- [ ] ML-based task routing optimization
- [ ] Automatic conflict detection and resolution
- [ ] Cross-project agent pooling
- [ ] Advanced scheduling (priority, dependencies, resources)
- [ ] Cost optimization (prefer cheaper agents)
- [ ] Quality metrics per agent
- [ ] Human-in-the-loop approval workflow
