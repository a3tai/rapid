/**
 * Logging utilities
 */

import chalk from 'chalk';

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

  error(message: string, ...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(chalk.red('✗'), message, ...args);
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
