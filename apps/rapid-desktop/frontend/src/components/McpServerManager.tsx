import { useState, useEffect, useCallback } from 'react'
import { clsx } from 'clsx'
import { useToast } from './Toast'

export interface McpServerConfig {
  command?: string
  args?: string[]
}

export interface McpServerHealth {
  name: string
  connected: boolean
  responseTime: number | null
  error: string | null
  lastChecked: Date | null
  toolCount: number
  uptime: number | null
}

export interface McpServerManagerProps {
  servers: Record<string, McpServerConfig>
  onRefresh?: () => void
}

/**
 * Component for monitoring and managing MCP server connections
 * Displays per-server health status, response times, and diagnostics
 */
export function McpServerManager({ servers, onRefresh }: McpServerManagerProps) {
  const toast = useToast()
  const [healthStatus, setHealthStatus] = useState<Record<string, McpServerHealth>>({})
  const [checking, setChecking] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Initialize health status for each server
  useEffect(() => {
    const initial: Record<string, McpServerHealth> = {}
    Object.keys(servers).forEach((name) => {
      initial[name] = {
        name,
        connected: false,
        responseTime: null,
        error: null,
        lastChecked: null,
        toolCount: 0,
        uptime: null,
      }
    })
    setHealthStatus(initial)
  }, [servers])

  // Check health of all servers
  const checkAllServers = useCallback(async () => {
    setChecking(true)
    const newStatus: Record<string, McpServerHealth> = {}

    for (const [name] of Object.entries(servers)) {
      const startTime = performance.now()

      try {
        // Try the default RAPID MCP endpoint for now
        // In production, would extract server URL from config
        const endpoint = import.meta.env.VITE_MCP_URL || 'http://localhost:3100/mcp'

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `health-check-${name}`,
            method: 'tools/list',
            params: {},
          }),
          signal: AbortSignal.timeout(5000),
        })

        const responseTime = performance.now() - startTime

        if (response.ok) {
          const data = await response.json()
          newStatus[name] = {
            name,
            connected: true,
            responseTime,
            error: null,
            lastChecked: new Date(),
            toolCount: data.result?.tools?.length || 0,
            uptime: null,
          }
        } else {
          newStatus[name] = {
            name,
            connected: false,
            responseTime,
            error: `HTTP ${response.status}: ${response.statusText}`,
            lastChecked: new Date(),
            toolCount: 0,
            uptime: null,
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        newStatus[name] = {
          name,
          connected: false,
          responseTime: performance.now() - startTime,
          error: errorMsg,
          lastChecked: new Date(),
          toolCount: 0,
          uptime: null,
        }
      }
    }

    setHealthStatus(newStatus)
    setChecking(false)

    const connected = Object.values(newStatus).filter((s) => s.connected).length
    const total = Object.keys(newStatus).length
    toast.success(`Health Check Complete`, `${connected}/${total} servers connected`)

    if (onRefresh) {
      onRefresh()
    }
  }, [servers, onRefresh, toast])

  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      checkAllServers()
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh, checkAllServers])

  // Initial health check on mount
  useEffect(() => {
    checkAllServers()
  }, [])

  const connectedCount = Object.values(healthStatus).filter((s) => s.connected).length
  const totalCount = Object.keys(servers).length
  const avgResponseTime =
    Object.values(healthStatus)
      .filter((s) => s.responseTime !== null)
      .reduce((sum, s) => sum + (s.responseTime || 0), 0) / Object.values(healthStatus).length || 0

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-rapid-elevated rounded-lg border border-rapid-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Server Health Summary</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={clsx(
                'btn btn-sm',
                autoRefresh ? 'btn-accent' : 'btn-ghost'
              )}
              title={autoRefresh ? 'Auto-refresh enabled (30s)' : 'Auto-refresh disabled'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {autoRefresh ? 'Auto' : 'Manual'}
            </button>
            <button
              onClick={checkAllServers}
              disabled={checking}
              className="btn btn-sm flex items-center gap-1.5"
            >
              <svg
                className={clsx('w-4 h-4', checking && 'animate-spin')}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {checking ? 'Checking...' : 'Check Now'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-rapid-muted block text-xs mb-1">Connected</span>
            <span className="text-lg font-semibold">
              {connectedCount}
              <span className="text-rapid-muted font-normal">/{totalCount}</span>
            </span>
          </div>
          <div>
            <span className="text-rapid-muted block text-xs mb-1">Avg Response</span>
            <span className="text-lg font-semibold">
              {avgResponseTime.toFixed(0)}
              <span className="text-rapid-muted font-normal text-sm">ms</span>
            </span>
          </div>
          <div>
            <span className="text-rapid-muted block text-xs mb-1">Total Tools</span>
            <span className="text-lg font-semibold">
              {Object.values(healthStatus).reduce((sum, s) => sum + s.toolCount, 0)}
            </span>
          </div>
          <div>
            <span className="text-rapid-muted block text-xs mb-1">Last Check</span>
            <span className="text-lg font-semibold">
              {healthStatus[Object.keys(healthStatus)[0]]?.lastChecked
                ? healthStatus[Object.keys(healthStatus)[0]].lastChecked!.toLocaleTimeString()
                : 'Never'}
            </span>
          </div>
        </div>
      </div>

      {/* Server List */}
      {totalCount === 0 ? (
        <div className="text-center py-12 text-rapid-muted">
          <p>No MCP servers configured</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(servers).map(([name]) => {
            const health = healthStatus[name]
            if (!health) return null

            return (
              <div
                key={name}
                className={clsx(
                  'p-4 rounded-lg border transition-colors',
                  health.connected
                    ? 'bg-green-500/5 border-green-500/20'
                    : 'bg-red-500/5 border-red-500/20'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {/* Status indicator */}
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <div
                        className={clsx(
                          'w-3 h-3 rounded-full',
                          health.connected ? 'bg-green-400' : 'bg-red-400'
                        )}
                      />
                    </div>

                    {/* Server info */}
                    <div>
                      <h4 className="font-semibold">{name}</h4>
                      <div className="text-xs text-rapid-muted space-y-1 mt-2">
                        <div>
                          Status:{' '}
                          <span className={health.connected ? 'text-green-400' : 'text-red-400'}>
                            {health.connected ? 'Connected' : 'Disconnected'}
                          </span>
                        </div>
                        {health.responseTime !== null && (
                          <div>Response Time: {health.responseTime.toFixed(1)}ms</div>
                        )}
                        {health.toolCount > 0 && (
                          <div>Available Tools: {health.toolCount}</div>
                        )}
                        {health.error && (
                          <div className="text-red-400">
                            Error: {health.error}
                          </div>
                        )}
                        {health.lastChecked && (
                          <div>
                            Last Checked: {health.lastChecked.toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side: Quick info */}
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={clsx(
                        'badge text-xs',
                        health.connected ? 'badge-success' : 'badge-error'
                      )}
                    >
                      {health.connected ? '● Online' : '● Offline'}
                    </span>
                    {health.responseTime !== null && (
                      <span className="text-xs text-rapid-muted">
                        {health.responseTime.toFixed(0)}ms
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Help text */}
      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-400">
        <p>
          <strong>Tip:</strong> Health checks are performed via HTTP requests to each server. Green status indicates
          the server is responding and available. Check response times to monitor server performance.
        </p>
      </div>
    </div>
  )
}
