/**
 * rapid dev - Launch AI coding session inside the dev container
 */

import { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import {
  loadConfig,
  getAgent,
  checkAgentAvailable,
  logger,
  getContainerStatus,
  startContainer,
  execInContainer,
  hasDevcontainerCli,
  loadSecrets,
  hasOpCli,
  isOpAuthenticated,
  hasVaultCli,
  isVaultAuthenticated,
  buildAgentArgs,
  agentSupportsRuntimeInjection,
  type McpConfig,
  type AgentDefinition,
} from '@a3t/rapid-core';
import ora from 'ora';

export const devCommand = new Command('dev')
  .description('Launch AI coding session in the dev container')
  .option('-a, --agent <name>', 'Agent to use')
  .option(
    '--multi [agents]',
    'Launch multiple agents (comma-separated, or interactive if no value)'
  )
  .option('--list', 'List available agents without launching')
  .option('--local', 'Run locally instead of in container (not recommended)')
  .option('--no-start', 'Do not auto-start container if stopped')
  .action(async (options) => {
    try {
      // Load config
      const spinner = ora('Loading configuration...').start();
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found. Run `rapid init` first.');
        process.exit(1);
      }

      const { config, rootDir } = loaded;
      spinner.succeed('Configuration loaded');

      // List mode
      if (options.list) {
        listAgents(config);
        return;
      }

      // Multi-agent mode
      if (options.multi !== undefined) {
        await runMultiAgent(config, rootDir, options);
        return;
      }

      // Get the agent to use
      const agentName = options.agent || config.agents.default;
      const agent = getAgent(config, agentName);

      if (!agent) {
        logger.error(`Agent "${agentName}" not found in configuration`);
        logger.info('Available agents:');
        Object.keys(config.agents.available).forEach((name) => {
          const isDefault = name === config.agents.default;
          console.log(`  ${isDefault ? '* ' : '  '}${name}${isDefault ? ' (default)' : ''}`);
        });
        process.exit(1);
      }

      // Check if running locally (not recommended)
      if (options.local) {
        logger.warn('Running locally instead of in container');
        logger.dim('This bypasses the isolated dev environment');
        logger.blank();
        await runLocally(agent, agentName, rootDir, config);
        return;
      }

      // Check for devcontainer CLI
      const hasDevCli = await hasDevcontainerCli();
      if (!hasDevCli) {
        logger.error('devcontainer CLI not found');
        logger.info('Install with: npm install -g @devcontainers/cli');
        logger.blank();
        logger.info('Or use --local to run without container (not recommended)');
        process.exit(1);
      }

      // Check container status
      spinner.start('Checking container status...');
      const status = await getContainerStatus(rootDir, config);

      if (!status.running) {
        if (options.start === false) {
          spinner.fail('Container not running. Use `rapid start` first.');
          process.exit(1);
        }

        // Auto-start the container
        spinner.text = 'Starting container...';
        spinner.stopAndPersist({ symbol: '🐳', text: 'Starting container...' });

        const result = await startContainer(rootDir, config, { quiet: false });
        if (!result.success) {
          logger.blank();
          logger.error('Failed to start container');
          logger.error(result.error || 'Unknown error');
          process.exit(1);
        }
        logger.blank();
      } else {
        spinner.succeed(`Container running (${status.containerName})`);
      }

      // Load secrets (1Password, Vault, or env)
      let secrets: Record<string, string> = {};
      const secretsConfig = config.secrets;

      if (secretsConfig?.items && Object.keys(secretsConfig.items).length > 0) {
        const provider = secretsConfig.provider || 'env';

        if (provider === '1password') {
          spinner.start('Loading secrets from 1Password...');

          const hasOp = await hasOpCli();
          if (!hasOp) {
            spinner.warn('1Password CLI not found - secrets will not be loaded');
            logger.info('Install with: brew install 1password-cli');
          } else {
            const authenticated = await isOpAuthenticated();
            if (!authenticated) {
              spinner.warn('1Password not authenticated - secrets will not be loaded');
              logger.info('Run: eval $(op signin)');
            } else {
              try {
                secrets = await loadSecrets(secretsConfig);
                const count = Object.keys(secrets).length;
                spinner.succeed(`Loaded ${count} secret${count !== 1 ? 's' : ''} from 1Password`);
              } catch (err) {
                spinner.warn('Failed to load secrets from 1Password');
                logger.debug(err instanceof Error ? err.message : String(err));
              }
            }
          }
        } else if (provider === 'vault') {
          spinner.start('Loading secrets from Vault...');

          const hasVault = await hasVaultCli();
          if (!hasVault) {
            spinner.warn('Vault CLI not found - secrets will not be loaded');
            logger.info('Install from: https://developer.hashicorp.com/vault/docs/install');
          } else {
            const authenticated = await isVaultAuthenticated();
            if (!authenticated) {
              spinner.warn('Vault not authenticated - secrets will not be loaded');
              logger.info('Run: vault login');
            } else {
              try {
                secrets = await loadSecrets(secretsConfig);
                const count = Object.keys(secrets).length;
                spinner.succeed(`Loaded ${count} secret${count !== 1 ? 's' : ''} from Vault`);
              } catch (err) {
                spinner.warn('Failed to load secrets from Vault');
                logger.debug(err instanceof Error ? err.message : String(err));
              }
            }
          }
        } else if (provider === 'env') {
          spinner.start('Loading secrets from environment...');
          try {
            secrets = await loadSecrets(secretsConfig);
            const count = Object.keys(secrets).length;
            if (count > 0) {
              spinner.succeed(`Loaded ${count} secret${count !== 1 ? 's' : ''} from environment`);
            } else {
              spinner.warn('No secrets found in environment');
            }
          } catch (err) {
            spinner.warn('Failed to load secrets from environment');
            logger.debug(err instanceof Error ? err.message : String(err));
          }
        }
      }

      // Launch the agent inside the container
      logger.blank();
      logger.info(`Launching ${logger.brand(agentName)} in container...`);

      // Build agent args with system prompt injection if supported
      const builtArgs = buildAgentArgs(agent, { injectSystemPrompt: true });
      if (agentSupportsRuntimeInjection(agent)) {
        logger.dim('Injecting RAPID methodology via CLI args');
      }
      logger.blank();

      const agentArgs = [agent.cli, ...builtArgs];
      const mcpEnv = await prepareMcpEnv(rootDir, config.mcp);
      const mergedEnv = { ...secrets, ...(mcpEnv ?? {}) };

      // Inject secrets and MCP config as environment variables
      await execInContainer(rootDir, agentArgs, config, {
        interactive: true,
        tty: true,
        env: mergedEnv,
      });
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

async function prepareMcpEnv(
  rootDir: string,
  mcp?: McpConfig
): Promise<Record<string, string> | undefined> {
  if (!mcp?.servers || Object.keys(mcp.servers).length === 0) {
    return undefined;
  }

  const configFile = mcp.configFile ?? '.mcp.json';
  const configPath = isAbsolute(configFile) ? configFile : join(rootDir, configFile);

  const servers: Record<string, unknown> = {};
  for (const [name, serverConfig] of Object.entries(mcp.servers)) {
    if (!serverConfig || typeof serverConfig !== 'object') {
      continue;
    }

    const { enabled, ...rest } = serverConfig as Record<string, unknown>;
    if (enabled === false) {
      continue;
    }

    servers[name] = rest;
  }

  if (Object.keys(servers).length === 0) {
    return undefined;
  }

  await writeFile(configPath, `${JSON.stringify({ servers }, null, 2)}\n`, 'utf-8');

  return {
    MCP_CONFIG_FILE: configFile,
  };
}

/**
 * Run agent locally (fallback, not recommended)
 */
async function runLocally(
  agent: AgentDefinition,
  agentName: string,
  rootDir: string,
  config: {
    secrets?: {
      provider?: 'env' | '1password' | 'vault';
      items?: Record<string, unknown>;
    };
    mcp?: McpConfig;
  }
): Promise<void> {
  const { execa } = await import('execa');

  // Check if agent CLI is available locally
  const status = await checkAgentAvailable(agent);
  if (!status.available) {
    logger.error(`${agentName} CLI not found locally`);
    process.exit(1);
  }

  // Load secrets (1Password, Vault, or env) - same as container mode
  let secrets: Record<string, string> = {};
  const secretsConfig = config.secrets;

  if (secretsConfig?.items && Object.keys(secretsConfig.items).length > 0) {
    const provider = secretsConfig.provider || 'env';
    const spinner = ora();

    if (provider === '1password') {
      spinner.start('Loading secrets from 1Password...');

      const hasOp = await hasOpCli();
      if (!hasOp) {
        spinner.warn('1Password CLI not found - secrets will not be loaded');
        logger.info('Install with: brew install 1password-cli');
      } else {
        const authenticated = await isOpAuthenticated();
        if (!authenticated) {
          spinner.warn('1Password not authenticated - secrets will not be loaded');
          logger.info('Run: eval $(op signin)');
        } else {
          try {
            secrets = await loadSecrets(secretsConfig as Parameters<typeof loadSecrets>[0]);
            const count = Object.keys(secrets).length;
            spinner.succeed(`Loaded ${count} secret${count !== 1 ? 's' : ''} from 1Password`);
          } catch (err) {
            spinner.warn('Failed to load secrets from 1Password');
            logger.debug(err instanceof Error ? err.message : String(err));
          }
        }
      }
    } else if (provider === 'vault') {
      spinner.start('Loading secrets from Vault...');

      const hasVault = await hasVaultCli();
      if (!hasVault) {
        spinner.warn('Vault CLI not found - secrets will not be loaded');
        logger.info('Install from: https://developer.hashicorp.com/vault/docs/install');
      } else {
        const authenticated = await isVaultAuthenticated();
        if (!authenticated) {
          spinner.warn('Vault not authenticated - secrets will not be loaded');
          logger.info('Run: vault login');
        } else {
          try {
            secrets = await loadSecrets(secretsConfig as Parameters<typeof loadSecrets>[0]);
            const count = Object.keys(secrets).length;
            spinner.succeed(`Loaded ${count} secret${count !== 1 ? 's' : ''} from Vault`);
          } catch (err) {
            spinner.warn('Failed to load secrets from Vault');
            logger.debug(err instanceof Error ? err.message : String(err));
          }
        }
      }
    } else if (provider === 'env') {
      spinner.start('Loading secrets from environment...');
      try {
        secrets = await loadSecrets(secretsConfig as Parameters<typeof loadSecrets>[0]);
        const count = Object.keys(secrets).length;
        if (count > 0) {
          spinner.succeed(`Loaded ${count} secret${count !== 1 ? 's' : ''} from environment`);
        } else {
          spinner.warn('No secrets found in environment');
        }
      } catch (err) {
        spinner.warn('Failed to load secrets from environment');
        logger.debug(err instanceof Error ? err.message : String(err));
      }
    }
  }

  // Prepare MCP environment
  const mcpEnv = await prepareMcpEnv(rootDir, config.mcp);
  const mergedEnv = { ...secrets, ...(mcpEnv ?? {}) };

  logger.info(`Launching ${logger.brand(agentName)}...`);
  logger.dim(`Working directory: ${rootDir}`);

  // Build agent args with system prompt injection if supported
  const builtArgs = buildAgentArgs(agent, { injectSystemPrompt: true });
  if (agentSupportsRuntimeInjection(agent)) {
    logger.dim('Injecting RAPID methodology via CLI args');
  }
  logger.blank();

  await execa(agent.cli, builtArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...mergedEnv,
    },
  });
}

function listAgents(config: {
  agents: { default: string; available: Record<string, unknown> };
}): void {
  logger.header('Available Agents');

  Object.keys(config.agents.available).forEach((name) => {
    const isDefault = name === config.agents.default;
    console.log(
      `  ${isDefault ? logger.brand('*') : ' '} ${name}${isDefault ? logger.dim(' (default)') : ''}`
    );
  });

  logger.blank();
  logger.dim('Use --agent <name> to select a specific agent');
}

/**
 * Run multiple agents sequentially or show selection menu
 */
async function runMultiAgent(
  config: {
    agents: { default: string; available: Record<string, { cli: string; args?: string[] }> };
  },
  rootDir: string,
  options: { multi?: string | boolean; local?: boolean }
): Promise<void> {
  const availableAgents = Object.keys(config.agents.available);

  if (availableAgents.length === 0) {
    logger.error('No agents configured');
    process.exit(1);
  }

  let selectedAgents: string[];

  if (typeof options.multi === 'string') {
    // Parse comma-separated agent list
    selectedAgents = options.multi
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    // Validate all agents exist
    for (const name of selectedAgents) {
      if (!config.agents.available[name]) {
        logger.error(`Agent "${name}" not found in configuration`);
        logger.info('Available agents: ' + availableAgents.join(', '));
        process.exit(1);
      }
    }
  } else {
    // Show available agents and instructions
    logger.header('Multi-Agent Mode');
    console.log();
    console.log('  Available agents:');
    for (const name of availableAgents) {
      const isDefault = name === config.agents.default;
      console.log(`    ${logger.brand('•')} ${name}${isDefault ? logger.dim(' (default)') : ''}`);
    }
    console.log();
    logger.info('To run multiple agents, specify them with:');
    console.log(`  ${logger.brand('rapid dev --multi claude,aider')}`);
    console.log();
    logger.info('Or run agents in separate terminals:');
    for (const name of availableAgents) {
      console.log(`  ${logger.dim('$')} rapid dev --agent ${name}`);
    }
    console.log();
    logger.warn('Note: Running multiple agents simultaneously requires separate terminal windows.');
    logger.info('Each agent maintains its own session and context.');
    console.log();
    return;
  }

  if (selectedAgents.length === 0) {
    logger.error('No agents specified');
    process.exit(1);
  }

  if (selectedAgents.length === 1) {
    logger.info(
      `Only one agent specified. Use ${logger.brand('rapid dev --agent ' + selectedAgents[0])} instead.`
    );
    process.exit(0);
  }

  // Show what we're about to do
  logger.header('Multi-Agent Session');
  console.log();
  console.log('  Selected agents:');
  for (const name of selectedAgents) {
    console.log(`    ${logger.brand('•')} ${name}`);
  }
  console.log();

  // Check for tmux
  const { execa } = await import('execa');
  let hasTmux = false;

  try {
    await execa('tmux', ['-V']);
    hasTmux = true;
  } catch {
    hasTmux = false;
  }

  if (hasTmux) {
    // Use tmux for multi-agent
    logger.info('Launching agents in tmux panes...');
    console.log();

    const sessionName = `rapid-${Date.now()}`;

    // Create new tmux session with first agent
    const firstAgent = selectedAgents[0];
    const firstCmd = options.local
      ? `rapid dev --agent ${firstAgent} --local`
      : `rapid dev --agent ${firstAgent}`;

    await execa('tmux', ['new-session', '-d', '-s', sessionName, '-n', 'rapid', firstCmd], {
      cwd: rootDir,
    });

    // Split panes for remaining agents
    for (let i = 1; i < selectedAgents.length; i++) {
      const agentName = selectedAgents[i];
      const cmd = options.local
        ? `rapid dev --agent ${agentName} --local`
        : `rapid dev --agent ${agentName}`;

      await execa('tmux', ['split-window', '-t', sessionName, '-h', cmd], {
        cwd: rootDir,
      });

      // Rebalance panes
      await execa('tmux', ['select-layout', '-t', sessionName, 'tiled']);
    }

    // Attach to the session
    logger.success(`Started ${selectedAgents.length} agents in tmux session: ${sessionName}`);
    console.log();
    logger.info('Attaching to tmux session...');
    logger.dim('Press Ctrl+B then D to detach, or Ctrl+B then arrow keys to switch panes');
    console.log();

    await execa('tmux', ['attach-session', '-t', sessionName], {
      stdio: 'inherit',
    });
  } else {
    // No tmux - show instructions for manual setup
    logger.warn('tmux not found. Multi-agent mode works best with tmux installed.');
    console.log();
    logger.info('To run multiple agents, open separate terminal windows and run:');
    console.log();
    for (const name of selectedAgents) {
      const cmd = options.local ? `--local` : '';
      console.log(
        `  ${logger.dim('Terminal ' + (selectedAgents.indexOf(name) + 1) + ':')} rapid dev --agent ${name} ${cmd}`.trim()
      );
    }
    console.log();
    logger.info('Install tmux for integrated multi-pane support:');
    console.log(`  ${logger.dim('macOS:')}  brew install tmux`);
    console.log(`  ${logger.dim('Ubuntu:')} sudo apt install tmux`);
    console.log();
  }
}
