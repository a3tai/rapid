/**
 * CLI Adapters
 *
 * Exports all supported CLI adapters for multi-tool agent support.
 */

export { ClaudeAdapter } from './claude.js';
export { GeminiAdapter } from './gemini.js';
export { AiderAdapter } from './aider.js';
export { OpenCodeAdapter } from './opencode.js';

import type { AgentTool, CliAdapter } from '../types.js';
import { ClaudeAdapter } from './claude.js';
import { GeminiAdapter } from './gemini.js';
import { AiderAdapter } from './aider.js';
import { OpenCodeAdapter } from './opencode.js';

/**
 * Get the appropriate CLI adapter for a given tool
 */
export function getAdapter(tool: AgentTool): CliAdapter {
  switch (tool) {
    case 'claude':
      return new ClaudeAdapter();
    case 'gemini':
      return new GeminiAdapter();
    case 'aider':
      return new AiderAdapter();
    case 'opencode':
      return new OpenCodeAdapter();
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

/**
 * Check which tools are available on the system
 */
export async function getAvailableTools(): Promise<AgentTool[]> {
  const adapters: CliAdapter[] = [
    new ClaudeAdapter(),
    new GeminiAdapter(),
    new AiderAdapter(),
    new OpenCodeAdapter(),
  ];

  const results = await Promise.all(
    adapters.map(async (adapter) => ({
      name: adapter.name,
      available: await adapter.isAvailable(),
    }))
  );

  return results
    .filter((r) => r.available)
    .map((r) => r.name);
}
