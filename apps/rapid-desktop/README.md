# RAPID Desktop

A cross-platform desktop application for the RAPID multi-agent development orchestration system.

## Overview

RAPID Desktop provides a visual dashboard for monitoring and managing AI agents, tasks, and the event bus. Built with [Wails](https://wails.io/) (Go + React).

## Features

- **Dashboard Overview**: Real-time view of active agents, tasks, and system metrics
- **Agent Management**: Spawn, monitor, and stop AI agents with persona selection
- **Task Board**: Kanban-style task management with priority and status tracking
- **Event Bus Viewer**: Real-time message feed with filtering and search
- **Configuration Editor**: Visual editor for rapid.json settings

## Prerequisites

- Go 1.21+
- Node.js 18+
- Wails CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`

## Development

### Setup

```bash
# Install frontend dependencies
cd frontend && npm install && cd ..

# Generate Wails bindings
wails generate module
```

### Run in Development Mode

```bash
wails dev
```

This starts the app with hot-reload enabled for both Go and frontend changes.

### Build

```bash
# Build for current platform
wails build

# Build for specific platform
wails build -platform darwin/arm64  # macOS Apple Silicon
wails build -platform darwin/amd64  # macOS Intel
wails build -platform windows/amd64 # Windows
wails build -platform linux/amd64   # Linux
```

Built binaries are output to `build/bin/`.

## Architecture

```
rapid-desktop/
├── main.go           # Wails entry point
├── app.go            # Go backend - daemon RPC integration
├── wails.json        # Wails configuration
└── frontend/
    ├── src/
    │   ├── App.tsx           # Main application component
    │   ├── components/       # Shared UI components
    │   │   ├── Sidebar.tsx
    │   │   └── Header.tsx
    │   ├── pages/            # View components
    │   │   ├── Dashboard.tsx
    │   │   ├── Agents.tsx
    │   │   ├── Tasks.tsx
    │   │   ├── Events.tsx
    │   │   └── Config.tsx
    │   ├── stores/           # State management (Zustand)
    │   │   └── app.ts
    │   └── hooks/            # React hooks
    │       └── useWails.ts   # Wails backend integration
    └── wailsjs/              # Auto-generated Go bindings
```

## Backend Integration

The Go backend (`app.go`) communicates with the RAPID daemon via Unix socket at `~/.rapid/rapid.sock`. It exposes these methods to the frontend:

- `GetDaemonStatus()` - Check if daemon is running
- `GetAgents()` - List active agents
- `GetTasks(status)` - Get tasks by status
- `GetMessages(limit)` - Get event bus messages
- `CreateTask(...)` - Create a new task
- `SpawnAgent(persona, worktree)` - Start a new agent
- `StopAgent(id)` - Stop a running agent
- `GetConfig()` - Get rapid.json configuration

## Design

The UI follows a dark theme inspired by modern developer tools:

- **Color Palette**: Dark backgrounds (#0a0a0a, #121212) with blue accents
- **Typography**: Inter for UI, JetBrains Mono for code
- **Status Indicators**: Glowing dots for active states
- **Animations**: Subtle fade-in transitions

## Keyboard Shortcuts (Planned)

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + N` | New task |
| `Cmd/Ctrl + K` | Quick search |
| `1-5` | Switch views |
| `Esc` | Close modals |

## License

MIT
