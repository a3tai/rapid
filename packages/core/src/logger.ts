/**
 * Logging utilities
 */

import chalk from 'chalk';
import { RAPIDError, type ErrorSeverity } from './errors.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.log(chalk.gray(`[debug] ${message}`), ...args);
    }
  },

  info(message: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.log(chalk.blue('ℹ'), message, ...args);
    }
  },

  success(message: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.log(chalk.green('✓'), message, ...args);
    }
  },

  warn(message: string, ...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.log(chalk.yellow('⚠'), message, ...args);
    }
  },

  error(message: string | Error | RAPIDError, ...args: unknown[]): void {
    if (shouldLog('error')) {
      if (message instanceof RAPIDError) {
        console.error(chalk.red('✗'), message.getFormattedMessage());
        if (message.getRecoverySuggestions()) {
          console.error(message.getRecoverySuggestions());
        }
        if (message.context.metadata) {
          console.error(chalk.dim('Metadata:'), JSON.stringify(message.context.metadata, null, 2));
        }
      } else if (message instanceof Error) {
        console.error(chalk.red('✗'), message.message, ...args);
        if (message.stack && currentLevel === 'debug') {
          console.error(chalk.dim(message.stack));
        }
      } else {
        console.error(chalk.red('✗'), message, ...args);
      }
    }
  },

  /**
   * Log error with proper severity level
   */
  errorWithSeverity(error: Error | RAPIDError, severity: ErrorSeverity = 'error'): void {
    const logLevel =
      severity === 'critical'
        ? 'error'
        : severity === 'error'
          ? 'error'
          : severity === 'warn'
            ? 'warn'
            : 'debug';
    if (shouldLog(logLevel)) {
      const icon = {
        critical: chalk.red('❌'),
        error: chalk.red('✗'),
        warn: chalk.yellow('⚠'),
        info: chalk.blue('ℹ'),
      }[severity];

      if (error instanceof RAPIDError) {
        console.error(icon, `[${severity.toUpperCase()}]`, error.getFormattedMessage());
        if (error.getRecoverySuggestions()) {
          console.error(error.getRecoverySuggestions());
        }
      } else if (error instanceof Error) {
        console.error(icon, `[${severity.toUpperCase()}]`, error.message);
        if (currentLevel === 'debug' && error.stack) {
          console.error(chalk.dim(error.stack));
        }
      } else {
        console.error(icon, `[${severity.toUpperCase()}]`, String(error));
      }
    }
  },

  // Styled output helpers
  brand(text: string): string {
    return chalk.hex('#818cf8')(text);
  },

  dim(text: string): string {
    return chalk.dim(text);
  },

  bold(text: string): string {
    return chalk.bold(text);
  },

  // Print a header
  header(text: string): void {
    console.log();
    console.log(chalk.bold(text));
    console.log(chalk.dim('─'.repeat(text.length)));
  },

  // Print a blank line
  blank(): void {
    console.log();
  },
};
