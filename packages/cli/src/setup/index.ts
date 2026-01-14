/**
 * RAPID Setup Wizard
 *
 * Interactive setup wizard using @clack/prompts for a beautiful TUI.
 * Configures devcontainer, MCP servers, secrets provider, and git signing.
 *
 * Design principles:
 * - Opt-out by default: all features are selected, user unchecks what they don't want
 * - No host dependency installation: everything lives in devcontainer
 * - SSH agent forwarding: secure commit signing without exposing private keys
 */

import * as p from '@clack/prompts';
import { MCP_SERVER_TEMPLATES } from '@a3t/rapid-core';
import { getPlatformInfo, checkRequirements, type PlatformInfo } from './platform.js';
import { listSshKeys, getSigningStatus, configureSshSigning, type SshKeyInfo } from './signing.js';

/**
 * Setup wizard options
 */
export interface SetupOptions {
  /** Skip the intro/outro messages */
  quiet?: boolean;
  /** Force setup even if already configured */
  force?: boolean;
}

/**
 * Setup wizard result
 */
export interface SetupResult {
  /** Whether setup completed successfully */
  success: boolean;
  /** Selected features */
  features: {
    devcontainer: boolean;
    mcpServers: string[];
    secretsProvider: 'env' | '1password' | 'vault' | 'none';
    gitSigning: boolean;
  };
  /** Any warnings during setup */
  warnings: string[];
  /** Error message if setup failed */
  error?: string;
}

/**
 * Feature selection for the wizard
 */
interface FeatureSelection {
  devcontainer: boolean;
  mcp: boolean;
  secrets: boolean;
  signing: boolean;
}

/**
 * Run the interactive setup wizard
 */
export async function runSetupWizard(options: SetupOptions = {}): Promise<SetupResult> {
  const warnings: string[] = [];

  if (!options.quiet) {
    p.intro('RAPID Setup Wizard');
  }

  // Check platform requirements
  const platformSpinner = p.spinner();
  platformSpinner.start('Checking system requirements...');

  const platformInfo = await getPlatformInfo();
  const requirements = await checkRequirements();

  if (!requirements.met) {
    platformSpinner.stop('Missing requirements');
    p.note(requirements.missing.map((m) => `- ${m}`).join('\n'), 'Missing Requirements');
    return {
      success: false,
      features: {
        devcontainer: false,
        mcpServers: [],
        secretsProvider: 'none',
        gitSigning: false,
      },
      warnings,
      error: `Missing requirements: ${requirements.missing.join(', ')}`,
    };
  }

  platformSpinner.stop('System requirements met');

  // Show platform info
  if (!options.quiet) {
    p.note(
      [
        `Platform: ${platformInfo.platform} (${platformInfo.arch})`,
        `Docker: ${platformInfo.hasDocker ? 'available' : 'not found'}`,
        `SSH Agent: ${platformInfo.hasSshAgent ? 'running' : 'not running'}`,
        platformInfo.platform === 'macos'
          ? `Lima: ${platformInfo.hasLima ? 'available' : 'not installed'}`
          : null,
      ]
        .filter(Boolean)
        .join('\n'),
      'System Info'
    );
  }

  // Add platform warnings
  warnings.push(...requirements.warnings);

  // Feature selection (opt-out style)
  const features = await p.multiselect({
    message: 'Select features to configure (all selected by default)',
    options: [
      {
        value: 'devcontainer',
        label: 'Dev Container',
        hint: 'Isolated development environment with all tools',
      },
      {
        value: 'mcp',
        label: 'MCP Servers',
        hint: 'Context7 docs, Tavily search, and more',
      },
      {
        value: 'secrets',
        label: 'Secrets Provider',
        hint: '1Password, HashiCorp Vault, or environment variables',
      },
      {
        value: 'signing',
        label: 'Git Signing',
        hint: 'SSH-based commit signing for verified commits',
      },
    ],
    initialValues: ['devcontainer', 'mcp', 'secrets', 'signing'],
    required: false,
  });

  if (p.isCancel(features)) {
    p.cancel('Setup cancelled');
    return {
      success: false,
      features: {
        devcontainer: false,
        mcpServers: [],
        secretsProvider: 'none',
        gitSigning: false,
      },
      warnings,
      error: 'User cancelled',
    };
  }

  const selectedFeatures: FeatureSelection = {
    devcontainer: (features as string[]).includes('devcontainer'),
    mcp: (features as string[]).includes('mcp'),
    secrets: (features as string[]).includes('secrets'),
    signing: (features as string[]).includes('signing'),
  };

  // MCP server selection
  let selectedMcpServers: string[] = [];
  if (selectedFeatures.mcp) {
    const mcpServers = await p.multiselect({
      message: 'Select MCP servers to enable',
      options: Object.entries(MCP_SERVER_TEMPLATES).map(([name, template]) => ({
        value: name,
        label: name,
        hint: template.description,
      })),
      initialValues: ['context7', 'tavily'],
      required: false,
    });

    if (!p.isCancel(mcpServers)) {
      selectedMcpServers = mcpServers as string[];
    }
  }

  // Secrets provider selection
  let secretsProvider: 'env' | '1password' | 'vault' | 'none' = 'env';
  if (selectedFeatures.secrets) {
    const provider = await p.select({
      message: 'Select secrets provider',
      options: [
        {
          value: '1password',
          label: '1Password',
          hint: 'Recommended - secure secret management',
        },
        {
          value: 'vault',
          label: 'HashiCorp Vault',
          hint: 'Enterprise secret management',
        },
        {
          value: 'env',
          label: 'Environment Variables',
          hint: 'Simple but less secure',
        },
      ],
      initialValue: '1password',
    });

    if (!p.isCancel(provider)) {
      secretsProvider = provider as 'env' | '1password' | 'vault';
    }
  }

  // Git signing configuration
  let gitSigningEnabled = false;
  if (selectedFeatures.signing) {
    const signingResult = await configureGitSigning(platformInfo);
    gitSigningEnabled = signingResult.success;
    if (signingResult.warning) {
      warnings.push(signingResult.warning);
    }
  }

  if (!options.quiet) {
    // Summary
    const summary = [
      `Dev Container: ${selectedFeatures.devcontainer ? 'Yes' : 'No'}`,
      `MCP Servers: ${selectedMcpServers.length > 0 ? selectedMcpServers.join(', ') : 'None'}`,
      `Secrets: ${secretsProvider}`,
      `Git Signing: ${gitSigningEnabled ? 'Enabled' : 'Disabled'}`,
    ].join('\n');

    p.note(summary, 'Configuration Summary');

    if (warnings.length > 0) {
      p.note(warnings.join('\n'), 'Warnings');
    }

    p.outro('Setup complete! Run `rapid init` to create configuration files.');
  }

  return {
    success: true,
    features: {
      devcontainer: selectedFeatures.devcontainer,
      mcpServers: selectedMcpServers,
      secretsProvider,
      gitSigning: gitSigningEnabled,
    },
    warnings,
  };
}

