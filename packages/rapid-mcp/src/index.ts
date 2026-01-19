/**
 * RAPID MCP Server
 *
 * MCP server exposing RAPID sandbox and governance capabilities to AI agents.
 *
 * @packageDocumentation
 */

// Types
export type {
  RapidMcpServerConfig,
  TransportType,
  SecureExecInput,
  SecureExecOutput,
  FetchViaProxyInput,
  FetchViaProxyOutput,
  GetSecretInput,
  GetSecretOutput,
  ReadFileInput,
  ReadFileOutput,
  WriteFileInput,
  WriteFileOutput,
  CheckSecurityInput,
  CheckSecurityOutput,
  ConfigResource,
  ContextResource,
  StatusResource,
  MethodologyPrompt,
} from './types.js';

export {
  SecureExecInputSchema,
  SecureExecOutputSchema,
  FetchViaProxyInputSchema,
  FetchViaProxyOutputSchema,
  GetSecretInputSchema,
  GetSecretOutputSchema,
  ReadFileInputSchema,
  ReadFileOutputSchema,
  WriteFileInputSchema,
  WriteFileOutputSchema,
  CheckSecurityInputSchema,
  CheckSecurityOutputSchema,
} from './types.js';

// Server
export {
  createRapidMcpServer,
  startRapidMcpServer,
  runStdio,
  runHttp,
  type ServerContext,
} from './server.js';

// Tools (for direct use if needed)
export { registerSecureExecTool } from './tools/secure-exec.js';
export { registerFetchViaProxyTool } from './tools/fetch.js';
export { registerGetSecretTool } from './tools/secrets.js';
export { registerFilesystemTools } from './tools/filesystem.js';
export { registerSecurityTools } from './tools/security.js';

// Resources
export { registerConfigResource } from './resources/config.js';
export { registerContextResource } from './resources/context.js';
export { registerStatusResource } from './resources/status.js';

// Prompts
export { registerMethodologyPrompt } from './prompts/rapid-methodology.js';
