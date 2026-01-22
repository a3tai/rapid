# RAPID Dashboard Design

## Philosophy

> "The UI's job shifts from 'show me all the status' to 'tell me what you need from me so my agents can keep working.'"

The RAPID dashboard should surface **actionable insights**, not just status. Every metric should answer: "What decision does this help me make?"

---

## Dashboard Sections

### 1. Command Bar (Top)
```
┌──────────────────────────────────────────────────────────────────┐
│ RAPID                    [🔍 Search]  [⏱ Last 24h ▼]  [⚙️]  [👤] │
└──────────────────────────────────────────────────────────────────┘
```
- Global search (agents, tasks, events)
- Time range selector (1h, 6h, 24h, 7d, 30d, custom)
- Settings and user profile

### 2. Summary Cards (KPI Row)
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  $24.67  │ │    4     │ │   12     │ │  97.2%   │ │  1.4s    │
│ ──────── │ │ ──────── │ │ ──────── │ │ ──────── │ │ ──────── │
│  Today   │ │  Active  │ │  Tasks   │ │ Success  │ │   Avg    │
│  Cost    │ │  Agents  │ │  Queue   │ │   Rate   │ │ Latency  │
│  ↑ 12%   │ │  ↑ 2     │ │  ↓ 3     │ │  → 0%    │ │  ↓ 0.2s  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**Metrics:**
- **Today's Cost** - Total LLM spend (with trend vs yesterday)
- **Active Agents** - Currently running agents
- **Task Queue** - Pending + in_progress tasks
- **Success Rate** - Task completion rate (last 24h)
- **Avg Latency** - Mean agent response time

### 3. Alerts & Actions (Attention Required)
```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️  Attention Required                                          │
├─────────────────────────────────────────────────────────────────┤
│ 🔴 Budget alert: $45.23 of $50 daily limit (90%)    [View]     │
│ 🟠 Agent worker-abc stale (no heartbeat 5m)         [Restart]  │
│ 🟡 3 tasks awaiting approval                        [Review]   │
└─────────────────────────────────────────────────────────────────┘
```

**Alert Types:**
- Budget thresholds (70%, 90%, 100%)
- Stale/errored agents
- Pending approvals (HITL)
- Task timeouts
- High error rates

### 4. Cost Analytics (Primary Focus)
```
┌─────────────────────────────────────┬────────────────────────────┐
│ Cost Over Time                      │ Cost by Model              │
│                                     │                            │
│    $50 ┤                            │   ┌────────┐               │
│        │      ╭──╮                  │   │ Opus   │ $15.20 (62%)  │
│    $25 ┤  ╭──╯    ╰──╮              │   │ Sonnet │ $7.30  (30%)  │
│        │──╯           ╰──           │   │ Haiku  │ $2.17  (8%)   │
│     $0 ┼───────────────────         │   └────────┘               │
│        Mon  Tue  Wed  Thu  Fri      │                            │
└─────────────────────────────────────┴────────────────────────────┘
│ Cost by Agent                       │ Token Usage                │
│                                     │                            │
│ orchestrator ████████████ $12.40    │ Input:  2.4M tokens        │
│ worker-impl  ██████      $6.20      │ Output: 890K tokens        │
│ worker-test  ████        $4.10      │ Total:  3.29M tokens       │
│ worker-docs  ██          $1.97      │                            │
│                                     │ Avg per task: 45K tokens   │
└─────────────────────────────────────┴────────────────────────────┘
```

**Metrics:**
- Cost over time (line/area chart)
- Cost breakdown by model (donut chart)
- Cost by agent (bar chart)
- Token usage (input/output split)
- Cost per task average

