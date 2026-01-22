# MCP Tool Error Handling Middleware Architecture

**Author**: architect-architect-522871
**Created**: 2026-01-22
**Status**: Design Complete

## Overview

This document defines the architecture for standardized error handling and retry middleware in the RAPID MCP server. The middleware provides consistent error responses, automatic retries for transient failures, and a clean API for tool developers.

## Current State Analysis

### Issues Identified

Analysis of the RAPID MCP codebase revealed:

1. **161 try/catch blocks across 18 tool files** with inconsistent handling
2. **Empty catch blocks** that silently swallow errors (e.g., `catch { }`)
3. **Varied error message formats** - some return structured data, others return strings
4. **No retry logic** for transient failures (network timeouts, Redis connection issues)
5. **Mixed error handling patterns**:
   - Some tools return error in `structuredContent`
   - Some tools throw exceptions
   - Some tools return error strings in `content`

### Example of Current Inconsistencies

```typescript
// Pattern 1: Return structured error (fetch.ts)
catch (error) {
  return {
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    structuredContent: output, // Contains error info
  };
}

// Pattern 2: Silent catch (eventbus.ts)
catch {
  // Redis not available, fall back to in-memory
}

// Pattern 3: Log and continue (personas.ts)
catch (err) {
  logger.error(`[personas] Failed to load ${file}:`, err);
}
```

## Design Goals

1. **Consistency**: All tools use the same error response format
2. **Retryability**: Automatic retry for transient failures with exponential backoff
3. **Observability**: Structured error codes and logging for debugging
4. **Transparency**: Clear indication to LLMs whether errors are retryable
5. **Non-breaking**: Middleware can be adopted incrementally

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Tool Handler                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   withRetry  │ -> │ withErrorBoundary │ -> │  Tool Handler │  │
│  │  (optional)  │    │  (required)   │    │   (user fn)  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
│  Composition: registerToolWithMiddleware(                   │
│    server, name, config, handler, { retry: {...} }         │
│  )                                                          │
└─────────────────────────────────────────────────────────────┘
```

### TypeScript Interfaces

```typescript
// ============================================================
// Error Classification
// ============================================================

/**
 * Standard error codes for MCP tools
 */
export enum McpErrorCode {
  // Client errors (4xx-like, not retryable)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RATE_LIMITED = 'RATE_LIMITED', // May be retryable with backoff

  // Server/transient errors (5xx-like, retryable)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  REDIS_ERROR = 'REDIS_ERROR',
  FILESYSTEM_ERROR = 'FILESYSTEM_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',

  // Operational errors
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  UNAVAILABLE = 'UNAVAILABLE',
  ABORTED = 'ABORTED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Determines if an error code represents a transient (retryable) error
 */
export function isRetryableError(code: McpErrorCode): boolean {
  const retryableCodes: McpErrorCode[] = [
    McpErrorCode.NETWORK_ERROR,
    McpErrorCode.TIMEOUT,
    McpErrorCode.REDIS_ERROR,
    McpErrorCode.EXTERNAL_SERVICE_ERROR,
    McpErrorCode.UNAVAILABLE,
    McpErrorCode.RATE_LIMITED,
  ];
  return retryableCodes.includes(code);
}

// ============================================================
// Error Response Format
// ============================================================

/**
 * Standard error response returned by all MCP tools
 */
export interface McpToolError {
  /** Always true for error responses */
  error: true;

  /** Standardized error code */
  code: McpErrorCode;

  /** Human-readable error message */
  message: string;

  /** Whether the operation can be retried */
  retryable: boolean;

  /** Suggested retry delay in milliseconds (if retryable) */
  retryAfterMs?: number;

  /** Number of retry attempts made before giving up */
  attemptsMade?: number;

