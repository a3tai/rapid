import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useData, useMcpStatus } from '../../hooks/useData'

describe('useData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should provide data access methods', () => {
    const { result } = renderHook(() => useData())

    expect(result.current).toHaveProperty('fetchAgents')
    expect(result.current).toHaveProperty('fetchTasks')
    expect(result.current).toHaveProperty('fetchMessages')
    expect(result.current).toHaveProperty('fetchDaemonStatus')
    expect(result.current).toHaveProperty('initialize')
  })

  it('should detect environment correctly', () => {
    const { result } = renderHook(() => useData())

    // In test environment, should detect based on window.go availability
    expect(typeof result.current.isWails).toBe('boolean')
  })

  it('should provide MCP endpoint from env or default', () => {
    const { result } = renderHook(() => useData())

    expect(result.current.mcpEndpoint).toBeDefined()
    expect(typeof result.current.mcpEndpoint).toBe('string')
  })

  it('should have callTool method available', () => {
    const { result } = renderHook(() => useData())

    expect(typeof result.current.callTool).toBe('function')
  })
})

describe('useMcpStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should provide checkConnection method', () => {
    const { result } = renderHook(() => useMcpStatus())

    expect(typeof result.current.checkConnection).toBe('function')
  })

  it('should provide MCP endpoint', () => {
    const { result } = renderHook(() => useMcpStatus())

    expect(result.current.mcpEndpoint).toBeDefined()
    expect(typeof result.current.mcpEndpoint).toBe('string')
  })

  it('should check MCP connection', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        result: { tools: [{ name: 'tool1' }] },
      }),
    })
    global.fetch = mockFetch

    const { result } = renderHook(() => useMcpStatus())

    const status = await result.current.checkConnection()

    await waitFor(() => {
      expect(status).toHaveProperty('connected')
      expect(status).toHaveProperty('toolCount')
    })
  })

  it('should handle connection failures gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    global.fetch = mockFetch

    const { result } = renderHook(() => useMcpStatus())

    const status = await result.current.checkConnection()

    expect(status.connected).toBe(false)
    expect(status.toolCount).toBe(0)
  })
})
