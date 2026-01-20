# RAPID Wails Desktop - Unified Chat-Based UI Design

**Status**: Design Phase
**Created**: 2026-01-20
**Designer**: claude-middle
**Task ID**: 4da3fa8f-eea3-4bfe-9234-da5662458055

## Executive Summary

This document outlines the design for transforming the RAPID Wails desktop app into a unified, chat-centric interface that integrates multi-agent orchestration, task management, human-in-the-loop approvals, and context management into a seamless conversational experience.

**Core Philosophy**: Make multi-agent orchestration feel like chatting with an intelligent team, not managing a complex system.

## Current Architecture Analysis

### Existing Foundation (✅ Strong)

```
App.tsx
├── Sidebar (Navigation)
├── Header (Title bar + status)
└── Pages (Route-based views)
    ├── Dashboard (Stats + Agent/Task/Event/Suggestion panels)
    ├── AgentsPage
    ├── TasksPage
    ├── EventsPage
    ├── ConfigPage
    └── Knowledge
```

**State Management**: Zustand store with types:

- `Agent`: id, name, worktree, session
- `Task`: id, title, description, status, priority, assignedTo, timestamps, tags
- `Message`: id, type, fromAgent, timestamp, payload
- `Suggestion`: id, title, description, category, status, voting data
- `DaemonStatus`: running, pid, socketPath, version, uptime, sessions

**Data Flow**: useDataPolling(5000ms) → Wails bindings → Zustand store → React components

### Gap Analysis

| Feature           | Current Status    | Needs                                             |
| ----------------- | ----------------- | ------------------------------------------------- |
| Chat Interface    | ❌ None           | Primary interaction layer with streaming          |
| HITL Approvals    | ❌ None           | Inline chat prompts with one-click approve/reject |
| Real-time Updates | ⚠️ Polling only   | WebSocket for instant updates                     |
| Task Board        | ⚠️ List view only | Kanban drag-drop view                             |
| Command Palette   | ❌ None           | Cmd+K quick actions                               |
| Context Browser   | ⚠️ Basic page     | Enhanced context-specific UI                      |
| Agent Management  | ✅ List view      | Add spawn/stop/reassign actions                   |

## Proposed Unified Architecture

