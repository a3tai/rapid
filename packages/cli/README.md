# @a3t/rapid

CLI for RAPID - AI-assisted development with dev containers.

This package provides the command-line interface for orchestrating AI coding assistants within containerized development environments.

## Features

- 🚀 **Simple Commands** - Intuitive CLI for starting and managing dev sessions
- 🤖 **Multi-Agent Support** - Run Claude Code, OpenCode, Aider, and more
- 🐳 **Container Orchestration** - Automatic Docker container management
- 🔐 **Credential Management** - 1Password/Vault integration out of the box
- 🎯 **Configuration-Driven** - Single `rapid.json` for all settings
- 📊 **Status Monitoring** - Check environment and agent availability

## Installation

```bash
npm install -g @a3t/rapid
# or
npm install @a3t/rapid
```

## Quick Start

```bash
# Initialize a project
rapid init

# Start the container
rapid start

# Launch an AI coding session
rapid dev

# Check environment status
rapid status
```

## Commands

### rapid init

Initialize RAPID in a new project.

```bash
rapid init [--template <template>]
```

**Options:**

- `--template` - Project template (typescript, python, node, rust, go, universal)

### rapid start

Start the development container.

```bash
rapid start [--rebuild] [--no-cache]
```

**Options:**

- `--rebuild` - Force rebuild the container image
- `--no-cache` - Build without Docker cache

### rapid dev

Launch an AI coding session in the container.

```bash
rapid dev [options]
```

**Options:**

- `--agent <name>` - Use specific agent (overrides default)
- `--multi [agents]` - Launch multiple agents (comma-separated, e.g., `claude,aider`)
- `--list` - List available agents without launching
- `--local` - Run locally instead of in container (not recommended)
- `--no-start` - Do not auto-start container if stopped

**Examples:**

```bash
# Use default agent
rapid dev

# Use specific agent
rapid dev --agent aider

# Run multiple agents in tmux panes (requires tmux)
rapid dev --multi claude,aider

# Show multi-agent instructions
rapid dev --multi

# List available agents
rapid dev --list
```

### rapid stop

Stop the development container and clean up.

```bash
rapid stop [--remove] [--services-only] [--prune-worktrees]
```

**Options:**

- `--remove` - Remove containers and volumes after stopping
- `--services-only` - Only stop services, not the dev container
- `--prune-worktrees` - Automatically clean up merged agent worktrees

### rapid status

Show environment status.

```bash
rapid status [--json]
```

**Options:**

- `--json` - Output as JSON

### rapid auth

Show authentication status from external tools.

```bash
rapid auth [--json] [--source <source>] [--provider <provider>]
```

**Options:**

- `--json` - Output as JSON
- `--source` - Filter by source (claude-code, codex, gemini-cli, aider, env)
- `--provider` - Filter by provider (anthropic, openai, google)

**Subcommands:**

```bash
# Show environment variables for detected credentials
rapid auth env [--export] [--json]
```

### rapid agent

Manage AI agents.

```bash
rapid agent list
rapid agent info <name>
```

### rapid worktree

Manage git worktrees for isolated agent environments.

```bash
rapid worktree list [--json]
rapid worktree spawn <persona> <branch> [--no-checkout]
rapid worktree remove <branch> [--force]
```

**Subcommands:**

- `list` - List active worktrees
- `spawn` - Create a new worktree for an agent persona
- `remove` - Remove a worktree

**Options:**

- `--json` - Output in JSON format
- `--no-checkout` - Create branch but don't checkout
- `--force` - Force removal without safety checks

### rapid mcp serve

Start the RAPID MCP server for secure execution and inter-agent communication.

```bash
rapid mcp serve [--http] [--port <port>] [--project <dir>] [--verbose]
```

**Options:**

- `--http` - Use HTTP transport instead of stdio (recommended)
- `--port <port>` - HTTP port (default: 3100)
- `--project <dir>` - Project directory for MCP context
- `--verbose` - Enable verbose logging

**Features:**

- Secure sandboxed command execution
- File operations with access controls
- Secrets management
- Event bus integration
- Task management
- Persona spawning

