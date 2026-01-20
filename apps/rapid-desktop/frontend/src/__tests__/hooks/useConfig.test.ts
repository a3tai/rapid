import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useConfigValidation, type RapidConfig } from '../../hooks/useConfig'

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
}

describe('useConfigValidation', () => {
  it('should pass valid config', () => {
    const { result } = renderHook(() => useConfigValidation())
    const errors = result.current.validate(mockConfig)
    expect(errors).toEqual({})
  })

  it('should detect missing project name', () => {
    const { result } = renderHook(() => useConfigValidation())
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      project: { ...mockConfig.project, name: '' },
    }
    const errors = result.current.validate(invalidConfig)
    expect(errors['project.name']).toBe('Project name is required')
  })

  it('should detect missing project root', () => {
    const { result } = renderHook(() => useConfigValidation())
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      project: { ...mockConfig.project, root: '' },
    }
    const errors = result.current.validate(invalidConfig)
    expect(errors['project.root']).toBe('Project root directory is required')
  })

  it('should validate personas', () => {
    const { result } = renderHook(() => useConfigValidation())
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      personas: {
        claude: { systemPrompt: '', capabilities: [] },
      },
    }
    const errors = result.current.validate(invalidConfig)
    expect(errors['personas.claude.systemPrompt']).toBe('System prompt is required')
    expect(errors['personas.claude.capabilities']).toBe('At least one capability is required')
  })

  it('should validate MCP servers', () => {
    const { result } = renderHook(() => useConfigValidation())
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      mcp: {
        servers: {
          invalid: { command: '' },
        },
      },
    }
    const errors = result.current.validate(invalidConfig)
    expect(errors['mcp.servers.invalid.command']).toBe('Command is required')
  })

  it('should handle null config', () => {
    const { result } = renderHook(() => useConfigValidation())
    const errors = result.current.validate(null)
    expect(errors).toEqual({})
  })

  it('should accumulate multiple validation errors', () => {
    const { result } = renderHook(() => useConfigValidation())
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      project: { name: '', root: '' },
      personas: {
        test: { systemPrompt: '', capabilities: [] },
      },
    }
    const errors = result.current.validate(invalidConfig)
    expect(Object.keys(errors).length).toBeGreaterThan(2)
    expect(errors['project.name']).toBeDefined()
    expect(errors['project.root']).toBeDefined()
    expect(errors['personas.test.systemPrompt']).toBeDefined()
  })

  it('should validate multiple personas', () => {
    const { result } = renderHook(() => useConfigValidation())
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      personas: {
        persona1: { systemPrompt: '', capabilities: [] },
        persona2: { systemPrompt: 'prompt', capabilities: [] },
      },
    }
    const errors = result.current.validate(invalidConfig)
    expect(errors['personas.persona1.systemPrompt']).toBe('System prompt is required')
    expect(errors['personas.persona1.capabilities']).toBe('At least one capability is required')
    expect(errors['personas.persona2.capabilities']).toBe('At least one capability is required')
  })

  it('should validate multiple MCP servers', () => {
    const { result } = renderHook(() => useConfigValidation())
    const invalidConfig: RapidConfig = {
      ...mockConfig,
      mcp: {
        servers: {
          server1: { command: '' },
          server2: { command: 'valid' },
          server3: { command: '' },
        },
      },
    }
    const errors = result.current.validate(invalidConfig)
    expect(errors['mcp.servers.server1.command']).toBe('Command is required')
    expect(errors['mcp.servers.server3.command']).toBe('Command is required')
    expect(errors['mcp.servers.server2.command']).toBeUndefined()
  })
})
