/**
 * Lima VM Management for RAPID
 *
 * Provides isolated Linux development environments on macOS using
 * Apple Virtualization.framework via Lima.
 *
 * Features:
 * - Near-native performance with VZ backend
 * - Rosetta for x86_64 binary compatibility
 * - SSH agent forwarding for commit signing
 * - Automatic project directory mounting
 */

import { execa, type ExecaError } from 'execa';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Get error message from execa error
 */
function getErrorMessage(err: ExecaError): string {
  if (typeof err.stderr === 'string' && err.stderr) {
    return err.stderr;
  }
  return err.message;
}

/**
 * Get string value from execa output (stdout/stderr can be various types)
 */
function getOutputString(output: unknown): string | undefined {
  if (typeof output === 'string') {
    return output;
  }
  return undefined;
}

/**
 * Lima VM instance status
 */
export type LimaStatus = 'Running' | 'Stopped' | 'Starting' | 'Stopping' | 'Unknown';

/**
 * Lima VM instance information
 */
export interface LimaInstance {
  name: string;
  status: LimaStatus;
  arch: string;
  cpus: number;
  memory: string;
  disk: string;
  dir: string;
  sshLocalPort?: number;
}

/**
 * Options for starting a Lima VM
 */
export interface LimaStartOptions {
  /** Number of CPUs (default: 4) */
  cpus?: number;
  /** Memory size (default: 8GiB) */
  memory?: string;
  /** Disk size (default: 50GiB) */
  disk?: string;
  /** Project directory to mount */
  projectDir?: string;
  /** Environment variables to pass through */
  env?: Record<string, string>;
  /** Wait for VM to be ready */
  wait?: boolean;
  /** Timeout in seconds */
  timeout?: number;
  /** Install GitHub CLI (gh) in the VM (default: true) */
  installGh?: boolean;
}

/**
 * Result of Lima operations
 */
export interface LimaResult {
  success: boolean;
  error?: string;
}

/**
 * Default Lima instance name for RAPID
 */
export const RAPID_LIMA_INSTANCE = 'rapid';

/**
 * Path to store Lima configuration
 */
export const RAPID_LIMA_DIR = join(homedir(), '.rapid', 'lima');

/**
 * Check if Lima is available on the system
 */
