/**
 * Configuration loading and validation
 */

import { cosmiconfig } from 'cosmiconfig';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { RapidConfig } from './types.js';

const CONFIG_NAME = 'rapid';
const CONFIG_FILES = [
  'rapid.json',
  'rapid.config.json',
  '.rapidrc',
  '.rapidrc.json',
];

export interface LoadedConfig {
  config: RapidConfig;
  filepath: string;
  rootDir: string;
}

/**
 * Load RAPID configuration from the current directory or ancestors
 */
export async function loadConfig(cwd?: string): Promise<LoadedConfig | null> {
  const explorer = cosmiconfig(CONFIG_NAME, {
    searchPlaces: CONFIG_FILES,
    loaders: {
      '.json': async (filepath) => {
        const content = await readFile(filepath, 'utf-8');
        return JSON.parse(content);
      },
    },
  });

  const result = await explorer.search(cwd);
  
  if (!result || result.isEmpty) {
    return null;
  }

  return {
    config: result.config as RapidConfig,
    filepath: result.filepath,
    rootDir: dirname(result.filepath),
  };
}

/**
 * Load configuration from a specific file
 */
export async function loadConfigFromFile(filepath: string): Promise<LoadedConfig> {
  const content = await readFile(filepath, 'utf-8');
  const config = JSON.parse(content) as RapidConfig;
  
  return {
    config,
    filepath: resolve(filepath),
    rootDir: dirname(resolve(filepath)),
  };
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): RapidConfig {
  return {
    version: '1.0',
    agents: {
      default: 'claude',
      available: {
        claude: {
          cli: 'claude',
          instructionFile: 'CLAUDE.md',
          envVars: ['ANTHROPIC_API_KEY'],
        },
        opencode: {
          cli: 'opencode',
          instructionFile: 'AGENTS.md',
          envVars: ['ANTHROPIC_API_KEY'],
        },
        aider: {
          cli: 'aider',
          instructionFile: 'AGENTS.md',
          envVars: ['ANTHROPIC_API_KEY'],
          args: ['--model', 'claude-3-5-sonnet-20241022'],
        },
      },
    },
    secrets: {
      provider: 'env',
    },
    context: {
      files: ['README.md'],
      dirs: ['docs/'],
      generateAgentFiles: true,
    },
  };
}

/**
 * Merge user config with defaults
 */
export function mergeWithDefaults(config: Partial<RapidConfig>): RapidConfig {
  const defaults = getDefaultConfig();
  
  return {
    ...defaults,
    ...config,
    agents: {
      ...defaults.agents,
      ...config.agents,
      available: {
        ...defaults.agents.available,
        ...config.agents?.available,
      },
    },
    secrets: {
      ...defaults.secrets,
      ...config.secrets,
    },
    context: {
      ...defaults.context,
      ...config.context,
    },
  };
}
