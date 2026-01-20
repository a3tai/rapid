# @a3t/rapid-daemon

Background daemon for RAPID session management, config watching, and secrets caching.

## Overview

The daemon runs as a persistent background process, providing:

- **Session Management** - Create, start, stop, and track agent sessions
- **Config Watching** - Monitor `rapid.json` for changes and hot-reload
- **Secrets Caching** - Cache secrets from 1Password/Vault with configurable TTL
- **Multi-Provider Support** - Local, DevContainer, Lima execution environments

## Installation

```bash
pnpm add @a3t/rapid-daemon
```

## Quick Start

### As a Binary

```bash
# Start daemon
rapidd start

# With options
rapidd start --http-port 3200 --verbose
```

### Programmatic Usage

```typescript
import { DaemonServer, isDaemonRunning } from '@a3t/rapid-daemon';

// Check if already running
if (await isDaemonRunning()) {
  console.log('Daemon already running');
  process.exit(0);
}

// Start daemon
const daemon = new DaemonServer({
  httpPort: 3200,
  secretsTtl: 300000, // 5 minutes
  verbose: true,
});

await daemon.start();
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    DaemonServer                          │
├──────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐               │
│  │  Unix Socket    │  │   HTTP Server   │               │
│  │  (IPC)          │  │   (optional)    │               │
│  └────────┬────────┘  └────────┬────────┘               │
│           │    JSON-RPC 2.0    │                         │
│           └─────────┬──────────┘                         │
│                     ▼                                    │
│  ┌─────────────────────────────────────────────────────┐│
│  │              RPC Method Router                      ││
│  └─────────────────────────────────────────────────────┘│
│           │              │              │                │
│           ▼              ▼              ▼                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │   Session    │ │    Config    │ │   Secrets    │     │
│  │   Manager    │ │   Watcher    │ │    Cache     │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
│           │                                              │
│           ▼                                              │
│  ┌────────────────────────────────────────────┐         │
│  │              Environment Providers          │         │
│  │  ┌─────────┐ ┌───────────────┐ ┌─────────┐ │         │
│  │  │  Local  │ │  DevContainer │ │  Lima   │ │         │
│  │  └─────────┘ └───────────────┘ └─────────┘ │         │
│  └────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

## JSON-RPC Methods

### Session Management

| Method | Parameters | Description |
|--------|------------|-------------|
| `session.create` | `projectDir`, `agent`, `provider?`, `env?` | Create new session |
| `session.start` | `sessionId` | Start session |
| `session.stop` | `sessionId` | Stop session |
| `session.list` | - | List all sessions |
| `session.get` | `sessionId` | Get session details |

### Daemon Control

| Method | Parameters | Description |
|--------|------------|-------------|
| `daemon.status` | - | Get daemon status |
| `daemon.shutdown` | - | Graceful shutdown |

### Configuration

| Method | Parameters | Description |
|--------|------------|-------------|
| `config.get` | `projectDir` | Get project config |
| `config.reload` | `projectDir` | Force reload config |

### Secrets

| Method | Parameters | Description |
|--------|------------|-------------|
| `secrets.get` | `key`, `projectDir` | Get cached secret |
| `secrets.refresh` | `projectDir` | Refresh all secrets |

## Configuration

```typescript
interface DaemonConfig {
  socketPath?: string;    // Default: ~/.rapid/rapid.sock
  pidFile?: string;       // Default: ~/.rapid/rapid.pid
  cacheDir?: string;      // Default: ~/.rapid/cache
  httpPort?: number;      // Optional HTTP server port
  secretsTtl?: number;    // Secret cache TTL in ms (default: 300000)
  logFile?: string;       // Optional log file path
  verbose?: boolean;      // Enable verbose logging
}
```

## Environment Providers

### LocalProvider
Runs sessions in the current local environment. No isolation.

### DevcontainerProvider
Runs sessions inside VS Code DevContainers. Requires Docker.

### LimaProvider
Runs sessions in Lima VMs (macOS). Provides Linux environment on Mac.

## Files

| Path | Description |
|------|-------------|
| `~/.rapid/rapid.sock` | Unix socket for IPC |
| `~/.rapid/rapid.pid` | PID file |
| `~/.rapid/cache/` | Secrets and config cache |

## Integration with RAPID

The daemon is started automatically by `rapid start` and stopped by `rapid stop`. Direct interaction is typically not needed.

```bash
# CLI commands that interact with daemon
rapid start          # Starts daemon if not running
rapid stop           # Stops daemon
rapid status         # Queries daemon.status
```

## License

MIT
