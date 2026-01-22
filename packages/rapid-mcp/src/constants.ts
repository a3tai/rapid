/**
 * RAPID MCP Server Constants
 *
 * Centralized configuration for timeout values, intervals, and other magic numbers
 * used throughout the codebase.
 */

/**
 * Network and HTTP timeouts
 */
export const FETCH_DEFAULT_TIMEOUT = 30000; // 30 seconds
export const SECURE_EXEC_DEFAULT_TIMEOUT = 120000; // 2 minutes
export const DEFAULT_HTTP_PORT = 3000;

/**
 * Security and approval timeouts
 */
export const APPROVAL_WINDOW = 300000; // 5 minutes
export const RATE_LIMIT_WINDOW = 60000; // 1 minute

/**
 * Audit and logging
 */
export const AUDIT_FLUSH_INTERVAL = 5000; // 5 seconds

/**
 * Session and event bus management
 */
export const SESSION_CHECK_INTERVAL = 60000; // 1 minute
export const MAX_EVENT_BUS_TIMEOUT = 60000; // 1 minute (max timeout for event bus waits)

/**
 * Display formatting
 */
export const SESSION_ID_DISPLAY_LENGTH = 8; // Show first 8 characters of session ID
