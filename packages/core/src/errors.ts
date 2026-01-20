/**
 * Standardized Error Type System for RAPID
 *
 * Provides typed error classes with consistent context enrichment,
 * severity levels, recovery suggestions, and structured error information.
 */

export type ErrorSeverity = 'info' | 'warn' | 'error' | 'critical';

/**
 * Error context with file, line, and operation information
 */
export interface ErrorContext {
  /** File path where error occurred */
  file?: string;
  /** Line number where error occurred */
  line?: number;
  /** Function name where error occurred */
  function?: string;
  /** Operation being performed */
  operation?: string;
  /** Additional contextual data */
  metadata?: Record<string, unknown>;
}

/**
 * Base RAPIDError class with enhanced context and recovery info
 */
export class RAPIDError extends Error {
  public readonly severity: ErrorSeverity;
  public readonly code: string;
  public readonly context: ErrorContext;
  public readonly recoveryTips: string[];
  public readonly timestamp: Date;
  public readonly originalError: Error | undefined;

  constructor(
    message: string,
    options: {
      code?: string;
      severity?: ErrorSeverity;
      context?: ErrorContext;
      recoveryTips?: string[];
      originalError?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'RAPIDError';
    this.code = options.code || 'RAPID_ERROR';
    this.severity = options.severity || 'error';
    this.context = options.context || {};
    this.recoveryTips = options.recoveryTips || [];
    this.timestamp = new Date();
    this.originalError = options.originalError;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, RAPIDError.prototype);
  }

  /**
   * Get formatted error message with context
   */
  public getFormattedMessage(): string {
    let message = `[${this.code}] ${this.message}`;

    if (this.context.operation) {
      message += ` (during ${this.context.operation})`;
    }

    if (this.context.file) {
      message += `\n  Location: ${this.context.file}`;
      if (this.context.line) {
        message += `:${this.context.line}`;
      }
      if (this.context.function) {
        message += ` in ${this.context.function}()`;
      }
    }

    return message;
  }

  /**
   * Get recovery suggestions as formatted string
   */
  public getRecoverySuggestions(): string {
    if (this.recoveryTips.length === 0) {
      return '';
    }

    let tips = '\nRecovery suggestions:\n';
    this.recoveryTips.forEach((tip, i) => {
      tips += `  ${i + 1}. ${tip}\n`;
    });
    return tips;
  }

  /**
   * Convert to JSON for logging/serialization
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      context: this.context,
      recoveryTips: this.recoveryTips,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

/**
 * Configuration-related errors
 */
export class ConfigError extends RAPIDError {
  constructor(message: string, options?: any) {
    super(message, {
      code: 'CONFIG_ERROR',
      severity: 'error',
      ...options,
    });
    this.name = 'ConfigError';
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

/**
 * Container/Docker-related errors
 */
export class ContainerError extends RAPIDError {
  constructor(message: string, options?: any) {
    super(message, {
      code: 'CONTAINER_ERROR',
      severity: 'error',
      ...options,
    });
    this.name = 'ContainerError';
    Object.setPrototypeOf(this, ContainerError.prototype);
  }
}

/**
 * Command execution errors
 */
export class CommandError extends RAPIDError {
  public readonly exitCode?: number;
  public readonly stdout?: string;
  public readonly stderr?: string;

  constructor(message: string, options?: any) {
    const { exitCode, stdout, stderr, ...baseOptions } = options || {};
    super(message, {
      code: 'COMMAND_ERROR',
      severity: 'error',
      ...baseOptions,
    });
    this.name = 'CommandError';
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
    Object.setPrototypeOf(this, CommandError.prototype);
  }

  public toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      exitCode: this.exitCode,
      stdout: this.stdout,
      stderr: this.stderr,
    };
  }
}

/**
 * Validation/input errors
 */
export class ValidationError extends RAPIDError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(message: string, options?: any) {
    const { field, value, ...baseOptions } = options || {};
    super(message, {
      code: 'VALIDATION_ERROR',
      severity: 'warn',
      ...baseOptions,
    });
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  public toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      field: this.field,
      value: this.value,
    };
  }
}

/**
 * File system errors
 */
export class FileError extends RAPIDError {
  public readonly path?: string;

  constructor(message: string, options?: any) {
    const { path, ...baseOptions } = options || {};
    super(message, {
      code: 'FILE_ERROR',
      severity: 'error',
      ...baseOptions,
    });
    this.name = 'FileError';
    this.path = path;
    Object.setPrototypeOf(this, FileError.prototype);
  }

  public toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      path: this.path,
    };
  }
}

/**
 * Network/HTTP errors
 */
export class NetworkError extends RAPIDError {
  public readonly statusCode?: number;
  public readonly url?: string;

  constructor(message: string, options?: any) {
    const { statusCode, url, ...baseOptions } = options || {};
    super(message, {
      code: 'NETWORK_ERROR',
      severity: 'error',
      ...baseOptions,
    });
    this.name = 'NetworkError';
    this.statusCode = statusCode;
    this.url = url;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }

  public toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode,
      url: this.url,
    };
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends RAPIDError {
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number, options?: any) {
    super(message, {
      code: 'TIMEOUT_ERROR',
      severity: 'warn',
      ...options,
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }

  public toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      timeoutMs: this.timeoutMs,
    };
  }
}

/**
 * Authentication errors
 */
export class AuthError extends RAPIDError {
  public readonly provider?: string;

  constructor(message: string, options?: any) {
    const { provider, ...baseOptions } = options || {};
    super(message, {
      code: 'AUTH_ERROR',
      severity: 'error',
      ...baseOptions,
    });
    this.name = 'AuthError';
    this.provider = provider;
    Object.setPrototypeOf(this, AuthError.prototype);
  }

  public toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      provider: this.provider,
    };
  }
}

/**
 * Type guard to check if error is RAPIDError
 */
export function isRAPIDError(error: unknown): error is RAPIDError {
  return error instanceof RAPIDError;
}

/**
 * Convert any error to RAPIDError
 */
export function toRAPIDError(
  error: unknown,
  options?: any
): RAPIDError {
  if (isRAPIDError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new RAPIDError(error.message, {
      ...options,
      originalError: error,
    });
  }

  return new RAPIDError(String(error), options);
}