### rapid approve

Handle human-in-the-loop (HITL) approval requests from agents.

```bash
rapid approve list
rapid approve <request-id> approve [--reason <reason>]
rapid approve <request-id> reject --reason <reason>
rapid approve <request-id> defer --reason <reason>
```

**Subcommands:**

- `list` - List pending approval requests
- `approve` - Approve a specific request
- `reject` - Reject a request with optional reason
- `defer` - Defer a decision with optional reason

**Options:**

- `-r, --reason <reason>` - Provide reason for the decision

### rapid bus

Interact with the event bus for agent coordination.

```bash
rapid bus register [--agent <name>] [--session <id>]
rapid bus send <type> <message> [--to <agent>] [--priority <level>]
rapid bus messages [--type <type>] [--limit <n>] [--json]
rapid bus agents [--json]
rapid bus status
```

**Subcommands:**

- `register` - Register current agent on the bus
- `send` - Broadcast message to all agents
- `messages` - Retrieve messages with optional filtering
- `agents` - List active agents
- `status` - Show event bus health

### rapid plugin

Manage Claude Code plugins and integrations.

```bash
rapid plugin list
rapid plugin install <plugin>
rapid plugin remove <plugin>
rapid plugin config <plugin> [options]
```

### rapid checkpoint / rapid rewind

Save and restore project state.

```bash
# Create a checkpoint
rapid checkpoint [--message <msg>]

# List checkpoints
rapid checkpoint list [--json]

# Restore to a checkpoint
rapid rewind <checkpoint-id>

# Show checkpoint details
rapid checkpoint show <checkpoint-id> [--diff]
```

### Global Options

All commands support:

- `--verbose` - Verbose output
- `-q, --quiet` - Minimal output
- `--config <path>` - Path to rapid.json

## Configuration File

Create a `rapid.json` in your project root:

```json
{
  "version": "1.0",
  "name": "my-project",
  "agents": {
    "default": "claude",
    "available": {
      "claude": {
        "cli": "claude",
        "instructionFile": "CLAUDE.md",
        "envVars": ["ANTHROPIC_API_KEY"]
      }
    }
  },
  "container": {
    "devcontainer": ".devcontainer/devcontainer.json",
    "autoStart": true
  },
  "secrets": {
    "provider": "env"
  },
  "mcp": {
    "configFile": ".mcp.json",
    "servers": {
      "filesystem": { "enabled": true }
    }
  }
}
```

See [rapid.json Specification](../../docs/reference/rapid.json-spec.md) for complete reference.

## Environment Variables

- `RAPID_CONFIG` - Path to rapid.json
- `RAPID_LOG_LEVEL` - Log verbosity (debug, info, warn, error)
- `RAPID_NO_COLOR` - Disable colored output

## Supported Agents

| Agent              | Installation                               | Best For                       |
| ------------------ | ------------------------------------------ | ------------------------------ |
| Claude Code        | `npm install -g @anthropic-ai/claude-code` | Complex reasoning, refactoring |
| OpenCode           | `npm install -g opencode`                  | Multi-model, cost optimization |
| Aider              | `pip install aider-chat`                   | Quick iterations, auto-commits |
| GitHub Copilot CLI | `gh extension install github/gh-copilot`   | Shell commands, git operations |

## See Also

- [@a3t/rapid-core](https://www.npmjs.com/package/@a3t/rapid-core) - Core library
- [@a3t/rapid-schema](https://www.npmjs.com/package/@a3t/rapid-schema) - JSON schema
- [RAPID Documentation](https://getrapid.dev)
- [GitHub Repository](https://github.com/a3tai/rapid)

## Troubleshooting

### devcontainer CLI not found

Install with:

```bash
npm install -g @devcontainers/cli
```

### Docker not running

Start Docker Desktop or your Docker daemon:

```bash
# macOS
open -a Docker

# Linux
sudo systemctl start docker
```

### Container won't start

Try rebuilding:

```bash
rapid start --rebuild
```

## License

MIT © 2026 Rude Company LLC