### High-Level Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [RAPID 🚀]  [🤖 Agents]  [📋 Tasks]  [🧠 Context]  [⚙️]     │
├──────────────┬──────────────────────────────────────────────┤
│              │                                               │
│   Agents     │         Main Chat Area                        │
│   Panel      │                                               │
│              │  ┌──────────────────────────────────────┐    │
│ 🟢 Orch      │  │ 👤 Orchestrator                      │    │
│   claude-1   │  │ Created 3 new tasks from your        │    │
│              │  │ request. Worker-1 claimed task #42.  │    │
│ 🟢 Worker-1  │  │                               2m ago │    │
│   rapid-w1   │  └──────────────────────────────────────┘    │
│              │                                               │
│ 🟡 Worker-2  │  ┌──────────────────────────────────────┐    │
│   rapid-w2   │  │ ⚠️  APPROVAL REQUIRED                │    │
│              │  │ 👤 Worker-1 (rapid-w1)               │    │
│ ⚪ Designer   │  │ Wants to deploy to production        │    │
│   [Spawn]    │  │ Changes: 15 files modified           │    │
│              │  │                                       │    │
│──────────────│  │ [✓ Approve]  [✗ Reject]  [👁 Details]│    │
│              │  │                               Just now│    │
│   Quick      │  └──────────────────────────────────────┘    │
│   Actions    │                                               │
│              │  ┌──────────────────────────────────────┐    │
│ 🚀 Start All │  │ 👤 You                               │    │
│ ⏸  Pause     │  │ Show me the task status              │    │
│ 📝 New Task  │  │                               Just now│    │
│ 🗳️ Proposals │  └──────────────────────────────────────┘    │
│              │                                               │
│──────────────│  ┌──────────────────────────────────────┐    │
│              │  │ Type a message... (Cmd+K for actions)│    │
│  [Activity]  │  │ [📎] [🎤] [Send]                      │    │
│  (collapsed) │  └──────────────────────────────────────┘    │
└──────────────┴──────────────────────────────────────────────┘
```

### Enhanced Layout with Panels Expanded

```
┌──────────────┬──────────────────────────┬──────────────────┐
│   Agents     │      Main Chat           │   Task Board     │
│   Panel      │                          │   (toggleable)   │
│ (200px)      │                          │   (300px)        │
├──────────────┼──────────────────────────┼──────────────────┤
│              │                          │ Pending          │
│ 🟢 Orch      │  [Chat messages...]      │ ┌──────────────┐ │
│ 🟢 Worker-1  │                          │ │ Fix bug #123 │ │
│ 🟡 Worker-2  │                          │ │ High priority│ │
│ ⚪ Designer   │                          │ └──────────────┘ │
│              │                          │                  │
│ [+ Spawn]    │                          │ In Progress      │
│              │                          │ ┌──────────────┐ │
│──────────────│                          │ │ Implement... │ │
│  Activity    │                          │ │ Worker-1 ↻   │ │
│  Feed        │                          │ └──────────────┘ │
│              │                          │                  │
│ 🔍 Discovery │                          │ Completed        │
│ ✅ Complete  │                          │ ┌──────────────┐ │
│ ❌ Error     │                          │ │ Deploy done  │ │
└──────────────┴──────────────────────────┴──────────────────┘
```

## Component Architecture

### 1. Chat Interface (New)

**Primary Component**: `<ChatInterface />`

```typescript
interface ChatMessage {
  id: string;
  type: 'user' | 'agent' | 'system' | 'approval' | 'streaming';
  fromAgent?: Agent;
  content: string;
  timestamp: string;
  metadata?: {
    taskId?: string;
    approvalId?: string;
    contextRefs?: string[];
    files?: string[];
  };
}

interface ApprovalRequest {
  id: string;
  fromAgent: Agent;
  action: string;
  reason: string;
  risk: 'low' | 'medium' | 'high';
  context: {
    files?: string[];
    changes?: string;
    impact?: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  respondedAt?: string;
  respondedBy?: string;
}

// State additions to app.ts
interface AppState {
  // ... existing state

  // Chat state
  chatMessages: ChatMessage[];
  chatInput: string;
  isStreaming: boolean;
  activeApprovalRequest: ApprovalRequest | null;
  approvalHistory: ApprovalRequest[];

