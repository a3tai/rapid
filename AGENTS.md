# Agent Instructions

## Project: rapid

This file contains instructions for AI coding agents working on this project.

## Overview

RAPID (Rapid AI-Powered Integrated Development) is a CLI tool that orchestrates AI-assisted development workflows using devcontainers. It provides:

- **Devcontainer management**: Auto-configured development environments
- **Multi-agent support**: Claude Code, OpenCode, Aider, and custom agents
- **MCP servers**: Context7 docs, Tavily search, and more
- **Secrets management**: 1Password, HashiCorp Vault, or environment variables
- **Git worktrees**: Automatic branch isolation for feature development
- **SSH commit signing**: Secure verified commits via SSH agent forwarding

## Development Guidelines

- Follow existing code patterns and conventions
- Write tests for new functionality
- Update documentation when making changes
- Commit changes with clear, descriptive messages
- Use SSH signing for commits (configured in devcontainer)

## Release Guidelines

- GitHub release titles should only contain the version number (e.g., `v0.1.5`)
- Do not include descriptions or feature names in the release title
- Release notes body should contain the detailed changelog

## Project Structure

```
.
├── packages/
│   ├── cli/                # @a3t/rapid - Main CLI package
│   │   ├── src/
│   │   │   ├── commands/   # CLI commands (init, dev, worktree, etc.)
│   │   │   ├── setup/      # Setup wizard modules
│   │   │   └── utils/      # Utilities (worktree, update-checker)
│   │   └── package.json
│   ├── core/               # @a3t/rapid-core - Shared logic
│   └── schema/             # @a3t/rapid-schema - JSON schema
├── apps/
│   └── docs/               # Documentation site (Astro/Starlight)
├── templates/              # Devcontainer templates
│   ├── typescript/
│   ├── python/
│   ├── rust/
│   ├── go/
│   └── universal/
├── rapid.json              # RAPID configuration
├── CLAUDE.md               # Claude-specific instructions
└── AGENTS.md               # Generic agent instructions (this file)
```

## Key Commands

```bash
# Development
pnpm install              # Install dependencies
pnpm build                # Build all packages
pnpm test                 # Run tests
pnpm typecheck            # Type check all packages

# CLI testing
cd packages/cli
pnpm dev                  # Watch mode build
node dist/bin.js <cmd>    # Test CLI locally

# RAPID workflow
rapid init                # Initialize RAPID in a project
rapid dev                 # Launch AI coding session
rapid worktree list       # Show git worktrees
rapid mcp list            # Show MCP servers
```

## Getting Started

1. Review the project structure above
2. Run `pnpm install && pnpm build` to set up
3. Check `packages/cli/src/commands/` for command implementations
4. Follow the guidelines above when making changes
