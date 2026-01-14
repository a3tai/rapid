# RAPID Quickstart

Get a RAPID-enabled project running in 5 minutes.

## Prerequisites

| Requirement              | Version | Notes                   |
| ------------------------ | ------- | ----------------------- |
| Docker Desktop or Podman | Latest  | Container runtime       |
| Node.js                  | 18+     | For RAPID CLI           |
| AI Provider API Key      | -       | Anthropic, OpenAI, etc. |

## Installation

```bash
npm install -g @rapid-dev/cli
```

Verify installation:

```bash
rapid --version
```

## Initialize a Project

Navigate to your project directory and initialize RAPID:

```bash
cd your-project
rapid init
```

This creates:

```
your-project/
├── rapid.json              # RAPID configuration
├── AGENTS.md               # AI agent instructions (template)
├── CLAUDE.md               # Claude-specific instructions (template)
└── .devcontainer/          # Dev container config (if not present)
    └── devcontainer.json
```

## Configure Your AI Provider

Edit `rapid.json` to set up your preferred AI tool:

```json
{
  "version": "1.0",
  "agents": {
    "default": "claude",
    "available": {
      "claude": {
        "cli": "claude",
        "instructionFile": "CLAUDE.md",
        "envVars": ["ANTHROPIC_API_KEY"],
        "installCmd": "npm install -g @anthropic-ai/claude-code"
      }
    }
  },
  "secrets": {
    "provider": "1password",
    "vault": "Development",
    "items": {
      "ANTHROPIC_API_KEY": "op://Development/Anthropic/api-key"
    }
  }
}
```

### Alternative: Environment Variables

If not using 1Password, set secrets via environment:

```json
{
  "secrets": {
    "provider": "env"
  }
}
```

Then export your API key:

```bash
export ANTHROPIC_API_KEY="your-api-key"
```

## Start Development

### Step 1: Start the Environment

```bash
rapid start
```

This will:

1. Build and start the dev container
2. Load secrets from your configured provider
3. Install the AI CLI tool if missing
4. Generate/update agent instruction files

### Step 2: Launch AI Session

```bash
rapid dev
```

You're now in an AI-assisted coding session inside your container.

## Common Workflows

### Switch AI Agents

```bash
# Switch to OpenCode
rapid agent opencode

# Launch with the new agent
rapid dev
```

### Add Another Agent

```bash
# Add Aider to available agents
rapid agent add aider

# Run both Claude and Aider concurrently
rapid dev --multi
```

### View Configuration

```bash
rapid config
```

### Stop Environment

```bash
rapid stop
```

## Customize Agent Instructions

Edit `AGENTS.md` or `CLAUDE.md` to provide project-specific context:

```markdown
# Project Instructions

## Overview

This is a TypeScript/Node.js API server using Express.

## Code Style

- Use async/await, not callbacks
- Prefer named exports
- Add JSDoc comments to public functions

## Testing

- Run tests with `npm test`
- Maintain >80% coverage

## Important Patterns

- Error handling: Use custom AppError class
- Logging: Use the logger from `src/utils/logger.ts`
```

## Troubleshooting

### Container fails to start

```bash
# Check Docker/Podman is running
docker info

# Rebuild container
rapid start --rebuild
```

### AI tool not found

```bash
# Force reinstall
rapid start --reinstall-tools
```

### Secrets not loading

```bash
# Verify 1Password CLI
op whoami

# Test secret access
op read "op://Development/Anthropic/api-key"
```

## Next Steps

- [CLI Reference](./cli-reference.md) - All commands and options
- [Agent Configuration](./agent-configuration.md) - Detailed agent setup
- [Secrets Management](./secrets-management.md) - 1Password/Vault configuration
- [rapid.json Specification](../reference/rapid.json-spec.md) - Full configuration reference
