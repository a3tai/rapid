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
  ExternalAuthSource,
  DetectedCredential,
  ExternalAuthConfig,
  AuthStatus,
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
export { logger, setLogLevel, getLogLevel, type LogLevel } from './logger.js';

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

// Secrets
export {
  hasOpCli,
  isOpAuthenticated,
  hasOpServiceAccountToken,
  getOpAuthStatus,
  hasVaultCli,
  isVaultAuthenticated,
  readOpSecret,
  readVaultSecret,
  verifySecret,
  verifySecrets,
  loadSecrets,
  generateEnvrc,
  writeEnvrc,
  hasEnvrc,
  readEnvrc,
  getProviderInfo,
  type SecretStatus,
  type SecretsStatus,
  type OpAuthStatus,
} from './secrets.js';

// External Auth
export {
  detectClaudeCodeAuth,
  detectCodexAuth,
  detectGeminiAuth,
  detectAiderAuth,
  detectEnvAuth,
  detectAllCredentials,
  getAuthStatus,
  getCredentialsForProvider,
  getAuthEnvironment,
  formatAuthStatus,
} from './external-auth.js';

// MCP
export {
  getMcpServers,
  getMcpServerStatus,
  addMcpServer,
  addMcpServerFromTemplate,
  removeMcpServer,
  enableMcpServer,
  disableMcpServer,
  generateMcpConfig,
  generateOpenCodeConfig,
  writeMcpConfig,
  writeOpenCodeConfig,
  hasMcpConfig,
  readMcpConfig,
  getMcpConfigPath,
  MCP_SERVER_TEMPLATES,
  getMcpTemplate,
  getMcpTemplateNames,
  getEasySetupTemplates,
  getRequiredSecrets,
  getSecretReferences,
  type McpServerDefinition,
  type McpServerInfo,
  type McpServerStatus,
  type GeneratedMcpConfig,
  type McpServerEntry,
  type OpenCodeConfig,
  type OpenCodeMcpEntry,
  type McpServerTemplate,
} from './mcp.js';
