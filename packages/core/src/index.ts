/**
 * @a3t/rapid-core
 * Core library for RAPID - AI-assisted development with dev containers
 */

// Types
export type {
  RapidConfig,
  ContainerConfig,
  SecretsConfig,
  EnvrcConfig,
  DotenvConfig,
  AgentsConfig,
  AgentDefinition,
  ContextConfig,
  McpConfig,
  McpServerConfig,
  AgentStatus,
  EnvironmentStatus,
} from './types.js';

// Config
export {
  loadConfig,
  loadConfigFromFile,
  getDefaultConfig,
  mergeWithDefaults,
  type LoadedConfig,
} from './config.js';

// Agents
export {
  checkAgentAvailable,
  checkAllAgents,
  getDefaultAgent,
  getAgent,
  launchAgent,
} from './agents.js';

// Logger
export {
  logger,
  setLogLevel,
  getLogLevel,
  type LogLevel,
} from './logger.js';

// Container
export {
  hasDevcontainerCli,
  hasDocker,
  getDevcontainerPath,
  loadDevcontainerConfig,
  getContainerName,
  getContainerStatus,
  startContainer,
  stopContainer,
  execInContainer,
  type ContainerStatus,
  type DevcontainerConfig,
} from './container.js';
