# RAPID Desktop

A cross-platform desktop application for the RAPID multi-agent development orchestration system.

## Overview

RAPID Desktop provides a visual dashboard for monitoring and managing AI agents, tasks, and the event bus. Built with [Wails v3](https://wails.io/) (Go + React).

## Features

- **Dashboard Overview**: Real-time view of active agents, tasks, and system metrics
- **Agent Management**: Spawn, monitor, and stop AI agents with persona selection
- **Task Board**: Kanban-style task management with priority and status tracking
- **Event Bus Viewer**: Real-time message feed with filtering and search
- **Configuration Editor**: Visual editor for rapid.json settings

## Prerequisites

- Go 1.21+
- Node.js 18+
- Wails v3 CLI: `go install -v github.com/wailsapp/wails/v3/cmd/wails3@latest`

## Development

### Setup

```bash
# Install frontend dependencies
cd frontend && pnpm install && cd ..
```

### Run in Development Mode

```bash
wails3 dev -config ./build/config.yml
```

This starts the app with hot-reload enabled for both Go and frontend changes.

### Build

```bash
# Build for current platform
go build -o bin/rapid-desktop .

# Build with Taskfile (recommended for multi-platform builds)
task build        # Current platform
task build:darwin # macOS
task build:linux  # Linux
task build:windows # Windows
```

Built binaries are output to `bin/`.

## Architecture

```
rapid-desktop/
├── main.go           # Wails v3 entry point
├── app.go            # Go backend - daemon RPC integration (AppService)
├── build/
│   ├── config.yml    # Wails v3 configuration
│   └── [platform]/   # Platform-specific build configs
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

The Go backend (`app.go`, `AppService` struct) communicates with the RAPID daemon via Unix socket at `~/.rapid/rapid.sock`. It exposes these methods to the frontend via Wails v3 RPC:

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

| Shortcut       | Action       |
| -------------- | ------------ |
| `Cmd/Ctrl + N` | New task     |
| `Cmd/Ctrl + K` | Quick search |
| `1-5`          | Switch views |
| `Esc`          | Close modals |

## License

MIT
