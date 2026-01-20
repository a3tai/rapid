/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useData } from './useData';
import { useWebSocket } from './useWebSocket';

export interface EnhancedPollingOptions {
  pollingInterval?: number;
  websocketUrl?: string;
  enableWebSocket?: boolean;
  fallbackToPolling?: boolean;
  debug?: boolean;
}

export interface PollingState {
  dataSource: 'websocket' | 'polling';
  connected: boolean;
  lastUpdate: number | null;
  error: Error | null;
}

/**
 * Enhanced polling hook that uses WebSocket when available
 * Falls back to polling if WebSocket unavailable or disabled
 */
export function useEnhancedPolling(options: EnhancedPollingOptions = {}) {
  const {
    pollingInterval = 5000,
    websocketUrl = import.meta.env.VITE_WEBSOCKET_URL,
    enableWebSocket = true,
    fallbackToPolling = true,
    debug = false,
  } = options;

  const { fetchAgents, fetchTasks, fetchMessages, fetchDaemonStatus } = useData();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [state, setState] = useState<PollingState>({
    dataSource: 'polling',
    connected: false,
    lastUpdate: null,
    error: null,
  });

  // WebSocket hook - only initialize if enabled and URL is provided
  const wsState = useWebSocket(
    enableWebSocket && websocketUrl
      ? {
          url: websocketUrl,
          reconnectAttempts: 5,
          reconnectDelay: 2000,
          heartbeatInterval: 30000,
          debug,
        }
      : (null as any) // Type workaround for conditional hook
  );

  // Handle WebSocket messages for data updates
  useEffect(() => {
    const handleUpdate = (event: Event) => {
      if (event instanceof CustomEvent) {
        const { detail } = event;
        if (
          detail?.type === 'agents' ||
          detail?.type === 'tasks' ||
          detail?.type === 'messages' ||
          detail?.type === 'status'
        ) {
          if (debug) {
            console.log('[EnhancedPolling] Received update via WebSocket:', detail.type);
          }

          setState((prev) => ({
            ...prev,
            dataSource: 'websocket',
            connected: true,
            lastUpdate: Date.now(),
          }));
        }
      }
    };

    if (enableWebSocket && websocketUrl) {
      window.addEventListener('websocket-message', handleUpdate);
      return () => {
        window.removeEventListener('websocket-message', handleUpdate);
      };
    }
  }, [enableWebSocket, websocketUrl, debug]);

  // Set up polling as fallback
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(() => {
      if (debug) {
        console.log('[EnhancedPolling] Polling for updates');
      }

      fetchDaemonStatus();
      fetchAgents();
      fetchTasks();
      fetchMessages();

      setState((prev) => ({
        ...prev,
        dataSource: wsState.connected ? 'websocket' : 'polling',
        connected: wsState.connected || fallbackToPolling,
        lastUpdate: Date.now(),
      }));
    }, pollingInterval);
  }, [
    pollingInterval,
    fetchAgents,
    fetchTasks,
    fetchMessages,
    fetchDaemonStatus,
    debug,
    wsState.connected,
    fallbackToPolling,
  ]);

  // Initialize polling
  useEffect(() => {
    // If WebSocket is not enabled or URL not provided, start polling immediately
    if (!enableWebSocket || !websocketUrl) {
      startPolling();
    } else if (fallbackToPolling) {
      // If WebSocket is enabled but connection failed, fall back to polling
      if (!wsState.connected) {
        startPolling();
      } else {
        // Clear polling interval if WebSocket connected
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [enableWebSocket, websocketUrl, fallbackToPolling, wsState.connected, startPolling]);

  // Update state based on WebSocket connection
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      connected: wsState.connected || (fallbackToPolling && pollingIntervalRef.current !== null),
      error: wsState.error,
    }));
  }, [wsState.connected, wsState.error, fallbackToPolling]);

  return {
    ...state,
    websocketState: wsState,
  };
}

/**
 * Higher-order hook that combines useEnhancedPolling with WebSocket listener
 * Provides a simpler API for consuming real-time updates
 */
export function useRealtimeUpdates(options: EnhancedPollingOptions = {}) {
  const pollingState = useEnhancedPolling(options);

  return {
    dataSource: pollingState.dataSource,
    connected: pollingState.connected,
    lastUpdate: pollingState.lastUpdate,
    error: pollingState.error,
    isWebSocket: pollingState.dataSource === 'websocket',
    isPolling: pollingState.dataSource === 'polling',
  };
}
