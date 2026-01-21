/**
 * Hook for streaming agent logs via SSE from the MCP server
 *
 * Connects to http://localhost:3200/logs/:agentName for real-time log streaming
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface LogLine {
  line: string;
  timestamp?: string;
}

const LOG_STREAM_BASE_URL = 'http://localhost:3200';

/**
 * Hook to stream agent logs in real-time via SSE
 */
export function useLogStream(agentName: string | null, enabled: boolean = true, maxLines: number = 500) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    if (!enabled || !agentName) {
      setConnected(false);
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setError(null);
    setConnected(false);

    const url = `${LOG_STREAM_BASE_URL}/logs/${encodeURIComponent(agentName)}`;
    console.log(`[useLogStream] Connecting to: ${url}`);

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log(`[useLogStream] Connected to ${agentName}`);
        setConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.line) {
            setLogs(prev => {
              const newLogs = [...prev, { line: data.line, timestamp: new Date().toISOString() }];
              // Keep only the last maxLines
              return newLogs.slice(-maxLines);
            });
          }
        } catch (e) {
          // If it's not JSON, treat as plain text
          if (event.data) {
            setLogs(prev => {
              const newLogs = [...prev, { line: event.data, timestamp: new Date().toISOString() }];
              return newLogs.slice(-maxLines);
            });
          }
        }
      };

      eventSource.onerror = (e) => {
        console.error(`[useLogStream] Error for ${agentName}:`, e);
        setConnected(false);

        // Only set error if we're still trying to connect
        if (eventSource.readyState === EventSource.CONNECTING) {
          setError('Connecting...');
        } else if (eventSource.readyState === EventSource.CLOSED) {
          setError('Connection closed');
        }
      };

      return () => {
        console.log(`[useLogStream] Closing connection to ${agentName}`);
        eventSource.close();
        eventSourceRef.current = null;
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect';
      console.error(`[useLogStream] Failed to create EventSource:`, err);
      setError(errorMsg);
      setConnected(false);
    }
  }, [agentName, enabled, maxLines]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
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
