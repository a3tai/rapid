# @a3t/rapid-schema

JSON schema and TypeScript types for RAPID configuration.

This package provides the JSON schema and TypeScript type definitions for `rapid.json` configuration files, enabling IDE autocompletion and validation.

## Features

- 📋 **JSON Schema** - Full JSON Schema for `rapid.json` validation
- 🎯 **TypeScript Types** - Comprehensive TypeScript interfaces
- ✨ **IDE Support** - Autocompletion in VS Code and other IDEs
- 🔍 **Validation** - JSON Schema validation support

## Installation

```bash
npm install @a3t/rapid-schema
```

## Usage

### TypeScript Types

```typescript
import type {
  RapidConfig,
  ContainerConfig,
  AgentsConfig,
  AgentDefinition,
  SecretsConfig,
  ContextConfig,
  McpConfig,
  McpServerConfig,
} from '@a3t/rapid-schema';

const config: RapidConfig = {
  version: '1.0',
  name: 'my-project',
  agents: {
    default: 'claude',
    available: {
      claude: {
        cli: 'claude',
        instructionFile: 'CLAUDE.md',
        envVars: ['ANTHROPIC_API_KEY'],
      },
    },
  },
};
```

### JSON Schema Import

```javascript
import schema from '@a3t/rapid-schema/schema';
// or
import schema from '@a3t/rapid-schema/rapid.schema.json';
```

### IDE Setup

To enable autocompletion in your `rapid.json`, add the `$schema` property:

```json
{
  "$schema": "https://unpkg.com/@a3t/rapid-schema@latest/dist/rapid.schema.json",
  "version": "1.0",
  "name": "my-project",
  "agents": {
    "default": "claude",
    "available": {}
  }
}
```

## Configuration Structure

### Root Properties

| Property    | Type   | Required | Description                     |
| ----------- | ------ | -------- | ------------------------------- |
| `version`   | string | Yes      | Schema version (`"1.0"`)        |
| `name`      | string | No       | Project name                    |
| `container` | object | No       | Container configuration         |
| `agents`    | object | Yes      | AI agents configuration         |
| `secrets`   | object | No       | Secret management configuration |
| `context`   | object | No       | Context file settings           |
| `mcp`       | object | No       | MCP server configuration        |

### Container Configuration

```typescript
interface ContainerConfig {
  devcontainer?: string; // Path to devcontainer.json
  compose?: string; // Docker Compose file
  autoStart?: boolean; // Auto-start on `rapid dev`
  buildArgs?: Record<string, string>;
}
```

### Agents Configuration

```typescript
interface AgentsConfig {
  default: string; // Default agent name
  available: Record<string, AgentDefinition>; // Available agents
}

interface AgentDefinition {
  cli: string; // CLI command to execute
  instructionFile?: string; // Path to instruction file
  envVars?: string[]; // Required environment variables
  installCmd?: string; // Installation command
  args?: string[]; // Additional CLI arguments
}
```

### Secrets Configuration

```typescript
interface SecretsConfig {
  provider?: '1password' | 'vault' | 'env'; // Secret provider
  vault?: string; // Vault name/path
  address?: string; // Vault server address
  items?: Record<string, string>; // Secret references
  envrc?: EnvrcConfig;
  dotenv?: DotenvConfig;
}

interface EnvrcConfig {
  generate?: boolean; // Auto-generate .envrc
  path?: string; // Path to .envrc file
  includeLocal?: boolean;
}

interface DotenvConfig {
  enabled?: boolean; // Load .env files
  files?: string[]; // .env files to load
  warn?: boolean; // Warn about .env usage
}
```

### Context Configuration

```typescript
interface ContextConfig {
  files?: string[]; // Files to include in context
  dirs?: string[]; // Directories to include
  exclude?: string[]; // Patterns to exclude
  generateAgentFiles?: boolean; // Auto-generate AGENTS.md, CLAUDE.md
  templateDir?: string; // Custom template directory
  preserve?: string[]; // Files to preserve during generation
}
```

### MCP Configuration

```typescript
interface McpConfig {
  configFile?: string; // MCP config file path
  servers?: Record<string, McpServerConfig>; // MCP servers
}

interface McpServerConfig {
  enabled?: boolean; // Enable this server
  [key: string]: unknown; // Server-specific config
}
```

## Complete Example

```json
{
  "$schema": "https://unpkg.com/@a3t/rapid-schema@latest/dist/rapid.schema.json",
  "version": "1.0",
  "name": "my-project",
  "container": {
    "devcontainer": ".devcontainer/devcontainer.json",
    "autoStart": true,
    "buildArgs": {
      "NODE_VERSION": "20"
    }
  },
  "agents": {
    "default": "claude",
    "available": {
      "claude": {
        "cli": "claude",
        "instructionFile": "CLAUDE.md",
        "envVars": ["ANTHROPIC_API_KEY"],
        "installCmd": "npm install -g @anthropic-ai/claude-code"
      },
      "opencode": {
        "cli": "opencode",
        "instructionFile": "AGENTS.md",
        "envVars": ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
        "installCmd": "npm install -g opencode"
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
  "context": {
    "files": ["README.md", "CONTRIBUTING.md"],
    "dirs": ["docs/", "src/"],
    "exclude": ["docs/internal/"],
    "generateAgentFiles": true
  },
  "mcp": {
    "configFile": ".mcp.json",
    "servers": {
      "filesystem": {
        "enabled": true
      },
      "github": {
        "enabled": true,
        "repo": "${localEnv:GITHUB_REPOSITORY}"
      }
    }
  }
}
```

## Variable Substitution

Configuration values support variable substitution:

| Variable                     | Description                         |
| ---------------------------- | ----------------------------------- |
| `${env:VAR}`                 | Environment variable from container |
| `${localEnv:VAR}`            | Environment variable from host      |
| `${workspaceFolder}`         | Absolute path to project root       |
| `${workspaceFolderBasename}` | Project directory name              |

## See Also

- [@a3t/rapid](https://www.npmjs.com/package/@a3t/rapid) - CLI tool
- [@a3t/rapid-core](https://www.npmjs.com/package/@a3t/rapid-core) - Core library
- [RAPID Documentation](https://getrapid.dev)
- [rapid.json Specification](https://github.com/a3tai/rapid/docs/reference/rapid.json-spec.md)

## License

MIT © 2026 Rude Company LLC
