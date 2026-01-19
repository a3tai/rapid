/**
 * RAPID MCP Server Types
 *
 * Type definitions for MCP tools, resources, and server configuration.
 */

import { z } from 'zod';

/**
 * Server configuration
 */
export interface RapidMcpServerConfig {
  /** Server name shown to clients */
  name: string;
  /** Server version */
  version: string;
  /** Project directory for context */
  projectDir: string;
  /** Daemon socket path (if connecting to existing daemon) */
  daemonSocketPath?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Transport type for the MCP server
 */
export type TransportType = 'stdio' | 'http';

// ============================================================================
// Tool Input/Output Schemas
// ============================================================================

/**
 * secure_exec tool input
 */
export const SecureExecInputSchema = z.object({
  command: z.string().describe('Command to execute'),
  args: z.array(z.string()).optional().describe('Command arguments'),
  cwd: z.string().optional().describe('Working directory'),
  timeout: z.number().default(120000).describe('Timeout in milliseconds'),
  allowNetwork: z.boolean().default(false).describe('Allow network access'),
});

export type SecureExecInput = z.infer<typeof SecureExecInputSchema>;

/**
 * secure_exec tool output
 */
export const SecureExecOutputSchema = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  sandboxed: z.boolean(),
  blockedDomains: z.array(z.string()).optional(),
  durationMs: z.number(),
});

export type SecureExecOutput = z.infer<typeof SecureExecOutputSchema>;

/**
 * fetch_via_proxy tool input
 */
export const FetchViaProxyInputSchema = z.object({
  url: z.string().url().describe('URL to fetch'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']).default('GET'),
  headers: z.record(z.string()).optional().describe('HTTP headers'),
  body: z.string().optional().describe('Request body'),
  timeout: z.number().default(30000).describe('Timeout in milliseconds'),
});

export type FetchViaProxyInput = z.infer<typeof FetchViaProxyInputSchema>;

/**
 * fetch_via_proxy tool output
 */
export const FetchViaProxyOutputSchema = z.object({
  status: z.number(),
  statusText: z.string(),
  headers: z.record(z.string()),
  body: z.string(),
  allowed: z.boolean(),
  domain: z.string(),
  durationMs: z.number(),
});

export type FetchViaProxyOutput = z.infer<typeof FetchViaProxyOutputSchema>;

/**
 * get_secret tool input
 */
export const GetSecretInputSchema = z.object({
  key: z.string().describe('Secret key name'),
  ttl: z.number().default(300).describe('Token TTL in seconds'),
});

export type GetSecretInput = z.infer<typeof GetSecretInputSchema>;

/**
 * get_secret tool output
 */
export const GetSecretOutputSchema = z.object({
  value: z.string().optional(),
  masked: z.string().describe('Masked value for logging (e.g., sk-...xyz)'),
  expiresAt: z.string().datetime().optional(),
  source: z.enum(['1password', 'vault', 'env', 'cache']),
  found: z.boolean(),
});

export type GetSecretOutput = z.infer<typeof GetSecretOutputSchema>;

/**
 * read_file tool input (scoped to project)
 */
export const ReadFileInputSchema = z.object({
  path: z.string().describe('Relative path within project'),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
  maxSize: z
    .number()
    .default(1024 * 1024)
    .describe('Maximum file size in bytes'),
});

export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;

/**
 * read_file tool output
 */
export const ReadFileOutputSchema = z.object({
  content: z.string(),
  size: z.number(),
  encoding: z.string(),
  mimeType: z.string().optional(),
});

export type ReadFileOutput = z.infer<typeof ReadFileOutputSchema>;

/**
 * write_file tool input (scoped to project)
 */
export const WriteFileInputSchema = z.object({
  path: z.string().describe('Relative path within project'),
  content: z.string().describe('File content'),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
  createDirs: z.boolean().default(true).describe('Create parent directories'),
});

export type WriteFileInput = z.infer<typeof WriteFileInputSchema>;

/**
 * write_file tool output
 */
export const WriteFileOutputSchema = z.object({
  written: z.boolean(),
  path: z.string(),
  size: z.number(),
});

export type WriteFileOutput = z.infer<typeof WriteFileOutputSchema>;

/**
 * check_security tool input
 */
export const CheckSecurityInputSchema = z.object({
  checks: z.array(z.enum(['secrets', 'dependencies', 'sast'])).default(['secrets', 'dependencies']),
  fix: z.boolean().default(false).describe('Attempt to fix issues'),
});

export type CheckSecurityInput = z.infer<typeof CheckSecurityInputSchema>;

/**
 * check_security tool output
 */
export const CheckSecurityOutputSchema = z.object({
  passed: z.boolean(),
  issues: z.array(
    z.object({
      type: z.enum(['secret', 'vulnerability', 'code']),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      message: z.string(),
      file: z.string().optional(),
      line: z.number().optional(),
      fixed: z.boolean().optional(),
    })
  ),
  summary: z.object({
    total: z.number(),
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
});

export type CheckSecurityOutput = z.infer<typeof CheckSecurityOutputSchema>;

// ============================================================================
// Resource Types
// ============================================================================

/**
 * RAPID config resource
 */
export interface ConfigResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/**
 * Context resource (assembled prompt context)
 */
export interface ContextResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/**
 * Status resource (daemon/sandbox status)
 */
export interface StatusResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

// ============================================================================
// Prompt Types
// ============================================================================

/**
 * RAPID methodology prompt
 */
export interface MethodologyPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}
