# RAPID

Multi-agent development orchestration system with Claude, OpenCode, Aider and more.

## Overview

RAPID is an orchestration layer for AI-assisted development. It manages the complexity of running AI coding tools inside containerized environments.

**Key Features:**

- Multi-agent orchestration - Run Claude Code, OpenCode, Aider concurrently
- Dev container integration - Automatic lifecycle management
- Secret management - 1Password and Vault integration
- MCP server support - Model Context Protocol configuration
- Configuration-driven - Single `rapid.json` for all settings

## Installation

```bash
npm install -g @a3t/rapid
```

## Quick Start

```bash
# Initialize RAPID in your project
rapid init

# Start the dev container
rapid start

# Launch an AI coding session
rapid dev

# Check status
rapid status
```

## Documentation

- [Quickstart Guide](./docs/guides/quickstart.md)
- [CLI Reference](./docs/guides/cli-reference.md)
- [Configuration Reference](./docs/reference/rapid.json-spec.md)
- [RAPID Overview](./docs/concepts/rapid-overview.md)

## Packages

| Package | Description |
|---------|-------------|
| [@a3t/rapid](./packages/cli) | CLI tool |
| [@a3t/rapid-core](./packages/core) | Core library |
| [@a3t/rapid-schema](./packages/schema) | JSON schema |

## Supported Agents

- **Claude Code** - Complex reasoning, refactoring
- **OpenCode** - Multi-model, cost optimization
- **Aider** - Quick iterations, auto-commits
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
