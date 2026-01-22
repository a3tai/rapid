/**
 * Unified Data Hook
 *
 * Uses Wails Go backend for all data fetching in the desktop app.
 * No MCP fallback - this app only runs in the Wails desktop context.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useWails } from './useWails';

/**
 * Hook for desktop app data operations via Wails Go backend
 */
export function useData() {
  const wails = useWails();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Destructure individual functions to avoid object reference changes
  const { fetchDaemonStatus, fetchAgents, fetchTasks, fetchMessages } = wails;

  // Simple polling using Wails backend
  const startPolling = useCallback((intervalMs = 5000) => {
    // Stop any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    // Initial fetch
    fetchDaemonStatus();
    fetchAgents();
    fetchTasks();
    fetchMessages();

    // Start polling interval
    pollingRef.current = setInterval(() => {
      fetchDaemonStatus();
      fetchAgents();
      fetchTasks();
      fetchMessages();
    }, intervalMs);

    // Return stop function
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [fetchDaemonStatus, fetchAgents, fetchTasks, fetchMessages]);

  return {
    // All functions come from Wails Go backend
    fetchDaemonStatus,
    fetchAgents,
    fetchTasks,
    fetchMessages,
    initialize: wails.initialize,
    createTask: wails.createTask,
    spawnAgent: wails.spawnAgent,
    stopAgent: wails.stopAgent,
    sendMessage: wails.sendMessage,
    updateTaskStatus: wails.updateTaskStatus,
    fetchApprovals: wails.fetchApprovals,
    approveRequest: wails.approveRequest,
    rejectRequest: wails.rejectRequest,
    subscribe: wails.subscribe,
    unsubscribe: wails.unsubscribe,
    getChatHistory: wails.getChatHistory,
    callTool: wails.callTool,
    submitVote: wails.submitVote,
    overrideSuggestion: wails.overrideSuggestion,
    startPolling,
    isWails: true,
  };
}

/**
 * Auto-polling hook
 */
export function useDataPolling(intervalMs = 5000) {
  const { startPolling } = useData();
  const pollingStopRef = useRef<(() => void) | null>(null);

  // Start polling in useEffect, not during render
  useEffect(() => {
    pollingStopRef.current = startPolling(intervalMs);

    return () => {
      if (pollingStopRef.current) {
        pollingStopRef.current();
        pollingStopRef.current = null;
      }
    };
  }, [startPolling, intervalMs]);
}
