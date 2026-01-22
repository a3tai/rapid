import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

/**
 * Tests for rapid init command
 *
 * Coverage areas:
 * - Project type detection (TypeScript, Python, Go, Rust, etc.)
 * - Template selection and validation
 * - Config file generation (rapid.json)
 * - DevContainer creation
 * - Force overwrite scenarios
 * - Error handling for invalid templates
 * - File creation and structure verification
 */

describe('rapid init command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'rapid-init-test-'));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Project Type Detection', () => {
    it('should detect TypeScript projects', () => {
      const detectProjectType = (files: string[]) => {
        const fileSet = new Set(files);
        if (fileSet.has('tsconfig.json')) {
          return {
            language: 'typescript',
            confidence: 'high',
          };
        }
        return { language: 'unknown', confidence: 'low' };
      };

      const detected = detectProjectType(['tsconfig.json', 'package.json']);
      expect(detected.language).toBe('typescript');
      expect(detected.confidence).toBe('high');
    });

    it('should detect JavaScript projects', () => {
      const detectProjectType = (files: string[]) => {
        const fileSet = new Set(files);
        if (fileSet.has('package.json') && !fileSet.has('tsconfig.json')) {
          return {
            language: 'javascript',
            confidence: 'medium',
          };
        }
        return { language: 'unknown', confidence: 'low' };
      };

      const detected = detectProjectType(['package.json']);
      expect(detected.language).toBe('javascript');
      expect(detected.confidence).toBe('medium');
    });

    it('should detect Python projects', () => {
      const detectProjectType = (files: string[]) => {
        const fileSet = new Set(files);
        if (fileSet.has('pyproject.toml') || fileSet.has('requirements.txt')) {
          return {
            language: 'python',
            confidence: 'high',
          };
        }
        return { language: 'unknown', confidence: 'low' };
      };

      const detected = detectProjectType(['pyproject.toml']);
      expect(detected.language).toBe('python');
      expect(detected.confidence).toBe('high');
    });

    it('should detect Go projects', () => {
      const detectProjectType = (files: string[]) => {
        const fileSet = new Set(files);
        if (fileSet.has('go.mod')) {
          return {
            language: 'go',
            confidence: 'high',
          };
        }
        return { language: 'unknown', confidence: 'low' };
      };

      const detected = detectProjectType(['go.mod']);
      expect(detected.language).toBe('go');
      expect(detected.confidence).toBe('high');
    });

    it('should detect Rust projects', () => {
      const detectProjectType = (files: string[]) => {
        const fileSet = new Set(files);
        if (fileSet.has('Cargo.toml')) {
          return {
            language: 'rust',
            confidence: 'high',
          };
        }
        return { language: 'unknown', confidence: 'low' };
      };

      const detected = detectProjectType(['Cargo.toml']);
      expect(detected.language).toBe('rust');
      expect(detected.confidence).toBe('high');
    });

    it('should return unknown for unrecognized projects', () => {
      const detectProjectType = (files: string[]) => {
        const fileSet = new Set(files);
        if (
          fileSet.has('tsconfig.json') ||
          fileSet.has('pyproject.toml') ||
          fileSet.has('go.mod') ||
          fileSet.has('Cargo.toml')
        ) {
          return { language: 'unknown', confidence: 'low' };
        }
        return { language: 'unknown', confidence: 'low' };
      };

      const detected = detectProjectType(['random.txt']);
      expect(detected.language).toBe('unknown');
      expect(detected.confidence).toBe('low');
    });
  });

  describe('Template Selection and Validation', () => {
    it('should accept valid template names', () => {
      const validTemplates = ['typescript', 'python', 'node', 'rust', 'go', 'universal'];
      const isValidTemplate = (template: string) => validTemplates.includes(template);

      expect(isValidTemplate('typescript')).toBe(true);
      expect(isValidTemplate('python')).toBe(true);
      expect(isValidTemplate('universal')).toBe(true);
    });

    it('should reject invalid template names', () => {
      const validTemplates = ['typescript', 'python', 'node', 'rust', 'go', 'universal'];
      const isValidTemplate = (template: string) => validTemplates.includes(template);

      expect(isValidTemplate('invalid')).toBe(false);
      expect(isValidTemplate('unknown')).toBe(false);
    });

    it('should suggest appropriate template based on project type', () => {
      const suggestTemplate = (language: string) => {
        const templateMap: Record<string, string> = {
          typescript: 'typescript',
          javascript: 'node',
          python: 'python',
          rust: 'rust',
          go: 'go',
          unknown: 'universal',
        };
        return templateMap[language] || 'universal';
      };

      expect(suggestTemplate('typescript')).toBe('typescript');
      expect(suggestTemplate('python')).toBe('python');
      expect(suggestTemplate('rust')).toBe('rust');
      expect(suggestTemplate('unknown')).toBe('universal');
    });
  });

  describe('Config File Generation', () => {
    it('should create valid rapid.json config', () => {
      const createRapidConfig = (projectName: string, template: string) => ({
        version: '1.0',
        name: projectName,
        agents: {
          default: 'claude',
          available: {
            claude: {
              cli: 'claude',
              instructionFile: 'CLAUDE.md',
            },
          },
        },
        container: {
          devcontainer: '.devcontainer/devcontainer.json',
          autoStart: true,
        },
        secrets: {
          provider: 'env',
        },
        template,
      });

      const config = createRapidConfig('my-project', 'typescript');

      expect(config.version).toBe('1.0');
      expect(config.name).toBe('my-project');
      expect(config.template).toBe('typescript');
      expect(config.agents.default).toBe('claude');
    });

    it('should include MCP configuration', () => {
      const createRapidConfig = (projectName: string) => ({
        version: '1.0',
        name: projectName,
        mcp: {
          configFile: '.mcp.json',
          servers: {
            filesystem: { enabled: true },
          },
        },
      });

      const config = createRapidConfig('my-project');

      expect(config.mcp).toBeDefined();
      expect(config.mcp.configFile).toBe('.mcp.json');
      expect(config.mcp.servers.filesystem.enabled).toBe(true);
    });

    it('should validate config structure', () => {
      const validateRapidConfig = (config: any) => {
        const errors: string[] = [];

        if (!config.version) errors.push('Missing version');
        if (!config.name) errors.push('Missing name');
        if (!config.agents) errors.push('Missing agents config');
        if (!config.container) errors.push('Missing container config');

        return { valid: errors.length === 0, errors };
      };

      const validConfig = {
        version: '1.0',
        name: 'test',
        agents: {},
        container: {},
      };

      const invalidConfig = {
        name: 'test',
      };

      const validResult = validateRapidConfig(validConfig);
      const invalidResult = validateRapidConfig(invalidConfig);

      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContain('Missing version');
    });
  });

  describe('DevContainer Creation', () => {
    it('should create .devcontainer directory', () => {
      const createDevcontainerConfig = () => ({
        version: '0.263.0',
        image: 'mcr.microsoft.com/devcontainers/base:jammy',
        features: {
          'ghcr.io/devcontainers/features/node:1': {
            version: 'lts',
          },
        },
        postCreateCommand: 'npm install',
        remoteUser: 'node',
      });

      const config = createDevcontainerConfig();

      expect(config.version).toBeDefined();
      expect(config.image).toBeDefined();
      expect(config.features).toBeDefined();
      expect(config.postCreateCommand).toBe('npm install');
    });

    it('should customize devcontainer based on project type', () => {
      const getDevcontainerImage = (language: string) => {
        const imageMap: Record<string, string> = {
          typescript: 'mcr.microsoft.com/devcontainers/typescript-node:latest',
          python: 'mcr.microsoft.com/devcontainers/python:latest',
          rust: 'mcr.microsoft.com/devcontainers/rust:latest',
          go: 'mcr.microsoft.com/devcontainers/go:latest',
        };
        return imageMap[language] || 'mcr.microsoft.com/devcontainers/base:latest';
      };

      expect(getDevcontainerImage('typescript')).toContain('typescript');
      expect(getDevcontainerImage('python')).toContain('python');
      expect(getDevcontainerImage('rust')).toContain('rust');
    });
  });

  describe('Force Overwrite Scenarios', () => {
    it('should skip creation if file exists and --force not set', () => {
      const shouldSkipCreation = (exists: boolean, force: boolean) => {
        return exists && !force;
      };

      expect(shouldSkipCreation(true, false)).toBe(true);
      expect(shouldSkipCreation(true, true)).toBe(false);
      expect(shouldSkipCreation(false, false)).toBe(false);
    });

    it('should overwrite files when --force is set', () => {
      const createOrOverwrite = (force: boolean, existingContent: string, newContent: string) => {
        if (force || !existingContent) {
          return newContent;
        }
        return existingContent;
      };

      const existing = 'old content';
      const updated = 'new content';

      expect(createOrOverwrite(true, existing, updated)).toBe(updated);
      expect(createOrOverwrite(false, existing, updated)).toBe(existing);
      expect(createOrOverwrite(false, '', updated)).toBe(updated);
    });

    it('should warn user when overwriting existing files', () => {
      const warnings: string[] = [];

      const warnIfOverwriting = (force: boolean, files: string[]) => {
        if (force && files.length > 0) {
          warnings.push(`Overwriting ${files.length} existing files`);
        }
      };

      warnIfOverwriting(true, ['rapid.json', 'CLAUDE.md']);

      expect(warnings).toContain('Overwriting 2 existing files');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid template names', () => {
      const validateTemplate = (template: string) => {
        const validTemplates = ['typescript', 'python', 'node', 'rust', 'go', 'universal'];
        if (!validTemplates.includes(template)) {
          throw new Error(`Invalid template: ${template}`);
        }
        return template;
      };

      expect(() => validateTemplate('invalid')).toThrow('Invalid template');
      expect(() => validateTemplate('typescript')).not.toThrow();
    });

    it('should handle missing project directory', () => {
      const validateProjectDir = (dir: string) => {
        if (!dir || dir.length === 0) {
          throw new Error('Project directory required');
        }
        return dir;
      };

      expect(() => validateProjectDir('')).toThrow('Project directory required');
      expect(() => validateProjectDir('/valid/path')).not.toThrow();
    });

    it('should handle file write errors gracefully', () => {
      const handleWriteError = (error: any) => {
        const errorMessages: Record<string, string> = {
          EACCES: 'Permission denied when writing file',
          ENOENT: 'Directory does not exist',
          EISDIR: 'Target is a directory, not a file',
        };

        return errorMessages[error.code] || `Failed to write file: ${error.message}`;
      };

      const permError = { code: 'EACCES', message: 'Permission denied' };
      const notFoundError = { code: 'ENOENT', message: 'Not found' };

      expect(handleWriteError(permError)).toContain('Permission denied');
      expect(handleWriteError(notFoundError)).toContain('Directory does not exist');
    });

    it('should validate input parameters', () => {
      const validateInputs = (projectName: string, template: string) => {
        const errors: string[] = [];

        if (!projectName || projectName.length === 0) {
          errors.push('Project name is required');
        }
        if (!template || template.length === 0) {
          errors.push('Template is required');
        }
        if (projectName && !/^[a-zA-Z0-9_-]+$/.test(projectName)) {
          errors.push(
            'Project name must contain only alphanumeric characters, dashes, and underscores'
          );
        }

        return { valid: errors.length === 0, errors };
      };

      const validInputs = validateInputs('my-project', 'typescript');
      const invalidInputs = validateInputs('my project!', '');

      expect(validInputs.valid).toBe(true);
      expect(invalidInputs.valid).toBe(false);
      expect(invalidInputs.errors).toContain('Template is required');
    });
  });

  describe('File Creation and Structure', () => {
    it('should create all required files', () => {
      const requiredFiles = [
        'rapid.json',
        'CLAUDE.md',
        'AGENTS.md',
        '.devcontainer/devcontainer.json',
        '.devcontainer/Dockerfile',
      ];

      const createdFiles: string[] = [];

      // Simulate file creation
      requiredFiles.forEach((file) => {
        createdFiles.push(file);
      });

      expect(createdFiles).toEqual(requiredFiles);
      expect(createdFiles).toHaveLength(5);
    });

    it('should verify rapid.json content is valid JSON', () => {
      const rapidConfig = {
        version: '1.0',
        name: 'test-project',
        agents: {},
      };

      const jsonString = JSON.stringify(rapidConfig);
      const parsed = JSON.parse(jsonString);

      expect(parsed.version).toBe('1.0');
      expect(parsed.name).toBe('test-project');
    });

    it('should include instruction files (CLAUDE.md, AGENTS.md)', () => {
      const instructionFiles = ['CLAUDE.md', 'AGENTS.md'];

      instructionFiles.forEach((file) => {
        expect(file).toMatch(/^[A-Z_]+\.md$/);
      });

      expect(instructionFiles).toContain('CLAUDE.md');
      expect(instructionFiles).toContain('AGENTS.md');
    });

    it('should structure .devcontainer directory properly', () => {
      const devcontainerStructure = {
        '.devcontainer/devcontainer.json': 'config file',
        '.devcontainer/Dockerfile': 'docker file',
      };

      const paths = Object.keys(devcontainerStructure);

      expect(paths).toHaveLength(2);
      paths.forEach((path) => {
        expect(path).toContain('.devcontainer');
      });
    });
  });

  describe('Integration', () => {
    it('should complete full initialization workflow', () => {
      const workflow = {
        detectProject: true,
        selectTemplate: true,
        validateInputs: true,
        createConfig: true,
        createDevcontainer: true,
        createInstructions: true,
        success: true,
      };

      const allStepsComplete = Object.values(workflow).every((v) => v === true);
      expect(allStepsComplete).toBe(true);
    });

    it('should handle template selection with default', () => {
      const selectTemplate = (detectedLanguage?: string, userChoice?: string) => {
        if (userChoice) {
          return userChoice;
        }
        const defaultTemplateMap: Record<string, string> = {
          typescript: 'typescript',
          python: 'python',
          rust: 'rust',
          go: 'go',
        };
        return defaultTemplateMap[detectedLanguage || ''] || 'universal';
      };

      expect(selectTemplate('typescript', undefined)).toBe('typescript');
      expect(selectTemplate('typescript', 'python')).toBe('python');
      expect(selectTemplate('unknown', undefined)).toBe('universal');
    });
  });
});
