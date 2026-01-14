# Claude Instructions

## Project: rapid

This file contains instructions for Claude Code when working on this project.
See `AGENTS.md` for complete project documentation.

## Quick Reference

```bash
# Development
pnpm install && pnpm build   # Setup
pnpm test                    # Run tests
pnpm typecheck               # Type check

# CLI testing
cd packages/cli
pnpm dev                     # Watch mode
node dist/bin.js <cmd>       # Test locally
```

## Key Directories

- `packages/cli/src/commands/` - CLI command implementations
- `packages/cli/src/setup/` - Setup wizard modules
- `packages/cli/src/utils/` - Utility functions
- `packages/core/src/` - Shared business logic
- `apps/docs/` - Documentation site

## Commit Guidelines

- Use conventional commits (feat:, fix:, docs:, etc.)
- Keep commits focused and atomic
- SSH signing is configured for verified commits
