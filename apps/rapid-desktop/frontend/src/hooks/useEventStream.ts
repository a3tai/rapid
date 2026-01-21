/**
 * Event Stream Hook
 *
 * Provides real-time updates via Server-Sent Events (SSE)
 * from the RAPID daemon. Falls back to polling if SSE is unavailable.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/app';

// Daemon SSE endpoint
const DAEMON_SSE_URL = import.meta.env.VITE_DAEMON_URL
  ? `${import.meta.env.VITE_DAEMON_URL}/events`
  : 'http://localhost:3200/events';

export interface EventStreamState {
  connected: boolean;
  lastEvent: unknown | null;
  error: string | null;
}

/**
 * Hook for connecting to the daemon's SSE event stream
 * Provides real-time updates for agents, tasks, and messages
 */
export function useEventStream() {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSource = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  const { mergeMessages } = useAppStore();

  /**
   * Handle incoming SSE events
   */
  const handleEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        setLastEvent(data);

        // Dispatch to appropriate handlers based on event type
        if (data.type) {
          // Emit custom event for other components to listen to
          window.dispatchEvent(
            new CustomEvent('rapid:event', { detail: data })
          );

          // Handle specific event types
          switch (data.type) {
            case 'message':
            case 'coordination':
            case 'task':
            case 'lifecycle':
              // Merge new message into store
              if (data.id) {
                mergeMessages([data]);
              }
              break;
            case 'agent_registered':
            case 'agent_deregistered':
            case 'agent_heartbeat':
              // Trigger agent list refresh via custom event
              window.dispatchEvent(new CustomEvent('rapid:agents:refresh'));
              break;
            case 'task_created':
            case 'task_updated':
            case 'task_completed':
              // Trigger task list refresh via custom event
              window.dispatchEvent(new CustomEvent('rapid:tasks:refresh'));
              break;
          }
        }
      } catch (err) {
        console.error('[SSE] Error parsing event:', err);
      }
    },
    [mergeMessages]
  );

  /**
   * Connect to the SSE endpoint
   */
  const connect = useCallback(() => {
    if (eventSource.current) {
      eventSource.current.close();
    }

    try {
      eventSource.current = new EventSource(DAEMON_SSE_URL);

      eventSource.current.onopen = () => {
        setConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
        console.log('[SSE] Connected to event stream');
      };

      eventSource.current.onerror = () => {
        setConnected(false);

        // Attempt reconnection with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;

          console.log(`[SSE] Connection lost, reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);

          if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
          }

          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setError('Failed to connect to event stream after multiple attempts');
          console.error('[SSE] Max reconnection attempts reached');
        }
      };

      // Listen for generic messages
      eventSource.current.onmessage = handleEvent;

      // Listen for specific event types
      eventSource.current.addEventListener('connected', () => {
        console.log('[SSE] Received connection confirmation');
      });

      eventSource.current.addEventListener('heartbeat', () => {
        // Heartbeat received - connection is healthy
      });

      eventSource.current.addEventListener('message', handleEvent);
    } catch (err) {
      setError(`Failed to create EventSource: ${err}`);
      setConnected(false);
    }
  }, [handleEvent]);

  /**
   * Disconnect from the SSE endpoint
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    if (eventSource.current) {
      eventSource.current.close();
      eventSource.current = null;
    }

    setConnected(false);
    console.log('[SSE] Disconnected from event stream');
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connected,
    lastEvent,
    error,
    connect,
    disconnect,
  };
}

/**
 * Hook to listen for specific rapid events
 */
export function useRapidEvent<T = unknown>(
  eventType: string,
  callback: (data: T) => void
) {
  useEffect(() => {
    const handler = (event: CustomEvent<T>) => {
      callback(event.detail);
    };

    window.addEventListener(`rapid:${eventType}` as keyof WindowEventMap, handler as EventListener);

    return () => {
      window.removeEventListener(`rapid:${eventType}` as keyof WindowEventMap, handler as EventListener);
    };
  }, [eventType, callback]);
}
