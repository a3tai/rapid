import { useState, useCallback, useEffect } from 'react';
import { useAsyncOperation } from './useAsyncOperation';
import { AppError } from '../utils/errorHandling';
import * as AppService from '@bindings/rapid-desktop/appservice';

// Agent configuration
export interface AgentConfig {
  cli: string;
  instructionFile?: string;
  yolo?: boolean;
  envVars?: string[];
  args?: string[];
  readsInstructionFiles?: boolean;
}

// Secrets configuration
export interface SecretsConfig {
  provider: '1password' | 'vault' | 'env';
  vault?: string;
  items?: Record<string, string>;
}

// MCP server configuration
export interface McpServerConfig {
  enabled?: boolean;
  type: 'stdio' | 'remote';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
}

// Security configuration
export interface SecurityConfig {
  trustLevel?: 'development' | 'staging' | 'production';
  strictMode?: boolean;
  humanApproval?: {
    enabled: boolean;
    timeout?: number;
    timeoutBehavior?: 'deny' | 'allow';
    actions?: Array<{
      pattern: string;
      requireApproval: boolean;
      exemptRoles?: string[];
      description?: string;
    }>;
    notify?: {
      eventBus?: boolean;
      desktop?: boolean;
    };
  };
  toolAcls?: Array<{
    tool: string;
    allowedRoles: string[];
    alwaysRequireApproval?: boolean;
    requireApprovalFor?: string[];
    rateLimit?: number;
  }>;
  audit?: {
    enabled: boolean;
    events?: string[];
    destination?: 'file' | 'redis' | 'both';
    logFile?: string;
    retentionDays?: number;
  };
  perAgentBudget?: number;
  perSessionBudget?: number;
  sandbox?: {
    enabled: boolean;
    mode?: 'auto' | 'strict' | 'permissive';
    network?: {
      enabled: boolean;
      allowedDomains?: string[];
      proxyPort?: number;
      socksPort?: number;
    };
    filesystem?: {
      readOnlyRoot?: boolean;
      writePaths?: string[];
    };
  };
  budgets?: {
    enabled: boolean;
    alerts?: number[];
  };
}

// Full rapid.json configuration
export interface RapidConfig {
  $schema?: string;
  version?: string;
  name?: string;
  agents?: {
    default?: string;
    available?: Record<string, AgentConfig>;
  };
  secrets?: SecretsConfig;
  context?: {
    files?: string[];
    generateAgentFiles?: boolean;
  };
  gateway?: {
    enabled?: boolean;
    mode?: 'managed' | 'proxy' | 'disabled';
  };
  mcp?: {
    configFile?: string;
    servers?: Record<string, McpServerConfig>;
  };
  eventBus?: {
    enabled?: boolean;
  };
  security?: SecurityConfig;
  // Legacy fields for backward compatibility
  project?: {
    name?: string;
    root?: string;
    description?: string;
  };
  sandbox?: {
    enabled?: boolean;
    preset?: 'strict' | 'balanced' | 'permissive' | 'none';
    allowNetwork?: boolean;
  };
  personas?: Record<string, {
    systemPrompt?: string;
    capabilities?: string[];
  }>;
}

/**
 * Hook for loading and managing configuration
 */
export function useConfig() {
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<AppError | null>(null);

  // Load config from Go backend
  const {
    data: configData,
    loading,
    error,
    execute: loadConfig,
  } = useAsyncOperation<Record<string, unknown>>(
    async () => {
      const result = await AppService.GetConfig();
      if (!result) {
        throw new AppError('No config returned', 'CONFIG_ERROR', 'warning', false);
      }
      return result;
    },
    { maxAttempts: 2, initialDelayMs: 500 }
  );

  // The raw config from Go backend is already the correct shape
  // Just cast it to our typed interface
  const config: RapidConfig | null = configData as RapidConfig | null;

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = useCallback(async (updatedConfig: RapidConfig) => {
    setSaving(true);
    setSaveError(null);

    try {
      // Convert typed config back to raw format for saving
      const rawConfig: Record<string, unknown> = {
        ...updatedConfig,
      };

      await AppService.SaveConfig(rawConfig);
      setIsDirty(false);
      setSaving(false);
      return true;
    } catch (err) {
      const appError =
        err instanceof AppError ? err : new AppError(String(err), 'UNKNOWN_ERROR', 'error', false);
      setSaveError(appError);
      setSaving(false);
      return false;
    }
  }, []);

  return {
    config,
    loading,
    error,
    saving,
    saveError,
    isDirty,
    setIsDirty,
    loadConfig,
    saveConfig: handleSave,
  };
}

/**
 * Hook for validating configuration
 */
export function useConfigValidation() {
  const validate = useCallback((config: RapidConfig | null): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!config) return errors;

    // Name validation
    if (!config.name?.trim()) {
      errors['name'] = 'Project name is required';
    }

    // Agents validation
    if (config.agents?.available) {
      Object.entries(config.agents.available).forEach(([name, agent]) => {
        if (!agent.cli?.trim()) {
          errors[`agents.available.${name}.cli`] = 'CLI command is required';
        }
      });
    }

    // MCP validation
    if (config.mcp?.servers) {
      Object.entries(config.mcp.servers).forEach(([name, server]) => {
        if (server.type === 'stdio' && !server.command?.trim()) {
          errors[`mcp.servers.${name}.command`] = 'Command is required for stdio servers';
        }
        if (server.type === 'remote' && !server.url?.trim()) {
          errors[`mcp.servers.${name}.url`] = 'URL is required for remote servers';
        }
      });
    }

    // Security validation
    if (config.security?.perAgentBudget !== undefined && config.security.perAgentBudget < 0) {
      errors['security.perAgentBudget'] = 'Budget must be positive';
    }
    if (config.security?.perSessionBudget !== undefined && config.security.perSessionBudget < 0) {
      errors['security.perSessionBudget'] = 'Budget must be positive';
    }

    return errors;
  }, []);

  return { validate };
}
