/**
 * Agent detection and management
 */

import { execa } from 'execa';
import which from 'which';
import type { AgentDefinition, AgentStatus, RapidConfig, ExternalAuthConfig } from './types.js';
import { getAuthEnvironment } from './external-auth.js';

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
