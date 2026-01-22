# @a3t/rapid-mcp

MCP Server for RAPID - Exposes sandbox execution, file operations, and event bus capabilities via the Model Context Protocol.

## Overview

This package provides a Model Context Protocol (MCP) server that enables AI agents to safely execute commands, manage files, access secrets, and communicate with other agents through the RAPID event bus.

## Features

- 🔒 **Secure Command Execution** - Sandboxed execution with configurable isolation levels
- 📁 **File Operations** - Read, write, list files with path restrictions
- 🔐 **Secret Management** - Access credentials from 1Password, Vault, or environment
- 🌐 **Event Bus Integration** - Real-time inter-agent communication
- 👤 **Persona Management** - Define and spawn specialized agent personalities
- 📋 **Task Management** - Create, track, and coordinate tasks across agents
- 🛡️ **Network Policy** - Whitelist-based domain access with proxy enforcement

## Installation

```bash
npm install @a3t/rapid-mcp
```

## Quick Start

### Start via CLI

```bash
# HTTP transport (recommended for integration with Claude Code)
rapid mcp serve --http --port 3100

# Stdio transport (for direct process communication)
rapid mcp serve
```

### Programmatic Usage

```typescript
import { createMcpServer } from '@a3t/rapid-mcp';

const server = createMcpServer({
  projectId: 'my-project',
  verbose: false,
});

// Run with stdio transport
import { runStdio } from '@a3t/rapid-mcp';
await runStdio(server);
```

## Tools

### Secure Execution

- **`secure_exec`** - Execute commands in sandboxed environment
  - Parameters: `command`, `args`, `cwd`, `timeout`, `sandbox` (strict/balanced/permissive)
  - Returns: exit code, stdout, stderr, execution time

### File Operations

- **`read_file`** - Read file contents (UTF-8 or base64)
- **`write_file`** - Write files with directory creation
- **`list_files`** - List directory contents with file metadata

### Network Access

- **`fetch_via_proxy`** - Make HTTP requests through domain whitelist
  - Enforces RAPID network policy
  - Supports GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS

### Secrets

- **`get_secret`** - Retrieve credentials from configured providers
  - Supports env vars, 1Password, HashiCorp Vault
  - Returns masked values for logging safety

### Event Bus

- **`bus_register`** - Register agent on the event bus
- **`bus_send`** - Send messages (coordination, discovery, completion, error, learning, question)
- **`bus_messages`** - Retrieve recent messages
- **`bus_poll`** - Poll for new messages since last check
- **`bus_agents`** - List active agents
- **`bus_status`** - Get event bus health

### Persona Management

- **`persona_list`** - List available personas from `.rapid/personas/`
- **`persona_get`** - Get persona configuration
- **`persona_spawn`** - Spawn a new agent with persona config
- **`persona_spawn_command`** - Generate spawn command
- **`persona_agents`** - List spawned agents with status
- **`persona_stop`** - Stop a running agent

### Task Management

- **`task_create`** - Create a task with optional assignment
- **`task_list`** - List tasks with filtering
- **`task_get`** - Get task details with subtasks
- **`task_update`** - Update task status, priority, assignment
- **`task_claim`** - Claim task for yourself
- **`task_complete`** - Mark task as complete

## Security

### Sandbox Modes

- **strict** - Maximum isolation (requires bubblewrap on Linux)
- **balanced** - Default isolation level
- **permissive** - Minimal restrictions for trusted operations

### Network Policy

Whitelist-based domain filtering:

- GitHub (api.github.com, _.github.com, _.githubusercontent.com)
- NPM (npmjs.org, npmjs.com, registry.npmjs.org)
- Python (pypi.org)
- Go (golang.org)
- Rust (crates.io)
- Docker (docker.io, docker.com)

### File Access

Operations restricted to project directory with symbolic link resolution.

## Configuration

Set via environment or rapid.json:

```json
{
  "mcp": {
    "servers": {
      "rapid": {
        "enabled": true,
        "type": "remote",
        "url": "http://localhost:3100/mcp"
      }
    }
  }
}
```

## Logging

The RAPID MCP server includes a centralized logging utility with support for multiple log levels and component-based namespacing.

### Environment Variables

- **`RAPID_LOGGING_DISABLED=true`** - Disable all logging output
- **`RAPID_LOG_LEVEL=debug|info|warn|error`** - Set minimum log level (default: `info`)
  - `debug` - Most verbose, includes all debug messages
  - `info` - Normal operation messages
  - `warn` - Warning messages only
  - `error` - Errors only
- **`NODE_ENV=production`** with **`RAPID_LOGGING=false`** - Disable logging in production

### Usage

```typescript
import { createLogger } from '@a3t/rapid-mcp/utils/logger';

// Create a logger for your component
const logger = createLogger('my-component');

// Log messages at different levels
logger.debug('Debug information', { details: 'data' });
logger.info('Operation started');
logger.warn('Unexpected condition');
logger.error('Operation failed', error);
```

### Programmatic Configuration

```typescript
import { configureLogger } from '@a3t/rapid-mcp/utils/logger';

// Show debug messages
configureLogger({ level: 'debug' });

// Disable all logging
configureLogger({ enabled: false });
```

### Log Format

All logs are output to stderr with timestamps and component names:

```
2026-01-21T11:23:00.000Z [component-name] LEVEL: Message content
```

## Transport Modes

### HTTP (Recommended)

Best for Claude Code integration:

```bash
rapid mcp serve --http --port 3100
```

### Stdio

For direct process connection:

```bash
rapid mcp serve
```

## See Also

- [@a3t/rapid](https://www.npmjs.com/package/@a3t/rapid) - Main CLI
- [@a3t/rapid-eventbus](https://www.npmjs.com/package/@a3t/rapid-eventbus) - Event bus library
- [Model Context Protocol](https://modelcontextprotocol.io)
- [RAPID Documentation](https://getrapid.dev)

## License

MIT © 2026 Rude Company LLC