export async function hasLima(): Promise<boolean> {
  try {
    await execa('limactl', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if running on macOS (Lima only works on macOS)
 */
export function isMacOS(): boolean {
  return platform() === 'darwin';
}

/**
 * Get the Lima template path
 */
function getLimaTemplatePath(): string {
  // In development, the template is at templates/lima.yaml
  // In production (npm package), it should be bundled
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // Try multiple locations
  const possiblePaths = [
    join(__dirname, '../../../../templates/lima.yaml'), // From dist/isolation/
    join(__dirname, '../../../templates/lima.yaml'), // From src/isolation/
    join(homedir(), '.rapid', 'lima.yaml'), // User config
  ];

  return possiblePaths[0]!; // Return first path, we'll check existence later
}

/**
 * List all Lima instances
 */
export async function listInstances(): Promise<LimaInstance[]> {
  try {
    const { stdout } = await execa('limactl', ['list', '--json']);
    const instances = JSON.parse(stdout) as Array<{
      name: string;
      status: string;
      arch: string;
      cpus: number;
      memory: number;
      disk: number;
      dir: string;
      sshLocalPort?: number;
    }>;

    return instances.map((inst) => {
      const result: LimaInstance = {
        name: inst.name,
        status: inst.status as LimaStatus,
        arch: inst.arch,
        cpus: inst.cpus,
        memory: `${Math.round(inst.memory / 1024 / 1024 / 1024)}GiB`,
        disk: `${Math.round(inst.disk / 1024 / 1024 / 1024)}GiB`,
        dir: inst.dir,
      };
      if (inst.sshLocalPort !== undefined) {
        result.sshLocalPort = inst.sshLocalPort;
      }
      return result;
    });
  } catch {
    return [];
  }
}

/**
 * Get a specific Lima instance
 */
export async function getInstance(
  name: string = RAPID_LIMA_INSTANCE
): Promise<LimaInstance | null> {
  const instances = await listInstances();
  return instances.find((i) => i.name === name) ?? null;
}

/**
 * Check if the RAPID Lima instance exists
 */
export async function instanceExists(name: string = RAPID_LIMA_INSTANCE): Promise<boolean> {
  const instance = await getInstance(name);
  if (instance !== null) {
    return true;
  }

  // Fallback: check if the instance directory exists
  // This handles cases where limactl list --json fails or returns unexpected output
  return instanceDirExists(name);
}

/**
 * Check if the Lima instance directory exists at ~/.lima/<name>
 * This is a fallback check when limactl list doesn't work properly
 */
async function instanceDirExists(name: string = RAPID_LIMA_INSTANCE): Promise<boolean> {
  const instanceDir = join(homedir(), '.lima', name);
  try {
    await access(instanceDir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the RAPID Lima instance is running
 */
export async function isRunning(name: string = RAPID_LIMA_INSTANCE): Promise<boolean> {
  const instance = await getInstance(name);
  return instance?.status === 'Running';
}

/**
 * Insert a project mount into a Lima config string.
 */
export function insertProjectMount(config: string, projectDir: string): string {
  const projectMount = `  - location: "${projectDir}"
    writable: true
`;
  const homeMountRegex = /mounts:\s*\n(\s*- location: ['"]~['"]\n(?:\s{2,}[^-][^\n]*\n)*)/;
  return config.replace(homeMountRegex, (_match, homeMount) => {
    return `mounts:\n${homeMount}${projectMount}`;
  });
}

/**
 * Create the Lima configuration with project-specific settings
 */
async function createLimaConfig(
  projectDir: string,
  options: LimaStartOptions = {}
): Promise<string> {
  const templatePath = getLimaTemplatePath();
  const configDir = RAPID_LIMA_DIR;
  const configPath = join(configDir, 'lima.yaml');

  // Ensure config directory exists
  await mkdir(configDir, { recursive: true });

  // Read template
  let template: string;
  try {
    template = await readFile(templatePath, 'utf-8');
  } catch {
    // If template not found, use a minimal config
    template = getMinimalLimaConfig();
  }

  // Customize config with project settings
  let config = template;

  config = insertProjectMount(config, projectDir);

  // Override CPU/memory if specified
  if (options.cpus) {
    config = config.replace(/cpus: \d+/, `cpus: ${options.cpus}`);
  }
  if (options.memory) {
    config = config.replace(/memory: "[^"]*"/, `memory: "${options.memory}"`);
  }
  if (options.disk) {
    config = config.replace(/disk: "[^"]*"/, `disk: "${options.disk}"`);
  }

  // Add environment variables
  if (options.env) {
    const envLines = Object.entries(options.env)
      .map(([key, value]) => `  ${key}: "${value}"`)
      .join('\n');
    config = config.replace(/env:[\s\S]*?(?=\n\w|\n#|$)/, `env:\n${envLines}\n`);
  }

  // Remove GitHub CLI installation if disabled
  if (options.installGh === false) {
    // Remove the GitHub CLI installation block from the provision script
    const ghInstallPattern =
      /\s*# Install GitHub CLI\n\s*curl -fsSL https:\/\/cli\.github\.com\/packages\/githubcli-archive-keyring\.gpg \| dd of=\/usr\/share\/keyrings\/githubcli-archive-keyring\.gpg\n\s*chmod go\+r \/usr\/share\/keyrings\/githubcli-archive-keyring\.gpg\n\s*echo "deb \[arch=\$\(dpkg --print-architecture\) signed-by=\/usr\/share\/keyrings\/githubcli-archive-keyring\.gpg\] https:\/\/cli\.github\.com\/packages stable main" \| tee \/etc\/apt\/sources\.list\.d\/github-cli\.list > \/dev\/null\n\s*apt-get update\n\s*apt-get install -y gh\n/;
    config = config.replace(ghInstallPattern, '\n');
  }

  // Write customized config
  await writeFile(configPath, config);

  return configPath;
}

/**
 * Get a minimal Lima configuration if template is not found
 */
function getMinimalLimaConfig(): string {
  return `
vmType: "vz"
vmOpts:
  vz:
    rosetta:
      enabled: true
      binfmt: true

cpus: 4
memory: "8GiB"
disk: "50GiB"
images:
  - location: "https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-arm64.img"
    arch: "aarch64"
  - location: "https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img"
    arch: "x86_64"
mountType: "virtiofs"
mounts:
  - location: "~"
    writable: true
mountInotify: true
ssh:
  forwardAgent: true
  localPort: 0
networks:
  - vzNAT: true
containerd:
  system: true
  user: false
portForwards:
  - guestPort: 3000
    hostPort: 3000
  - guestPort: 8080
    hostPort: 8080
provision:
  - mode: system
    script: |
      #!/bin/bash
      set -eux
      apt-get update
      apt-get install -y build-essential curl git jq
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      apt-get install -y nodejs
      npm install -g pnpm
  - mode: user
    script: |
      #!/bin/bash
      set -eux
      npm install -g @anthropic-ai/claude-code || true
      curl -fsSL https://opencode.ai/install | bash || true
`;
}

/**
 * Start the Lima VM
 */
export async function startInstance(
  projectDir: string,
  options: LimaStartOptions = {}
): Promise<LimaResult> {
  const name = RAPID_LIMA_INSTANCE;

  // Check if Lima is available
  if (!(await hasLima())) {
    return {
      success: false,
      error: 'Lima is not installed. Install with: brew install lima',
    };
  }

  // Check if not macOS
  if (!isMacOS()) {
    return {
      success: false,
      error: 'Lima is only available on macOS',
    };
  }

  try {
    // Check if instance already exists
    const exists = await instanceExists(name);

    if (exists) {
      // Check if running
      if (await isRunning(name)) {
        return { success: true }; // Already running
      }

      // Start existing instance
      await execa('limactl', ['start', name], {
        timeout: (options.timeout ?? 300) * 1000,
        stdio: 'inherit', // Show progress
      });
    } else {
      // Create config and start new instance
      const configPath = await createLimaConfig(projectDir, options);

      await execa('limactl', ['start', '--name', name, configPath], {
        timeout: (options.timeout ?? 600) * 1000,
        stdio: 'inherit', // Show progress
      });
    }

    return { success: true };
  } catch (err) {
    const error = err as ExecaError;
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Stop the Lima VM
 */
export async function stopInstance(
  name: string = RAPID_LIMA_INSTANCE,
  options: { force?: boolean } = {}
): Promise<LimaResult> {
  try {
    const args = ['stop'];
    if (options.force) {
      args.push('--force');
    }
    args.push(name);

    await execa('limactl', args);
    return { success: true };
  } catch (err) {
    const error = err as ExecaError;
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Delete the Lima VM
 */
export async function deleteInstance(
  name: string = RAPID_LIMA_INSTANCE,
  options: { force?: boolean } = {}
): Promise<LimaResult> {
  try {
    const args = ['delete'];
    if (options.force) {
      args.push('--force');
    }
    args.push(name);

    await execa('limactl', args);
    return { success: true };
  } catch (err) {
    const error = err as ExecaError;
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Execute a command inside the Lima VM
 */
export async function execInLima(
  command: string[],
  options: {
    name?: string;
    cwd?: string;
    env?: Record<string, string>;
    interactive?: boolean;
    tty?: boolean;
  } = {}
): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }> {
  const name = options.name ?? RAPID_LIMA_INSTANCE;

  try {
    // Build the command
    let fullCommand = command.join(' ');

    // If cwd is specified, cd to it first
    if (options.cwd) {
      fullCommand = `cd "${options.cwd}" && ${fullCommand}`;
    }

    // Build environment variable exports
    if (options.env) {
      const exports = Object.entries(options.env)
        .map(([key, value]) => `export ${key}="${value}"`)
        .join(' && ');
      fullCommand = `${exports} && ${fullCommand}`;
    }

    const useInheritStdio = options.interactive || options.tty;

    const result = await execa(
      'limactl',
      ['shell', name, '--', 'bash', '-c', fullCommand],
      useInheritStdio ? { stdio: 'inherit' } : {}
    );

    const successResult: { success: boolean; stdout?: string; stderr?: string; error?: string } = {
      success: true,
    };
    const stdout = getOutputString(result.stdout);
    const stderr = getOutputString(result.stderr);
    if (stdout) successResult.stdout = stdout;
    if (stderr) successResult.stderr = stderr;
    return successResult;
  } catch (err) {
    const error = err as ExecaError;
    const errorResult: { success: boolean; stdout?: string; stderr?: string; error?: string } = {
      success: false,
      error: error.message,
    };
    const stdout = getOutputString(error.stdout);
    const stderr = getOutputString(error.stderr);
    if (stdout) errorResult.stdout = stdout;
    if (stderr) errorResult.stderr = stderr;
    return errorResult;
  }
}

/**
 * Open an interactive shell in the Lima VM
 */
export async function shellInLima(
  options: {
    name?: string;
    cwd?: string;
    command?: string;
  } = {}
): Promise<void> {
  const name = options.name ?? RAPID_LIMA_INSTANCE;
  const args = ['shell', name];

  if (options.cwd) {
    args.push('--workdir', options.cwd);
  }

  if (options.command) {
    args.push('--', options.command);
  }

  await execa('limactl', args, { stdio: 'inherit' });
}

/**
 * Get SSH connection info for the Lima VM
 */
export async function getSshInfo(name: string = RAPID_LIMA_INSTANCE): Promise<{
  host: string;
  port: number;
  user: string;
  identityFile: string;
} | null> {
  const instance = await getInstance(name);
  if (!instance || instance.status !== 'Running') {
    return null;
  }

  return {
    host: '127.0.0.1',
    port: instance.sshLocalPort ?? 0,
    user: process.env.USER ?? 'lima',
    identityFile: join(homedir(), '.lima', name, 'ssh', 'id_ed25519'),
  };
}

/**
 * Known agent CLI install commands
 */
const AGENT_INSTALL_COMMANDS: Record<string, string[]> = {
  claude: ['sudo', 'npm', 'install', '-g', '@anthropic-ai/claude-code'],
  opencode: ['bash', '-c', 'curl -fsSL https://opencode.ai/install | bash'],
  aider: ['pip3', 'install', '--user', 'aider-chat'],
};

/**
 * Check if an agent CLI is available in the Lima VM
 */
export async function isAgentInstalled(
  agentCli: string,
  name: string = RAPID_LIMA_INSTANCE
): Promise<boolean> {
  try {
    const result = await execInLima(['which', agentCli], { name });
    return result.success && !!result.stdout?.trim();
  } catch {
    return false;
  }
}

/**
 * Install an agent CLI in the Lima VM
 */
export async function installAgent(
  agentCli: string,
  name: string = RAPID_LIMA_INSTANCE
): Promise<LimaResult> {
  const installCmd = AGENT_INSTALL_COMMANDS[agentCli];

  if (!installCmd) {
    return {
      success: false,
      error: `Unknown agent "${agentCli}". No install command available.`,
    };
  }

  try {
    const result = await execInLima(installCmd, { name });

    if (!result.success) {
      return {
        success: false,
        error: result.error || result.stderr || `Failed to install ${agentCli}`,
      };
    }

    // Verify installation
    const installed = await isAgentInstalled(agentCli, name);
    if (!installed) {
      return {
        success: false,
        error: `Installation command succeeded but ${agentCli} is not in PATH`,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Ensure an agent CLI is available in the Lima VM, installing if necessary
 */
export async function ensureAgentInstalled(
  agentCli: string,
  name: string = RAPID_LIMA_INSTANCE
): Promise<LimaResult> {
  // First check if already installed
  if (await isAgentInstalled(agentCli, name)) {
    return { success: true };
  }

  // Try to install
  return installAgent(agentCli, name);
}

/**
 * Copy SSH keys to Lima VM for git operations
 */
export async function setupGitSsh(name: string = RAPID_LIMA_INSTANCE): Promise<LimaResult> {
  try {
    // The SSH agent is forwarded via the lima.yaml config (forwardAgent: true)
    // We just need to verify it's working
    const result = await execInLima(['ssh-add', '-l'], { name });

    if (!result.success) {
      return {
        success: false,
        error: 'SSH agent forwarding is not working. Make sure ssh-agent is running on the host.',
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
