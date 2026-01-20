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

Stop the development container.

```bash
rapid stop [--remove] [--volumes]
```

**Options:**

- `--remove` - Remove container after stopping
- `--volumes` - Also remove volumes

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
