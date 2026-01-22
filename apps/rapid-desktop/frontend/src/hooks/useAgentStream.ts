/**
 * Hook for consuming real-time agent output via Server-Sent Events
 *
 * Connects to the streaming endpoint and emits agent output as it arrives.
 */

import { useCallback, useEffect, useRef } from 'react';

interface StreamMessage {
  type: 'ready' | 'output' | 'error';
  text?: string;
  agentId?: string;
}

interface UseAgentStreamOptions {
  agentId: string;
  mcpUrl?: string;
  onMessage?: (message: StreamMessage) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

/**
 * Hook to stream agent output via SSE
 */
export function useAgentStream({
  agentId,
  mcpUrl = import.meta.env.VITE_MCP_URL || 'http://localhost:3100/mcp',
  onMessage,
  onError,
  onClose,
}: UseAgentStreamOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const isConnectingRef = useRef(false);

  const connect = useCallback(() => {
    if (isConnectingRef.current || eventSourceRef.current) {
      return; // Already connecting or connected
    }

    isConnectingRef.current = true;

    try {
      // Extract base URL from MCP endpoint (remove /mcp)
      const baseUrl = mcpUrl.replace(/\/mcp$/, '');
      const streamUrl = `${baseUrl}/agents/stream/${agentId}`;

      const eventSource = new EventSource(streamUrl);

      eventSource.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data) as StreamMessage;
          onMessage?.(message);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          onError?.(error);
        }
      });

      eventSource.addEventListener('error', () => {
        isConnectingRef.current = false;
        eventSource.close();
        eventSourceRef.current = null;
        onClose?.();
      });

      eventSourceRef.current = eventSource;
      isConnectingRef.current = false;
    } catch (err) {
      isConnectingRef.current = false;
      const error = err instanceof Error ? err : new Error(String(err));
      onError?.(error);
    }
  }, [agentId, mcpUrl, onMessage, onError, onClose]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    isConnectingRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    isConnected: eventSourceRef.current !== null,
  };
}
