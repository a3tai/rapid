# @a3t/rapid-core

Core library for RAPID - AI-assisted development with dev containers.

This package provides the foundational utilities for orchestrating AI coding assistants within containerized development environments.

## Features

- 🐳 **Dev Container Management** - Control containerized environments via devcontainer CLI
- 🤖 **Agent Configuration** - Manage multiple AI coding assistants (Claude Code, OpenCode, Aider, etc.)
- 🔐 **Secret Management** - Integration with 1Password and Vault for credential handling
- 🔌 **MCP Server Support** - Model Context Protocol integration for external tools and APIs
- ⚙️ **Configuration Loading** - Smart configuration resolution with cosmiconfig
- 🔍 **External Auth Detection** - Detect credentials from external AI tools

## Installation

```bash
npm install @a3t/rapid-core
```

## Usage

### Loading Configuration

```typescript
import { loadConfig } from '@a3t/rapid-core';

const { config, rootDir } = await loadConfig();
console.log(config.agents.default); // 'claude'
```

### Managing Containers

```typescript
import { getContainerStatus, startContainer, execInContainer } from '@a3t/rapid-core';

// Check if container is running
const status = await getContainerStatus(projectRoot, config);

// Start container
const result = await startContainer(projectRoot, config);

// Execute command in container
await execInContainer(projectRoot, ['claude'], config);
```

### Agent Detection

```typescript
import { checkAllAgents, getAgent, launchAgent } from '@a3t/rapid-core';

// Check installed agents
const agents = await checkAllAgents(config);

// Get specific agent
const claude = getAgent(config, 'claude');

// Launch agent
await launchAgent(claude, { cwd: projectRoot });
```

### External Authentication

```typescript
import { detectClaudeCodeAuth, detectAllCredentials, getAuthStatus } from '@a3t/rapid-core';

// Detect Claude Code credentials
const claudeAuth = await detectClaudeCodeAuth();

// Detect all credentials from external tools
const credentials = await detectAllCredentials();

// Get authentication status
const authStatus = await getAuthStatus();
```

## API Reference

### Configuration

- `loadConfig(cwd?)` - Load RAPID configuration from cosmiconfig search
- `loadConfigFromFile(filepath)` - Load configuration from specific file
- `getDefaultConfig()` - Get default configuration
- `mergeWithDefaults(config)` - Merge user config with defaults

### Container Management

- `hasDevcontainerCli()` - Check if devcontainer CLI is installed
- `hasDocker()` - Check if Docker is available
- `getContainerStatus(rootDir, config)` - Get current container status
- `startContainer(rootDir, config, options)` - Start dev container
- `stopContainer(rootDir, config, options)` - Stop dev container
- `execInContainer(rootDir, command, config, options)` - Execute command in container

### Agent Management

- `checkAgentAvailable(agent)` - Check if agent CLI is installed
- `checkAllAgents(config)` - Check all configured agents
- `getDefaultAgent(config)` - Get default agent from config
- `getAgent(config, name)` - Get specific agent by name
- `launchAgent(agent, options)` - Launch agent CLI

### Authentication

- `detectClaudeCodeAuth()` - Detect Claude Code credentials
- `detectCodexAuth()` - Detect OpenAI Codex credentials
- `detectGeminiAuth()` - Detect Google Gemini credentials
- `detectAiderAuth()` - Detect Aider API keys
- `detectEnvAuth()` - Detect API keys from environment
- `detectAllCredentials(config)` - Detect all available credentials
- `getAuthStatus(config)` - Get authentication status summary
- `getCredentialsForProvider(provider, config)` - Get credentials for specific provider
- `getAuthEnvironment(config)` - Get environment variables for detected credentials

## Types

```typescript
import type {
  RapidConfig,
  ContainerConfig,
  AgentsConfig,
  AgentDefinition,
  SecretsConfig,
  ContextConfig,
  McpConfig,
  DetectedCredential,
  AuthStatus,
} from '@a3t/rapid-core';
```

## Configuration File Format

See [rapid.json Specification](../../docs/reference/rapid.json-spec.md) for complete configuration reference.

## Logger

```typescript
import { logger, setLogLevel } from '@a3t/rapid-core';

// Set log level
setLogLevel('debug'); // 'debug' | 'info' | 'warn' | 'error'

// Log messages
logger.info('Information message');
logger.warn('Warning message');
logger.error('Error message');
logger.success('Success message');
logger.blank(); // Empty line
```

## Error Handling

Most async functions return success/error objects rather than throwing:

```typescript
const result = await startContainer(rootDir, config);
if (!result.success) {
  console.error(result.error);
}
```

## See Also

- [@a3t/rapid](https://www.npmjs.com/package/@a3t/rapid) - CLI tool
- [@a3t/rapid-schema](https://www.npmjs.com/package/@a3t/rapid-schema) - JSON schema
- [RAPID Documentation](https://getrapid.dev)

## License

MIT © 2026 Rude Company LLC