  // Actions
  sendChatMessage: (content: string) => Promise<void>;
  addChatMessage: (message: ChatMessage) => void;
  handleApproval: (id: string, decision: 'approve' | 'reject', reason?: string) => Promise<void>;
}
```

**Features**:

- Streaming text display with typewriter effect
- Message threading (replies to specific messages)
- Rich content: code blocks, file links, task references
- Approval requests as special message type with action buttons
- Auto-scroll to bottom on new messages
- Message search and filtering
- Copy message content
- React to messages (like Slack reactions)

**Keyboard Shortcuts**:

- `Cmd+Enter`: Send message
- `Cmd+K`: Open command palette
- `Escape`: Clear input
- `↑/↓`: Navigate message history

### 2. Enhanced Agent Panel

**Component**: `<AgentPanel />`

```typescript
interface AgentPanelProps {
  agents: Agent[];
  onSpawn: (personaType: string) => Promise<void>;
  onStop: (agentId: string) => Promise<void>;
  onReassign: (taskId: string, agentId: string) => Promise<void>;
}

interface EnhancedAgent extends Agent {
  status: 'active' | 'idle' | 'working' | 'stale';
  currentTask?: Task;
  capabilities: string[];
  healthScore: number; // 0-100
  lastHeartbeat: string;
  tasksCompleted: number;
  tasksInProgress: number;
}
```

**Features**:

- Real-time status indicators (🟢 active, 🟡 working, 🔴 stale)
- Current task display (if assigned)
- Capabilities badges (e.g., "TypeScript", "Security", "UI")
- Health score visualization (progress bar or dot color)
- Quick actions dropdown:
  - View details
  - Stop agent
  - Reassign tasks
  - Send message
- Spawn button with persona selector
- Agent grouping (by type, status, worktree)
- Search/filter agents

**Spawn Dialog**:

```
┌─────────────────────────────────────┐
│  Spawn New Agent                     │
├─────────────────────────────────────┤
│  Persona: [Architect ▼]             │
│  ├─ Architect (design & planning)   │
│  ├─ Worker (implementation)         │
│  ├─ Security (review & audit)       │
│  ├─ Test Writer (testing)           │
│  └─ Critic (code review)            │
│                                      │
│  Task (optional): [Implement...]    │
│  Worktree: [feature/auth ▼]         │
│                                      │
│  [Cancel]            [Spawn Agent]  │
└─────────────────────────────────────┘
```

### 3. Task Board (Enhanced)

**Component**: `<TaskBoard />`

```typescript
interface TaskBoardProps {
  tasks: Task[];
  agents: Agent[];
  onDragDrop: (taskId: string, newStatus: Task['status'], newAgent?: string) => Promise<void>;
  onTaskClick: (taskId: string) => void;
}

interface TaskCard {
  task: Task;
  agent?: Agent;
  dependencies?: Task[];
  subtasks?: Task[];
  approvalRequired?: boolean;
}
```

**Layout**: Kanban columns

```
│ Pending (5)      │ In Progress (3)   │ Completed (12)   │
├──────────────────┼───────────────────┼──────────────────┤
│ ┌──────────────┐│ ┌───────────────┐│ ┌──────────────┐ │
│ │🔴 HIGH        ││ │🟡 NORMAL      ││ │✅            │ │
│ │Fix login bug  ││ │Deploy to prod ││ │Setup CI/CD   │ │
│ │               ││ │Worker-1       ││ │              │ │
│ │[Unassigned]   ││ │⚠️  Needs aprv  ││ │2h ago        │ │
│ └──────────────┘│ └───────────────┘│ └──────────────┘ │
│                 │                  │                  │
│ ┌──────────────┐│ ┌───────────────┐│                  │
│ │🟡 NORMAL      ││ │🟢 LOW         ││                  │
│ │Add dark mode  ││ │Update docs    ││                  │
│ │               ││ │Worker-2       ││                  │
│ │[Unassigned]   ││ │50% done       ││                  │
│ └──────────────┘│ └───────────────┘│                  │
```

**Features**:

- Drag-drop between columns (changes status)
- Drag-drop to agent (assigns task)
- Priority color coding
- Approval indicator (⚠️ icon)
- Progress bar for in-progress tasks
- Dependency visualization (lines connecting tasks)
- Subtask count badge
- Filter by: priority, agent, tags
- Sort by: priority, created date, updated date
- Quick actions: Edit, Delete, Duplicate, Add dependency
- Expand/collapse for task details

### 4. Event Feed (Enhanced)

**Component**: `<EventFeed />`

```typescript
interface EventFeedProps {
  messages: Message[];
  onFilter: (filters: EventFilter) => void;
  onExpand: (messageId: string) => void;
}

interface EventFilter {
  types?: Message['type'][];
  agents?: string[];
  priority?: 'low' | 'normal' | 'high';
  since?: Date;
}
```

**Features**:

- Collapsible sidebar (default: collapsed)
- Real-time updates with animations
- Type filtering (checkboxes for each type)
- Agent filtering
- Time range filter (last hour, today, this week)
- Click to expand full message
- Notification badges for unread
- Auto-collapse after inactivity
- Export to JSON/CSV

**Collapsed View**:

```
│ Activity (5 new)        │
│ ▼ Last 5 minutes        │
│ ─────────────────────── │
│ 🔍 Discovery            │
│ ✅ Task completed        │
│ ❌ Error occurred        │
│ 🔄 Coordination          │
│ 💓 Heartbeat (3)         │
```

**Expanded View**:

```
│ Activity Feed           [X] │
├─────────────────────────────┤
│ Filters: [All ▼] [Today ▼]  │
│ ☑ Discovery ☑ Completion    │
│ ☑ Error     ☐ Heartbeat     │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ 🔍 Worker-1              │ │
│ │ Discovered API pattern   │ │
│ │ for auth                 │ │
│ │ 📎 auth.ts +45 lines     │ │
│ │ [View Details]  2m ago   │ │
│ └─────────────────────────┘ │
│                              │
│ ┌─────────────────────────┐ │
│ │ ✅ Worker-2              │ │
│ │ Completed task #42       │ │
│ │ [View Task]    5m ago    │ │
│ └─────────────────────────┘ │
```

### 5. Command Palette (New)

**Component**: `<CommandPalette />`

**Trigger**: `Cmd+K` or `Ctrl+K`

```typescript
interface Command {
  id: string;
  label: string;
  description?: string;
  category: 'task' | 'agent' | 'approval' | 'context' | 'system';
  icon: string;
  action: () => void | Promise<void>;
  keywords?: string[];
  shortcut?: string;
}
```

**Example Commands**:

```
┌─────────────────────────────────────────────┐
│ Search commands...                          │
├─────────────────────────────────────────────┤
│ 📋 Create Task                    Cmd+N     │
│ 🤖 Spawn Agent                               │
│ ✓  Approve All Pending                       │
│ 🚀 Start All Workers                         │
│ ⏸  Pause All Workers                         │
│ 📊 Show Dashboard                 Cmd+1     │
│ 🔍 Search Context                 Cmd+Shift+F│
│ ⚙️  Open Settings                  Cmd+,     │
│ 🗑️  Clear Chat History                       │
└─────────────────────────────────────────────┘
```

**Features**:

- Fuzzy search by label, description, keywords
- Category filtering
- Recent commands history
- Keyboard navigation (↑/↓, Enter to execute)
- Command preview with description
- Shortcuts display
- Custom commands (user-defined)

### 6. Context Engine Browser (Enhanced)

**Component**: `<ContextBrowser />`

```typescript
interface ContextEntry {
  id: string;
  memoryType: 'episodic' | 'semantic' | 'procedural' | 'decision_trace';
  key: string;
  value: any;
  embedding?: number[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    confidence: number;
    accessCount: number;
    lastAccessed: string;
    expiresAt?: string;
    tags: string[];
    relatedKeys: string[];
  };
}

interface ContextBrowserProps {
  entries: ContextEntry[];
  onSearch: (query: string) => Promise<ContextEntry[]>;
  onAdd: (entry: Omit<ContextEntry, 'id' | 'metadata'>) => Promise<void>;
  onEdit: (id: string, entry: Partial<ContextEntry>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onExport: (format: 'json' | 'csv') => Promise<void>;
  onImport: (file: File) => Promise<void>;
}
```

**Layout**:

```
┌─────────────────────────────────────────────────────┐
│ Context Engine                                       │
├──────────────┬──────────────────────────────────────┤
│ Memory Types │ Search: [semantic auth patterns...]  │
│              │                                       │
│ ☑ Episodic   │ ┌───────────────────────────────────┐│
│ ☑ Semantic   │ │ 📚 API Auth Pattern                ││
│ ☐ Procedural │ │ Semantic • High confidence         ││
│ ☐ Decisions  │ │ Last accessed: 2h ago              ││
│              │ │                                    ││
│ Tags         │ │ Use JWT bearer tokens in headers   ││
│ ☑ auth       │ │ with refresh token rotation...     ││
│ ☑ api        │ │                                    ││
│ ☐ testing    │ │ [Edit] [Delete] [Related: 3]       ││
│              │ └───────────────────────────────────┘│
│ [+ Add]      │                                       │
│ [📤 Export]   │ ┌───────────────────────────────────┐│
│ [📥 Import]   │ │ 📝 Login Flow Error (Fixed)        ││
│              │ │ Episodic • Medium confidence       ││
│              │ │ Last accessed: 1d ago              ││
│              │ │                                    ││
│              │ │ Missing error handling in...       ││
│              │ │                                    ││
│              │ │ [Edit] [Delete] [Related: 1]       ││
│              │ └───────────────────────────────────┘│
└──────────────┴──────────────────────────────────────┘
```

**Features**:

- Semantic search with embeddings
- Filter by memory type, tags, confidence
- Sort by: relevance, recency, access count
- Edit inline or in dialog
- Add new entries with auto-tagging
- View related entries (knowledge graph visualization)
- Export/import (JSON, CSV)
- Bulk operations (delete, tag, export)
- Confidence score visualization

### 7. HITL Approval Workflow (New)

**Component**: `<ApprovalPrompt />`

```typescript
interface ApprovalPromptProps {
  request: ApprovalRequest;
  onApprove: (reason?: string) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onDetails: () => void;
}
```

**Inline in Chat**:

```
┌────────────────────────────────────────────────┐
│ ⚠️  APPROVAL REQUIRED                           │
├────────────────────────────────────────────────┤
│ 👤 Worker-1 (rapid-w1)                         │
│ Wants to deploy to production                  │
│                                                 │
│ Risk: 🔴 High                                   │
│ Impact: 15 files modified, 230 lines changed   │
│                                                 │
│ Context:                                        │
│ • API authentication refactor                   │
│ • Breaking changes to /auth endpoints          │
│ • Database migrations required                  │
│                                                 │
│ Rationale:                                      │
│ "All tests passing, security review approved,  │
│  ready for production deployment."              │
│                                                 │
│ ┌────────────┬────────────┬──────────────────┐│
│ │ ✓ Approve  │ ✗ Reject  │ 👁 Show Details  ││
│ └────────────┴────────────┴──────────────────┘│
│                                      Just now   │
└────────────────────────────────────────────────┘
```

**Detailed View** (Modal):

```
┌─────────────────────────────────────────────────┐
│ Approval Request Details                 [X]    │
├─────────────────────────────────────────────────┤
│ From: Worker-1 (rapid-w1)                       │
│ Task: Deploy authentication refactor (#42)      │
│ Risk: 🔴 High                                    │
│ Requested: Just now                             │
│                                                  │
│ Files Changed (15):                              │
│ ├─ src/auth/login.ts (+45, -12)                 │
│ ├─ src/auth/jwt.ts (+89, -56)                   │
│ ├─ src/middleware/auth.ts (+12, -8)             │
│ └─ ... (12 more)                                 │
│                                                  │
│ Tests: ✅ All passing (127/127)                  │
│ Coverage: 89.2% (+2.3%)                          │
│ Security Scan: ✅ No issues                      │
│                                                  │
│ Impact Analysis:                                 │
│ • Breaking change to /auth/login endpoint       │
│ • Database migration required (v1.2.0 → v1.3.0) │
│ • Clients must update to new auth flow          │
│                                                  │
│ Similar Past Approvals:                          │
│ • API refactor (approved, 2w ago)               │
│ • Auth middleware update (approved, 1m ago)     │
│                                                  │
│ Your decision:                                   │
│ ( ) Approve with comment                         │
│ ( ) Reject with reason                           │
│ ( ) Request changes                              │
│                                                  │
│ Comment (optional):                              │
│ ┌─────────────────────────────────────────────┐│
│ │                                             ││
│ └─────────────────────────────────────────────┘│
│                                                  │
│ [Cancel]              [Submit Decision]         │
└─────────────────────────────────────────────────┘
```

**Features**:

- Risk assessment (AI-generated)
- Impact analysis (files, lines, breaking changes)
- Context from related approvals
- One-click approve/reject
- Optional reason/comment
- Approval history
- Batch approval (approve all similar requests)
- Configurable approval rules (auto-approve low-risk)

## Technical Implementation

### Frontend Architecture

#### State Management Extensions

```typescript
// stores/chat.ts (new)
interface ChatState {
  messages: ChatMessage[];
  input: string;
  isStreaming: boolean;
  streamingMessage: string;
  activeThread: string | null;

  sendMessage: (content: string) => Promise<void>;
  streamMessageChunk: (chunk: string) => void;
  finishStreaming: () => void;
  setActiveThread: (messageId: string | null) => void;
}

// stores/approvals.ts (new)
interface ApprovalState {
  pending: ApprovalRequest[];
  history: ApprovalRequest[];

  requestApproval: (request: Omit<ApprovalRequest, 'id' | 'status'>) => Promise<string>;
  approve: (id: string, reason?: string) => Promise<void>;
  reject: (id: string, reason: string) => Promise<void>;
  batchApprove: (ids: string[], reason?: string) => Promise<void>;
}

// stores/context.ts (new)
interface ContextState {
  entries: ContextEntry[];
  searchResults: ContextEntry[];
  filters: {
    memoryTypes: ContextEntry['memoryType'][];
    tags: string[];
    minConfidence: number;
  };

  search: (query: string) => Promise<ContextEntry[]>;
  addEntry: (entry: Omit<ContextEntry, 'id' | 'metadata'>) => Promise<void>;
  updateEntry: (id: string, entry: Partial<ContextEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  exportContext: (format: 'json' | 'csv') => Promise<void>;
  importContext: (file: File) => Promise<void>;
}
```

#### WebSocket Integration

```typescript
// hooks/useWebSocket.ts (new)
import { useEffect, useRef } from 'react';
import { useAppStore, useChatStore, useApprovalStore } from '../stores';

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const { addMessage } = useAppStore();
  const { streamMessageChunk, finishStreaming } = useChatStore();
  const { requestApproval } = useApprovalStore();

  useEffect(() => {
    // Connect to Go backend WebSocket
    ws.current = new WebSocket('ws://localhost:9000/ws');

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'message':
          addMessage(data.payload);
          break;
        case 'stream_chunk':
          streamMessageChunk(data.payload.chunk);
          break;
        case 'stream_end':
          finishStreaming();
          break;
        case 'approval_request':
          requestApproval(data.payload);
          break;
        case 'agent_update':
          // Update agent status
          break;
        case 'task_update':
          // Update task
          break;
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.current?.close();
    };
  }, []);

  const sendMessage = (message: any) => {
    ws.current?.send(JSON.stringify(message));
  };

  return { sendMessage };
}
```

### Go Backend (Wails Bindings)

#### New Bindings Needed

```go
// app/desktop.go

// Chat operations
func (a *App) SendChatMessage(content string) (Response, error)
func (a *App) GetChatHistory(limit int) ([]ChatMessage, error)
func (a *App) StreamChatResponse(content string) (<-chan string, error)

// Approval operations
func (a *App) GetPendingApprovals() ([]ApprovalRequest, error)
func (a *App) ApproveRequest(id string, reason string) error
func (a *App) RejectRequest(id string, reason string) error
func (a *App) BatchApprove(ids []string, reason string) error

// Context operations
func (a *App) SearchContext(query string, filters ContextFilter) ([]ContextEntry, error)
func (a *App) AddContextEntry(entry ContextEntry) error
func (a *App) UpdateContextEntry(id string, entry ContextEntry) error
func (a *App) DeleteContextEntry(id string) error
func (a *App) ExportContext(format string) (string, error) // Returns file path
func (a *App) ImportContext(filePath string) error

// Agent operations (enhanced)
func (a *App) SpawnAgent(personaType string, task string, worktree string) (Agent, error)
func (a *App) StopAgent(agentId string) error
func (a *App) ReassignTask(taskId string, agentId string) error
func (a *App) GetAgentCapabilities(agentId string) ([]string, error)

// Task operations (enhanced)
func (a *App) UpdateTaskStatus(taskId string, status string) error
func (a *App) DragDropTask(taskId string, newStatus string, newAgentId string) error

// Real-time subscriptions
func (a *App) SubscribeToEvents() (<-chan Event, error)
func (a *App) UnsubscribeFromEvents() error
```

#### WebSocket Server

```go
// internal/websocket/hub.go (new)
package websocket

type Hub struct {
  clients    map[*Client]bool
  broadcast  chan []byte
  register   chan *Client
  unregister chan *Client
  eventBus   *eventbus.EventBus
}

func (h *Hub) Run() {
  for {
    select {
    case client := <-h.register:
      h.clients[client] = true

    case client := <-h.unregister:
      if _, ok := h.clients[client]; ok {
        delete(h.clients, client)
        close(client.send)
      }

    case message := <-h.broadcast:
      for client := range h.clients {
        select {
        case client.send <- message:
        default:
          close(client.send)
          delete(h.clients, client)
        }
      }

    case event := <-h.eventBus.Subscribe():
      // Forward event bus messages to WebSocket clients
      message, _ := json.Marshal(event)
      h.broadcast <- message
    }
  }
}
```

#### Bridge to Redis Event Bus

```go
// internal/bridge/eventbus.go (new)
package bridge

func (b *Bridge) Start() error {
  // Subscribe to Redis event bus
  messages, err := b.eventBus.Subscribe(context.Background())
  if err != nil {
    return err
  }

  go func() {
    for msg := range messages {
      // Convert to WebSocket format
      wsMsg := convertToWebSocketMessage(msg)

      // Broadcast to all WebSocket clients
      b.wsHub.Broadcast(wsMsg)

      // Update local state (for Wails bindings)
      b.updateLocalState(msg)
    }
  }()

  return nil
}
```

### UI Components (React)

#### ChatInterface Component

```tsx
// components/ChatInterface.tsx
import { useEffect, useRef, useState } from 'react';
import { useChatStore, useApprovalStore } from '../stores';
import { MessageBubble } from './MessageBubble';
import { ApprovalPrompt } from './ApprovalPrompt';
import { ChatInput } from './ChatInput';

export function ChatInterface() {
  const messages = useChatStore((s) => s.messages);
  const approvals = useApprovalStore((s) => s.pending);
  const streamingMessage = useChatStore((s) => s.streamingMessage);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Approval requests */}
        {approvals.map((approval) => (
          <ApprovalPrompt key={approval.id} request={approval} />
        ))}