/**
 * Configure git SSH signing interactively
 */
async function configureGitSigning(
  platformInfo: PlatformInfo
): Promise<{ success: boolean; warning?: string }> {
  // Check current signing status
  const currentStatus = await getSigningStatus();
  if (currentStatus.enabled && currentStatus.format === 'ssh') {
    const keepCurrent = await p.confirm({
      message: `Git signing already configured with SSH. Keep current configuration?`,
      initialValue: true,
    });

    if (p.isCancel(keepCurrent) || keepCurrent) {
      return { success: true };
    }
  }

  // Check SSH agent
  if (!platformInfo.hasSshAgent) {
    return {
      success: false,
      warning: 'SSH agent not running. Start it with: eval "$(ssh-agent -s)"',
    };
  }

  // List available SSH keys
  const keys = await listSshKeys();
  if (keys.length === 0) {
    const createKey = await p.confirm({
      message: 'No SSH keys found. Would you like instructions to create one?',
      initialValue: true,
    });

    if (!p.isCancel(createKey) && createKey) {
      p.note(
        [
          'Run the following command to create an SSH key:',
          '',
          '  ssh-keygen -t ed25519 -C "your_email@example.com"',
          '',
          'Then run `rapid init --setup` again to configure signing.',
        ].join('\n'),
        'Create SSH Key'
      );
    }

    return {
      success: false,
      warning: 'No SSH keys available for signing',
    };
  }

  // Select SSH key
  const selectedKey = await p.select({
    message: 'Select SSH key for signing commits',
    options: keys.map((key) => ({
      value: key,
      label: `${key.type} ${key.comment || key.path}`,
      hint: key.path,
    })),
  });

  if (p.isCancel(selectedKey)) {
    return { success: false };
  }

  // Configure signing
  const configSpinner = p.spinner();
  configSpinner.start('Configuring git signing...');

  try {
    await configureSshSigning(selectedKey as SshKeyInfo);
    configSpinner.stop('Git signing configured');
    return { success: true };
  } catch (err) {
    configSpinner.stop('Failed to configure git signing');
    return {
      success: false,
      warning: `Failed to configure signing: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Export utilities for use in init command
 */
export { getPlatformInfo, checkRequirements } from './platform.js';
export { listSshKeys, getSigningStatus, configureSshSigning } from './signing.js';
