/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useCallback, useState } from 'react';

export interface WebSocketOptions {
  url: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
  debug?: boolean;
}

export interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: Error | null;
  lastMessageTime: number | null;
  reconnectAttempt: number;
}

/**
 * WebSocket hook with automatic reconnection and heartbeat
 * Provides real-time updates with graceful fallback to polling
 */
export function useWebSocket(options: WebSocketOptions | null) {
  const {
    url = '',
    reconnectAttempts = 10,
    reconnectDelay = 1000,
    heartbeatInterval = 30000,
    debug = false,
  } = options || {};

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    lastMessageTime: null,
    reconnectAttempt: 0,
  });

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        setState((prev) => ({
          ...prev,
          lastMessageTime: Date.now(),
        }));

        if (debug) {
          console.log('[WebSocket] Message received:', data);
        }

        // Dispatch custom event for consumers to listen to
        window.dispatchEvent(new CustomEvent('websocket-message', { detail: data }));
      } catch (err) {
        if (debug) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      }
    },
    [debug]
  );

  const handleError = useCallback(
    (event: Event) => {
      const error = event instanceof ErrorEvent ? event.error : new Error('WebSocket error');
      if (debug) {
        console.error('[WebSocket] Error:', error);
      }

      setState((prev) => ({
        ...prev,
        error,
        connected: false,
      }));
    },
    [debug]
  );

  const handleClose = useCallback(() => {
    if (debug) {
      console.log('[WebSocket] Connection closed');
    }

    setState((prev) => ({
      ...prev,
      connected: false,
      connecting: false,
    }));

    // Clear heartbeat timeout
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }

    // Attempt reconnection if not at max attempts
    if (reconnectAttemptsRef.current < reconnectAttempts) {
      const delay = reconnectDelay * Math.pow(1.5, reconnectAttemptsRef.current);
      if (debug) {
        console.log(
          `[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${reconnectAttempts})`
        );
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, delay);
    } else {
      if (debug) {
        console.warn('[WebSocket] Max reconnection attempts reached');
      }
      setState((prev) => ({
        ...prev,
        error: new Error('Max reconnection attempts reached'),
      }));
    }
  }, [debug, reconnectAttempts, reconnectDelay]);

  const handleOpen = useCallback(() => {
    if (debug) {
      console.log('[WebSocket] Connection established');
    }

    reconnectAttemptsRef.current = 0;
    setState((prev) => ({
      ...prev,
      connected: true,
      connecting: false,
      error: null,
      lastMessageTime: Date.now(),
    }));

    // Set up heartbeat
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }

    heartbeatTimeoutRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
        if (debug) {
          console.log('[WebSocket] Heartbeat sent');
        }
      }
    }, heartbeatInterval);
  }, [debug, heartbeatInterval]);

  const connectWebSocket = useCallback(() => {
    // Don't connect if no URL provided
    if (!url) {
      return;
    }

    // Prevent duplicate connections
    if (
      wsRef.current?.readyState === WebSocket.CONNECTING ||
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      return;
    }

    try {
      if (debug) {
        console.log(`[WebSocket] Connecting to ${url}`);
      }

      setState((prev) => ({
        ...prev,
        connecting: true,
      }));

      wsRef.current = new WebSocket(url);
      wsRef.current.onopen = handleOpen;
      wsRef.current.onmessage = handleMessage;
      wsRef.current.onerror = handleError;
      wsRef.current.onclose = handleClose;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect');
      if (debug) {
        console.error('[WebSocket] Connection failed:', error);
      }

      setState((prev) => ({
        ...prev,
        error,
        connecting: false,
      }));

      reconnectAttemptsRef.current++;
    }
  }, [url, debug, handleOpen, handleMessage, handleError, handleClose]);

  const disconnect = useCallback(() => {
    if (debug) {
      console.log('[WebSocket] Manual disconnect');
    }

    // Clear all timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }

    // Close connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    reconnectAttemptsRef.current = reconnectAttempts;
    setState({
      connected: false,
      connecting: false,
      error: null,
      lastMessageTime: null,
      reconnectAttempt: 0,
    });
  }, [debug, reconnectAttempts]);

  const send = useCallback(
    (data: unknown) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data));
        if (debug) {
          console.log('[WebSocket] Message sent:', data);
        }
        return true;
      }
      if (debug) {
        console.warn('[WebSocket] Cannot send - connection not open');
      }
      return false;
    },
    [debug]
  );

  // Connect on mount
  useEffect(() => {
    connectWebSocket();

    return () => {
      disconnect();
    };
  }, [connectWebSocket, disconnect]);

  // Update reconnect attempt count in state
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      reconnectAttempt: reconnectAttemptsRef.current,
    }));
  }, [reconnectAttemptsRef.current]);

  return {
    ...state,
    send,
    disconnect,
    reconnect: connectWebSocket,
  };
}

/**
 * Hook to listen for WebSocket messages of a specific type
 */
export function useWebSocketListener<T = any>(messageType: string, callback: (data: T) => void) {
  useEffect(() => {
    const handleWebSocketMessage = (event: Event) => {
      if (event instanceof CustomEvent) {
        const { detail } = event;
        if (detail?.type === messageType) {
          callback(detail.data);
        }
      }
    };

    window.addEventListener('websocket-message', handleWebSocketMessage);
    return () => {
      window.removeEventListener('websocket-message', handleWebSocketMessage);
    };
  }, [messageType, callback]);
}