  /** Additional context for debugging */
  details?: {
    /** Original error message if different from message */
    originalError?: string;

    /** Tool name that failed */
    toolName?: string;

    /** Request parameters that caused the error (sanitized) */
    params?: Record<string, unknown>;

    /** Stack trace (only in debug mode) */
    stack?: string;

    /** Timestamp of the error */
    timestamp?: string;
  };
}

/**
 * Type guard for McpToolError
 */
export function isMcpToolError(value: unknown): value is McpToolError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as McpToolError).error === true &&
    typeof (value as McpToolError).code === 'string' &&
    typeof (value as McpToolError).message === 'string'
  );
}

// ============================================================
// Custom Error Classes
// ============================================================

/**
 * Base class for MCP tool errors
 */
export class McpError extends Error {
  readonly code: McpErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: McpErrorCode,
    message: string,
    options?: {
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'McpError';
    this.code = code;
    this.retryable = options?.retryable ?? isRetryableError(code);
    this.details = options?.details;
  }

  toResponse(): McpToolError {
    return {
      error: true,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: {
        ...this.details,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Network-related errors (retryable by default)
 */
export class NetworkError extends McpError {
  constructor(message: string, cause?: Error) {
    super(McpErrorCode.NETWORK_ERROR, message, {
      retryable: true,
      cause
    });
    this.name = 'NetworkError';
  }
}

/**
 * Timeout errors (retryable by default)
 */
export class TimeoutError extends McpError {
  constructor(message: string, timeoutMs?: number) {
    super(McpErrorCode.TIMEOUT, message, {
      retryable: true,
      details: { timeoutMs },
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Validation errors (not retryable)
 */
export class ValidationError extends McpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(McpErrorCode.VALIDATION_ERROR, message, {
      retryable: false,
      details,
    });
    this.name = 'ValidationError';
  }
}

// ============================================================
// Retry Configuration
// ============================================================

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;

  /** Initial delay between retries in ms (default: 1000) */
  initialDelayMs?: number;

  /** Maximum delay between retries in ms (default: 30000) */
  maxDelayMs?: number;

  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number;

  /** Add random jitter to delays (default: true) */
  jitter?: boolean;

  /** Custom function to determine if error should be retried */
  shouldRetry?: (error: unknown, attempt: number) => boolean;

  /** Callback for retry events (logging, metrics) */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: Required<Omit<RetryConfig, 'shouldRetry' | 'onRetry'>> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

// ============================================================
// Middleware Options
// ============================================================

/**
 * Options for error handling middleware
 */
export interface ErrorMiddlewareOptions {
  /** Tool name for error context */
  toolName: string;

  /** Include stack traces in error details */
  includeStack?: boolean;

  /** Custom error classifier */
  classifyError?: (error: unknown) => McpErrorCode;

  /** Custom error message formatter */
  formatMessage?: (error: unknown) => string;
}

/**
 * Combined middleware options
 */
export interface ToolMiddlewareOptions extends ErrorMiddlewareOptions {
  /** Retry configuration (omit to disable retries) */
  retry?: RetryConfig;
}

// ============================================================
// Middleware Implementation
// ============================================================

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  config: Required<Omit<RetryConfig, 'shouldRetry' | 'onRetry'>>
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const boundedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  if (config.jitter) {
    // Add 0-50% random jitter
    const jitterFactor = 1 + Math.random() * 0.5;
    return Math.floor(boundedDelay * jitterFactor);
  }

  return boundedDelay;
}

/**
 * Default error classifier based on error type and message
 */
function defaultClassifyError(error: unknown): McpErrorCode {
  if (error instanceof McpError) {
    return error.code;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('network')) {
      return McpErrorCode.NETWORK_ERROR;
    }

    // Timeout errors
    if (message.includes('timeout') ||
        message.includes('timed out') ||
        message.includes('etimedout')) {
      return McpErrorCode.TIMEOUT;
    }

    // Redis errors
    if (message.includes('redis') ||
        error.name === 'ReplyError') {
      return McpErrorCode.REDIS_ERROR;
    }

    // Filesystem errors
    if (message.includes('enoent') ||
        message.includes('eacces') ||
        message.includes('eperm')) {
      return McpErrorCode.FILESYSTEM_ERROR;
    }

    // Validation errors
    if (error.name === 'ZodError' ||
        message.includes('validation')) {
      return McpErrorCode.VALIDATION_ERROR;
    }
  }

  return McpErrorCode.UNKNOWN;
}

/**
 * Wrap a tool handler with error boundary middleware
 */
export function withErrorBoundary<TInput, TOutput>(
  handler: (args: TInput) => Promise<TOutput>,
  options: ErrorMiddlewareOptions
): (args: TInput) => Promise<TOutput | McpToolError> {
  const {
    toolName,
    includeStack = process.env.NODE_ENV === 'development',
    classifyError = defaultClassifyError,
    formatMessage = (e) => e instanceof Error ? e.message : String(e),
  } = options;

  return async (args: TInput): Promise<TOutput | McpToolError> => {
    try {
      return await handler(args);
    } catch (error) {
      const code = classifyError(error);
      const message = formatMessage(error);

      const errorResponse: McpToolError = {
        error: true,
        code,
        message,
        retryable: isRetryableError(code),
        details: {
          toolName,
          timestamp: new Date().toISOString(),
          ...(includeStack && error instanceof Error && { stack: error.stack }),
        },
      };

      return errorResponse;
    }
  };
}

/**
 * Wrap a tool handler with retry middleware
 */
export function withRetry<TInput, TOutput>(
  handler: (args: TInput) => Promise<TOutput>,
  config: RetryConfig = {}
): (args: TInput) => Promise<TOutput> {
  const {
    maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts,
    initialDelayMs = DEFAULT_RETRY_CONFIG.initialDelayMs,
    maxDelayMs = DEFAULT_RETRY_CONFIG.maxDelayMs,
    backoffMultiplier = DEFAULT_RETRY_CONFIG.backoffMultiplier,
    jitter = DEFAULT_RETRY_CONFIG.jitter,
    shouldRetry = (error) => {
      if (error instanceof McpError) {
        return error.retryable;
      }
      const code = defaultClassifyError(error);
      return isRetryableError(code);
    },
    onRetry,
  } = config;

  const fullConfig = { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier, jitter };

  return async (args: TInput): Promise<TOutput> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await handler(args);
      } catch (error) {
        lastError = error;

        if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
          throw error;
        }

        const delayMs = calculateDelay(attempt, fullConfig);
        onRetry?.(error, attempt, delayMs);

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  };
}

/**
 * Compose retry and error boundary middleware
 */
export function withToolMiddleware<TInput, TOutput>(
  handler: (args: TInput) => Promise<TOutput>,
  options: ToolMiddlewareOptions
): (args: TInput) => Promise<TOutput | McpToolError> {
  let wrappedHandler = handler;

  // Apply retry middleware first (inner)
  if (options.retry) {
    wrappedHandler = withRetry(wrappedHandler, options.retry);
  }

  // Apply error boundary second (outer)
  return withErrorBoundary(wrappedHandler, options);
}
```

### Tool Registration Helper

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import { withToolMiddleware, type ToolMiddlewareOptions, type McpToolError } from './error-middleware.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('tool-registration');

/**
 * Tool configuration with schemas
 */
interface ToolConfig<TInput, TOutput> {
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  outputSchema?: Record<string, z.ZodTypeAny>;
}

/**
 * MCP tool result format
 */
interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: unknown;
}

/**
 * Register a tool with error handling middleware
 *
 * @example
 * ```typescript
 * registerToolWithMiddleware(
 *   server,
 *   'fetch_via_proxy',
 *   {
 *     title: 'Fetch via RAPID Proxy',
 *     description: 'HTTP fetch with domain filtering',
 *     inputSchema: { url: z.string().url() },
 *   },
 *   async (args) => {
 *     const response = await fetch(args.url);
 *     return { status: response.status };
 *   },
 *   {
 *     retry: { maxAttempts: 3 },
 *   }
 * );
 * ```
 */
export function registerToolWithMiddleware<TInput, TOutput>(
  server: McpServer,
  name: string,
  config: ToolConfig<TInput, TOutput>,
  handler: (args: TInput) => Promise<TOutput>,
  options?: Partial<ToolMiddlewareOptions>
): void {
  const middlewareOptions: ToolMiddlewareOptions = {
    toolName: name,
    ...options,
    retry: options?.retry ? {
      ...options.retry,
      onRetry: (error, attempt, delayMs) => {
        logger.warn(`[${name}] Retry attempt ${attempt}, waiting ${delayMs}ms`,
          error instanceof Error ? error.message : String(error));
        options?.retry?.onRetry?.(error, attempt, delayMs);
      },
    } : undefined,
  };

  const wrappedHandler = withToolMiddleware(handler, middlewareOptions);

  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      outputSchema: config.outputSchema,
    },
    async (args): Promise<McpToolResult> => {
      const result = await wrappedHandler(args as TInput);

      // Format response
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );
}
```

## Usage Examples

### Basic Tool with Error Boundary

```typescript
// Before: Manual error handling
server.registerTool('task_get', config, async (args) => {
  try {
    const task = await getTask(args.id);
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
  }
});

// After: With middleware
registerToolWithMiddleware(
  server,
  'task_get',
  config,
  async (args) => getTask(args.id)
  // Error boundary is automatic
);
```

### Tool with Retry for Network Operations

```typescript
registerToolWithMiddleware(
  server,
  'fetch_via_proxy',
  {
    title: 'Fetch via RAPID Proxy',
    description: 'HTTP fetch with domain filtering and automatic retry',
    inputSchema: { url: z.string().url() },
  },
  async (args) => {
    const response = await fetch(args.url);
    return { status: response.status, body: await response.text() };
  },
  {
    retry: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      shouldRetry: (error) => {
        // Only retry network errors, not 4xx responses
        return error instanceof NetworkError ||
               (error instanceof Error && error.message.includes('ECONNREFUSED'));
      },
    },
  }
);
```

### Throwing Typed Errors

```typescript
registerToolWithMiddleware(
  server,
  'task_claim',
  config,
  async (args) => {
    const task = await getTask(args.id);

    if (!task) {
      throw new McpError(
        McpErrorCode.NOT_FOUND,
        `Task ${args.id} not found`,
        { retryable: false }
      );
    }

    if (task.status !== 'pending') {
      throw new McpError(
        McpErrorCode.VALIDATION_ERROR,
        `Cannot claim task in ${task.status} status`,
        { retryable: false, details: { currentStatus: task.status } }
      );
    }

    return await claimTask(args.id, args.agentId);
  }
);
```

## Retry Behavior for Common Error Types

| Error Type | Retryable | Default Max Attempts | Notes |
|------------|-----------|---------------------|-------|
| `NETWORK_ERROR` | Yes | 3 | Connection failures, DNS issues |
| `TIMEOUT` | Yes | 3 | Request timeouts |
| `REDIS_ERROR` | Yes | 3 | Redis connection issues |
| `EXTERNAL_SERVICE_ERROR` | Yes | 3 | Third-party API failures |
| `RATE_LIMITED` | Yes | 3 | With exponential backoff |
| `UNAVAILABLE` | Yes | 3 | Service temporarily unavailable |
| `VALIDATION_ERROR` | No | - | Invalid input, won't succeed on retry |
| `NOT_FOUND` | No | - | Resource doesn't exist |
| `PERMISSION_DENIED` | No | - | Auth failure |
| `INTERNAL_ERROR` | Configurable | - | May or may not be transient |

## Integration with Existing Tools

### Migration Strategy

1. **Phase 1**: Add middleware package with no breaking changes
2. **Phase 2**: Update high-traffic tools (eventbus, tasks, fetch)
3. **Phase 3**: Update remaining tools incrementally
4. **Phase 4**: Deprecate manual error handling patterns

### Backward Compatibility

The middleware is designed to be opt-in:

```typescript
// Old style still works
server.registerTool('legacy_tool', config, async (args) => {
  // Manual error handling
});

// New style with middleware
registerToolWithMiddleware(server, 'new_tool', config, handler, options);
```

## File Structure

```
packages/rapid-mcp/src/
├── middleware/
│   ├── index.ts              # Re-exports
│   ├── error-codes.ts        # McpErrorCode enum
│   ├── error-types.ts        # McpToolError, McpError classes
│   ├── error-boundary.ts     # withErrorBoundary middleware
│   ├── retry.ts              # withRetry middleware
│   └── tool-registration.ts  # registerToolWithMiddleware helper
├── tools/
│   └── ... (existing tools)
└── utils/
    └── logger.ts             # Existing logger
```

## Metrics and Observability

The middleware can emit metrics for monitoring:

```typescript
interface ToolMetrics {
  toolName: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  retryCount: number;
  avgDurationMs: number;
  errorsByCode: Record<McpErrorCode, number>;
}
```

Integration with the existing metrics system in `packages/rapid-mcp/src/tools/metrics.ts` is recommended.

## Testing Considerations

1. **Unit tests** for each middleware function
2. **Integration tests** with mock servers
3. **Chaos testing** for retry logic (simulate network failures)
4. **Type tests** to ensure proper typing

```typescript
// Example test
describe('withRetry', () => {
  it('should retry on transient errors', async () => {
    let attempts = 0;
    const handler = jest.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new NetworkError('Connection refused');
      }
      return { success: true };
    });

    const retryHandler = withRetry(handler, { maxAttempts: 3 });
    const result = await retryHandler({});

    expect(result).toEqual({ success: true });
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('should not retry on validation errors', async () => {
    const handler = jest.fn(async () => {
      throw new ValidationError('Invalid input');
    });

    const retryHandler = withRetry(handler, { maxAttempts: 3 });

    await expect(retryHandler({})).rejects.toThrow(ValidationError);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
```

## Implementation Plan

### Week 1: Core Middleware
- [ ] Create middleware package structure
- [ ] Implement error codes and types
- [ ] Implement withErrorBoundary
- [ ] Implement withRetry
- [ ] Add unit tests

### Week 2: Tool Registration Helper
- [ ] Create registerToolWithMiddleware helper
- [ ] Add logging integration
- [ ] Add metrics integration
- [ ] Document migration guide

### Week 3: Tool Migration
- [ ] Migrate eventbus.ts (14 try/catch blocks)
- [ ] Migrate personas.ts (17 try/catch blocks)
- [ ] Migrate worktree-merge.ts (42 try/catch blocks)
- [ ] Validate backward compatibility

### Week 4: Complete Migration & Documentation
- [ ] Migrate remaining tools
- [ ] Add integration tests
- [ ] Update developer documentation
- [ ] Create error handling best practices guide

## Appendix: Current Error Handling Audit

| File | Try/Catch Blocks | Pattern Used | Priority |
|------|-----------------|--------------|----------|
| worktree-merge.ts | 42 | Mixed | High |
| personas.ts | 17 | Log and continue | High |
| eventbus.ts | 14 | Silent catch | High |
| knowledge.ts | 13 | Mixed | Medium |
| security.ts | 12 | Mixed | Medium |
| audit-trail.ts | 11 | Structured | Low |
| git-workflow.ts | 8 | Mixed | Medium |
| filesystem.ts | 6 | Structured | Low |
| task-watch.ts | 6 | Mixed | Medium |
| metrics.ts | 5 | Mixed | Low |
| tasks.ts | 4 | Mixed | Medium |
| fetch.ts | 4 | Structured | Low |
| suggestions.ts | 4 | Mixed | Low |
| priority-scoring.ts | 4 | Mixed | Low |
| secrets.ts | 4 | Mixed | Low |
| context7.ts | 3 | Mixed | Low |
| dependencies.ts | 2 | Mixed | Low |
| secure-exec.ts | 2 | Mixed | Low |

## References

- [MCP SDK Documentation](https://modelcontextprotocol.io/docs)
- [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Error Handling Best Practices](https://www.patterns.dev/posts/error-handling-patterns)
- RAPID Architecture: `/workspace/docs/architecture/`
