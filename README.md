# RAPID

Multi-agent development orchestration system with Claude, OpenCode, Aider and more.

## Overview

RAPID is an orchestration layer for AI-assisted development. It manages the complexity of running AI coding tools inside containerized environments with integrated event communication, task management, and specialized agents.

**Key Features:**

- **Multi-agent orchestration** - Run Claude Code, OpenCode, Aider concurrently with inter-agent communication
- **Event bus** - Redis-based message bus for real-time agent coordination and discovery
- **MCP Server** - Model Context Protocol server providing secure execution, file operations, and secrets management
- **Persona system** - Define specialized agent personalities with custom capabilities and behaviors
- **Task management** - Track and coordinate work across multiple agents
- **Dev container integration** - Automatic lifecycle management for isolated development environments
- **Secret management** - 1Password and Vault integration for secure credential handling
- **Configuration-driven** - Single `rapid.json` for all settings and orchestration

## Installation

```bash
npm install -g @a3t/rapid
```

## Quick Start

```bash
# Initialize RAPID in your project
rapid init

# Start all RAPID services (event bus, MCP server, gateway, daemon)
rapid start

# Launch an AI coding session
rapid dev

# Check service status
rapid status

# Access the MCP server for advanced tasks
rapid mcp serve --http
```

## Documentation

- [Quickstart Guide](./docs/guides/quickstart.md)
- [CLI Reference](./docs/guides/cli-reference.md)
- [Configuration Reference](./docs/reference/rapid.json-spec.md)
- [RAPID Overview](./docs/concepts/rapid-overview.md)

## Core Services

### Event Bus
Enables real-time communication between agents:
- Agent registration and discovery
- Message types: coordination, discovery, completion, error, learning, question
- Automatic Redis integration when available

### MCP Server
Secure execution and file access with built-in tools:
- `secure_exec` - Sandboxed command execution
- `fetch_via_proxy` - Network requests with domain whitelist
- `get_secret` - Credential management
- File operations - Read, write, list with path restrictions
- Event bus integration - Inter-agent communication

### Task Management
Coordinate work across agents:
- Create and assign tasks
- Track task status (pending, in_progress, completed, blocked, cancelled)
- Priority levels (low, normal, high, urgent)
- Subtask hierarchies

### Persona System
Define specialized agents with custom behavior:
- YAML-based persona definitions in `.rapid/personas/`
- Custom system prompts and capabilities
- Agent spawning and lifecycle management

## Packages

| Package | Description |
|---------|-------------|
| [@a3t/rapid](./packages/cli) | CLI tool and main orchestrator |
| [@a3t/rapid-core](./packages/core) | Core orchestration library |
| [@a3t/rapid-mcp](./packages/rapid-mcp) | MCP server implementation |
| [@a3t/rapid-eventbus](./packages/rapid-eventbus) | Event bus and messaging |
| [@a3t/rapid-daemon](./packages/daemon) | Session manager and daemon |
| [@a3t/rapid-schema](./packages/schema) | JSON schema and types |
| [@a3t/rapid-runtime](./packages/runtime) | Agent runtime environment |

## Supported Agents

- **Claude Code** - Complex reasoning, refactoring, multi-file changes
- **OpenCode** - Multi-model support, cost optimization
- **Aider** - Quick iterations, automatic commits
- **GitHub Copilot CLI** - Shell commands, git operations

## The RAPID Methodology

RAPID embodies a methodology for effective AI-assisted development:

- **R**esearch - Gather context before engaging AI
- **A**ugment - Enhance with external knowledge
- **P**lan - Structure work before execution
- **I**ntegrate - Ensure environment is ready
- **D**evelop - Execute with AI assistance

## License

MIT
