# RAPID - AI-Assisted Development with Dev Containers

**RAPID** (Reproduction, Augmentation, and Parallel Intelligence Development) is a framework that bridges AI coding assistants with containerized development environments, enabling seamless orchestration of multiple AI agents and tools.

## Features

- 🤖 **Multi-Agent Orchestration** - Run multiple AI coding assistants (Claude Code, OpenCode, Aider) in parallel
- 🐳 **Dev Container Integration** - Automatic container management via devcontainer CLI
- 🔐 **Secure Secret Management** - 1Password/Vault integration for credential handling
- 🔌 **MCP Server Support** - Model Context Protocol integration for external tools and APIs
- 📋 **Context Management** - Automatic AGENTS.md and CLAUDE.md generation
- 🎯 **Configuration-Driven** - Single `rapid.json` file for all orchestration settings

## Quick Start

### Prerequisites

- Node.js 20+
- Docker Desktop (or Docker daemon)
- devcontainer CLI: `npm install -g @devcontainers/cli`

### Installation

```bash
npm install -g rapid
```

### Initialize a Project

```bash
rapid init
rapid start
rapid dev
```

## Usage

### Basic Commands

```bash
# Start the development container
rapid start

# Launch AI coding session
rapid dev

# Use specific agent
rapid dev --agent aider

# Run multiple agents in tmux
rapid dev --multi

# Stop the container
rapid stop

# Check environment status
rapid status
```

## Configuration

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
      },
      "opencode": {
        "cli": "opencode",
        "instructionFile": "AGENTS.md",
        "envVars": ["ANTHROPIC_API_KEY"]
      }
    }
  },
  "container": {
    "devcontainer": ".devcontainer/devcontainer.json",
    "autoStart": true
  },
  "secrets": {
    "provider": "1password",
    "vault": "Development"
  },
  "mcp": {
    "configFile": ".mcp.json",
    "servers": {
      "filesystem": { "enabled": true },
      "github": { "enabled": true }
    }
  }
}
```

## Documentation

- [Getting Started](./docs/guides/quickstart.md)
- [Agent Configuration](./docs/guides/agent-configuration.md)
- [Secrets Management](./docs/guides/secrets-management.md)
- [Container Lifecycle](./docs/concepts/container-lifecycle.md)
- [rapid.json Specification](./docs/reference/rapid.json-spec.md)
- [Supported Agents](./docs/reference/supported-agents.md)

## Architecture

### Core Packages

- **@a3t/rapid-core** - Core library with container, agent, and config management
- **@a3t/rapid** - CLI tool for orchestration commands
- **@a3t/rapid-schema** - JSON schema and TypeScript types
- **@a3t/rapid-docs** - Documentation site (Astro + Starlight)

### Supported AI Agents

| Agent              | Provider  | MCP Support | Best For                       |
| ------------------ | --------- | ----------- | ------------------------------ |
| Claude Code        | Anthropic | ✅ Yes      | Complex reasoning, refactoring |
| OpenCode           | Multi     | ✅ Yes      | Multi-model, cost optimization |
| Aider              | Multi     | ❌ No       | Quick iterations, auto-commits |
| GitHub Copilot CLI | GitHub    | ❌ No       | Shell commands, git operations |

## Development

### Setup

```bash
pnpm install
pnpm build
pnpm dev
```

### Available Scripts

```bash
pnpm lint              # Run ESLint
pnpm format            # Format with Prettier
pnpm typecheck         # Run TypeScript type checking
pnpm test              # Run test suite
pnpm build             # Build all packages
```

## Security

- All secrets are stored in 1Password/Vault, not in `.env` files
- MCP server configurations are project-scoped, not global
- Git pre-commit hooks prevent accidental secret commits
- Secret scanning enabled via GitHub security settings

## License

MIT © 2026 Rude Company LLC

See [LICENSE](./LICENSE) for details.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Support

- 📚 [Documentation](./docs)
- 🐛 [Report Issues](https://github.com/a3tai/rapid/issues)
- 💬 [Discussions](https://github.com/a3tai/rapid/discussions)

---

Built with ❤️ by Rude Company LLC
