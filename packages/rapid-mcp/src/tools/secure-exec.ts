/**
 * secure_exec Tool
 *
 * Execute commands inside RAPID sandbox with policy enforcement.
 * Uses the runtime package's sandbox manager for platform-native isolation.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execa } from 'execa';
import { SandboxManager, type SandboxManagerOptions } from '@a3t/rapid-runtime';
import type { ServerContext } from '../server.js';

/**
 * Sandbox preset mapping from our API to runtime API
 */
const PRESET_MAP = {
  strict: 'strict',
  balanced: 'standard',
  permissive: 'permissive',
  none: 'development',
} as const;

/**
 * Input schema for secure_exec tool
 */
const inputSchema = {
  command: z.string().describe('Command to execute'),
  args: z.array(z.string()).optional().describe('Command arguments'),
  cwd: z.string().optional().describe('Working directory (relative to project)'),
  timeout: z.number().default(120000).describe('Timeout in milliseconds'),
  allowNetwork: z.boolean().default(false).describe('Allow network access'),
  sandbox: z
    .enum(['strict', 'balanced', 'permissive', 'none'])
    .default('balanced')
    .describe('Sandbox preset'),
};

/**
 * Output schema for secure_exec tool
 */
const outputSchema = {
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  sandboxed: z.boolean(),
  sandboxMethod: z.string().optional(),
  blockedDomains: z.array(z.string()).optional(),
  durationMs: z.number(),
};

/**
 * Register the secure_exec tool with the MCP server
 */
export function registerSecureExecTool(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'secure_exec',
    {
      title: 'Secure Command Execution',
      description:
        'Execute a command inside the RAPID sandbox with policy enforcement. ' +
        'Commands are isolated using platform-native sandboxing (Seatbelt on macOS, Bubblewrap on Linux). ' +
        'Network access is denied by default. Filesystem access is restricted to the project directory.',
      inputSchema,
      outputSchema,
    },
    async (args) => {
      const startTime = Date.now();
      const {
        command,
        args: cmdArgs = [],
        cwd,
        timeout,
        allowNetwork,
        sandbox: sandboxPreset,
      } = args as {
        command: string;
        args?: string[];
        cwd?: string;
        timeout: number;
        allowNetwork: boolean;
        sandbox: 'strict' | 'balanced' | 'permissive' | 'none';
      };

      // Resolve working directory
      const workingDir = cwd
        ? cwd.startsWith('/')
          ? cwd
          : `${context.projectDir}/${cwd}`
        : context.projectDir;

      const blockedDomains: string[] = [];
      let exitCode = 1;
      let stdout = '';
      let stderr = '';
      let sandboxed = false;
      let sandboxMethod: string | undefined;

      try {
        if (sandboxPreset === 'none') {
          // Execute without sandboxing (for trusted commands)
          const execResult = await execa(command, cmdArgs, {
            cwd: workingDir,
            timeout,
            reject: false,
            env: {
              ...process.env,
              RAPID_PROJECT_DIR: context.projectDir,
            },
          });

          exitCode = execResult.exitCode ?? 1;
          stdout = execResult.stdout || '';
          stderr = execResult.stderr || '';
        } else {
          // Build sandbox manager options
          const managerOptions: SandboxManagerOptions = {
            cwd: workingDir,
            verbose: context.verbose,
            onNetworkBlock: (domain: string) => {
              blockedDomains.push(domain);
            },
          };

          // Map our preset to runtime preset
          const runtimePreset = PRESET_MAP[sandboxPreset];

          // Create sandbox manager from preset
          const manager = SandboxManager.fromPreset(runtimePreset, managerOptions);

          // If network is allowed, we use permissive preset instead
          let effectiveManager = manager;
          if (allowNetwork && sandboxPreset !== 'permissive') {
            effectiveManager = SandboxManager.fromPreset('permissive', managerOptions);
          }

          // Initialize and execute
          await effectiveManager.initialize();

          const fullCommand = [command, ...cmdArgs];
          const execResult = await effectiveManager.execute(fullCommand, {
            stdin: 'pipe',
            stdout: 'pipe',
            stderr: 'pipe',
            env: {
              RAPID_PROJECT_DIR: context.projectDir,
            },
          });

          exitCode = execResult.exitCode;
          stdout = execResult.stdout || '';
          stderr = execResult.stderr || '';
          sandboxed = true;
          sandboxMethod = await SandboxManager.getMethod();

          // Shutdown the manager
          await effectiveManager.shutdown();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        stderr = `Sandbox execution failed: ${errorMessage}`;
      }

      const durationMs = Date.now() - startTime;

      const output = {
        exitCode,
        stdout,
        stderr,
        sandboxed,
        sandboxMethod,
        blockedDomains: blockedDomains.length > 0 ? blockedDomains : undefined,
        durationMs,
      };

      // Log if verbose
      if (context.verbose) {
        console.error(`[secure_exec] ${command} ${cmdArgs.join(' ')}`);
        console.error(`[secure_exec] Exit code: ${exitCode}, Duration: ${durationMs}ms`);
        if (blockedDomains.length > 0) {
          console.error(`[secure_exec] Blocked domains: ${blockedDomains.join(', ')}`);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(output, null, 2),
          },
        ],
        structuredContent: output,
      };
    }
  );
}
