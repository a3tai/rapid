/**
 * Logger utility for RAPID MCP Server
 *
 * Centralized logging with support for:
 * - Log levels (debug, info, warn, error)
 * - Component/tool namespacing
 * - Timestamps
 * - Environment-based filtering (can be disabled in production)
 *
 * @module utils/logger
 *
 * Environment Variables:
 * - RAPID_LOGGING_DISABLED='true' - Disable all logging
 * - RAPID_LOG_LEVEL='debug'|'info'|'warn'|'error' - Set minimum log level
 * - NODE_ENV='production' with RAPID_LOGGING='false' - Disable logs in production
 *
 * @example
 * // Basic usage
 * const logger = createLogger('auth-service');
 * logger.info('User logged in', { userId: '123' });
 * logger.error('Authentication failed', error);
 *
 * @example
 * // Setting log level programmatically
 * configureLogger({ level: 'debug' });
 *
 * @example
 * // Disabling logs
 * configureLogger({ enabled: false });
 *
 * Usage:
 *   const logger = createLogger('component-name');
 *   logger.debug('message with context', data);
 *   logger.info('status update');
 *   logger.warn('warning message');
 *   logger.error('error message', error);
 */

/** Log level type - determines which messages are output */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger interface for consistent logging across components
 *
 * All log levels are output to stderr with timestamps and component names.
 * Log levels are hierarchical: debug < info < warn < error
 */
interface Logger {
  /**
   * Log debug message (lowest priority)
   * @param message - Message to log
   * @param data - Optional contextual data to include
   */
  debug(message: string, data?: unknown): void;

  /**
   * Log informational message
   * @param message - Message to log
   * @param data - Optional contextual data to include
   */
  info(message: string, data?: unknown): void;

  /**
   * Log warning message
   * @param message - Message to log
   * @param data - Optional contextual data to include
   */
  warn(message: string, data?: unknown): void;

  /**
   * Log error message (highest priority)
   * @param message - Message to log
   * @param data - Optional error object or contextual data
   */
  error(message: string, data?: unknown): void;
}

/**
 * Global logger configuration state
 * @internal
 */
let globalLogLevel: LogLevel = 'info';
let globalEnabled = true;

/**
 * Configure global logger settings
 *
 * @param options - Configuration options
 * @param options.enabled - Enable/disable all logging (default: true)
 * @param options.level - Minimum log level to output (default: 'info')
 *
 * @example
 * // Disable all logging
 * configureLogger({ enabled: false });
 *
 * @example
 * // Show debug and all higher levels
 * configureLogger({ level: 'debug' });
 */
export function configureLogger(options: {
  enabled?: boolean;
  level?: LogLevel;
}): void {
  if (options.enabled !== undefined) {
    globalEnabled = options.enabled;
  }
  if (options.level !== undefined) {
    globalLogLevel = options.level;
  }
}

/**
 * Check if logging is enabled based on environment and config
 *
 * Priority order:
 * 1. RAPID_LOGGING_DISABLED=true (highest priority - disables all logging)
 * 2. NODE_ENV=production and RAPID_LOGGING=false
 * 3. Global enabled flag from configureLogger()
 *
 * @internal
 * @returns true if logging should proceed
 */
function isLoggingEnabled(): boolean {
  if (process.env.RAPID_LOGGING_DISABLED === 'true') {
    return false;
  }
  if (process.env.NODE_ENV === 'production' && process.env.RAPID_LOGGING === 'false') {
    return false;
  }
  return globalEnabled;
}

/**
 * Get current timestamp in ISO 8601 format
 * @internal
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format log message with timestamp, component, and level
 *
 * Format: ISO-8601-TIMESTAMP [component-name] LEVEL: message
 * Example: 2026-01-21T11:23:00.000Z [event-bus] INFO: Event received
 *
 * @internal
 */
function formatMessage(level: LogLevel, component: string, message: string): string {
  return `${getTimestamp()} [${component}] ${level.toUpperCase()}: ${message}`;
}

/**
 * Check if a log level should be output based on global minimum level
 *
 * Levels are hierarchical: debug < info < warn < error
 * Only messages at or above the global level are logged.
 *
 * @internal
 */
function shouldLog(level: LogLevel): boolean {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const globalIndex = levels.indexOf(globalLogLevel);
  const currentIndex = levels.indexOf(level);
  return currentIndex >= globalIndex;
}

/**
 * Create a logger for a specific component or tool
 *
 * @param component - Name of the component/tool (used in log prefix)
 * @returns Logger instance for the component
 *
 * @example
 * const logger = createLogger('event-bus');
 * logger.info('Event received', { type: 'task-complete' });
 *
 * @example
 * // With error logging
 * const logger = createLogger('database');
 * try {
 *   await db.query('SELECT * FROM users');
 * } catch (error) {
 *   logger.error('Query failed', error);
 * }
 */
export function createLogger(component: string): Logger {
  return {
    debug(message: string, data?: unknown): void {
      if (!isLoggingEnabled() || !shouldLog('debug')) return;
      const formatted = formatMessage('debug', component, message);
      if (data !== undefined) {
        console.error(formatted, data);
      } else {
        console.error(formatted);
      }
    },

    info(message: string, data?: unknown): void {
      if (!isLoggingEnabled() || !shouldLog('info')) return;
      const formatted = formatMessage('info', component, message);
      if (data !== undefined) {
        console.error(formatted, data);
      } else {
        console.error(formatted);
      }
    },

    warn(message: string, data?: unknown): void {
      if (!isLoggingEnabled() || !shouldLog('warn')) return;
      const formatted = formatMessage('warn', component, message);
      if (data !== undefined) {
        console.error(formatted, data);
      } else {
        console.error(formatted);
      }
    },

    error(message: string, data?: unknown): void {
      if (!isLoggingEnabled()) return;
      const formatted = formatMessage('error', component, message);
      if (data !== undefined) {
        console.error(formatted, data);
      } else {
        console.error(formatted);
      }
    },
  };
}

/**
 * Legacy compatibility function for backward compatibility
 *
 * Use createLogger() for new code instead. This function maintains the existing
 * behavior where all logs go to stderr with component namespacing.
 *
 * @param component - Name of the component/tool
 * @param message - Message to log
 * @param data - Optional contextual data
 *
 * @deprecated Use createLogger() and logger.info() instead
 *
 * @example
 * // Old style (deprecated)
 * log('auth', 'User authenticated', { userId: '123' });
 *
 * @example
 * // New style (recommended)
 * const logger = createLogger('auth');
 * logger.info('User authenticated', { userId: '123' });
 */
export function log(component: string, message: string, data?: unknown): void {
  if (!isLoggingEnabled()) return;
  const formatted = formatMessage('info', component, message);
  if (data !== undefined) {
    console.error(formatted, data);
  } else {
    console.error(formatted);
  }
}