### 5. Agent Fleet Status
```
┌─────────────────────────────────────────────────────────────────┐
│ Agents                                            [+ Spawn New] │
├─────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ 🟢 orchestrator-main          Running    2h 15m           │   │
│ │    Model: opus │ Tasks: 12 │ Cost: $8.40 │ ████░ 80%     │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ 🟢 worker-impl-abc123         Running    45m              │   │
│ │    Model: sonnet │ Task: "Implement auth" │ Cost: $3.20   │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ 🟡 worker-test-def456         Idle       5m               │   │
│ │    Model: haiku │ Awaiting tasks │ Cost: $0.45            │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │ 🔴 worker-docs-ghi789         Error      10m              │   │
│ │    Model: sonnet │ "Connection timeout" │ [Restart] [Logs]│   │
│ └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Agent Card Info:**
- Status indicator (green/yellow/red)
- Name and type (orchestrator/worker)
- Runtime duration
- Current model
- Current task (if any)
- Session cost
- Quick actions (restart, view logs, stop)

### 6. Task Pipeline
```
┌─────────────────────────────────────────────────────────────────┐
│ Tasks                                    [Kanban ▼] [+ Create]  │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │ PENDING (5) │ │ CLAIMED (2) │ │ PROGRESS(3) │ │ DONE (45)   │ │
│ ├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤ │
│ │ ┌─────────┐ │ │ ┌─────────┐ │ │ ┌─────────┐ │ │ ┌─────────┐ │ │
│ │ │ Add     │ │ │ │ Fix     │ │ │ │ Impl    │ │ │ │ Write   │ │ │
│ │ │ tests   │ │ │ │ bug #42 │ │ │ │ auth    │ │ │ │ docs    │ │ │
│ │ │ ──────  │ │ │ │ ──────  │ │ │ │ ──────  │ │ │ │ ──────  │ │ │
│ │ │ 🏷 test │ │ │ │ worker  │ │ │ │ ████░   │ │ │ │ ✓ 2m    │ │ │
│ │ └─────────┘ │ │ └─────────┘ │ │ └─────────┘ │ │ └─────────┘ │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Views:**
- Kanban board (default)
- List view with filters
- Priority queue view
- Dependency graph

### 7. Activity Feed
```
┌─────────────────────────────────────────────────────────────────┐
│ Activity                                        [Filter ▼]      │
├─────────────────────────────────────────────────────────────────┤
│ 10:45  ✅  worker-impl completed "Implement user auth"          │
│ 10:44  🔧  worker-impl called Edit tool (src/auth.ts)           │
│ 10:42  📋  orchestrator assigned task-456 to worker-test        │
│ 10:40  ⚠️  worker-docs heartbeat timeout (recovered)            │
│ 10:38  💬  orchestrator → workers: "Focus on auth module"       │
│ 10:35  🚀  worker-test spawned (worktree: agent-abc123)         │
│ 10:32  💰  Budget checkpoint: $18.40 (37% of daily limit)       │
└─────────────────────────────────────────────────────────────────┘
```

**Event Types:**
- Task completions
- Tool calls
- Agent spawns/stops
- Inter-agent messages
- Budget checkpoints
- Errors and recoveries

---

## Secondary Pages

### Cost Detail Page
- Detailed cost breakdown by hour/day
- Cost by agent over time (stacked area)
- Token usage patterns
- Model efficiency comparison
- Budget configuration

### Agent Detail Page
- Agent output stream (live)
- Tool call history
- Token usage graph
- Task history
- Performance metrics

### Task Detail Page
- Full task description
- Assignment history
- Progress updates
- Dependencies visualization
- Approval workflow

### Settings Page
- Budget limits (daily, per-agent)
- Alert thresholds
- Model preferences
- MCP server configuration
- Persona management

---

## Color System

| Color | Meaning | Usage |
|-------|---------|-------|
| Green | Healthy/Success | Running agents, completed tasks |
| Yellow | Warning/Idle | Idle agents, pending approvals |
| Red | Error/Critical | Errors, budget exceeded |
| Violet | Primary accent | Buttons, links, highlights |
| Blue | Info | Informational badges, links |

## Typography

| Element | Size | Weight | Font |
|---------|------|--------|------|
| Page title | 24px | 500 | System sans |
| Section header | 18px | 600 | System sans |
| Card title | 14px | 600 | System sans |
| Body text | 14px | 400 | System sans |
| Stat value | 28px | 700 | Tabular nums |
| Code/IDs | 12px | 400 | Mono |

---

## Implementation Priority

### Phase 1: Core Dashboard
1. Summary KPI cards
2. Agent status list
3. Task queue (list view)
4. Activity feed

### Phase 2: Cost Analytics
1. Cost summary cards
2. Cost over time chart
3. Cost by model/agent charts
4. Budget alerts

### Phase 3: Advanced Features
1. Task Kanban board
2. Agent output streaming
3. Dependency graph
4. Performance analytics

### Phase 4: Polish
1. Real-time updates (WebSocket/SSE)
2. Mobile responsive
3. Keyboard shortcuts
4. Export/reporting

---

## Tech Stack (Current)

- **Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Charts**: Recharts
- **State**: Zustand
- **Data**: Polling → SSE/WebSocket

## Data Sources

| Metric | Source | Update Frequency |
|--------|--------|------------------|
| Agent status | Daemon API | 5s polling / SSE |
| Task list | MCP task_list | 5s polling |
| Cost data | MCP get_cost_summary | 30s polling |
| Events | MCP bus_messages | SSE stream |
| Metrics | MCP metrics_get | 30s polling |
