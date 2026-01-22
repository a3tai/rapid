/**
 * Hook for streaming agent logs via Wails Go backend
 *
 * Uses polling via GetAgentLogs instead of direct SSE (which fails in Wails WebView)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as AppService from '@bindings/rapid-desktop/appservice';

export interface LogLine {
  line: string;
  timestamp?: string;
}

/**
 * Hook to stream agent logs via Wails polling
 */
export function useLogStream(agentName: string | null, enabled: boolean = true, maxLines: number = 500) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastLogCountRef = useRef(0);

  const clearLogs = useCallback(() => {
    setLogs([]);
    lastLogCountRef.current = 0;
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!agentName) return;

    try {
      const entries = await AppService.GetAgentLogs(agentName, maxLines);

      if (entries && entries.length > 0) {
        // Only add new logs (compare with last count to detect new entries)
        if (entries.length > lastLogCountRef.current) {
          const newEntries = entries.slice(lastLogCountRef.current);
          setLogs(prev => {
            const newLogs = [
              ...prev,
              // Go backend returns LogEntry with 'message' field, not 'content' or 'line'
              ...newEntries.map((e: { message?: string; content?: string; line?: string; timestamp?: string }) => ({
                line: e.message || e.content || e.line || '',
                timestamp: e.timestamp || new Date().toISOString(),
              })),
            ];
            return newLogs.slice(-maxLines);
          });
          lastLogCountRef.current = entries.length;
        }
        setConnected(true);
        setError(null);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch logs';
      console.error(`[useLogStream] Error fetching logs for ${agentName}:`, err);
      setError(errorMsg);
      // Don't disconnect on error - keep polling
    }
  }, [agentName, maxLines]);

  useEffect(() => {
    if (!enabled || !agentName) {
      setConnected(false);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    console.log(`[useLogStream] Starting polling for ${agentName}`);
    setError(null);
    lastLogCountRef.current = 0;

    // Initial fetch
    fetchLogs();

    // Start polling every 1 second for near-real-time updates
    pollingRef.current = setInterval(fetchLogs, 1000);

    return () => {
      console.log(`[useLogStream] Stopping polling for ${agentName}`);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [agentName, enabled, fetchLogs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  return {
    logs,
    connected,
    error,
    clearLogs,
  };
}
