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
  type RapidConfig,
} from '@a3t/rapid-core';
import ora from 'ora';

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
    return { language: 'javascript', packageManager: pkgManager, confidence: 'medium' };
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
    'ghcr.io/devcontainers-contrib/features/direnv:1': {},
    'ghcr.io/devcontainers-contrib/features/starship:1': {},
    'ghcr.io/devcontainers-contrib/features/1password-cli:1': {},
  };

  const containerEnv = {
    OP_SERVICE_ACCOUNT_TOKEN: '${localEnv:OP_SERVICE_ACCOUNT_TOKEN}',
  };

  const postCreateBase =
    'npm install -g @anthropic-ai/claude-code && curl -fsSL https://opencode.ai/install | bash';
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
          'ghcr.io/devcontainers-contrib/features/pnpm:2': {},
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
          'ghcr.io/devcontainers-contrib/features/poetry:2': {},
          'ghcr.io/devcontainers-contrib/features/uv:1': {},
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
        postCreateCommand: `${postCreateBase} && pip install aider-chat`,
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
  await writeFile(devcontainerJsonPath, JSON.stringify(config, null, 2) + '\n');

  return true;
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
  .action(async (templateArg: string | undefined, options) => {
    const spinner = ora('Initializing RAPID...').start();

    try {
      const cwd = process.cwd();
      const configPath = join(cwd, 'rapid.json');

      // Check if config already exists
      if (!options.force) {
        try {
          await access(configPath);
          spinner.fail('rapid.json already exists. Use --force to overwrite.');
          process.exit(1);
        } catch {
          // File doesn't exist, continue
        }
      }

      // Auto-detect project type if no template specified
      let detectedProject: DetectedProject | undefined;
      let templateSource = templateArg;

      if (!templateArg && options.detect !== false) {
        spinner.text = 'Detecting project type...';
        detectedProject = await detectProjectType(cwd);

        if (detectedProject.language !== 'unknown') {
          const suggested = getSuggestedTemplate(detectedProject);
          spinner.succeed(
            `Detected ${detectedProject.language}${detectedProject.framework ? ` (${detectedProject.framework})` : ''} project`
          );
          templateSource = suggested;
          logger.info(`Using ${logger.brand(suggested)} template`);
        } else {
          spinner.info('Could not detect project type, using universal template');
          templateSource = 'universal';
        }
        spinner.start('Initializing RAPID...');
      }

      // Parse template source
      const parsed = parseTemplateSource(templateSource || 'universal');

      // Handle remote templates (GitHub, GitLab, npm, URL)
      if (parsed.type !== 'builtin') {
        spinner.text = `Fetching template from ${parsed.source}...`;

        // For npm packages, we'd need additional handling
        if (parsed.type === 'npm') {
          spinner.fail('npm template support coming soon. Use github:user/repo instead.');
          process.exit(1);
        }

        const downloaded = await downloadRemoteTemplate(parsed, cwd, spinner);
        if (!downloaded) {
          spinner.fail(`Failed to download template from ${parsed.source}`);
          logger.info('Make sure the repository exists and is accessible.');
          logger.info('For private repos, set GIGET_AUTH environment variable.');
          process.exit(1);
        }

        spinner.succeed(`Downloaded template from ${parsed.source}`);

        // Check if downloaded template has rapid.json, if so we're done
        try {
          await access(join(cwd, 'rapid.json'));
          logger.blank();
          logger.info('Template includes rapid.json configuration.');
          logger.info('Run `rapid dev` to start coding!');
          return;
        } catch {
          // No rapid.json in template, continue to create one
          spinner.start('Creating RAPID configuration...');
        }
      }

      // Parse MCP servers option
      const mcpServers: string[] =
        options.mcp === false ? [] : options.mcp.split(',').map((s: string) => s.trim());

      // Create config with MCP servers
      let config = createConfig(options, detectedProject);

      // Add MCP servers
      if (mcpServers.length > 0) {
        spinner.text = 'Configuring MCP servers...';
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
            provider: '1password',
            vault: 'Development',
            items: {
              ...config.secrets?.items,
              ...secretRefs,
            },
          };
        }
      }

      spinner.text = 'Writing rapid.json...';
      await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');

      // Generate MCP config files if MCP servers are configured
      if (mcpServers.length > 0) {
        spinner.text = 'Generating MCP configuration files...';
        await writeMcpConfig(cwd, config);
        await writeOpenCodeConfig(cwd, config);
      }

      // Create CLAUDE.md if using claude
      if (config.agents.available.claude) {
        spinner.text = 'Creating CLAUDE.md...';
        const claudeMdPath = join(cwd, 'CLAUDE.md');
        await writeFile(claudeMdPath, getClaudeMdTemplate(cwd, detectedProject));
      }

      // Create AGENTS.md
      spinner.text = 'Creating AGENTS.md...';
      const agentsMdPath = join(cwd, 'AGENTS.md');
      await writeFile(agentsMdPath, getAgentsMdTemplate(cwd, detectedProject));

      // Create devcontainer if not skipped
      let devcontainerCreated = false;
      const usePrebuilt = options.prebuilt === true;
      if (options.devcontainer !== false) {
        spinner.text = usePrebuilt
          ? 'Creating devcontainer configuration (using pre-built image)...'
          : 'Creating devcontainer configuration...';
        devcontainerCreated = await createDevContainer(
          cwd,
          detectedProject,
          options.force,
          usePrebuilt
        );
      }

      spinner.succeed('RAPID initialized successfully!');

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
      console.log(`  ${logger.dim('•')} CLAUDE.md`);
      console.log(`  ${logger.dim('•')} AGENTS.md`);

      // Show configured MCP servers
      if (mcpServers.length > 0) {
        logger.blank();
        logger.info('MCP servers configured:');
        for (const serverName of mcpServers) {
          const template = MCP_SERVER_TEMPLATES[serverName];
          if (template) {
            console.log(`  ${logger.brand('•')} ${serverName} - ${template.description}`);
          }
        }
      }

      logger.blank();
      logger.info('Next steps:');
      let stepNum = 1;
      console.log(
        `  ${logger.dim(`${stepNum++}.`)} Run ${logger.brand('rapid dev')} to start coding`
      );
      console.log(
        `  ${logger.dim(`${stepNum++}.`)} Edit ${logger.dim('rapid.json')} to customize your setup`
      );
      if (mcpServers.length > 0) {
        console.log(
          `  ${logger.dim(`${stepNum++}.`)} Add API keys to ${logger.dim('secrets.items')} in rapid.json`
        );
      }
      if (devcontainerCreated) {
        console.log(
          `  ${logger.dim(`${stepNum++}.`)} Set ${logger.dim('OP_SERVICE_ACCOUNT_TOKEN')} env var for 1Password secrets`
        );
      }
      logger.blank();
    } catch (error) {
      spinner.fail('Failed to initialize RAPID');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

function createConfig(options: { agent: string }, detectedProject?: DetectedProject): RapidConfig {
  const defaults = getDefaultConfig();

  const config: RapidConfig = {
    $schema: 'https://getrapid.dev/schema/v1/rapid.json',
    version: '1.0',
    agents: {
      default: options.agent,
      available: defaults.agents.available,
    },
    secrets: {
      provider: 'env',
    },
    context: {
      files: ['README.md', 'CLAUDE.md', 'AGENTS.md'],
      generateAgentFiles: false, // We already created them
    },
  };

  // Add detected project info as context hints
  if (detectedProject && detectedProject.language !== 'unknown') {
    config.context = {
      ...config.context,
      // Store detected info for potential future use
    };
  }

  return config;
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
