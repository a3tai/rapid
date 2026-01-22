import { describe, it, expect } from 'vitest';
import type { RapidConfig } from '../../hooks/useConfig';

const mockConfig: RapidConfig = {
  project: {
    name: 'test-project',
    root: '/home/test/projects/test',
    description: 'Test project',
  },
  sandbox: {
    enabled: true,
    preset: 'balanced',
    allowNetwork: false,
  },
  personas: {
    claude: {
      systemPrompt: 'You are a helpful assistant',
      capabilities: ['code', 'analysis'],
    },
  },
  mcp: {
    servers: {
      example: {
        command: 'example-server',
        args: ['--verbose'],
      },
    },
  },
};

// Validation logic extracted from useConfigValidation for testing
function validateConfig(config: RapidConfig | null): Record<string, string> {
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
}

describe('Config Validation', () => {
  it('should pass valid config', () => {
    const errors = validateConfig(mockConfig);
    expect(errors).toEqual({});
  });

  it('should detect missing project name', () => {
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      project: { ...mockConfig.project, name: '' },
    };
    const errors = validateConfig(invalidConfig);
    expect(errors['project.name']).toBe('Project name is required');
  });

  it('should detect missing project root', () => {
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      project: { ...mockConfig.project, root: '' },
    };
    const errors = validateConfig(invalidConfig);
    expect(errors['project.root']).toBe('Project root directory is required');
  });

  it('should validate personas', () => {
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      personas: {
        claude: { systemPrompt: '', capabilities: [] },
      },
    };
    const errors = validateConfig(invalidConfig);
    expect(errors['personas.claude.systemPrompt']).toBe('System prompt is required');
    expect(errors['personas.claude.capabilities']).toBe('At least one capability is required');
  });

  it('should validate MCP servers', () => {
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      mcp: {
        servers: {
          invalid: { command: '' },
        },
      },
    };
    const errors = validateConfig(invalidConfig);
    expect(errors['mcp.servers.invalid.command']).toBe('Command is required');
  });

  it('should handle null config', () => {
    const errors = validateConfig(null);
    expect(errors).toEqual({});
  });

  it('should accumulate multiple validation errors', () => {
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      project: { name: '', root: '' },
      personas: {
        test: { systemPrompt: '', capabilities: [] },
      },
    };
    const errors = validateConfig(invalidConfig);
    expect(Object.keys(errors).length).toBeGreaterThan(2);
    expect(errors['project.name']).toBeDefined();
    expect(errors['project.root']).toBeDefined();
    expect(errors['personas.test.systemPrompt']).toBeDefined();
  });

  it('should validate multiple personas', () => {
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      personas: {
        persona1: { systemPrompt: '', capabilities: [] },
        persona2: { systemPrompt: 'prompt', capabilities: [] },
      },
    };
    const errors = validateConfig(invalidConfig);
    expect(errors['personas.persona1.systemPrompt']).toBe('System prompt is required');
    expect(errors['personas.persona1.capabilities']).toBe('At least one capability is required');
    expect(errors['personas.persona2.capabilities']).toBe('At least one capability is required');
  });

  it('should validate multiple MCP servers', () => {
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      mcp: {
        servers: {
          server1: { command: '' },
          server2: { command: 'valid' },
          server3: { command: '' },
        },
      },
    };
    const errors = validateConfig(invalidConfig);
    expect(errors['mcp.servers.server1.command']).toBe('Command is required');
    expect(errors['mcp.servers.server3.command']).toBe('Command is required');
    expect(errors['mcp.servers.server2.command']).toBeUndefined();
  });
});
