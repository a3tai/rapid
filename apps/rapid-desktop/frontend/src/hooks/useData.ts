/**
 * Unified Data Hook
 *
 * Auto-detects environment and uses appropriate data source:
 * - Wails: Uses Go backend via window.go API
 * - Browser: Connects directly to RAPID MCP server
 * - Dev: Falls back to mock data if MCP unavailable
 */

import { useEffect, useCallback } from 'react'
import { useWails } from './useWails'
import { useMcp } from './useMcp'

// Detect if running in Wails context
const isWailsEnv = () => typeof window !== 'undefined' && window.go?.main?.App

// Get MCP endpoint from env or default
const MCP_ENDPOINT = import.meta.env.VITE_MCP_URL || 'http://localhost:3100/mcp'

/**
 * Unified hook that provides data access regardless of environment
 */
export function useData() {
  const wails = useWails()
  const mcp = useMcp()

  // Use Wails if available, otherwise MCP
  const source = isWailsEnv() ? wails : mcp

  return {
    ...source,
    // Always provide callTool from MCP for direct tool access
    callTool: mcp.callTool,
    isWails: isWailsEnv(),
    mcpEndpoint: MCP_ENDPOINT,
  }
}

/**
 * Auto-polling hook that works in both environments
 */
export function useDataPolling(intervalMs = 5000) {
  const { fetchAgents, fetchTasks, fetchMessages, fetchDaemonStatus } = useData()

  useEffect(() => {
    const interval = setInterval(() => {
      fetchDaemonStatus()
      fetchAgents()
      fetchTasks()
      fetchMessages()
    }, intervalMs)

    return () => clearInterval(interval)
  }, [fetchAgents, fetchTasks, fetchMessages, fetchDaemonStatus, intervalMs])
}

/**
 * Hook to check MCP connection status
 */
export function useMcpStatus() {
  const checkConnection = useCallback(async () => {
    try {
      const response = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      })

      if (response.ok) {
        const data = await response.json()
        return {
          connected: true,
          toolCount: data.result?.tools?.length || 0,
        }
      }
      return { connected: false, toolCount: 0 }
    } catch {
      return { connected: false, toolCount: 0 }
    }
  }, [])

  return { checkConnection, mcpEndpoint: MCP_ENDPOINT }
}
