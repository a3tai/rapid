# rapid.json Configuration Guide

Complete reference and examples for configuring RAPID multi-agent development systems.

## Table of Contents

- [Overview](#overview)
- [File Location](#file-location)
- [Quick Start](#quick-start)
- [Core Configuration](#core-configuration)
  - [Top-Level Properties](#top-level-properties)
  - [Container Configuration](#container-configuration)
  - [Agents Configuration](#agents-configuration)
  - [Secret Management](#secret-management)
  - [Context Files](#context-files)
- [Multi-Agent Features](#multi-agent-features)
  - [Event Bus](#event-bus)
  - [Personas](#personas)
  - [Skills](#skills)
- [Advanced Configuration](#advanced-configuration)
  - [MCP Servers](#mcp-servers)
  - [LLM Gateway](#llm-gateway)
  - [Sandbox Configuration](#sandbox-configuration)
- [Environment-Specific Configs](#environment-specific-configs)
- [Validation and Troubleshooting](#validation-and-troubleshooting)
- [Complete Examples](#complete-examples)

---

## Overview

`rapid.json` is the main configuration file for RAPID. It defines:
- Which AI agents are available (Claude, OpenCode, Aider, etc.)
- How secrets are managed (1Password, Vault, etc.)
- Container and development environment settings
- Multi-agent coordination via event bus and personas
- MCP server integrations
- LLM gateway routing and budgets

## File Location

RAPID looks for configuration in this order:

1. `rapid.json` (project root) - **recommended**
2. `.rapid/config.json`
3. `.rapidrc.json`

## Quick Start

Minimal configuration to get started:

```json
{
  "$schema": "https://getrapid.dev/schema/v1/rapid.json",
  "version": "1.0",
  "agents": {
    "default": "claude",
    "available": {
      "claude": {
        "cli": "claude",
        "instructionFile": "CLAUDE.md"
      }
    }
  }
}
```

## Core Configuration

### Top-Level Properties

| Property    | Type   | Required | Default         | Description                                 |
| ----------- | ------ | -------- | --------------- | ------------------------------------------- |
| `$schema`   | string | No       | -               | JSON schema URL for validation/IntelliSense |
| `version`   | string | Yes      | -               | Specification version (currently `"1.0"`)   |
| `name`      | string | No       | Directory name  | Project name                                |
| `container` | object | No       | See below       | Container lifecycle configuration           |
| `secrets`   | object | No       | `{"provider": "env"}` | Secret management           |
| `agents`    | object | Yes      | -               | AI agent configuration                      |
| `context`   | object | No       | See below       | Context file settings                       |
| `mcp`       | object | No       | -               | MCP server configuration                    |
| `gateway`   | object | No       | -               | LLM gateway (LiteLLM) configuration         |
| `eventBus`  | object | No       | `{"enabled": false}` | Inter-agent event bus             |
| `personas`  | object | No       | -               | Persona definitions for specialized agents  |
| `skills`    | object | No       | -               | Custom skills/commands                      |
| `sandbox`   | object | No       | -               | Sandbox security configuration              |
| `lima`      | object | No       | -               | Lima VM configuration (macOS only)          |

### Container Configuration

Control how RAPID manages your dev container:

```json
{
  "container": {
    "devcontainer": ".devcontainer/devcontainer.json",
    "autoStart": true,
    "buildArgs": {
      "NODE_VERSION": "20",
      "DEBIAN_FRONTEND": "noninteractive"
    }
  }
}
```

**Properties:**

| Property       | Type    | Default                             | Description                                  |
| -------------- | ------- | ----------------------------------- | -------------------------------------------- |
| `devcontainer` | string  | `".devcontainer/devcontainer.json"` | Path to devcontainer.json                    |
| `compose`      | string  | `null`                              | Docker Compose file (overrides devcontainer) |
| `autoStart`    | boolean | `true`                              | Start container automatically on `rapid dev` |
| `buildArgs`    | object  | `{}`                                | Additional Docker build arguments            |

**Using Docker Compose:**

```json
{
  "container": {
    "compose": "docker-compose.yml",
    "autoStart": true
  }
}
```

### Agents Configuration

Define which AI coding assistants are available:

```json
{
  "agents": {
    "default": "claude",
    "available": {
      "claude": {
        "cli": "claude",
        "instructionFile": "CLAUDE.md",
        "yolo": true,
        "envVars": ["ANTHROPIC_API_KEY"],
        "installCmd": "npm install -g @anthropic-ai/claude-code"
      },
      "opencode": {
        "cli": "opencode",
        "instructionFile": "AGENTS.md",
        "envVars": ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
        "installCmd": "npm install -g opencode"
      },
      "aider": {
        "cli": "aider",
        "instructionFile": ".aider.conf.yml",
        "envVars": ["OPENAI_API_KEY"],
        "installCmd": "pip install aider-chat",
        "args": ["--model", "gpt-4o"],
        "readsInstructionFiles": true
      }
    }
  }
}
```

**Agent Properties:**

| Property                | Type    | Required | Description                                        |
| ----------------------- | ------- | -------- | -------------------------------------------------- |
| `cli`                   | string  | Yes      | CLI command to execute                             |
| `instructionFile`       | string  | No       | Path to instruction file for this agent            |
| `envVars`               | array   | No       | Required environment variables                     |
| `installCmd`            | string  | No       | Command to install the CLI tool                    |
| `args`                  | array   | No       | Additional CLI arguments                           |
| `yolo`                  | boolean | No       | Enable auto-accept mode (skip confirmations)       |
| `readsInstructionFiles` | boolean | No       | Whether agent natively reads instruction files     |

**Pro tip:** Set `yolo: true` for Claude in trusted dev environments to skip permission prompts.

### Secret Management

RAPID uses `.envrc` with direnv as the source of truth for secure secret loading.

#### Provider: 1Password (Recommended)

```json
{
  "secrets": {
    "provider": "1password",
    "vault": "Development",
    "items": {
      "ANTHROPIC_API_KEY": "op://Development/Anthropic/api-key",
      "OPENAI_API_KEY": "op://Development/OpenAI/api-key",
      "GITHUB_TOKEN": "op://Development/GitHub/pat",
      "DATABASE_URL": "op://Development/PostgreSQL/connection-string"
    },
    "envrc": {
      "generate": true,
      "path": ".envrc",
      "includeLocal": true
    }
  }
}
```

**Generated `.envrc` file:**

```bash
# .envrc - Generated by RAPID
# Safe to commit - contains references only, not actual secrets

export ANTHROPIC_API_KEY=$(op read "op://Development/Anthropic/api-key")
export OPENAI_API_KEY=$(op read "op://Development/OpenAI/api-key")
export GITHUB_TOKEN=$(op read "op://Development/GitHub/pat")
export DATABASE_URL=$(op read "op://Development/PostgreSQL/connection-string")

# Load local overrides (gitignored)
[[ -f .envrc.local ]] && source_env .envrc.local
```

**Secret Properties:**

| Property   | Type   | Default       | Description                                |
| ---------- | ------ | ------------- | ------------------------------------------ |
| `provider` | enum   | `"1password"` | `"1password"`, `"vault"`, `"env"`          |
| `vault`    | string | -             | Vault name (1Password) or path (HashiCorp) |
| `address`  | string | -             | Vault server address (HashiCorp only)      |
| `items`    | object | `{}`          | Map of env var names to secret references  |

**envrc Options:**

| Property       | Type    | Default    | Description                       |
| -------------- | ------- | ---------- | --------------------------------- |
| `generate`     | boolean | `true`     | Auto-generate `.envrc` from items |
| `path`         | string  | `".envrc"` | Path to `.envrc` file             |
| `includeLocal` | boolean | `true`     | Source `.envrc.local` if present  |

#### Provider: HashiCorp Vault

```json
{
  "secrets": {
    "provider": "vault",
    "address": "https://vault.example.com",
    "vault": "secret/data/dev",
    "items": {
      "ANTHROPIC_API_KEY": "anthropic_key",
      "OPENAI_API_KEY": "openai_key"
    }
  }
}
```

**Generated `.envrc`:**

```bash
# .envrc - Generated by RAPID
export VAULT_ADDR="https://vault.example.com"

export ANTHROPIC_API_KEY=$(vault kv get -field=anthropic_key secret/data/dev)
export OPENAI_API_KEY=$(vault kv get -field=openai_key secret/data/dev)
```

#### Provider: env (Not Recommended)

Fallback that reads from environment. Does not generate `.envrc`.

```json
{
  "secrets": {
    "provider": "env"
  }
}
```

> **Warning:** Using `provider: "env"` without a secure source is not recommended. Prefer 1Password or Vault.

#### External Auth Detection

RAPID can automatically detect credentials from other AI tools:

```json
{
  "secrets": {
    "provider": "1password",
    "vault": "Development",
    "externalAuth": {
      "enabled": true,
      "sources": ["claude-code", "aider", "env"],
      "preferSource": "claude-code"
    }
  }
}
```

Supported sources: `claude-code`, `codex`, `gemini-cli`, `aider`, `env`

### Context Files

Control which files are included in agent context:

```json
{
  "context": {
    "files": ["README.md", "CONTRIBUTING.md", "docs/architecture.md"],
    "dirs": ["docs/", "specs/"],
    "exclude": ["docs/internal/", "*.log"],
    "generateAgentFiles": true,
    "templateDir": ".rapid/templates",
    "preserve": ["CLAUDE.md"]
  }
}
```

**Properties:**

| Property             | Type    | Default         | Description                        |
| -------------------- | ------- | --------------- | ---------------------------------- |
| `files`              | array   | `["README.md"]` | Files to include in agent context  |
| `dirs`               | array   | `["docs/"]`     | Directories to include             |
| `exclude`            | array   | `[]`            | Patterns to exclude                |
| `generateAgentFiles` | boolean | `true`          | Auto-generate AGENTS.md, CLAUDE.md |
| `templateDir`        | string  | -               | Custom templates for agent files   |
| `preserve`           | array   | `[]`            | Files to preserve from auto-updates |

---

## Multi-Agent Features

### Event Bus

Enable inter-agent communication for multi-agent workflows:

```json
{
  "eventBus": {
    "enabled": true,
    "redis": {
      "url": "redis://localhost:6379",
      "prefix": "rapid:"
    },
    "injection": {
      "mode": "system_prompt",
      "maxMessages": 10,
      "priorityThreshold": "high",
      "includeTypes": ["coordination", "error", "question"]
    },
    "autoCheck": {
      "enabled": true,
      "intervalMs": 5000
    }
  }
}
```

**Event Bus Properties:**

| Property    | Type    | Default | Description                    |
| ----------- | ------- | ------- | ------------------------------ |
| `enabled`   | boolean | `false` | Enable the event bus           |
| `redis`     | object  | -       | Redis connection (optional)    |
| `injection` | object  | -       | Context injection settings     |
| `autoCheck` | object  | -       | Auto-check for new messages    |

**Redis Configuration:**

| Property | Type   | Default   | Description                   |
| -------- | ------ | --------- | ----------------------------- |
| `url`    | string | -         | Redis connection URL          |
| `prefix` | string | `"rapid:"` | Key prefix for RAPID data     |

If Redis is not configured, RAPID falls back to in-memory event bus (single-host only).

**Injection Configuration:**

| Property            | Type   | Default          | Description                       |
| ------------------- | ------ | ---------------- | --------------------------------- |
| `mode`              | enum   | `"system_prompt"` | `"system_prompt"`, `"user_prefix"`, `"tool_response"` |
| `maxMessages`       | number | `5`              | Maximum messages to inject        |
| `priorityThreshold` | enum   | `"normal"`       | `"low"`, `"normal"`, `"high"`, `"urgent"` |
| `includeTypes`      | array  | All types        | Message types to include          |

**Auto-Check Configuration:**

| Property     | Type    | Default | Description                      |
| ------------ | ------- | ------- | -------------------------------- |
| `enabled`    | boolean | `false` | Enable automatic message checking |
| `intervalMs` | number  | `10000` | Check interval in milliseconds   |

### Personas

Define specialized AI agents with custom prompts and personalities:

```json
{
  "personas": {
    "directory": ".rapid/personas",
    "defaultModel": "sonnet",
    "defaultTools": ["read", "grep", "glob", "bus_send", "bus_messages"],
    "team": ["orchestrator", "architect", "security-reviewer", "test-writer"],
    "autoSpawn": false,
    "orchestrator": "orchestrator",
    "definitions": {
      "code-reviewer": {
        "name": "code-reviewer",
        "description": "Thorough code reviewer focused on best practices",
        "model": "haiku",
        "systemPrompt": "You are a code reviewer. Review code for readability, maintainability, and adherence to best practices.",
        "personality": ["thorough", "analytical", "asks_clarifying_questions"],
        "tools": ["read", "grep", "glob"],
        "triggers": ["on_pr", "on_commit"],
        "maxTurns": 20
      }
    }
  }
}
```

**Personas Configuration:**

| Property        | Type    | Default                 | Description                            |
| --------------- | ------- | ----------------------- | -------------------------------------- |
| `directory`     | string  | `".rapid/personas"`     | Directory containing persona YAML files |
| `defaultModel`  | enum    | `"sonnet"`              | Default model for all personas         |
| `defaultTools`  | array   | All tools               | Default tools for all personas         |
| `team`          | array   | `[]`                    | Team members to spawn                  |
| `autoSpawn`     | boolean | `false`                 | Auto-spawn team on `rapid start`       |
| `orchestrator`  | string  | -                       | Orchestrator persona name              |
| `definitions`   | object  | `{}`                    | Inline persona definitions             |

**Persona Definition (YAML file format):**

```yaml
name: architect
description: Software architect for design decisions and code structure planning

model: sonnet  # opus, sonnet, haiku, gpt-4o, gpt-4o-mini, custom

systemPrompt: |
  You are a software architect responsible for high-level design decisions.

  Your responsibilities:
  - Evaluate architectural trade-offs
  - Design scalable solutions
  - Document architectural decisions (ADRs)

  Communicate decisions via the event bus so other agents understand the "why".

personality:
  - analytical
  - thorough
  - formal

tools:
  - read
  - grep
  - glob
  - bus_send
  - bus_messages
  - bus_agents

triggers:
  - on_request
  - manual

maxTurns: 30
canSpawn: true  # Can spawn other specialized agents

contextFiles:
  - "docs/architecture/**/*.md"
  - "ADR.md"

envVars:
  - "ANTHROPIC_API_KEY"
```

**Persona Properties:**

| Property       | Type    | Required | Description                                |
| -------------- | ------- | -------- | ------------------------------------------ |
| `name`         | string  | Yes      | Unique persona identifier                  |
| `description`  | string  | No       | Human-readable description                 |
| `model`        | enum    | No       | AI model (opus/sonnet/haiku/gpt-4o/custom) |
| `customModel`  | string  | No       | Custom model ID when model is 'custom'     |
| `systemPrompt` | string  | Yes      | System prompt defining role and behavior   |
| `personality`  | array   | No       | Personality traits                         |
| `tools`        | array   | No       | MCP tools this persona can access          |
| `triggers`     | array   | No       | Events that auto-spawn this persona        |
| `maxTurns`     | number  | No       | Max conversation turns before terminating  |
| `canSpawn`     | boolean | No       | Whether this persona can spawn others      |
| `extends`      | string  | No       | Parent persona to inherit from             |
| `contextFiles` | array   | No       | Additional context files to include        |
| `envVars`      | array   | No       | Required environment variables             |

**Available Models:**
- `opus` - Claude Opus (highest capability, highest cost)
- `sonnet` - Claude Sonnet (balanced capability and cost) **recommended**
- `haiku` - Claude Haiku (fast, cost-effective for focused tasks)
- `gpt-4o` - GPT-4 Optimized
- `gpt-4o-mini` - GPT-4 Mini
- `custom` - Custom model ID (requires `customModel` property)

**Available Personality Traits:**
- `thorough` - Exhaustive, detail-oriented
- `concise` - Brief, to-the-point communication
- `cautious` - Risk-aware, asks for clarification
- `bold` - Takes initiative, makes decisions
- `creative` - Innovative solutions, thinks outside the box
- `analytical` - Data-driven, logical reasoning
- `friendly` - Approachable, conversational tone
- `formal` - Professional, structured communication
- `asks_clarifying_questions` - Seeks clarification before acting
- `autonomous` - Works independently, minimal oversight

**Available Tools:**
- `read` - Read files
- `write` - Write files
- `edit` - Edit existing files
- `grep` - Search code
- `glob` - Find files by pattern
- `bash` - Execute bash commands
- `bus_send` - Send event bus messages
- `bus_messages` - Read event bus messages
- `bus_agents` - List active agents
- `web_search` - Search the web
- `web_fetch` - Fetch web content

**Available Triggers:**
- `on_pr` - Pull request created/updated
- `on_commit` - Git commit
- `on_issue` - Issue created/updated
- `on_error` - Error occurred
- `on_request` - Manual request via event bus
- `manual` - Only spawn manually

### Skills

Define custom commands/skills that agents can execute:

```json
{
  "skills": {
    "directory": ".rapid/skills",
    "definitions": {
      "review": {
        "name": "review",
        "description": "Review code for quality and security",
        "type": "spawn",
        "persona": "code-reviewer"
      },
      "test": {
        "name": "test",
        "description": "Generate comprehensive tests",
        "type": "spawn",
        "persona": "test-writer"
      },
      "deploy": {
        "name": "deploy",
        "description": "Deploy to staging environment",
        "type": "script",
        "command": "./scripts/deploy.sh",
        "args": ["staging"]
      }
    }
  }
}
```

**Skills Configuration:**

| Property      | Type   | Default            | Description                            |
| ------------- | ------ | ------------------ | -------------------------------------- |
| `directory`   | string | `".rapid/skills"`  | Directory containing skill YAML files  |
| `definitions` | object | `{}`               | Inline skill definitions               |

**Skill Definition:**

| Property      | Type   | Required | Description                        |
| ------------- | ------ | -------- | ---------------------------------- |
| `name`        | string | Yes      | Skill name (used as /command)      |
| `description` | string | Yes      | Human-readable description         |
| `type`        | enum   | Yes      | `"spawn"`, `"script"`, or `"mcp"`  |
| `persona`     | string | No       | Persona to spawn (type: spawn)     |
| `command`     | string | No       | Command to execute (type: script)  |
| `args`        | array  | No       | Arguments passed to skill          |

---

## Advanced Configuration

### MCP Servers

Configure Model Context Protocol servers for extended agent capabilities:

```json
{
  "mcp": {
    "configFile": ".mcp.json",
    "servers": {
      "rapid": {
        "enabled": true,
        "type": "remote",
        "url": "http://localhost:3100/mcp"
      },
      "filesystem": {
        "enabled": true,
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspaces/myproject"]
      },
      "github": {
        "enabled": true,
        "type": "remote",
        "url": "https://api.github.com/mcp",
        "headers": {
          "Authorization": "Bearer ${GITHUB_TOKEN}"
        }
      },
      "postgres": {
        "enabled": false,
        "type": "stdio",
        "command": "mcp-server-postgres",
        "env": {
          "DATABASE_URL": "${DATABASE_URL}"
        }
      },
      "context7": {
        "enabled": true,
        "type": "remote",
        "url": "https://mcp.context7.com/mcp",
        "headers": {
          "Context7-API-Key": "${CONTEXT7_API_KEY}"
        }
      },
      "tavily": {
        "enabled": true,
        "type": "remote",
        "url": "https://mcp.tavily.com/mcp",
        "headers": {
          "Authorization": "Bearer ${TAVILY_API_KEY}"
        }
      }
    }
  }
}
```

**MCP Configuration:**

| Property     | Type   | Default       | Description               |
| ------------ | ------ | ------------- | ------------------------- |
| `configFile` | string | `".mcp.json"` | Path to MCP config file   |
| `servers`    | object | `{}`          | MCP server configurations |

**MCP Server Configuration:**

| Property  | Type    | Required | Description                                    |
| --------- | ------- | -------- | ---------------------------------------------- |
| `enabled` | boolean | No       | Enable this MCP server (default: true)         |
| `type`    | enum    | Yes      | `"stdio"`, `"streamable-http"`, or `"remote"`  |
| `url`     | string  | No       | URL for remote servers                         |
| `headers` | object  | No       | HTTP headers for remote servers                |
| `command` | string  | No       | Command for stdio servers                      |
| `args`    | array   | No       | Arguments for stdio command                    |
| `env`     | object  | No       | Environment variables for stdio servers        |

**Transport Types:**
- `stdio` - Local subprocess (command + args)
- `streamable-http` - Remote HTTP server (url + headers) - MCP spec standard
- `remote` - Alias for `streamable-http` (backwards compatible)

### LLM Gateway

Route AI requests through LiteLLM for load balancing, cost tracking, and fallbacks:

```json
{
  "gateway": {
    "enabled": true,
    "type": "litellm",
    "mode": "managed",
    "fallback": "direct",
    "logging": true,
    "config": {
      "baseUrl": "http://localhost:4000",
      "configFile": "litellm_config.yaml"
    },
    "models": {
      "default": "claude-sonnet",
      "aliases": {
        "claude": "claude-3-5-sonnet-20250122",
        "gpt4": "gpt-4o-2024-11-20"
      },
      "list": [
        {
          "modelName": "claude-sonnet",
          "provider": "anthropic",
          "model": "claude-3-5-sonnet-20250122",
          "apiKeyEnv": "ANTHROPIC_API_KEY",
          "priority": 1
        },
        {
          "modelName": "gpt-4o",
          "provider": "openai",
          "model": "gpt-4o-2024-11-20",
          "apiKeyEnv": "OPENAI_API_KEY",
          "priority": 2
        }
      ]
    },
    "budgets": {
      "project": {
        "max": 100,
        "duration": "30d",
        "alertAt": [50, 75, 90]
      },
      "session": {
        "max": 10,
        "duration": "24h"
      },
      "perModel": {
        "opus": {
          "max": 50,
          "duration": "30d"
        }
      }
    }
  }
}
```

**Gateway Properties:**

| Property   | Type    | Default   | Description                                    |
| ---------- | ------- | --------- | ---------------------------------------------- |
| `enabled`  | boolean | `false`   | Enable LLM gateway                             |
| `type`     | enum    | `"litellm"` | `"litellm"`, `"openrouter"`, `"custom"`      |
| `mode`     | enum    | `"proxy"` | `"external"` (connect) or `"managed"` (start) |
| `fallback` | enum    | `"direct"` | `"direct"` (bypass on error) or `"error"`     |
| `logging`  | boolean | `false`   | Enable request/response logging                |
| `config`   | object  | -         | Gateway connection config                      |
| `models`   | object  | -         | Model aliases and routing                      |
| `budgets`  | object  | -         | Budget configuration                           |

**Gateway Modes:**
- `external` - Connect to existing LiteLLM instance
- `managed` - RAPID starts and manages LiteLLM

**Budget Configuration:**

```json
{
  "project": {
    "max": 100,          // $100 USD
    "duration": "30d",    // Over 30 days
    "alertAt": [50, 75, 90]  // Alert at 50%, 75%, 90%
  }
}
```

### Sandbox Configuration

Control security sandbox for agent command execution:

```json
{
  "sandbox": {
    "enabled": true,
    "mode": "auto",
    "network": {
      "enabled": true,
      "allowedDomains": [
        "*.github.com",
        "api.anthropic.com",
        "api.openai.com",
        "registry.npmjs.org"
      ],
      "deniedDomains": [
        "internal.company.com"
      ],
      "proxyPort": 8888
    },
    "filesystem": {
      "readPaths": [
        "/workspaces/myproject/**",
        "/tmp/**"
      ],
      "writePaths": [
        "/workspaces/myproject/**",
        "/tmp/**"
      ],
      "blockedPaths": [
        "/workspaces/myproject/.env",
        "/workspaces/myproject/secrets/**"
      ],
      "readOnlyRoot": true
    }
  }
}
```

**Sandbox Properties:**

| Property     | Type    | Default | Description                           |
| ------------ | ------- | ------- | ------------------------------------- |
| `enabled`    | boolean | `true`  | Enable OS-level sandboxing            |
| `mode`       | enum    | `"auto"` | `"auto"`, `"sandbox"`, `"lima"`, `"none"` |
| `network`    | object  | -       | Network filtering config              |
| `filesystem` | object  | -       | Filesystem access config              |

**Sandbox Modes:**
- `auto` - Automatically select best sandbox (Seatbelt on macOS, Bubblewrap on Linux)
- `sandbox` - Force platform sandbox (Seatbelt/Bubblewrap)
- `lima` - Use Lima VM (macOS only)
- `none` - Disable sandboxing (not recommended)

---

## Environment-Specific Configs

### Development

```json
{
  "version": "1.0",
  "name": "myapp-dev",
  "agents": {
    "default": "claude",
    "available": {
      "claude": {
        "cli": "claude",
        "instructionFile": "CLAUDE.md",
        "yolo": true
      }
    }
  },
  "eventBus": {
    "enabled": true
  },
  "gateway": {
    "enabled": false
  },
  "secrets": {
    "provider": "1password",
    "vault": "Development"
  },
  "sandbox": {
    "enabled": false
  }
}
```

### Staging

```json
{
  "version": "1.0",
  "name": "myapp-staging",
  "agents": {
    "default": "claude",
    "available": {
      "claude": {
        "cli": "claude",
        "instructionFile": "CLAUDE.md",
        "yolo": false
      }
    }
  },
  "eventBus": {
    "enabled": true,
    "redis": {
      "url": "redis://redis-staging:6379"
    }
  },
  "gateway": {
    "enabled": true,
    "mode": "external",
    "config": {
      "baseUrl": "https://gateway-staging.company.com"
    }
  },
  "secrets": {
    "provider": "vault",
    "address": "https://vault-staging.company.com",
    "vault": "secret/data/staging"
  },
  "sandbox": {
    "enabled": true,
    "mode": "auto"
  }
}
```

### Production

```json
{
  "version": "1.0",
  "name": "myapp-production",
  "agents": {
    "default": "claude",
    "available": {
      "claude": {
        "cli": "claude",
        "instructionFile": "CLAUDE.md",
        "yolo": false
      }
    }
  },
  "eventBus": {
    "enabled": true,
    "redis": {
      "url": "redis://redis-prod:6379",
      "prefix": "rapid:prod:"
    }
  },
  "gateway": {
    "enabled": true,
    "mode": "external",
    "logging": true,
    "config": {
      "baseUrl": "https://gateway.company.com"
    },
    "budgets": {
      "project": {
        "max": 1000,
        "duration": "30d",
        "alertAt": [50, 75, 90, 95]
      }
    }
  },
  "secrets": {
    "provider": "vault",
    "address": "https://vault.company.com",
    "vault": "secret/data/production"
  },
  "sandbox": {
    "enabled": true,
    "mode": "auto",
    "network": {
      "enabled": true,
      "deniedDomains": ["*"]
    }
  }
}
```

---

## Validation and Troubleshooting

### Enable IntelliSense

Add the schema reference to enable editor validation and autocompletion:

```json
{
  "$schema": "https://getrapid.dev/schema/v1/rapid.json",
  "version": "1.0"
}
```

### Validation Commands

```bash
# Validate rapid.json syntax
rapid config validate

# Show effective configuration (with defaults)
rapid config show

# Check for common issues
rapid doctor
```

### Common Issues

#### Issue: Agent not found

```
Error: Agent 'claude' not found in PATH
```

**Solution:** Install the CLI or update `installCmd`:

```json
{
  "agents": {
    "available": {
      "claude": {
        "cli": "claude",
        "installCmd": "npm install -g @anthropic-ai/claude-code"
      }
    }
  }
}
```

#### Issue: Secret provider fails

```
Error: 1Password CLI not found
```

**Solutions:**

1. Install 1Password CLI: `brew install --cask 1password-cli`
2. Or switch to env provider:

```json
{
  "secrets": {
    "provider": "env"
  }
}
```

#### Issue: Event bus not connecting

```
Warning: Event bus unavailable, falling back to in-memory
```

**Solutions:**

1. Check Redis is running: `rapid status`
2. Start Redis: `rapid start --redis`
3. Or use in-memory mode (no Redis config):

```json
{
  "eventBus": {
    "enabled": true
  }
}
```

#### Issue: MCP server fails to start

```
Error: MCP server 'github' failed to initialize
```

**Solutions:**

1. Check environment variables are set
2. Verify server URL is correct
3. Disable the server temporarily:

```json
{
  "mcp": {
    "servers": {
      "github": {
        "enabled": false
      }
    }
  }
}
```

### Variable Substitution

RAPID supports variable substitution in string values:

| Variable                     | Description                         | Example                                  |
| ---------------------------- | ----------------------------------- | ---------------------------------------- |
| `${env:VAR}`                 | Environment variable from container | `"${env:DATABASE_URL}"`                  |
| `${localEnv:VAR}`            | Environment variable from host      | `"${localEnv:GITHUB_TOKEN}"`             |
| `${workspaceFolder}`         | Absolute path to project root       | `"${workspaceFolder}/scripts/deploy.sh"` |
| `${workspaceFolderBasename}` | Project directory name              | `"${workspaceFolderBasename}-prod"`      |

**Example:**

```json
{
  "name": "${workspaceFolderBasename}",
  "mcp": {
    "servers": {
      "github": {
        "env": {
          "GITHUB_TOKEN": "${localEnv:GITHUB_TOKEN}",
          "GITHUB_REPO": "${env:GITHUB_REPOSITORY}"
        }
      }
    }
  }
}
```

---

## Complete Examples

### Example 1: Single-Agent Development

Simple setup for solo development with Claude:

```json
{
  "$schema": "https://getrapid.dev/schema/v1/rapid.json",
  "version": "1.0",
  "name": "my-project",

  "agents": {
    "default": "claude",
    "available": {
      "claude": {
        "cli": "claude",
        "instructionFile": "CLAUDE.md",
        "yolo": true
      }
    }
  },

  "secrets": {
    "provider": "1password",
    "vault": "Development",
    "items": {
      "ANTHROPIC_API_KEY": "op://Development/Anthropic/api-key"
    }
  },

  "context": {
    "files": ["README.md", "CLAUDE.md"],
    "generateAgentFiles": true
  }
}
```

### Example 2: Multi-Agent Team

Advanced setup with orchestrator and specialized personas:

```json
{
  "$schema": "https://getrapid.dev/schema/v1/rapid.json",
  "version": "1.0",
  "name": "enterprise-app",

  "agents": {
    "default": "claude",
    "available": {
      "claude": {
        "cli": "claude",
        "instructionFile": "CLAUDE.md",
        "yolo": true
      },
      "opencode": {
        "cli": "opencode",
        "instructionFile": "AGENTS.md"
      }
    }
  },

  "eventBus": {
    "enabled": true,
    "redis": {
      "url": "redis://localhost:6379"
    },
    "injection": {
      "mode": "system_prompt",
      "maxMessages": 10,
      "priorityThreshold": "high"
    }
  },

  "personas": {
    "directory": ".rapid/personas",
    "defaultModel": "sonnet",
    "team": [
      "orchestrator",
      "architect",
      "security-reviewer",
      "test-writer"
    ],
    "autoSpawn": false,
    "orchestrator": "orchestrator"
  },

  "skills": {
    "directory": ".rapid/skills",
    "definitions": {
      "review": {
        "name": "review",
        "description": "Security and quality review",
        "type": "spawn",
        "persona": "security-reviewer"
      }
    }
  },

  "secrets": {
    "provider": "1password",
    "vault": "Development",
    "items": {
      "ANTHROPIC_API_KEY": "op://Development/Anthropic/api-key",
      "GITHUB_TOKEN": "op://Development/GitHub/pat"
    }
  },

  "mcp": {
    "servers": {
      "rapid": {
        "enabled": true,
        "type": "remote",
        "url": "http://localhost:3100/mcp"
      },
      "github": {
        "enabled": true,
        "type": "remote",
        "url": "https://api.github.com/mcp",
        "headers": {
          "Authorization": "Bearer ${GITHUB_TOKEN}"
        }
      }
    }
  },

  "gateway": {
    "enabled": true,
    "mode": "managed",
    "budgets": {
      "project": {
        "max": 100,
        "duration": "30d",
        "alertAt": [75, 90]
      }
    }
  }
}
```

### Example 3: Multi-Provider Setup

Using multiple AI providers with fallbacks:

```json
{
  "$schema": "https://getrapid.dev/schema/v1/rapid.json",
  "version": "1.0",
  "name": "multi-provider",

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
        "envVars": ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]
      },
      "aider": {
        "cli": "aider",
        "envVars": ["OPENAI_API_KEY"],
        "args": ["--model", "gpt-4o"]
      }
    }
  },

  "secrets": {
    "provider": "1password",
    "vault": "Development",
    "items": {
      "ANTHROPIC_API_KEY": "op://Development/Anthropic/api-key",
      "OPENAI_API_KEY": "op://Development/OpenAI/api-key"
    }
  },

  "gateway": {
    "enabled": true,
    "type": "litellm",
    "mode": "managed",
    "fallback": "direct",
    "models": {
      "default": "claude-sonnet",
      "aliases": {
        "claude": "claude-sonnet",
        "gpt4": "gpt-4o"
      },
      "list": [
        {
          "modelName": "claude-sonnet",
          "provider": "anthropic",
          "model": "claude-3-5-sonnet-20250122",
          "apiKeyEnv": "ANTHROPIC_API_KEY",
          "priority": 1
        },
        {
          "modelName": "gpt-4o",
          "provider": "openai",
          "model": "gpt-4o-2024-11-20",
          "apiKeyEnv": "OPENAI_API_KEY",
          "priority": 2
        }
      ]
    }
  }
}
```

---

## Next Steps

- **[Quickstart Guide](quickstart.md)** - Get started with RAPID
- **[Multi-Agent System](../architecture/multi-agent-system.md)** - Learn about event bus and personas
- **[MCP Server Integration](mcp-integration.md)** - Extend agent capabilities
- **[CLI Reference](cli-reference.md)** - Complete command reference

## Related Documentation

- [HITL Workflow](../architecture/hitl-workflow.md) - Human-in-the-loop approvals
- [Error Handling Patterns](error-handling-patterns.md) - Error handling best practices
- [CLI Output Design](cli-output-design.md) - CLI UX standards
