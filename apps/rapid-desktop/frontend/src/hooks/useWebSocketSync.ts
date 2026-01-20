import { useEffect } from 'react';
import { useAppStore, Agent, Task, Message, Suggestion } from '../stores/app';
import { useRealtimeUpdates } from './useEnhancedPolling';

/**
 * Hook that syncs WebSocket events to Zustand store
 * Listens for real-time updates and automatically updates app state
 */
export function useWebSocketSync() {
  const store = useAppStore();
  const realtimeUpdates = useRealtimeUpdates();

  // Listen for WebSocket messages and sync to store
  useEffect(() => {
    const handleWebSocketMessage = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;

      const { detail } = event;
      if (!detail) return;

      try {
        // Handle agents update
        if (detail.type === 'agents' && Array.isArray(detail.data)) {
          const agents = detail.data as Agent[];
          store.setAgents(agents);
        }

        // Handle tasks update
        if (detail.type === 'tasks' && Array.isArray(detail.data)) {
          const tasks = detail.data as Task[];
          store.setTasks(tasks);
        }

        // Handle messages update
        if (detail.type === 'messages' && Array.isArray(detail.data)) {
          const messages = detail.data as Message[];
          store.setMessages(messages);
        }

        // Handle single message (append mode)
        if (detail.type === 'message' && detail.data) {
          const message = detail.data as Message;
          store.addMessage(message);
        }

        // Handle suggestions update
        if (detail.type === 'suggestions' && Array.isArray(detail.data)) {
          const suggestions = detail.data as Suggestion[];
          store.setSuggestions(suggestions);
        }

        // Handle single suggestion (append mode)
        if (detail.type === 'suggestion' && detail.data) {
          const suggestion = detail.data as Suggestion;
          store.addSuggestion(suggestion);
        }

        // Handle daemon status update
        if (detail.type === 'status' && detail.data) {
          store.setDaemonStatus(detail.data);
          // Clear error when connection status updates
          if (detail.data.running) {
            store.setError(null);
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to sync WebSocket data';
        console.error('[WebSocketSync] Error syncing data:', error);
        store.setError(error);
      }
    };

    window.addEventListener('websocket-message', handleWebSocketMessage);
    return () => {
      window.removeEventListener('websocket-message', handleWebSocketMessage);
    };
  }, [store]);

  return {
    connected: realtimeUpdates.connected,
    dataSource: realtimeUpdates.dataSource,
    isWebSocket: realtimeUpdates.isWebSocket,
    isPolling: realtimeUpdates.isPolling,
  };
}
