/**
 * @a3t/rapid-core
 * Core library for RAPID - AI-assisted development with dev containers
 */

// Types - Config types from schema, runtime types from core
export type {
  // Config types (from schema)
  RapidConfig,
  LimaConfig,
  ContainerConfig,
  SecretsConfig,
  EnvrcConfig,
  DotenvConfig,
  ExternalAuthSource,
  ExternalAuthConfig,
  AgentsConfig,
  AgentDefinition,
  ContextConfig,
  McpConfig,
  McpServerConfig,
  McpTransportType,
  SandboxMode,
  SandboxConfig,
  SandboxNetworkConfig,
  SandboxFilesystemConfig,
  GatewayConfig,
  GatewayConnectionConfig,
  GatewayModelConfig,
  GatewayBudgetConfig,
  BudgetLimit,
  EventBusConfig,
  EventBusRedisConfig,
  EventBusInjectionConfig,
  EventBusAutoCheckConfig,
  // Runtime types (from core)
  AgentStatus,
  EnvironmentStatus,
  DetectedCredential,
  AuthStatus,
  GatewayStatus,
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
  buildAgentArgs,
  agentReadsInstructionFiles,
  agentSupportsRuntimeInjection,
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

// System Messages
export {
  RAPID_METHODOLOGY,
  RAPID_METHODOLOGY_COMPACT,
  RAPID_PHASES,
  MCP_USAGE_GUIDELINES,
  GIT_GUIDELINES,
  CODE_EDITING_GUIDELINES,
  COMMUNICATION_GUIDELINES,
  DEBUGGING_GUIDELINES,
  generateRapidMethodology,
  getStandardAgentInstructions,
  generateFullSystemPrompt,
  type RapidPhase,
} from './system-messages.js';

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

// Formatting
export { formatJson, formatJsonSync } from './format.js';

// Context
export {
  assembleContext,
  readContextFile,
  readContextDirectory,
  matchesExcludePattern,
  isBinaryFile,
  formatContextContent,
  type ContextFileResult,
  type AssembledContext,
  type SkippedFile,
  type ContextAssemblyOptions,
} from './context.js';

// Gateway
export {
  GatewayManager,
  createGatewayManager,
  checkExternalGateway,
  DEFAULT_GATEWAY_CONFIG,
  GATEWAY_ENV_VARS,
  type CostRecord,
  type CostSummary,
  type BudgetConfig,
  type LiteLLMConfig,
} from './gateway.js';
