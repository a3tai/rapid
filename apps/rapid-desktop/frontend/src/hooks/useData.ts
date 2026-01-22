/**
 * Unified Data Hook
 *
 * Uses MCP server for all data fetching to ensure proper state merging.
 * This prevents flickering by using mergeMessages/mergeAgents/mergeTasks
 * instead of setMessages/setAgents/setTasks.
 */

import { useEffect, useCallback } from 'react';
import { useWails } from './useWails';
import { useMcp } from './useMcp';

// Get MCP endpoint from env or default
const MCP_ENDPOINT = import.meta.env.VITE_MCP_URL || 'http://localhost:3100/mcp';

/**
 * Unified hook - uses MCP for fetching (merges state) and Wails for mutations
 */
export function useData() {
  const wails = useWails();
  const mcp = useMcp();

  // Use MCP for fetch functions (they use mergeMessages/mergeAgents/mergeTasks)
  // Use Wails for mutations (createTask, spawnAgent, etc.) if Wails backend is available
  return {
    // Fetch functions from MCP - these preserve state via merge functions
    fetchDaemonStatus: mcp.fetchDaemonStatus,
    fetchAgents: mcp.fetchAgents,
    fetchTasks: mcp.fetchTasks,
    fetchMessages: mcp.fetchMessages,
    initialize: mcp.initialize,
    // Mutation functions - use MCP versions for consistency
    createTask: mcp.createTask,
    spawnAgent: mcp.spawnAgent,
    stopAgent: mcp.stopAgent,
    sendMessage: mcp.sendMessage,
    // Wails-specific functions
    subscribe: wails.subscribe,
    unsubscribe: wails.unsubscribe,
    getChatHistory: wails.getChatHistory,
    // MCP-specific functions
    callTool: mcp.callTool,
    startPolling: mcp.startPolling,
    isWails: true,
    mcpEndpoint: MCP_ENDPOINT,
  };
}

/**
 * Auto-polling hook using centralized PollingManager
 * This prevents race conditions from multiple intervals
 */
export function useDataPolling(intervalMs = 5000) {
  const { startPolling } = useData();

  useEffect(() => {
    const stopPolling = startPolling(intervalMs);
    return () => stopPolling();
  }, [startPolling, intervalMs]);
}

/**
 * Hook to check MCP connection status
 */
export function useMcpStatus() {
  const checkConnection = useCallback(async () => {
    try {
      // First initialize to get a session
      const initResponse = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'rapid-desktop-check', version: '1.0.0' },
          },
        }),
      });

      const sessionId = initResponse.headers.get('mcp-session-id');
      if (!initResponse.ok || !sessionId) {
        return { connected: false, toolCount: 0 };
      }

      // Now list tools with the session
      const response = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': sessionId,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          connected: true,
          toolCount: data.result?.tools?.length || 0,
        };
      }
      return { connected: false, toolCount: 0 };
    } catch {
      return { connected: false, toolCount: 0 };
    }
  }, []);

  return { checkConnection, mcpEndpoint: MCP_ENDPOINT };
}
