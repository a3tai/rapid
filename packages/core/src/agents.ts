/**
 * Agent detection and management
 */

import { execa } from 'execa';
import which from 'which';
import type { AgentDefinition, AgentStatus, RapidConfig, ExternalAuthConfig } from './types.js';
import { getAuthEnvironment } from './external-auth.js';
import { getStandardAgentInstructions } from './system-messages.js';

/**
 * Check if an agent CLI is available
 */
export async function checkAgentAvailable(agent: AgentDefinition): Promise<AgentStatus> {
  try {
    const cliPath = await which(agent.cli);

    // Try to get version
    let version: string | undefined;
    try {
      const result = await execa(agent.cli, ['--version'], { timeout: 5000 });
      version = result.stdout.trim().split('\n')[0];
    } catch {
      // Version check failed, but CLI exists
    }

    return {
      name: agent.cli,
      available: true,
      cliPath,
      ...(version !== undefined && { version }),
    };
  } catch {
    return {
      name: agent.cli,
      available: false,
    };
  }
}

/**
 * Check all configured agents
 */
export async function checkAllAgents(config: RapidConfig): Promise<AgentStatus[]> {
  const results: AgentStatus[] = [];

  for (const [name, agent] of Object.entries(config.agents.available)) {
    const status = await checkAgentAvailable(agent);
    results.push({
      ...status,
      name,
    });
  }

  return results;
}

/**
 * Get the default agent from config
 */
export function getDefaultAgent(config: RapidConfig): AgentDefinition | null {
  const defaultName = config.agents.default;
  return config.agents.available[defaultName] || null;
}

/**
 * Get a specific agent by name
 */
export function getAgent(config: RapidConfig, name: string): AgentDefinition | null {
  return config.agents.available[name] || null;
}

/**
 * Build agent arguments with optional system prompt injection.
 * For agents that support CLI-based system prompt injection (like Claude),
 * this appends the RAPID methodology to the args.
 */
export function buildAgentArgs(
  agent: AgentDefinition,
  options?: {
    /** Include system prompt injection if agent supports it */
    injectSystemPrompt?: boolean;
    /** Use compact methodology (shorter) */
    compactPrompt?: boolean;
    /** Custom system prompt to use instead of default RAPID methodology */
    customPrompt?: string;
  }
): string[] {
  const baseArgs = [...(agent.args ?? [])];

  // YOLO mode: add --dangerously-skip-permissions for Claude
  if (agent.yolo && agent.cli === 'claude') {
    baseArgs.push('--dangerously-skip-permissions');
  }

  // If agent doesn't support CLI system prompt injection, or injection is disabled
  if (!agent.systemPromptArg || options?.injectSystemPrompt === false) {
    return baseArgs;
  }

  // Get the system prompt content
  const instructionOptions: Parameters<typeof getStandardAgentInstructions>[0] = {
    includeRapid: true,
    includeMcp: true,
    includeGit: true,
    includeCodeEditing: true,
  };
  if (options?.compactPrompt) {
    instructionOptions.compact = true;
  }
  const promptContent = options?.customPrompt ?? getStandardAgentInstructions(instructionOptions);

  // Parse the systemPromptArg pattern and build the args
  // Pattern can be like "--append-system-prompt {prompt}" or "--system-prompt-file {prompt}"
  const pattern = agent.systemPromptArg;

  if (pattern.includes('{prompt}')) {
    // Replace {prompt} with actual content
    const parts = pattern.split(/\s+/);
    const injectedArgs: string[] = [];

    for (const part of parts) {
      if (part === '{prompt}') {
        injectedArgs.push(promptContent);
      } else if (part.includes('{prompt}')) {
        // Handle cases like "--flag={prompt}"
        injectedArgs.push(part.replace('{prompt}', promptContent));
      } else {
        injectedArgs.push(part);
      }
    }

    return [...baseArgs, ...injectedArgs];
  }

  // Fallback: assume pattern is just a flag and prompt goes after
  return [...baseArgs, pattern, promptContent];
}

/**
 * Check if an agent reads instruction files from the filesystem.
 * These agents (like OpenCode) read AGENTS.md automatically.
 */
export function agentReadsInstructionFiles(agent: AgentDefinition): boolean {
  // Explicitly set
  if (agent.readsInstructionFiles !== undefined) {
    return agent.readsInstructionFiles;
  }

  // Infer from CLI name for known agents
  const cli = agent.cli.toLowerCase();
  if (cli === 'opencode' || cli === 'cursor' || cli === 'codex') {
    return true;
  }

  // Default: if no systemPromptArg is defined and has instructionFile, assume it reads files
  if (!agent.systemPromptArg && agent.instructionFile) {
    return true;
  }

  return false;
}

/**
 * Check if an agent supports runtime system prompt injection via CLI.
 */
export function agentSupportsRuntimeInjection(agent: AgentDefinition): boolean {
  return !!agent.systemPromptArg;
}

/**
 * Launch an agent CLI
 */
export async function launchAgent(
  agent: AgentDefinition,
  options: {
    cwd?: string;
    env?: Record<string, string>;
    stdio?: 'inherit' | 'pipe';
    useExternalAuth?: boolean;
    externalAuthConfig?: ExternalAuthConfig;
  } = {}
): Promise<void> {
  const args = agent.args ?? [];
  const cwd = options.cwd ?? process.cwd();

  // Get external auth environment if enabled
  let authEnv: Record<string, string> = {};
  if (options.useExternalAuth !== false) {
    authEnv = await getAuthEnvironment(options.externalAuthConfig);
  }

  await execa(agent.cli, args, {
    cwd,
    env: {
      ...process.env,
      ...authEnv,
      ...options.env, // User-provided env takes precedence
    },
    stdio: options.stdio ?? 'inherit',
  });
}