        {/* Streaming message */}
        {isStreaming && (
          <MessageBubble
            message={{
              id: 'streaming',
              type: 'agent',
              content: streamingMessage,
              timestamp: new Date().toISOString(),
            }}
            isStreaming
          />
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <ChatInput />
    </div>
  );
}
```

#### ApprovalPrompt Component

```tsx
// components/ApprovalPrompt.tsx
import { useState } from 'react';
import { useApprovalStore } from '../stores';
import type { ApprovalRequest } from '../stores/approvals';

interface ApprovalPromptProps {
  request: ApprovalRequest;
}

export function ApprovalPrompt({ request }: ApprovalPromptProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { approve, reject } = useApprovalStore();
  const [reason, setReason] = useState('');

  const getRiskColor = (risk: ApprovalRequest['risk']) => {
    switch (risk) {
      case 'high':
        return 'text-red-400 bg-red-400/10';
      case 'medium':
        return 'text-yellow-400 bg-yellow-400/10';
      case 'low':
        return 'text-green-400 bg-green-400/10';
    }
  };

  return (
    <div className="card p-4 border-l-4 border-yellow-400">
      <div className="flex items-start gap-3">
        <div className="text-2xl">⚠️</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold">APPROVAL REQUIRED</h3>
            <span className={clsx('badge text-xs', getRiskColor(request.risk))}>
              {request.risk} risk
            </span>
          </div>

          <div className="text-sm text-rapid-muted mb-3">
            <strong>{request.fromAgent.name}</strong> wants to {request.action}
          </div>

          <div className="text-sm mb-3">{request.reason}</div>

          {request.context.impact && (
            <div className="text-sm text-rapid-muted mb-3">Impact: {request.context.impact}</div>
          )}

          <div className="flex gap-2">
            <button onClick={() => approve(request.id)} className="btn btn-sm btn-success">
              ✓ Approve
            </button>
            <button
              onClick={() => {
                const reason = prompt('Reason for rejection:');
                if (reason) reject(request.id, reason);
              }}
              className="btn btn-sm btn-error"
            >
              ✗ Reject
            </button>
            <button onClick={() => setShowDetails(!showDetails)} className="btn btn-sm btn-ghost">
              👁 Details
            </button>
          </div>

          {showDetails && (
            <div className="mt-4 p-3 bg-rapid-elevated rounded-lg">
              <h4 className="font-medium mb-2">Details</h4>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(request.context, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goals**: Basic chat interface with WebSocket

**Tasks**:

1. Create chat state management (Zustand store)
2. Build ChatInterface component
3. Implement WebSocket hook
4. Add Go WebSocket server
5. Bridge to Redis event bus
6. Add basic Wails bindings for chat

**Deliverable**: Working chat that receives messages from agents via event bus

### Phase 2: Agent & Task Integration (Week 2)

**Goals**: Enhanced agent panel and task board

**Tasks**:

1. Enhance agent panel with health indicators
2. Add spawn/stop/reassign actions
3. Build Kanban task board with drag-drop
4. Add task status updates via chat
5. Implement command palette (Cmd+K)

**Deliverable**: Full agent management and task orchestration via chat + boards

### Phase 3: HITL Approvals (Week 3)

**Goals**: Human-in-the-loop approval workflow

**Tasks**:

1. Create approval state management
2. Build ApprovalPrompt component
3. Add approval modal for details
4. Implement batch approval
5. Add Go approval bindings
6. Add approval history tracking

**Deliverable**: Complete approval workflow with risk assessment

### Phase 4: Context Engine (Week 4)

**Goals**: Context browser and search

**Tasks**:

1. Create context state management
2. Build ContextBrowser component
3. Implement semantic search
4. Add add/edit/delete functionality
5. Add export/import features
6. Integrate context references in chat

**Deliverable**: Full context engine browser with search

### Phase 5: Polish & Optimization (Week 5)

**Goals**: Performance, UX improvements, testing

**Tasks**:

1. Add keyboard shortcuts
2. Implement message threading
3. Add code syntax highlighting
4. Optimize WebSocket reconnection
5. Add error boundaries
6. Write E2E tests
7. Performance profiling

**Deliverable**: Production-ready unified chat UI

## Success Metrics

1. **Usability**: Users can complete common tasks (spawn agent, assign task, approve) in <30 seconds
2. **Performance**: Chat messages appear in <100ms, streaming chunks in <50ms
3. **Reliability**: WebSocket maintains connection, auto-reconnects on failure
4. **Adoption**: Users prefer chat interface over clicking through pages (measured by usage analytics)
5. **Efficiency**: Time to complete multi-agent tasks reduces by 40%

## Open Questions & Decisions Needed

1. **Streaming Strategy**: Use Server-Sent Events (SSE) or WebSocket for chat streaming?
   - **Recommendation**: WebSocket (bidirectional, already needed for real-time updates)

2. **Approval Auto-Rules**: Should we auto-approve low-risk actions?
   - **Recommendation**: Yes, with user-configurable thresholds

3. **Context Search**: Use local embeddings or call external API?
   - **Recommendation**: Local embeddings (OpenAI text-embedding-3-small) for privacy

4. **Offline Mode**: How to handle offline scenario?
   - **Recommendation**: Queue messages locally, sync when connection restored

5. **Multi-User**: Should multiple users be able to connect to same desktop app?
   - **Recommendation**: Phase 2 feature, single-user for MVP

## Conclusion

This design transforms RAPID Wails Desktop into a unified, chat-centric interface that makes multi-agent orchestration feel natural and intuitive. By building on the existing solid foundation and adding a conversational layer, we create an experience where users can interact with their AI team as easily as chatting with colleagues.

The phased approach allows for incremental delivery of value while maintaining quality and allows for user feedback to shape later phases.

**Next Steps**:

1. Get stakeholder feedback on this design
2. Create detailed wireframes/mockups for key screens
3. Begin Phase 1 implementation
4. Set up user testing program for early feedback

---

**Design Review Status**: ⏳ Pending Review
**Estimated Implementation**: 5 weeks
**Risk Level**: 🟡 Medium (WebSocket complexity, state management coordination)
