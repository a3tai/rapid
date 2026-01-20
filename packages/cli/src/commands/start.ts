/**
 * rapid start - Start all RAPID services based on rapid.json config
 *
 * Orchestrates the RAPID services stack:
 * - Event bus (Redis)
 * - MCP Server (HTTP transport)
 * - LLM Gateway (LiteLLM)
 * - Daemon (session manager)
 *
 * All services run in Docker containers on the rapid-network.
 */

import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadConfig,
  logger,
  hasDevcontainerCli,
  hasDocker,
  loadDevcontainerConfig,
  getContainerStatus,
  startContainer,
  loadSecrets,
} from '@a3t/rapid-core';
import ora from 'ora';
import { execa } from 'execa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find the docker directory containing docker-compose.yml
 */
function findDockerDir(): string | null {
  // Look in common locations relative to the CLI package
  const possiblePaths = [
    join(__dirname, '..', '..', '..', '..', '..', 'docker'),
    join(__dirname, '..', '..', '..', '..', 'docker'),
    join(__dirname, '..', '..', '..', 'docker'),
    join(process.cwd(), 'docker'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(join(p, 'docker-compose.yml'))) {
      return p;
    }
  }

  return null;
}

/**
 * Check if docker compose is available
 */
async function hasDockerCompose(): Promise<boolean> {
  try {
    await execa('docker', ['compose', 'version']);
    return true;
  } catch {
    try {
      await execa('docker-compose', ['version']);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Get docker compose command (v2 or v1)
 */
async function getDockerComposeCmd(): Promise<string[]> {
  try {
    await execa('docker', ['compose', 'version']);
    return ['docker', 'compose'];
  } catch {
    return ['docker-compose'];
  }
}

/**
 * Get status of RAPID services
 */
async function getServicesStatus(): Promise<{
  redis: boolean;
  mcp: boolean;
  gateway: boolean;
  daemon: boolean;
}> {
  const status = { redis: false, mcp: false, gateway: false, daemon: false };

  try {
    const { stdout } = await execa('docker', [
      'ps',
      '--format',
      '{{.Names}}',
      '--filter',
      'network=rapid-network',
    ]);

    const containers = stdout.split('\n').filter(Boolean);
    status.redis = containers.includes('rapid-redis');
    status.mcp = containers.includes('rapid-mcp');
    status.gateway = containers.includes('rapid-gateway');
    status.daemon = containers.includes('rapid-daemon');
  } catch {
    // Docker not running or network doesn't exist
  }

  return status;
}

/**
 * Start RAPID services using docker compose
 */
async function startServices(
  dockerDir: string,
  options: { rebuild?: boolean; services?: string[]; secrets?: Record<string, string> }
): Promise<{ success: boolean; error?: string }> {
  const composeCmd = await getDockerComposeCmd();
  const composeFile = join(dockerDir, 'docker-compose.yml');

  const args = [
    ...composeCmd.slice(1),
    '-f',
    composeFile,
    'up',
    '-d',
    '--remove-orphans',
  ];

  if (options.rebuild) {
    args.push('--build', '--force-recreate');
  }

  if (options.services && options.services.length > 0) {
    args.push(...options.services);
  }

  const cmd = composeCmd[0];
  if (!cmd) {
    return { success: false, error: 'No docker compose command found' };
  }

  try {
    await execa(cmd, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...options.secrets, // Pass secrets to containers
        COMPOSE_PROJECT_NAME: 'rapid-services',
      },
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const startCommand = new Command('start')
  .description('Start all RAPID services (event bus, gateway, container)')
  .option('--rebuild', 'Force rebuild service containers', false)
  .option('--no-cache', 'Build without Docker cache', false)
  .option('--no-container', 'Skip starting the dev container')
  .option('--services-only', 'Only start services, not the dev container')
  .option('--minimal', 'Start only essential services (redis, mcp)')
  .option('--no-agents', 'Skip spawning team agents')
  .action(async (options) => {
    const spinner = ora('Starting RAPID environment...').start();

    try {
      // Load config
      spinner.text = 'Loading configuration...';
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found. Run `rapid init` first.');
        process.exit(1);
      }

      const { config, rootDir } = loaded;
      const servicesStarted: string[] = [];

      // Check Docker availability
      spinner.text = 'Checking Docker...';
      const dockerAvailable = await hasDocker();

      if (!dockerAvailable) {
        spinner.fail('Docker is not running. Please start Docker and try again.');
        process.exit(1);
      }

      // Check docker compose availability
      const composeAvailable = await hasDockerCompose();
      if (!composeAvailable) {
        spinner.fail('Docker Compose is not available. Please install it and try again.');
        process.exit(1);
      }

      // Find docker directory
      const dockerDir = findDockerDir();

      // Load secrets from 1Password/Vault to pass to containers
      let secrets: Record<string, string> = {};
      if (config.secrets) {
        spinner.text = 'Loading secrets...';
        try {
          secrets = await loadSecrets(config.secrets);
          const secretCount = Object.keys(secrets).length;
          if (secretCount > 0) {
            logger.debug(`Loaded ${secretCount} secrets for containers`);
          }
        } catch (error) {
          logger.debug(`Failed to load secrets: ${error}`);
          // Continue without secrets - they may be available via other means
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Start RAPID Services Stack
      // ─────────────────────────────────────────────────────────────
      if (dockerDir) {
        spinner.text = 'Starting RAPID services...';
        spinner.stopAndPersist({ symbol: '🚀', text: 'Starting RAPID services...' });

        // Determine which services to start
        let servicesToStart: string[] | undefined;
        if (options.minimal) {
          servicesToStart = ['redis', 'mcp'];
        }

        const result = await startServices(dockerDir, {
          rebuild: options.rebuild,
          ...(servicesToStart && { services: servicesToStart }),
          secrets,
        });

        if (!result.success) {
          logger.blank();
          logger.error('Failed to start services');
          if (result.error) logger.error(result.error);
          process.exit(1);
        }

        // Check what's running
        spinner.start('Checking service status...');
        const status = await getServicesStatus();

        if (status.redis) servicesStarted.push('Event Bus (redis://localhost:6379)');
        if (status.mcp) servicesStarted.push('MCP Server (http://localhost:3100)');
        if (status.gateway) servicesStarted.push('Gateway (http://localhost:4000)');
        if (status.daemon) servicesStarted.push('Daemon (http://localhost:3200)');
      } else {
        // Fall back to standalone Redis if docker-compose not available
        spinner.text = 'Docker compose files not found, starting minimal services...';

        if (config.eventBus?.enabled) {
          const { startRedis, getRedisStatus } = await import('@a3t/rapid-eventbus');
          const redisStatus = await getRedisStatus();

          if (redisStatus.running) {
            servicesStarted.push(`Event Bus (${redisStatus.url})`);
          } else {
            const status = await startRedis({
              port: config.eventBus.redis?.url
                ? parseInt(new URL(config.eventBus.redis.url).port || '6379', 10)
                : 6379,
            });

            if (status.running) {
              servicesStarted.push(`Event Bus (${status.url})`);
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Start Dev Container if configured
      // ─────────────────────────────────────────────────────────────
      const skipContainer = options.servicesOnly || options.container === false;

      if (!skipContainer) {
        // Check for devcontainer CLI
        spinner.text = 'Checking devcontainer CLI...';
        const hasDevCli = await hasDevcontainerCli();

        if (!hasDevCli) {
          spinner.text = 'Devcontainer CLI not found, skipping container';
          logger.debug('Install with: npm install -g @devcontainers/cli');
        } else {
          // Check for devcontainer.json
          spinner.text = 'Checking devcontainer configuration...';
          const devcontainerConfig = await loadDevcontainerConfig(rootDir, config);

          if (!devcontainerConfig) {
            logger.debug('No devcontainer.json found, skipping container');
          } else {
            // Check current status
            spinner.text = 'Checking container status...';
            const status = await getContainerStatus(rootDir, config);

            if (status.running && !options.rebuild) {
              servicesStarted.push(`Dev Container (${status.containerName})`);
            } else {
              // Start the container
              spinner.text = options.rebuild ? 'Rebuilding container...' : 'Starting container...';
              spinner.stopAndPersist({ symbol: '🐳', text: spinner.text });

              const result = await startContainer(rootDir, config, {
                rebuild: options.rebuild,
                quiet: false,
              });

              if (result.success) {
                servicesStarted.push('Dev Container');
              } else {
                logger.warn(`Container failed to start: ${result.error}`);
              }
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Spawn Agent Team if configured
      // ─────────────────────────────────────────────────────────────
      if (!options.agents && config.personas?.autoSpawn && config.personas.team && config.personas.team.length > 0) {
        spinner.start('Spawning agent team...');

        try {
          // Get MCP server URL from config or use default
          const rapidMcpConfig = config.mcp?.servers?.rapid;
          const mcpUrl = rapidMcpConfig?.url || 'http://localhost:3100/mcp';

          // Check if MCP server is available
          try {
            const healthCheck = await fetch(mcpUrl.replace('/mcp', '/health'), {
              method: 'GET',
              signal: AbortSignal.timeout(2000),
            }).catch(() => null);

            if (!healthCheck?.ok) {
              logger.debug('MCP server not responding - skipping team spawn');
              spinner.stop();
              return;
            }
          } catch {
            logger.debug('MCP server health check timeout - skipping team spawn');
            spinner.stop();
            return;
          }

          // Spawn each persona in the team
          for (const personaName of config.personas.team) {
            try {
              spinner.text = `Spawning agent: ${personaName}...`;
              logger.debug(`Spawning persona: ${personaName}`);

              // Make HTTP request to MCP server to spawn persona
              const response = await fetch(mcpUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'tools/call',
                  params: {
                    name: 'persona_spawn',
                    arguments: {
                      name: personaName,
                      task: `Team agent initialization for ${config.name || 'project'}`,
                      background: true,
                      connectToBus: true,
                    },
                  },
                }),
              }).catch(() => null);

              if (response?.ok) {
                const data = await response.json() as { result?: { structuredContent?: { agentId?: string } } };
                if (data.result?.structuredContent?.agentId) {
                  logger.debug(`Spawned ${personaName} as ${data.result.structuredContent.agentId}`);
                }
              }
            } catch (error) {
              logger.debug(`Failed to spawn persona ${personaName}: ${error}`);
            }
          }

          servicesStarted.push(`Agent Team (${config.personas.team.length} personas ready)`);
        } catch (error) {
          logger.debug(`Failed to spawn agent team: ${error}`);
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Summary
      // ─────────────────────────────────────────────────────────────
      spinner.stop();
      logger.blank();

      if (servicesStarted.length > 0) {
        logger.success('RAPID environment ready!');
        logger.blank();

        console.log(`  ${logger.brand('Services running:')}`);
        for (const service of servicesStarted) {
          console.log(`    ${logger.dim('•')} ${service}`);
        }
        logger.blank();

        console.log(`  ${logger.dim('Next steps:')}`);
        console.log(`    ${logger.dim('•')} Run ${logger.brand('rapid dev')} to start coding`);
        console.log(
          `    ${logger.dim('•')} Run ${logger.brand('rapid status')} to see full status`
        );
        console.log(`    ${logger.dim('•')} Run ${logger.brand('rapid stop')} when done`);
      } else {
        logger.info('No services to start.');
        logger.blank();
        logger.info('Configure services in rapid.json:');
        console.log(
          `    ${logger.dim('•')} eventBus.enabled: true  ${logger.dim('# Inter-agent communication')}`
        );
        console.log(
          `    ${logger.dim('•')} gateway.enabled: true   ${logger.dim('# LLM cost tracking')}`
        );
        console.log(
          `    ${logger.dim('•')} Add .devcontainer/      ${logger.dim('# Sandboxed development')}`
        );
      }

      logger.blank();
    } catch (error) {
      spinner.fail('Failed to start environment');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
