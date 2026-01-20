import { useRealtimeUpdates } from '../hooks/useEnhancedPolling'
import { clsx } from 'clsx'
import { useEffect, useState } from 'react'

export interface ConnectionStatusProps {
  variant?: 'compact' | 'full'
  showDataSource?: boolean
  showLastUpdate?: boolean
}

/**
 * Component that displays real-time connection status
 * Shows WebSocket vs polling status, last update time, and any errors
 */
export function ConnectionStatus({
  variant = 'compact',
  showDataSource = true,
  showLastUpdate = true,
}: ConnectionStatusProps) {
  const status = useRealtimeUpdates()
  const [displayTime, setDisplayTime] = useState('')

  // Format last update time
  useEffect(() => {
    if (!status.lastUpdate) {
      setDisplayTime('')
      return
    }

    const lastUpdate = status.lastUpdate
    const updateDisplay = () => {
      const now = Date.now()
      const diff = now - lastUpdate
      const seconds = Math.floor(diff / 1000)
      const minutes = Math.floor(seconds / 60)

      if (seconds < 60) {
        setDisplayTime(`${seconds}s ago`)
      } else if (minutes < 60) {
        setDisplayTime(`${minutes}m ago`)
      } else {
        setDisplayTime(`${Math.floor(minutes / 60)}h ago`)
      }
    }

    updateDisplay()
    const interval = setInterval(updateDisplay, 1000)
    return () => clearInterval(interval)
  }, [status.lastUpdate])

  if (variant === 'compact') {
    return (
      <div
        className={clsx(
          'flex items-center gap-1.5 text-xs font-medium',
          status.connected ? 'text-green-400' : 'text-red-400'
        )}
        title={`Status: ${status.connected ? 'Connected' : 'Disconnected'} (${status.dataSource})`}
      >
        <div
          className={clsx(
            'w-2 h-2 rounded-full transition-colors',
            status.connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
          )}
        />
        <span className="hidden sm:inline">
          {status.connected ? 'Live' : 'Offline'}
        </span>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="space-y-3">
        {/* Connection status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status</span>
          <div className="flex items-center gap-2">
            <div
              className={clsx(
                'w-2 h-2 rounded-full',
                status.connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
              )}
            />
            <span
              className={clsx(
                'text-sm font-medium',
                status.connected ? 'text-green-400' : 'text-red-400'
              )}
            >
              {status.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Data source */}
        {showDataSource && (
          <div className="flex items-center justify-between border-t border-rapid-border pt-3">
            <span className="text-sm font-medium text-rapid-muted">Data Source</span>
            <span
              className={clsx(
                'px-2 py-1 text-xs rounded font-medium',
                status.dataSource === 'websocket'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              )}
            >
              {status.dataSource === 'websocket' ? '⚡ WebSocket' : '📡 Polling'}
            </span>
          </div>
        )}

        {/* Last update */}
        {showLastUpdate && status.lastUpdate && (
          <div className="flex items-center justify-between border-t border-rapid-border pt-3">
            <span className="text-sm font-medium text-rapid-muted">Last Update</span>
            <span className="text-xs text-rapid-text">{displayTime}</span>
          </div>
        )}

        {/* Error message */}
        {status.error && (
          <div className="border-t border-rapid-border pt-3 px-2 py-1 bg-red-500/10 rounded border border-red-700">
            <p className="text-xs text-red-400">{status.error.message}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Compact inline connection status indicator
 * Good for headers and toolbars
 */
export function ConnectionStatusBadge() {
  return <ConnectionStatus variant="compact" showDataSource={false} showLastUpdate={false} />
}

/**
 * Displays connection metrics
 */
export function ConnectionMetrics() {
  const status = useRealtimeUpdates()
  const [metrics, setMetrics] = useState({
    updateCount: 0,
    uptime: '0s',
  })

  useEffect(() => {
    if (!status.lastUpdate) return

    let updateCount = 0
    const interval = setInterval(() => {
      updateCount++
      setMetrics((prev) => ({
        ...prev,
        updateCount,
      }))
    }, 1000)

    return () => clearInterval(interval)
  }, [status.lastUpdate])

  if (!status.connected) {
    return (
      <div className="text-xs text-red-400 font-medium">
        Disconnected
      </div>
    )
  }

  return (
    <div className="flex gap-3 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-rapid-muted">Source:</span>
        <span className={status.dataSource === 'websocket' ? 'text-blue-400' : 'text-yellow-400'}>
          {status.dataSource === 'websocket' ? '⚡' : '📡'}
        </span>
      </div>
      <div className="flex items-center gap-1 border-l border-rapid-border pl-3">
        <span className="text-rapid-muted">Updates:</span>
        <span className="text-rapid-text font-medium">{metrics.updateCount}</span>
      </div>
    </div>
  )
}
