/**
 * Centralized constants for timeout values and configuration defaults
 * These values were previously scattered throughout the codebase as magic numbers.
 */

// Timeout values (in milliseconds)
export const FETCH_DEFAULT = 30000; // 30 seconds - default fetch timeout
export const SECURE_EXEC_DEFAULT = 120000; // 2 minutes - default secure exec timeout
export const APPROVAL_WINDOW = 300000; // 5 minutes - human approval timeout window
export const RATE_LIMIT_WINDOW = 60000; // 1 minute - rate limiting window
export const AUDIT_FLUSH_INTERVAL = 5000; // 5 seconds - audit trail flush interval
export const SESSION_CHECK_INTERVAL = 60000; // 1 minute - session health check interval
export const MAX_EVENT_BUS_TIMEOUT = 60000; // 1 minute - max event bus operation timeout

// Configuration defaults
export const DEFAULT_HTTP_PORT = 3000; // Default HTTP port for the MCP server
export const SESSION_ID_DISPLAY_LENGTH = 8; // Number of characters to display from session IDs
