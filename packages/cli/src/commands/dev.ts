/**
 * rapid dev - Launch AI coding session inside the dev container
 *
 * Automatically uses git worktrees for feature branch isolation:
 * - On main/master: uses current directory
 * - On feature branches: creates sibling worktree (e.g., ../project-feat-my-feature/)
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
  formatJson,
  assembleContext,
  generateMcpConfig,
  getAuthEnvironment,
  type McpConfig,
  type AgentDefinition,
} from '@a3t/rapid-core';
import ora from 'ora';
import { isGitRepo, getCurrentBranch, getOrCreateWorktreeForBranch } from '../utils/worktree.js';
import {
  hasLima,
  isMacOS,
  isRunning as isLimaRunning,
  startInstance as startLimaInstance,
  execInLima,
  ensureAgentInstalled,
  RAPID_LIMA_INSTANCE,
} from '../isolation/lima.js';
import { hasDocker, getRedisStatus, startRedis } from '@a3t/rapid-eventbus';

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
  .option('--no-worktree', 'Skip automatic worktree creation for feature branches')
  .action(async (options) => {
    try {
      // Load config
      const spinner = ora('Loading configuration...').start();
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found. Run `rapid init` first.');
        process.exit(1);
      }

      const { config } = loaded;
      let { rootDir } = loaded;
      spinner.succeed('Configuration loaded');

      // Auto-start event bus if enabled but not running
      if (config.eventBus?.enabled) {
        const hasDockerInstalled = await hasDocker();
        if (hasDockerInstalled) {
          const redisStatus = await getRedisStatus();
          if (!redisStatus.running) {
            spinner.start('Starting event bus...');
            const result = await startRedis({ port: 6379, verbose: false });
            if (result.running) {
              spinner.succeed('Event bus started');
            } else {
              spinner.warn('Could not start event bus - multi-agent features may be limited');
            }
          }
        }
      }

      // List mode
      if (options.list) {
        listAgents(config);
        return;
      }

      // Auto-worktree for feature branches (unless disabled)
      if (options.worktree !== false && (await isGitRepo(rootDir))) {
        const branch = await getCurrentBranch(rootDir);

        if (!branch.isDefault && !branch.detached && branch.name) {
          spinner.start(`Checking worktree for branch: ${branch.name}...`);

          try {
            const worktree = await getOrCreateWorktreeForBranch(rootDir);

            if (worktree.created) {
              spinner.succeed(`Created worktree: ${worktree.path}`);
              rootDir = worktree.path;
            } else if (!worktree.isMain) {
              spinner.succeed(`Using worktree: ${worktree.path}`);
              rootDir = worktree.path;
            } else {
              spinner.info(`Using main directory (branch: ${branch.name})`);
            }
          } catch (err) {
            spinner.warn('Could not create worktree, using main directory');
            logger.debug(err instanceof Error ? err.message : String(err));
          }
        }
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

      // Assemble context files if configured
      let contextContent: string | undefined;
      if (config.context?.files?.length || config.context?.dirs?.length) {
        const spinner2 = ora('Assembling context files...').start();
        try {
          const assembled = await assembleContext(rootDir, config.context);
          if (assembled.files.length > 0) {
            contextContent = assembled.content;
            spinner2.succeed(
              `Assembled ${assembled.files.length} context file${assembled.files.length !== 1 ? 's' : ''} (${Math.round(assembled.totalSize / 1024)}KB)`
            );
            if (assembled.skippedFiles.length > 0) {
              logger.dim(`  Skipped ${assembled.skippedFiles.length} file(s)`);
            }
          } else {
            spinner2.warn('No context files found');
          }
        } catch (err) {
          spinner2.warn('Failed to assemble context files');
          logger.debug(err instanceof Error ? err.message : String(err));
        }
      }

      // Launch the agent inside the container
      logger.blank();
      logger.info(`Launching ${logger.brand(agentName)} in container...`);

      // Build agent args with system prompt injection if supported
      const builtArgs = buildAgentArgs(agent, {
        injectSystemPrompt: true,
        ...(contextContent && { contextContent }),
      });
      if (agentSupportsRuntimeInjection(agent)) {
        logger.dim('Injecting RAPID methodology via CLI args');
        if (contextContent) {
          logger.dim('Injecting context files via CLI args');
        }
      }
      logger.blank();

      const agentArgs = [agent.cli, ...builtArgs];
      const mcpEnv = await prepareMcpEnv(rootDir, config.mcp);
      const authEnv = await getAuthEnvironment();
      const mergedEnv = { ...secrets, ...authEnv, ...(mcpEnv ?? {}) };

      // Inject secrets, auth tokens, and MCP config as environment variables
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

  // Use generateMcpConfig to properly handle templates and type transformations
  // This ensures stdio servers get command/args from templates if not explicitly set
  const mcpConfig = generateMcpConfig({
    version: '1.0',
    agents: { default: '', available: {} },
    mcp,
  });

  if (Object.keys(mcpConfig.mcpServers).length === 0) {
    return undefined;
  }

  await writeFile(configPath, await formatJson(mcpConfig), 'utf-8');

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
    lima?: { installGh?: boolean };
    context?: Parameters<typeof assembleContext>[1];
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

  // Prepare MCP environment and auth passthrough
  const mcpEnv = await prepareMcpEnv(rootDir, config.mcp);
  const authEnv = await getAuthEnvironment();
  const mergedEnv = { ...secrets, ...authEnv, ...(mcpEnv ?? {}) };

  // Assemble context files if configured
  let contextContent: string | undefined;
  if (config.context?.files?.length || config.context?.dirs?.length) {
    const spinner = ora('Assembling context files...').start();
    try {
      const assembled = await assembleContext(rootDir, config.context);
      if (assembled.files.length > 0) {
        contextContent = assembled.content;
        spinner.succeed(
          `Assembled ${assembled.files.length} context file${assembled.files.length !== 1 ? 's' : ''} (${Math.round(assembled.totalSize / 1024)}KB)`
        );
        if (assembled.skippedFiles.length > 0) {
          logger.dim(`  Skipped ${assembled.skippedFiles.length} file(s)`);
        }
      } else {
        spinner.warn('No context files found');
      }
    } catch (err) {
      spinner.warn('Failed to assemble context files');
      logger.debug(err instanceof Error ? err.message : String(err));
    }
  }

  // Build agent args with system prompt injection if supported
  const builtArgs = buildAgentArgs(agent, {
    injectSystemPrompt: true,
    ...(contextContent && { contextContent }),
  });

  // Check if we should use Lima VM on macOS
  if (isMacOS() && (await hasLima())) {
    await runInLimaVm(agent, agentName, rootDir, builtArgs, mergedEnv, config.lima);
    return;
  }

  // Fall back to running directly on host
  logger.info(`Launching ${logger.brand(agentName)}...`);
  logger.dim(`Working directory: ${rootDir}`);

  if (agentSupportsRuntimeInjection(agent)) {
    logger.dim('Injecting RAPID methodology via CLI args');
    if (contextContent) {
      logger.dim('Injecting context files via CLI args');
    }
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

/**
 * Run agent inside Lima VM for isolated local development
 */
