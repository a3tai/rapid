import { useState, useCallback, useEffect } from 'react';
import { useAsyncOperation } from './useAsyncOperation';
import { AppError } from '../utils/errorHandling';
import * as AppService from '@bindings/rapid-desktop/appservice';

export interface RapidConfig {
  $schema?: string;
  project: {
    name: string;
    root: string;
    description?: string;
  };
  sandbox: {
    enabled: boolean;
    preset: 'strict' | 'balanced' | 'permissive' | 'none';
    allowNetwork: boolean;
  };
  secrets?: {
    provider: string;
  };
  personas?: Record<
    string,
    {
      systemPrompt: string;
      capabilities: string[];
    }
  >;
  mcp?: {
    servers?: Record<
      string,
      {
        command: string;
        args?: string[];
      }
    >;
  };
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

  // Transform raw config to typed config
  const config: RapidConfig | null = configData
    ? {
        $schema: configData.$schema as string | undefined,
        project: {
          name: (configData.project as Record<string, unknown>)?.name as string,
          root: (configData.project as Record<string, unknown>)?.root as string,
          description: (configData.project as Record<string, unknown>)?.description as
            | string
            | undefined,
        },
        sandbox: {
          enabled: ((configData.sandbox as Record<string, unknown>)?.enabled as boolean) ?? false,
          preset:
            ((configData.sandbox as Record<string, unknown>)?.preset as
              | 'strict'
              | 'balanced'
              | 'permissive'
              | 'none') ?? 'balanced',
          allowNetwork:
            ((configData.sandbox as Record<string, unknown>)?.allowNetwork as boolean) ?? false,
        },
        secrets: configData.secrets as { provider: string } | undefined,
        personas:
          (configData.personas as Record<
            string,
            { systemPrompt: string; capabilities: string[] }
          >) || undefined,
        mcp:
          (configData.mcp as { servers?: Record<string, { command: string; args?: string[] }> }) ||
          undefined,
      }
    : null;

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

    // Project validation
    if (!config.project?.name?.trim()) {
      errors['project.name'] = 'Project name is required';
    }
    if (!config.project?.root?.trim()) {
      errors['project.root'] = 'Project root directory is required';
    }

    // Persona validation
    if (config.personas) {
      Object.entries(config.personas).forEach(([name, persona]) => {
        if (!persona.systemPrompt?.trim()) {
          errors[`personas.${name}.systemPrompt`] = 'System prompt is required';
        }
        if (!persona.capabilities || persona.capabilities.length === 0) {
          errors[`personas.${name}.capabilities`] = 'At least one capability is required';
        }
      });
    }

    // MCP validation
    if (config.mcp?.servers) {
      Object.entries(config.mcp.servers).forEach(([name, server]) => {
        if (!server.command?.trim()) {
          errors[`mcp.servers.${name}.command`] = 'Command is required';
        }
      });
    }

    return errors;
  }, []);

  return { validate };
}
