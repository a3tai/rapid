/**
 * Event Bus Tools
 *
 * MCP tools for inter-agent communication via the RAPID event bus.
 * Automatically connects to Redis when available (started via `rapid start`).
 *
 * This module is organized into focused sub-modules:
 * - types.ts: Shared types and schemas
 * - storage.ts: Event bus connection management
 * - agent-registry.ts: Agent registration tools (bus_register, bus_whoami, bus_agents)
 * - messaging.ts: Message sending/receiving tools (bus_send, bus_messages, bus_poll, bus_wait)
 * - health.ts: Health monitoring tools (bus_status, bus_heartbeat, bus_health, bus_health_report)
 * - recovery.ts: Task recovery tools (bus_recover_tasks)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../../server.js';
import { registerAgentRegistryTools } from './agent-registry.js';
import { registerMessagingTools } from './messaging.js';
import { registerHealthTools } from './health.js';
import { registerRecoveryTools } from './recovery.js';

// Re-export types for external consumers
export { MessageType } from './types.js';
export type {
  EventBusInstance,
  HistoryOptions,
  WaitOptions,
  AgentReport,
  TaskRecord,
} from './types.js';

// Re-export storage utilities
export { getEventBus, isRedisBus, getBusMode } from './storage.js';

/**
 * Register all event bus tools with the MCP server
 */
export function registerEventBusTools(server: McpServer, context: ServerContext): void {
  registerAgentRegistryTools(server, context);
  registerMessagingTools(server, context);
  registerHealthTools(server, context);
  registerRecoveryTools(server, context);
}
