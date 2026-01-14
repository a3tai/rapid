# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] - 2026-01-14

### Added

- **MCP server management** - New `mcpServers` configuration section in `rapid.json` for defining Model Context Protocol servers with command, arguments, and environment variables

### Changed

- Updated all dependencies to latest versions

### Fixed

- Format `rapid.json` for prettier compliance

## [0.1.0] - 2026-01-14

### Added

#### Core Features

- **Multi-agent orchestration system** for managing development workflows with Claude Code, OpenCode, Aider, and other AI assistants
- **Dev container integration** with support for lifecycle management (start, stop, dev, status)
- **External authentication detection** for Claude Code, OpenAI Codex, Gemini CLI, Aider, and environment variables
- **MCP (Model Context Protocol) server configuration** with pass-through support in `rapid dev` command
- **Auth status CLI command** (`rapid auth`) to display detected credentials and external tool configurations
- **Secret management infrastructure** with 1Password and Vault integration ready

#### CLI Commands

- `rapid init` - Initialize RAPID configuration
- `rapid dev` - Start development session with dev container and MCP support
- `rapid start` - Start dev container
- `rapid stop` - Stop dev container
- `rapid status` - Show container and auth status
- `rapid auth` - Display detected credentials and auth configuration
- `rapid agent` - Agent interaction tools
- `rapid secrets` - Secret management utilities

#### Libraries & Packages

- **@a3t/rapid** - CLI package with command orchestration
- **@a3t/rapid-core** - Core library for agent management, container lifecycle, auth detection, and configuration
- **@a3t/rapid-schema** - JSON schema and TypeScript type definitions for RAPID configuration

#### Documentation

- Comprehensive documentation site built with Astro and Starlight
- Getting started guides and quick start instructions
- Detailed CLI reference documentation
- Agent configuration and integration guides
- Dev container setup and lifecycle documentation
- Secrets management best practices
- Architecture overview and concepts documentation
- Individual README files for each npm package

#### CI/CD & Repository Setup

- GitHub Actions workflows for lint, type checking, testing, and building
- GitHub Actions for documentation deployment to Cloudflare Pages
- Automated release workflow for npm packages
- Branch protection on `main` with required status checks and code review
- GitHub secret scanning and push protection
- Dependabot automation for npm and GitHub Actions dependencies
- MIT license and contribution guidelines

#### Development Configuration

- TypeScript configuration with monorepo support
- ESLint setup with Astro and TypeScript support
- Prettier code formatting configuration
- Vitest test runner setup
- pnpm workspace configuration

### Repository Metadata

- Repository made public on GitHub
- Description: "Multi-agent development orchestration system with Claude, OpenCode, Aider and more"
- Repository URL: https://github.com/a3tai/rapid
- Homepage: https://getrapid.dev

### Tags Created

- `v0.1.0` - Main repository release tag
- `rapid-cli@0.1.0` - @a3t/rapid CLI package tag
- `rapid-core@0.1.0` - @a3t/rapid-core library tag
- `rapid-schema@0.1.0` - @a3t/rapid-schema schema tag

### Known Limitations

- Package versions are `0.1.0` - This is an initial release and APIs may change
- Some features marked for future implementation (1Password/Vault secret backends)
- Test suites are placeholder implementations

## Future Releases

### Planned for 0.2.0

- Expanded agent support with more orchestration options
- Enhanced configuration validation and error handling
- Performance optimizations for large projects
- Additional secret management backends

### Planned for 1.0.0

- Stable API for agent integration
- Production-ready secret management
- Enterprise-grade authentication providers
- Comprehensive test coverage
