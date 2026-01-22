/**
 * Docker Environment Provider
 *
 * Runs agents inside Docker containers using the RAPID dev image.
 * Uses dockerode for Docker API instead of CLI commands.
 */

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { execa } from 'execa';
import Docker from 'dockerode';
import { getAuthEnvironment } from '@a3t/rapid-core';
import { BaseProvider } from './base.js';
import type {
  ProviderType,
  ProviderInitOptions,
  Session,
  EnvironmentHandle,
  ExecuteOptions,
  ExecuteResult,
  GetLogsOptions,
} from '../types.js';

// Default image for RAPID agents (built from docker/Dockerfile.agent)
const DEFAULT_AGENT_IMAGE = 'rapid-agent:latest';
const RAPID_NETWORK = 'rapid-network';

export class DockerProvider extends BaseProvider {
  readonly type: ProviderType = 'docker';
  readonly name = 'Docker (RAPID Agent)';

  private docker: Docker;
  private containers: Map<string, Docker.Container> = new Map();
  private agentImage: string = DEFAULT_AGENT_IMAGE;
  private verbose: boolean = false;

  constructor() {
    super();
    // Connect to Docker daemon via socket
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  protected async doInitialize(options: ProviderInitOptions): Promise<void> {
    this.verbose = options.verbose || false;

    // Check if rapid-dev image exists
    try {
      await this.docker.getImage(this.agentImage).inspect();
    } catch {
      if (this.verbose) {
        console.error(
          `[docker] Image ${this.agentImage} not found. Build with: docker build -f .devcontainer/Dockerfile -t rapid-dev:latest .`
        );
      }
    }

    // Ensure rapid-network exists
    try {
      await this.docker.getNetwork(RAPID_NETWORK).inspect();
    } catch {
      if (this.verbose) {
        console.error(`[docker] Creating network ${RAPID_NETWORK}`);
      }
      try {
        await this.docker.createNetwork({ Name: RAPID_NETWORK, Driver: 'bridge' });
      } catch {
        // Network might already exist
      }
    }
  }

  async createEnvironment(session: Session): Promise<EnvironmentHandle> {
    // Auto-initialize if not already initialized
    if (!this.initialized) {
      await this.initialize({ verbose: this.verbose });
    }

    const id = randomUUID();
    const containerName = `rapid-agent-${session.id.slice(0, 8)}`;

    // Get worktree name from session env, or generate one
    const worktreeName = session.env?.RAPID_WORKTREE || `agent-${session.id.slice(0, 8)}`;

    // Use host project directory for volume mounts (not container path)
    // RAPID_HOST_PROJECT_DIR is the actual host path, session.projectDir might be /project (container path)
    const hostProjectDir = process.env.RAPID_HOST_PROJECT_DIR || session.projectDir;
    const worktreeDir = join(session.projectDir, '.worktrees', worktreeName);
    const hostWorktreeDir = join(hostProjectDir, '.worktrees', worktreeName);

    // Create git worktree for this agent
    try {
      await mkdir(join(session.projectDir, '.worktrees'), { recursive: true });
      await execa('git', ['worktree', 'add', '-b', worktreeName, worktreeDir], {
        cwd: session.projectDir,
        reject: false,
      });
      if (this.verbose) {
        console.error(`[docker] Created worktree '${worktreeName}' at ${worktreeDir}`);
      }
    } catch (err) {
      if (this.verbose) {
        console.error(`[docker] Warning creating worktree: ${err}`);
      }
    }

    const hostHomeDir = process.env.RAPID_HOST_HOME_DIR || homedir();

    // Build environment variables
    const env: string[] = [
      `HOME=/home/agent`, // Set HOME for Claude Code to find credentials
      `RAPID_AGENT_ID=${session.id}`,
      `RAPID_PROJECT_DIR=/workspace`,
      `RAPID_WORKTREE=${worktreeName}`,
    ];

    // Add session environment variables
    if (session.env) {
      for (const [key, value] of Object.entries(session.env)) {
        env.push(`${key}=${value}`);
      }
    }

    // Get auth credentials from external-auth (reads from ~/.claude.json, keychain, etc.)
    // This is critical for OAuth tokens which aren't always in env vars
    try {
      const authEnv = await getAuthEnvironment();
      for (const [key, value] of Object.entries(authEnv)) {
        if (!session.env?.[key]) {
          env.push(`${key}=${value}`);
          if (this.verbose) {
            console.error(`[docker] Added auth env: ${key} (${value.slice(0, 10)}...)`);
          }
        }
      }
    } catch (err) {
      if (this.verbose) {
        console.error(`[docker] Warning getting auth environment: ${err}`);
      }
    }

    // Pass through important environment variables from host (fallback)
    // NOTE: Do NOT include ANTHROPIC_AUTH_TOKEN - it conflicts with Claude Code's OAuth
    // Use CLAUDE_CODE_OAUTH_TOKEN for OAuth authentication
    // NOTE: Do NOT include MCP_URL or REDIS_URL - agents use host.docker.internal
    // to reach services running on the host, since they may be on different Docker networks
    const passthroughEnvVars = [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'CONTEXT7_API_KEY',
      'TAVILY_API_KEY',
    ];
    for (const envVar of passthroughEnvVars) {
      const value = process.env[envVar];
      // Check if already set and has a non-empty value
      const existing = env.find(e => e.startsWith(`${envVar}=`));
      const existingValue = existing?.split('=')[1];
      // Add if we have a value and (no existing entry OR existing entry is empty)
      if (value && (!existing || !existingValue)) {
        if (existing) {
          // Remove the empty existing entry
          const idx = env.indexOf(existing);
          if (idx !== -1) env.splice(idx, 1);
        }
        env.push(`${envVar}=${value}`);
        if (this.verbose && (envVar.includes('TOKEN') || envVar.includes('KEY'))) {
          console.error(`[docker] Passthrough env: ${envVar}=${value.slice(0, 15)}...`);
        }
      }
    }

    // Debug: Log auth env vars being passed to container
    if (this.verbose) {
      const authEnvs = env.filter(e =>
        e.startsWith('CLAUDE_CODE_OAUTH_TOKEN=') ||
        e.startsWith('ANTHROPIC_AUTH_TOKEN=') ||
        e.startsWith('ANTHROPIC_API_KEY=')
      );
      if (authEnvs.length > 0) {
        console.error(`[docker] Auth env vars for container: ${authEnvs.map(e => e.split('=')[0]).join(', ')}`);
      } else {
        console.error(`[docker] WARNING: No auth env vars found for container!`);
      }
    }

    // Set host for cross-network access - agent containers may be on a different
    // Docker network than rapid-dev services. RAPID_MCP_HOST is the source of truth,
    // MCP_URL is derived from it for convenience in scripts
    const mcpHost = 'host.docker.internal';
    env.push(`RAPID_MCP_HOST=${mcpHost}`);
    env.push(`MCP_URL=http://${mcpHost}:3100/mcp`);
    env.push(`REDIS_URL=redis://${mcpHost}:6379`);

    try {
      // Create the container
      const binds = [
        `${hostWorktreeDir}:/workspace`, // Agent's worktree (host path)
        `${hostProjectDir}:/project`, // Main project (writable for git operations)
      ];
      const codexAuthPath = join(hostHomeDir, '.codex', 'auth.json');
      if (existsSync(codexAuthPath)) {
        binds.push(`${codexAuthPath}:/home/agent/.codex/auth.json`);
      } else if (this.verbose) {
        console.error(`[docker] WARNING: Codex auth.json not found at ${codexAuthPath}`);
      }

      const container = await this.docker.createContainer({
        name: containerName,
        Image: this.agentImage,
        Env: env,
        WorkingDir: '/workspace',
        Cmd: ['tail', '-f', '/dev/null'], // Keep container running
        HostConfig: {
          Binds: binds,
          NetworkMode: RAPID_NETWORK,
          AutoRemove: true,
        },
      });

      // Start the container
      await container.start();

      this.containers.set(id, container);

      if (this.verbose) {
        console.error(`[docker] Started container ${containerName} for session ${session.id}`);
      }

      return {
        id,
        provider: 'docker',
        containerId: container.id,
      };
    } catch (error) {
      throw new Error(
        `Failed to create Docker environment: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async stopEnvironment(handle: EnvironmentHandle): Promise<void> {
    const container = this.containers.get(handle.id);
    if (container) {
      try {
        await container.stop({ t: 5 });
      } catch {
        // Container may already be stopped
      }
      this.containers.delete(handle.id);
    }
  }

  async execute(
    handle: EnvironmentHandle,
    command: string[],
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    this.ensureInitialized();

    const container = this.containers.get(handle.id);
    if (!container) {
      throw new Error('No container for handle');
    }

    try {
      // Create exec instance
      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: options.cwd || '/workspace',
        Env: options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : undefined,
        Tty: options.tty || false,
      });

      // Start exec and collect output
      const stream = await exec.start({ hijack: true, stdin: false });

      return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        // Use PassThrough streams to collect output
        const stdoutStream = new PassThrough();
        const stderrStream = new PassThrough();

        stdoutStream.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        stderrStream.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        // Demux the multiplexed stream
        this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

        stream.on('end', async () => {
          try {
            const inspectData = await exec.inspect();
            resolve({
              exitCode: inspectData.ExitCode ?? 0,
              stdout,
              stderr,
            });
          } catch {
            resolve({ exitCode: 1, stdout, stderr });
          }
        });

        stream.on('error', reject);
      });
    } catch (error) {
      throw new Error(
        `Failed to execute in container: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Run Claude CLI in the container with a task
   */
  async runAgent(
    handle: EnvironmentHandle,
    task: string,
    systemPrompt?: string
  ): Promise<ExecuteResult> {
    const claudeArgs = ['claude', '--print', '--output-format', 'text'];

    if (systemPrompt) {
      claudeArgs.push('--append-system-prompt', systemPrompt);
    }

    claudeArgs.push(task);

    return this.execute(handle, claudeArgs, {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }

  protected async doCleanup(): Promise<void> {
    // Stop all containers
    for (const [id, container] of this.containers.entries()) {
      try {
        await container.stop({ t: 5 });
      } catch {
        // Container may already be stopped
      }
      this.containers.delete(id);
    }
  }

  /**
   * Set the agent image to use
   */
  setAgentImage(image: string): void {
    this.agentImage = image;
  }

  /**
   * Get logs from a container
   */
  async getLogs(handle: EnvironmentHandle, options: GetLogsOptions = {}): Promise<string> {
    const container = this.containers.get(handle.id);
    if (!container) {
      throw new Error('No container for handle');
    }

    try {
      // Use explicit type for follow: false to satisfy TypeScript
      const logOptions = {
        stdout: true,
        stderr: true,
        follow: false as const,
        tail: options.tail ?? 100,
        timestamps: options.timestamps ?? false,
        ...(options.since !== undefined && { since: options.since }),
      };

      const buffer = await container.logs(logOptions);

      // TypeScript infers Buffer when follow: false
      return this.demuxLogs(buffer);
    } catch (error) {
      throw new Error(
        `Failed to get container logs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Demultiplex Docker log stream (stdout/stderr are multiplexed with headers)
   */
  private demuxLogs(buffer: Buffer): string {
    const lines: string[] = [];
    let offset = 0;

    while (offset < buffer.length) {
      // Each frame has an 8-byte header
      if (offset + 8 > buffer.length) break;

      // Bytes 0: stream type (0=stdin, 1=stdout, 2=stderr)
      // Bytes 4-7: frame size (big endian)
      const frameSize = buffer.readUInt32BE(offset + 4);

      if (offset + 8 + frameSize > buffer.length) break;

      const frame = buffer.subarray(offset + 8, offset + 8 + frameSize);
      lines.push(frame.toString('utf-8'));

      offset += 8 + frameSize;
    }

    return lines.join('');
  }
}