async function runInLimaVm(
  agent: AgentDefinition,
  agentName: string,
  rootDir: string,
  args: string[],
  env: Record<string, string>,
  limaConfig?: { installGh?: boolean }
): Promise<void> {
  const spinner = ora();

  // Check if Lima instance is running
  if (!(await isLimaRunning())) {
    spinner.start(`Starting Lima VM (${RAPID_LIMA_INSTANCE})...`);

    const result = await startLimaInstance(rootDir, {
      env,
      timeout: 600, // 10 minutes for first-time setup
      ...(limaConfig?.installGh !== undefined && { installGh: limaConfig.installGh }),
    });

    if (!result.success) {
      spinner.fail('Failed to start Lima VM');
      logger.error(result.error ?? 'Unknown error');
      logger.blank();
      logger.info('Falling back to running directly on host...');
      logger.blank();

      // Fall back to direct execution
      const { execa } = await import('execa');
      await execa(agent.cli, args, {
        cwd: rootDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          ...env,
        },
      });
      return;
    }

    spinner.succeed('Lima VM started');
  } else {
    logger.info(`Lima VM (${RAPID_LIMA_INSTANCE}) is running`);
  }

  // Ensure agent CLI is installed in the VM
  spinner.start(`Checking if ${agentName} is installed in Lima VM...`);
  const installResult = await ensureAgentInstalled(agent.cli);

  if (!installResult.success) {
    spinner.fail(`Failed to install ${agentName} in Lima VM`);
    logger.error(installResult.error ?? 'Unknown error');
    logger.blank();
    logger.info('Falling back to running directly on host...');
    logger.blank();

    // Fall back to direct execution
    const { execa } = await import('execa');
    await execa(agent.cli, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...env,
      },
    });
    return;
  }

  spinner.succeed(`${agentName} is available in Lima VM`);

  logger.info(`Launching ${logger.brand(agentName)} in Lima VM...`);
  logger.dim(`Working directory: ${rootDir}`);
  logger.dim('SSH agent forwarded for commit signing');
  logger.blank();

  // Execute the agent inside the Lima VM
  await execInLima([agent.cli, ...args], {
    cwd: rootDir,
    env,
    interactive: true,
    tty: true,
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
    agents: {
      default: string;
      available: Record<string, { cli: string; args?: string[] }>;
    };
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
