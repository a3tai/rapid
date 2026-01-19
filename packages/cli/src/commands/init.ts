/**
 * rapid init - Initialize RAPID in a project
 */

import { Command } from 'commander';
import { writeFile, access, readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  getDefaultConfig,
  logger,
  MCP_SERVER_TEMPLATES,
  addMcpServerFromTemplate,
  getSecretReferences,
  writeMcpConfig,
  writeOpenCodeConfig,
  RAPID_METHODOLOGY,
  MCP_USAGE_GUIDELINES,
  GIT_GUIDELINES,
  formatJson,
  type RapidConfig,
} from '@a3t/rapid-core';
import ora from 'ora';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { createClaudePlugin, getClaudePluginFiles } from '../templates/claude-plugin.js';

/**
 * Detected project type with language and optional framework
 */
interface DetectedProject {
  language: 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'ruby' | 'java' | 'unknown';
  framework?: string;
  packageManager?: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detect project type from files in directory
 */
async function detectProjectType(dir: string): Promise<DetectedProject> {
  const files = await readdir(dir).catch(() => []);
  const fileSet = new Set(files);

  // Check for Rust
  if (fileSet.has('Cargo.toml')) {
    return { language: 'rust', confidence: 'high' };
  }

  // Check for Go
  if (fileSet.has('go.mod')) {
    return { language: 'go', confidence: 'high' };
  }

  // Check for Python
  if (fileSet.has('pyproject.toml')) {
    const content = await readFile(join(dir, 'pyproject.toml'), 'utf-8').catch(() => '');
    const framework = content.includes('fastapi')
      ? 'fastapi'
      : content.includes('django')
        ? 'django'
        : content.includes('flask')
          ? 'flask'
          : undefined;
    if (framework) {
      return { language: 'python', framework, confidence: 'high' };
    }
    return { language: 'python', confidence: 'high' };
  }
  if (fileSet.has('requirements.txt') || fileSet.has('setup.py') || fileSet.has('Pipfile')) {
    return { language: 'python', confidence: 'medium' };
  }

  // Check for Ruby
  if (fileSet.has('Gemfile')) {
    return { language: 'ruby', confidence: 'high' };
  }

  // Check for Java
  if (fileSet.has('pom.xml') || fileSet.has('build.gradle') || fileSet.has('build.gradle.kts')) {
    return { language: 'java', confidence: 'high' };
  }

  // Check for TypeScript/JavaScript (most common, check last)
  if (fileSet.has('tsconfig.json')) {
    const pkgManager = fileSet.has('pnpm-lock.yaml')
      ? 'pnpm'
      : fileSet.has('yarn.lock')
        ? 'yarn'
        : fileSet.has('bun.lockb') || fileSet.has('bun.lock')
          ? 'bun'
          : 'npm';

    // Try to detect framework from package.json
    let framework: string | undefined;
    if (fileSet.has('package.json')) {
      const pkg = await readFile(join(dir, 'package.json'), 'utf-8').catch(() => '{}');
      try {
        const parsed = JSON.parse(pkg);
        const deps = { ...parsed.dependencies, ...parsed.devDependencies };
        if (deps.next) framework = 'nextjs';
        else if (deps.nuxt) framework = 'nuxt';
        else if (deps.react) framework = 'react';
        else if (deps.vue) framework = 'vue';
        else if (deps.svelte) framework = 'svelte';
        else if (deps.express) framework = 'express';
        else if (deps.fastify) framework = 'fastify';
        else if (deps.hono) framework = 'hono';
      } catch {
        // Ignore parse errors
      }
    }

    const result: DetectedProject = {
      language: 'typescript',
      packageManager: pkgManager,
      confidence: 'high',
    };
    if (framework) {
      result.framework = framework;
    }
    return result;
  }

  if (fileSet.has('package.json')) {
    const pkgManager = fileSet.has('pnpm-lock.yaml')
      ? 'pnpm'
      : fileSet.has('yarn.lock')
        ? 'yarn'
        : 'npm';
    return {
      language: 'javascript',
      packageManager: pkgManager,
      confidence: 'medium',
    };
  }

  return { language: 'unknown', confidence: 'low' };
}

/**
 * Get suggested template based on detected project
 */
function getSuggestedTemplate(detected: DetectedProject): string {
  switch (detected.language) {
    case 'typescript':
      return 'typescript';
    case 'javascript':
      return 'typescript'; // Use TS template for JS too
    case 'python':
      return 'python';
    case 'rust':
      return 'rust';
    case 'go':
      return 'go';
    default:
      return 'universal';
  }
}

interface TemplateSource {
  type: 'builtin' | 'github' | 'gitlab' | 'npm' | 'url';
  source: string;
  subdir?: string;
  ref?: string;
}

/**
 * Parse template source - supports:
 * - Built-in templates: typescript, python, rust, go, universal
 * - GitHub: github:user/repo, gh:user/repo, user/repo
 * - GitLab: gitlab:user/repo
 * - npm packages: npm:@scope/package, npm:package
 * - Direct URLs: https://...
 */
function parseTemplateSource(input: string): TemplateSource {
  // Built-in templates
  const builtinTemplates = [
    'typescript',
    'python',
    'rust',
    'go',
    'universal',
    'default',
    'infrastructure',
  ];
  if (builtinTemplates.includes(input)) {
    return { type: 'builtin', source: input };
  }

  // GitHub explicit: github:user/repo or gh:user/repo
  if (input.startsWith('github:') || input.startsWith('gh:')) {
    const source = input.replace(/^(github|gh):/, '');
    const parsed = parseRepoPath(source);
    const result: TemplateSource = { type: 'github', source: parsed.repo };
    if (parsed.subdir) result.subdir = parsed.subdir;
    if (parsed.ref) result.ref = parsed.ref;
    return result;
  }

  // GitLab: gitlab:user/repo
  if (input.startsWith('gitlab:')) {
    const source = input.replace(/^gitlab:/, '');
    const parsed = parseRepoPath(source);
    const result: TemplateSource = { type: 'gitlab', source: parsed.repo };
    if (parsed.subdir) result.subdir = parsed.subdir;
    if (parsed.ref) result.ref = parsed.ref;
    return result;
  }

  // npm: npm:@scope/package or npm:package
  if (input.startsWith('npm:')) {
    return { type: 'npm', source: input.replace(/^npm:/, '') };
  }

  // Direct URL
  if (input.startsWith('https://') || input.startsWith('http://')) {
    return { type: 'url', source: input };
  }

  // Assume GitHub shorthand: user/repo
  if (/^[\w.-]+\/[\w.-]+/.test(input)) {
    const parsed = parseRepoPath(input);
    const result: TemplateSource = { type: 'github', source: parsed.repo };
    if (parsed.subdir) result.subdir = parsed.subdir;
    if (parsed.ref) result.ref = parsed.ref;
    return result;
  }

  // Fallback to builtin
  return { type: 'builtin', source: 'universal' };
}

interface RepoPath {
  repo: string;
  subdir?: string;
  ref?: string;
}

/**
 * Parse repo path with optional subdir and ref
 * Format: user/repo/subdir#ref
 */
function parseRepoPath(input: string): RepoPath {
  let ref: string | undefined;
  let path = input;

  // Extract ref after #
  if (path.includes('#')) {
    const parts = path.split('#');
    path = parts[0]!;
    ref = parts[1];
  }

  // Split into repo and subdir
  const segments = path.split('/');
  if (segments.length >= 2) {
    const repo = `${segments[0]}/${segments[1]}`;
    const subdir = segments.length > 2 ? segments.slice(2).join('/') : undefined;
    const result: RepoPath = { repo };
    if (subdir) result.subdir = subdir;
    if (ref) result.ref = ref;
    return result;
  }

  const result: RepoPath = { repo: path };
  if (ref) result.ref = ref;
  return result;
}

/**
 * Download template from remote source using giget
 */
async function downloadRemoteTemplate(
  parsed: ReturnType<typeof parseTemplateSource>,
  destDir: string,
  spinner: ReturnType<typeof ora>
): Promise<boolean> {
  try {
    // Dynamic import of giget
    const { downloadTemplate } = await import('giget');

    let source: string;
    switch (parsed.type) {
      case 'github':
        source = `github:${parsed.source}${parsed.subdir ? '/' + parsed.subdir : ''}${parsed.ref ? '#' + parsed.ref : ''}`;
        break;
      case 'gitlab':
        source = `gitlab:${parsed.source}${parsed.subdir ? '/' + parsed.subdir : ''}${parsed.ref ? '#' + parsed.ref : ''}`;
        break;
      case 'url':
        source = parsed.source;
        break;
      default:
        return false;
    }

    spinner.text = `Downloading template from ${source}...`;
    await downloadTemplate(source, {
      dir: destDir,
      force: true,
    });

    return true;
  } catch (error) {
    logger.debug(
      `Failed to download template: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * DevContainer configuration for a specific language/framework
 */
interface DevContainerConfig {
  name: string;
  image: string;
  features?: Record<string, Record<string, unknown> | object>;
  customizations: {
    vscode: {
      extensions: string[];
      settings?: Record<string, unknown>;
    };
  };
  containerEnv?: Record<string, string>;
  postCreateCommand?: string;
  postStartCommand: string;
  remoteUser: string;
  mounts?: string[];
}

/**
 * Pre-built image registry
 */
const PREBUILT_IMAGE_REGISTRY = 'ghcr.io/a3tai/rapid-devcontainer';

/**
 * Map of language to pre-built image name
 */
const PREBUILT_IMAGES: Record<string, string> = {
  typescript: `${PREBUILT_IMAGE_REGISTRY}-typescript:latest`,
  javascript: `${PREBUILT_IMAGE_REGISTRY}-typescript:latest`,
  python: `${PREBUILT_IMAGE_REGISTRY}-python:latest`,
  rust: `${PREBUILT_IMAGE_REGISTRY}-rust:latest`,
  go: `${PREBUILT_IMAGE_REGISTRY}-go:latest`,
  universal: `${PREBUILT_IMAGE_REGISTRY}-universal:latest`,
  infrastructure: `${PREBUILT_IMAGE_REGISTRY}-infrastructure:latest`,
};

/**
 * VSCode customizations for each template (used with pre-built images)
 */
const TEMPLATE_CUSTOMIZATIONS: Record<string, DevContainerConfig['customizations']> = {
  typescript: {
    vscode: {
      extensions: [
        'dbaeumer.vscode-eslint',
        'esbenp.prettier-vscode',
        'bradlc.vscode-tailwindcss',
        'prisma.prisma',
        'mikestead.dotenv',
      ],
      settings: {
        'editor.formatOnSave': true,
        'editor.defaultFormatter': 'esbenp.prettier-vscode',
      },
    },
  },
  python: {
    vscode: {
      extensions: [
        'ms-python.python',
        'ms-python.vscode-pylance',
        'charliermarsh.ruff',
        'ms-toolsai.jupyter',
      ],
      settings: {
        '[python]': {
          'editor.formatOnSave': true,
          'editor.defaultFormatter': 'charliermarsh.ruff',
        },
      },
    },
  },
  rust: {
    vscode: {
      extensions: ['rust-lang.rust-analyzer', 'tamasfe.even-better-toml', 'vadimcn.vscode-lldb'],
      settings: { '[rust]': { 'editor.formatOnSave': true } },
    },
  },
  go: {
    vscode: {
      extensions: ['golang.go', 'zxh404.vscode-proto3'],
      settings: { '[go]': { 'editor.formatOnSave': true } },
    },
  },
  universal: {
    vscode: {
      extensions: [
        'dbaeumer.vscode-eslint',
        'esbenp.prettier-vscode',
        'ms-python.python',
        'golang.go',
      ],
    },
  },
  infrastructure: {
    vscode: {
      extensions: [
        'hashicorp.terraform',
        'ms-kubernetes-tools.vscode-kubernetes-tools',
        'redhat.vscode-yaml',
      ],
    },
  },
};

/**
 * Get configuration for pre-built image (minimal, since features are baked in)
 */
function getPrebuiltConfig(
  templateName: string,
  containerEnv: Record<string, string>,
  postStartCommand: string
): DevContainerConfig {
  const image = PREBUILT_IMAGES[templateName] ?? PREBUILT_IMAGES.universal!;
  const customizations =
    TEMPLATE_CUSTOMIZATIONS[templateName] ?? TEMPLATE_CUSTOMIZATIONS.universal!;
  const remoteUser = templateName === 'typescript' ? 'node' : 'vscode';

  return {
    name: `RAPID ${templateName.charAt(0).toUpperCase() + templateName.slice(1)} (Pre-built)`,
    image,
    customizations,
    containerEnv,
    postStartCommand,
    remoteUser,
  };
}

/**
 * Get devcontainer configuration based on detected project
 */
function getDevContainerConfig(
  detected?: DetectedProject,
  usePrebuilt = false
): DevContainerConfig {
  const baseFeatures = {
    'ghcr.io/devcontainers/features/git:1': {},
    'ghcr.io/devcontainers/features/github-cli:1': {},
  };

  const containerEnv = {
    OP_SERVICE_ACCOUNT_TOKEN: '${localEnv:OP_SERVICE_ACCOUNT_TOKEN}',
  };

  // Install tools via apt/curl instead of unreliable devcontainers-contrib features
  const installTools =
    "sudo apt-get update -qq && sudo apt-get install -y -qq jq direnv && curl -sS https://downloads.1password.com/linux/keys/1password.asc | sudo gpg --dearmor -o /usr/share/keyrings/1password.gpg && echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/1password.gpg] https://downloads.1password.com/linux/debian/amd64 stable main' | sudo tee /etc/apt/sources.list.d/1password.list && sudo apt-get update -qq && sudo apt-get install -y -qq 1password-cli && curl -fsSL https://starship.rs/install.sh | sh -s -- -y";
  const postCreateBase = `${installTools} && npm install -g @anthropic-ai/claude-code && curl -fsSL https://opencode.ai/install | bash`;
  const postStartCommand = 'direnv allow 2>/dev/null || true';

  const language = detected?.language || 'unknown';
  const templateName =
    language === 'javascript' ? 'typescript' : language === 'unknown' ? 'universal' : language;

  // If using pre-built image, return minimal config (features are baked in)
  if (usePrebuilt && PREBUILT_IMAGES[templateName]) {
    return getPrebuiltConfig(templateName, containerEnv, postStartCommand);
  }

  switch (language) {
    case 'typescript':
    case 'javascript':
      return {
        name: 'RAPID TypeScript',
        image: 'mcr.microsoft.com/devcontainers/typescript-node:22',
        features: {
          ...baseFeatures,
        },
        customizations: {
          vscode: {
            extensions: [
              'dbaeumer.vscode-eslint',
              'esbenp.prettier-vscode',
              'bradlc.vscode-tailwindcss',
              'prisma.prisma',
              'mikestead.dotenv',
            ],
            settings: {
              'editor.formatOnSave': true,
              'editor.defaultFormatter': 'esbenp.prettier-vscode',
              'editor.codeActionsOnSave': {
                'source.fixAll.eslint': 'explicit',
              },
            },
          },
        },
        containerEnv,
        postCreateCommand: postCreateBase,
        postStartCommand,
        remoteUser: 'node',
      };

    case 'python':
      return {
        name: 'RAPID Python',
        image: 'mcr.microsoft.com/devcontainers/python:3.12',
        features: {
          ...baseFeatures,
          'ghcr.io/devcontainers/features/node:1': { version: '22' },
        },
        customizations: {
          vscode: {
            extensions: [
              'ms-python.python',
              'ms-python.vscode-pylance',
              'ms-python.debugpy',
              'charliermarsh.ruff',
              'ms-toolsai.jupyter',
              'tamasfe.even-better-toml',
            ],
            settings: {
              'python.defaultInterpreterPath': '/usr/local/bin/python',
              '[python]': {
                'editor.formatOnSave': true,
                'editor.defaultFormatter': 'charliermarsh.ruff',
                'editor.codeActionsOnSave': {
                  'source.fixAll': 'explicit',
                  'source.organizeImports': 'explicit',
                },
              },
            },
          },
        },
        containerEnv,
        postCreateCommand: `${postCreateBase} && pip install poetry uv aider-chat`,
        postStartCommand,
        remoteUser: 'vscode',
      };

    case 'rust':
      return {
        name: 'RAPID Rust',
        image: 'mcr.microsoft.com/devcontainers/rust:latest',
        features: {
          ...baseFeatures,
          'ghcr.io/devcontainers/features/node:1': { version: '22' },
        },
        customizations: {
          vscode: {
            extensions: [
              'rust-lang.rust-analyzer',
              'tamasfe.even-better-toml',
              'serayuzgur.crates',
              'vadimcn.vscode-lldb',
            ],
            settings: {
              'rust-analyzer.checkOnSave.command': 'clippy',
              '[rust]': {
                'editor.formatOnSave': true,
                'editor.defaultFormatter': 'rust-lang.rust-analyzer',
              },
            },
          },
        },
        containerEnv,
        postCreateCommand: `${postCreateBase} && rustup component add clippy rustfmt`,
        postStartCommand,
        remoteUser: 'vscode',
      };

    case 'go':
      return {
        name: 'RAPID Go',
        image: 'mcr.microsoft.com/devcontainers/go:1.23',
        features: {
          ...baseFeatures,
          'ghcr.io/devcontainers/features/node:1': { version: '22' },
        },
        customizations: {
          vscode: {
            extensions: ['golang.go', 'zxh404.vscode-proto3', 'tamasfe.even-better-toml'],
            settings: {
              'go.useLanguageServer': true,
              'go.lintTool': 'golangci-lint',
              'go.lintFlags': ['--fast'],
              '[go]': {
                'editor.formatOnSave': true,
                'editor.codeActionsOnSave': {
                  'source.organizeImports': 'explicit',
                },
              },
            },
          },
        },
        containerEnv,
        postCreateCommand: `${postCreateBase} && go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest && go install github.com/air-verse/air@latest`,
        postStartCommand,
        remoteUser: 'vscode',
      };

    default:
      // Universal container with multiple languages
      return {
        name: 'RAPID Universal',
        image: 'mcr.microsoft.com/devcontainers/base:ubuntu',
        features: {
          ...baseFeatures,
          'ghcr.io/devcontainers/features/node:1': { version: '22' },
          'ghcr.io/devcontainers/features/python:1': { version: '3.12' },
          'ghcr.io/devcontainers/features/go:1': { version: '1.23' },
          'ghcr.io/devcontainers/features/docker-in-docker:2': {},
        },
        customizations: {
          vscode: {
            extensions: [
              'dbaeumer.vscode-eslint',
              'esbenp.prettier-vscode',
              'ms-python.python',
              'ms-python.vscode-pylance',
              'golang.go',
              'tamasfe.even-better-toml',
              'redhat.vscode-yaml',
            ],
          },
        },
        containerEnv,
        postCreateCommand: `${postCreateBase} && pip install aider-chat`,
        postStartCommand,
        remoteUser: 'vscode',
      };
  }
}

/**
 * Create devcontainer configuration files
 */
async function createDevContainer(
  dir: string,
  detected?: DetectedProject,
  force = false,
  usePrebuilt = false
): Promise<boolean> {
  const devcontainerDir = join(dir, '.devcontainer');
  const devcontainerJsonPath = join(devcontainerDir, 'devcontainer.json');

  // Check if devcontainer already exists
  if (!force && existsSync(devcontainerJsonPath)) {
    return false; // Skip, already exists
  }

  // Create .devcontainer directory
  await mkdir(devcontainerDir, { recursive: true });

  // Get configuration based on detected project
  const config = getDevContainerConfig(detected, usePrebuilt);

  // Write devcontainer.json
  await writeFile(devcontainerJsonPath, await formatJson(config));

  return true;
}

/**
 * Interactive init flow using @clack/prompts
 */
async function runInteractiveInit(
  cwd: string,
  _detectedProject: DetectedProject | undefined,
  _options: { force?: boolean }
): Promise<{
  projectName: string;
  mcpServers: string[];
  secretsProvider: 'env' | '1password' | 'vault';
  vault: string | undefined;
  createDevcontainer: boolean;
  usePrebuilt: boolean;
} | null> {
  console.log();
  clack.intro(chalk.cyan.bold('  RAPID Setup'));

  // Project name (auto-detected)
  const dirName = cwd.split('/').pop() || 'my-project';
  const projectName = await clack.text({
    message: 'Project name',
    initialValue: dirName,
    validate: (value) => {
      if (!value.trim()) return 'Project name is required';
      return undefined;
    },
  });

  if (clack.isCancel(projectName)) {
    clack.cancel('Setup cancelled');
    return null;
  }

  // MCP servers selection
  const mcpOptions = [
    { value: 'context7', label: 'context7', hint: 'Library docs (Recommended)' },
    { value: 'tavily', label: 'tavily', hint: 'Web search (Recommended)' },
    { value: 'github', label: 'github', hint: 'GitHub operations' },
    { value: 'postgres', label: 'postgres', hint: 'Database access' },
    { value: 'filesystem', label: 'filesystem', hint: 'File operations' },
    { value: 'puppeteer', label: 'puppeteer', hint: 'Browser automation' },
  ];

  const selectedMcp = await clack.multiselect({
    message: 'MCP servers to enable',
    options: mcpOptions,
    initialValues: ['context7', 'tavily'],
    required: false,
  });

  if (clack.isCancel(selectedMcp)) {
    clack.cancel('Setup cancelled');
    return null;
  }

  // Secret management provider
  const secretsProvider = await clack.select({
    message: 'Secret management',
    options: [
      { value: '1password', label: '1Password', hint: 'Recommended' },
      { value: 'vault', label: 'HashiCorp Vault' },
      { value: 'env', label: 'Environment variables' },
    ],
    initialValue: '1password',
  });

  if (clack.isCancel(secretsProvider)) {
    clack.cancel('Setup cancelled');
    return null;
  }

  // Vault name if using 1Password or Vault
  let vault: string | undefined;
  if (secretsProvider === '1password' || secretsProvider === 'vault') {
    const vaultInput = await clack.text({
      message: secretsProvider === '1password' ? '1Password vault name' : 'Vault path',
      initialValue: 'Development',
      validate: (value) => {
        if (!value.trim()) return 'Vault is required';
        return undefined;
      },
    });

    if (clack.isCancel(vaultInput)) {
      clack.cancel('Setup cancelled');
      return null;
    }
    vault = vaultInput;
  }

  // Devcontainer creation
  const createDevcontainer = await clack.confirm({
    message: 'Create devcontainer configuration?',
    initialValue: true,
  });

  if (clack.isCancel(createDevcontainer)) {
    clack.cancel('Setup cancelled');
    return null;
  }

  // Pre-built images if devcontainer
  let usePrebuilt = false;
  if (createDevcontainer) {
    const prebuiltChoice = await clack.confirm({
      message: 'Use pre-built images for faster startup?',
      initialValue: false,
    });

    if (clack.isCancel(prebuiltChoice)) {
      clack.cancel('Setup cancelled');
      return null;
    }
    usePrebuilt = prebuiltChoice;
  }

  return {
    projectName,
    mcpServers: selectedMcp as string[],
    secretsProvider: secretsProvider as 'env' | '1password' | 'vault',
    vault,
    createDevcontainer,
    usePrebuilt,
  };
}

export const initCommand = new Command('init')
  .description('Initialize RAPID in a project')
  .argument('[template]', 'Template: builtin name, github:user/repo, npm:package, or URL')
  .option('--force', 'Overwrite existing files', false)
  .option('--agent <name>', 'Default agent to configure', 'claude')
  .option('--no-devcontainer', 'Skip devcontainer creation')
  .option('--prebuilt', 'Use pre-built devcontainer images from ghcr.io (faster startup)', false)
  .option('--mcp <servers>', 'MCP servers to enable (comma-separated)', 'context7,tavily')
  .option('--no-mcp', 'Skip MCP server configuration')
  .option('--no-detect', 'Skip auto-detection of project type')
  .option('--no-claude-plugin', 'Skip Claude Code plugin generation')
  .option('-y, --yes', 'Skip interactive prompts and use defaults')
  .action(async (templateArg: string | undefined, options) => {
    const cwd = process.cwd();
    const configPath = join(cwd, 'rapid.json');

    // Check if config already exists (before interactive mode)
    if (!options.force) {
      try {
        await access(configPath);
        logger.error('rapid.json already exists. Use --force to overwrite.');
        process.exit(1);
      } catch {
        // File doesn't exist, continue
      }
    }

    // Auto-detect project type
    const spinner = ora('Detecting project type...').start();
    let detectedProject: DetectedProject | undefined;
    if (options.detect !== false) {
      detectedProject = await detectProjectType(cwd);
      if (detectedProject.language !== 'unknown') {
        spinner.succeed(
          `Detected ${detectedProject.language}${detectedProject.framework ? ` (${detectedProject.framework})` : ''} project`
        );
      } else {
        spinner.info('Could not detect project type');
      }
    } else {
      spinner.stop();
    }

    // Determine if we should use interactive mode
    // Interactive mode: no template specified and not --yes
    const useInteractive = !templateArg && !options.yes;

    let mcpServers: string[];
    let secretsProvider: 'env' | '1password' | 'vault';
    let vault: string | undefined;
    let createDevcontainerFlag: boolean;
    let usePrebuilt: boolean;
    let projectName: string;

    if (useInteractive) {
      // Run interactive flow
      const answers = await runInteractiveInit(cwd, detectedProject, options);
      if (!answers) {
        process.exit(0);
      }

      projectName = answers.projectName;
      mcpServers = answers.mcpServers;
      secretsProvider = answers.secretsProvider;
      vault = answers.vault;
      createDevcontainerFlag = answers.createDevcontainer;
      usePrebuilt = answers.usePrebuilt;
    } else {
      // Non-interactive mode (--yes or template specified)
      projectName = cwd.split('/').pop() || 'my-project';
      mcpServers = options.mcp === false ? [] : options.mcp.split(',').map((s: string) => s.trim());
      secretsProvider = '1password';
      vault = 'Development';
      createDevcontainerFlag = options.devcontainer !== false;
      usePrebuilt = options.prebuilt === true;
    }

    const spinner2 = ora('Initializing RAPID...').start();

    try {
      let templateSource = templateArg;

      if (!templateArg && detectedProject && detectedProject.language !== 'unknown') {
        templateSource = getSuggestedTemplate(detectedProject);
      }

      // Parse template source
      const parsed = parseTemplateSource(templateSource || 'universal');

      // Handle remote templates (GitHub, GitLab, npm, URL)
      if (parsed.type !== 'builtin') {
        spinner2.text = `Fetching template from ${parsed.source}...`;

        // For npm packages, we'd need additional handling
        if (parsed.type === 'npm') {
          spinner2.fail('npm template support coming soon. Use github:user/repo instead.');
          process.exit(1);
        }

        const downloaded = await downloadRemoteTemplate(parsed, cwd, spinner2);
        if (!downloaded) {
          spinner2.fail(`Failed to download template from ${parsed.source}`);
          logger.info('Make sure the repository exists and is accessible.');
          logger.info('For private repos, set GIGET_AUTH environment variable.');
          process.exit(1);
        }

        spinner2.succeed(`Downloaded template from ${parsed.source}`);

        // Check if downloaded template has rapid.json, if so we're done
        try {
          await access(join(cwd, 'rapid.json'));
          logger.blank();
          logger.info('Template includes rapid.json configuration.');
          logger.info('Run `rapid dev` to start coding!');
          return;
        } catch {
          // No rapid.json in template, continue to create one
          spinner2.start('Creating RAPID configuration...');
        }
      }

      // Create config with project name and MCP servers
      let config = createConfigWithOptions({ agent: options.agent, projectName }, detectedProject);

      // Always add RAPID MCP server first
      config = addRapidMcpServer(config);

      // Add selected MCP servers
      if (mcpServers.length > 0) {
        spinner2.text = 'Configuring MCP servers...';
        for (const serverName of mcpServers) {
          if (MCP_SERVER_TEMPLATES[serverName]) {
            config = addMcpServerFromTemplate(config, serverName);
          } else {
            logger.warn(`Unknown MCP server template: ${serverName}`);
          }
        }

        // Add secret references for MCP servers
        const secretRefs = getSecretReferences(mcpServers);
        if (Object.keys(secretRefs).length > 0) {
          config.secrets = {
            ...config.secrets,
            provider: secretsProvider,
            ...(vault !== undefined ? { vault } : {}),
            items: {
              ...config.secrets?.items,
              ...secretRefs,
            },
          };
        }
      } else {
        // Still set the secrets provider even without MCP servers
        config.secrets = {
          ...config.secrets,
          provider: secretsProvider,
          ...(vault !== undefined ? { vault } : {}),
        };
      }

      // Enable event bus by default
      config.eventBus = { enabled: true };

      spinner2.text = 'Writing rapid.json...';
      await writeFile(configPath, await formatJson(config));

      // Generate MCP config files (always generate since we have rapid MCP server)
      spinner2.text = 'Generating MCP configuration files...';
      await writeMcpConfig(cwd, config);
      await writeOpenCodeConfig(cwd, config);

      // Create CLAUDE.md if using claude
      if (config.agents.available.claude) {
        spinner2.text = 'Creating CLAUDE.md...';
        const claudeMdPath = join(cwd, 'CLAUDE.md');
        await writeFile(claudeMdPath, getClaudeMdTemplate(cwd, detectedProject));
      }

      // Create AGENTS.md
      spinner2.text = 'Creating AGENTS.md...';
      const agentsMdPath = join(cwd, 'AGENTS.md');
      await writeFile(agentsMdPath, getAgentsMdTemplate(cwd, detectedProject));

      // Create devcontainer if not skipped
      let devcontainerCreated = false;
      if (createDevcontainerFlag) {
        spinner2.text = usePrebuilt
          ? 'Creating devcontainer configuration (using pre-built image)...'
          : 'Creating devcontainer configuration...';
        devcontainerCreated = await createDevContainer(
          cwd,
          detectedProject,
          options.force,
          usePrebuilt
        );
      }

      // Create Claude Code plugin if using claude and not skipped
      let claudePluginCreated = false;
      if (options.claudePlugin !== false && config.agents.available.claude) {
        spinner2.text = 'Creating Claude Code plugin...';
        claudePluginCreated = await createClaudePlugin(cwd, projectName, { force: options.force });
      }

      spinner2.succeed('RAPID initialized successfully!');

      // Show detected info
      if (detectedProject && detectedProject.language !== 'unknown') {
        logger.blank();
        logger.info('Project detected:');
        console.log(`  ${logger.dim('Language:')}  ${detectedProject.language}`);
        if (detectedProject.framework) {
          console.log(`  ${logger.dim('Framework:')} ${detectedProject.framework}`);
        }
        if (detectedProject.packageManager) {
          console.log(`  ${logger.dim('Package Mgr:')} ${detectedProject.packageManager}`);
        }
      }

      logger.blank();
      logger.info('Created files:');
      console.log(`  ${logger.dim('•')} rapid.json`);
      if (mcpServers.length > 0) {
        console.log(`  ${logger.dim('•')} .mcp.json`);
        console.log(`  ${logger.dim('•')} opencode.json`);
      }
      if (devcontainerCreated) {
        console.log(`  ${logger.dim('•')} .devcontainer/devcontainer.json`);
      }
      if (claudePluginCreated) {
        console.log(`  ${logger.dim('•')} .claude-plugin/`);
        for (const file of getClaudePluginFiles()) {
          console.log(`    ${logger.dim('•')} ${file.replace('.claude-plugin/', '')}`);
        }
      }
      console.log(`  ${logger.dim('•')} CLAUDE.md`);
      console.log(`  ${logger.dim('•')} AGENTS.md`);

      // Show configured MCP servers (always show RAPID server + user-selected ones)
      logger.blank();
      logger.info('MCP servers configured:');
      console.log(`  ${logger.brand('•')} rapid - RAPID event bus & tools (always enabled)`);
      for (const serverName of mcpServers) {
        const template = MCP_SERVER_TEMPLATES[serverName];
        if (template) {
          console.log(`  ${logger.brand('•')} ${serverName} - ${template.description}`);
        }
      }

      logger.blank();
      logger.info('Next step:');
      console.log(`  Run ${logger.brand('rapid dev')} to start coding!`);

      if (secretsProvider !== 'env' && mcpServers.length > 0) {
        logger.blank();
        logger.dim(
          `  Note: Configure API keys in ${secretsProvider === '1password' ? '1Password' : 'Vault'} for MCP servers.`
        );
      }
      logger.blank();
    } catch (error) {
      spinner2.fail('Failed to initialize RAPID');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

function createConfigWithOptions(
  options: { agent: string; projectName: string },
  _detectedProject?: DetectedProject
): RapidConfig {
  const defaults = getDefaultConfig();

  const config: RapidConfig = {
    $schema: 'https://getrapid.dev/schema/v1/rapid.json',
    version: '1.0',
    name: options.projectName,
    agents: {
      default: options.agent,
      available: {
        ...defaults.agents.available,
        claude: {
          cli: 'claude',
          instructionFile: 'CLAUDE.md',
          yolo: true, // Enable YOLO mode by default for streamlined UX
        },
        opencode: {
          cli: 'opencode',
          instructionFile: 'AGENTS.md',
        },
      },
    },
    secrets: {
      provider: 'env',
    },
    context: {
      files: ['README.md', 'CLAUDE.md', 'AGENTS.md'],
      generateAgentFiles: false, // We already created them
    },
    mcp: {
      configFile: '.mcp.json',
      servers: {},
    },
  };

  return config;
}

/**
 * Add the RAPID MCP server to the config (always included)
 */
function addRapidMcpServer(config: RapidConfig): RapidConfig {
  return {
    ...config,
    mcp: {
      ...config.mcp,
      configFile: config.mcp?.configFile ?? '.mcp.json',
      servers: {
        rapid: {
          enabled: true,
          type: 'stdio',
          command: 'rapid',
          args: ['mcp', 'serve'],
        },
        ...config.mcp?.servers,
      },
    },
  };
}

function getClaudeMdTemplate(projectPath: string, detectedProject?: DetectedProject): string {
  const projectName = projectPath.split('/').pop() || 'project';

  let languageSection = '';
  if (detectedProject && detectedProject.language !== 'unknown') {
    languageSection = `## Technology Stack

- **Language**: ${detectedProject.language}${detectedProject.framework ? `\n- **Framework**: ${detectedProject.framework}` : ''}${detectedProject.packageManager ? `\n- **Package Manager**: ${detectedProject.packageManager}` : ''}

`;
  }

  return `# Claude Instructions

## Project: ${projectName}

This file contains instructions for Claude Code when working on this project.

## Overview

<!-- Describe your project here -->

${languageSection}${RAPID_METHODOLOGY}
${MCP_USAGE_GUIDELINES}
${GIT_GUIDELINES}
## Key Files

- \`rapid.json\` - RAPID configuration
- \`README.md\` - Project documentation

## Commands

\`\`\`bash
# Start development
rapid dev

# Check status
rapid status
\`\`\`
`;
}

function getAgentsMdTemplate(projectPath: string, detectedProject?: DetectedProject): string {
  const projectName = projectPath.split('/').pop() || 'project';

  let languageSection = '';
  if (detectedProject && detectedProject.language !== 'unknown') {
    languageSection = `## Technology Stack

- **Language**: ${detectedProject.language}${detectedProject.framework ? `\n- **Framework**: ${detectedProject.framework}` : ''}${detectedProject.packageManager ? `\n- **Package Manager**: ${detectedProject.packageManager}` : ''}

`;
  }

  return `# Agent Instructions

## Project: ${projectName}

This file contains instructions for AI coding agents working on this project.

## Overview

<!-- Describe your project here -->

${languageSection}${RAPID_METHODOLOGY}
${MCP_USAGE_GUIDELINES}
${GIT_GUIDELINES}
## Project Structure

\`\`\`
.
├── rapid.json          # RAPID configuration
├── CLAUDE.md           # Claude-specific instructions
├── AGENTS.md           # Generic agent instructions
└── ...
\`\`\`

## Getting Started

1. Review the project structure
2. Check \`rapid.json\` for configuration
3. Follow the RAPID methodology above when making changes
`;
}
