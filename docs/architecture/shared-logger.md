# Shared Logging Interface Architecture

This document proposes a unified logging interface for RAPID to consolidate the duplicate logger implementations and provide consistent logging across all packages.

## Problem Statement

Currently, RAPID has two separate logger implementations with different APIs:

### 1. Core Logger (`packages/core/src/logger.ts`)
- **Size**: 3.6KB, ~120 lines
- **Features**: Chalk-based styling, log levels, error handling with RAPIDError
- **API**: Singleton `logger` object with methods
- **Used by**: CLI commands, core utilities

```typescript
// Current core usage
import { logger, setLogLevel } from '@a3t/rapid-core';
logger.info('Message');
logger.error('Error', error);
logger.success('Done');  // Custom level
```

### 2. rapid-mcp Logger (`packages/rapid-mcp/src/utils/logger.ts`)
- **Size**: 7.3KB, ~230 lines  
- **Features**: Namespacing, timestamps, environment config, structured data
- **API**: Factory `createLogger(component)` returning namespaced logger
- **Used by**: MCP tools, middleware, event bus

```typescript
// Current rapid-mcp usage
import { createLogger } from '../utils/logger.js';
const logger = createLogger('event-bus');
logger.info('Event received', { type: 'task' });
```

### Issues

1. **Duplicate implementations** - 10KB+ of similar code
2. **Inconsistent APIs** - Singleton vs factory pattern
3. **Feature fragmentation** - Namespacing only in rapid-mcp, chalk styling only in core
4. **No daemon logging** - 69 raw `console.log/error` calls
5. **Configuration divergence** - Different env vars and defaults

## Proposed Solution

Enhance the core logger to support all features while maintaining backwards compatibility.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Unified Logger Architecture                   │
└─────────────────────────────────────────────────────────────────┘

  packages/core/src/logger.ts
  ┌──────────────────────────────────────────────────────────────┐
  │                                                               │
  │  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐  │
  │  │   Config    │────►│  Formatters  │────►│   Writers    │  │
  │  │  (levels,   │     │  (timestamp, │     │  (console,   │  │
  │  │   env)      │     │   colors)    │     │   stream)    │  │
  │  └─────────────┘     └──────────────┘     └──────────────┘  │
  │         │                                                     │
  │         ▼                                                     │
  │  ┌─────────────────────────────────────────────────────────┐ │
  │  │                    Logger Factory                        │ │
  │  │  createLogger(component: string): NamespacedLogger       │ │
  │  └─────────────────────────────────────────────────────────┘ │
  │         │                                                     │
  │         ├─────────────┬─────────────┬─────────────┐          │
  │         ▼             ▼             ▼             ▼          │
  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
  │  │  Global   │ │   CLI     │ │   MCP     │ │  Daemon   │   │
  │  │  logger   │ │  logger   │ │  logger   │ │  logger   │   │
  │  │  (compat) │ │           │ │           │ │           │   │
  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │
  │                                                               │
  └──────────────────────────────────────────────────────────────┘

  Consumers:
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │   CLI    │  │ rapid-   │  │  daemon  │  │  agent-  │
  │ commands │  │   mcp    │  │  server  │  │  runner  │
  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

### Unified Logger Interface

```typescript
// packages/core/src/logger.ts

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
  /** Minimum log level to output */
  level?: LogLevel;
  /** Enable/disable all logging */
  enabled?: boolean;
  /** Include timestamps in output */
  timestamps?: boolean;
  /** Output format: 'pretty' (chalk) or 'json' */
  format?: 'pretty' | 'json';
  /** Output target: 'stdout', 'stderr', or custom writer */
  output?: 'stdout' | 'stderr' | LogWriter;
}

export interface LogWriter {
  write(entry: LogEntry): void;
}

export interface LogEntry {
  level: LogLevel;
  component?: string;
  message: string;
  timestamp: string;
  data?: unknown;
  error?: Error;
}

export interface Logger {
  /** Log debug message */
  debug(message: string, data?: unknown): void;
  /** Log info message */
  info(message: string, data?: unknown): void;
  /** Log success message (alias for info with success styling) */
  success(message: string, data?: unknown): void;
  /** Log warning message */
  warn(message: string, data?: unknown): void;
  /** Log error message */
  error(message: string | Error, data?: unknown): void;
  /** Create child logger with additional namespace */
  child(namespace: string): Logger;
}

/**
 * Configure global logger settings
 */
export function configureLogger(config: LoggerConfig): void;

/**
 * Create a namespaced logger for a component
 */
export function createLogger(component: string): Logger;

/**
 * Global logger instance (backwards compatible)
 */
export const logger: Logger & {
  // Additional helpers from current core logger
  brand(text: string): string;
  dim(text: string): string;
  bold(text: string): string;
  header(text: string): void;
  blank(): void;
};
```

### Environment Variables

Consolidate and support both existing environment variables:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RAPID_LOG_LEVEL` | string | `'info'` | Minimum log level |
| `RAPID_LOGGING_DISABLED` | boolean | `false` | Disable all logging |
| `RAPID_LOG_TIMESTAMPS` | boolean | `true` | Include timestamps |
| `RAPID_LOG_FORMAT` | string | `'pretty'` | Output format |
| `NODE_ENV=production` | - | - | Defaults to minimal logging |

### Output Formats

#### Pretty Format (default for TTY)
```
2026-01-22T19:15:00.000Z [event-bus] ℹ Event received { type: 'task' }
2026-01-22T19:15:01.000Z [tasks] ✓ Task claimed
2026-01-22T19:15:02.000Z [daemon] ⚠ Connection retry
2026-01-22T19:15:03.000Z [auth] ✗ Authentication failed
```

#### JSON Format (for structured logging)
```json
{"timestamp":"2026-01-22T19:15:00.000Z","level":"info","component":"event-bus","message":"Event received","data":{"type":"task"}}
```

### Implementation Details

#### Core Logger Enhancement

```typescript
// packages/core/src/logger.ts

import chalk from 'chalk';
import { RAPIDError } from './errors.js';

// Level hierarchy
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Global state
let globalConfig: LoggerConfig = {
  level: (process.env.RAPID_LOG_LEVEL as LogLevel) || 'info',
  enabled: process.env.RAPID_LOGGING_DISABLED !== 'true',
  timestamps: process.env.RAPID_LOG_TIMESTAMPS !== 'false',
  format: (process.env.RAPID_LOG_FORMAT as 'pretty' | 'json') || 'pretty',
  output: 'stderr',
};

export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

function shouldLog(level: LogLevel): boolean {
  if (!globalConfig.enabled) return false;
  return LOG_LEVELS[level] >= LOG_LEVELS[globalConfig.level!];
}

function formatEntry(entry: LogEntry): string {
  if (globalConfig.format === 'json') {
    return JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      component: entry.component,
      message: entry.message,
      ...(entry.data !== undefined && { data: entry.data }),
      ...(entry.error && { error: { message: entry.error.message, stack: entry.error.stack } }),
    });
  }

  // Pretty format
  const icons: Record<LogLevel | 'success', string> = {
    debug: chalk.gray('[debug]'),
    info: chalk.blue('ℹ'),
    success: chalk.green('✓'),
    warn: chalk.yellow('⚠'),
    error: chalk.red('✗'),
  };

  const parts: string[] = [];
  
  if (globalConfig.timestamps) {
    parts.push(chalk.dim(entry.timestamp));
  }
  
  if (entry.component) {
    parts.push(chalk.cyan(`[${entry.component}]`));
  }
  
  parts.push(icons[entry.level] || icons.info);
  parts.push(entry.message);
  
  if (entry.data !== undefined) {
    parts.push(typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data));
  }

  return parts.join(' ');
}

function writeLog(entry: LogEntry): void {
  const formatted = formatEntry(entry);
  const output = globalConfig.output;
  
  if (typeof output === 'object' && output.write) {
    output.write(entry);
  } else if (output === 'stdout') {
    console.log(formatted);
  } else {
    console.error(formatted);
  }
}

function createLoggerInternal(component?: string): Logger {
  const log = (level: LogLevel, message: string | Error, data?: unknown) => {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      component,
      message: message instanceof Error ? message.message : message,
      timestamp: new Date().toISOString(),
      data,
      error: message instanceof Error ? message : undefined,
    };

    // Handle RAPIDError specially
    if (message instanceof RAPIDError) {
      entry.message = message.getFormattedMessage();
      if (message.getRecoverySuggestions()) {
        entry.data = {
          ...(typeof entry.data === 'object' ? entry.data : {}),
          suggestions: message.getRecoverySuggestions(),
        };
      }
    }

    writeLog(entry);
  };

  return {
    debug: (msg, data) => log('debug', msg, data),
    info: (msg, data) => log('info', msg, data),
    success: (msg, data) => log('info', msg, data), // Same level, different icon
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
    child: (namespace) => createLoggerInternal(
      component ? `${component}:${namespace}` : namespace
    ),
  };
}

/**
 * Create a namespaced logger for a component
 */
export function createLogger(component: string): Logger {
  return createLoggerInternal(component);
}

/**
 * Global logger instance (backwards compatible)
 */
export const logger: Logger & {
  brand: (text: string) => string;
  dim: (text: string) => string;
  bold: (text: string) => string;
  header: (text: string) => void;
  blank: () => void;
  errorWithSeverity: (error: Error | RAPIDError, severity?: string) => void;
} = {
  ...createLoggerInternal(),
  
  // Style helpers (backwards compat)
  brand: (text) => chalk.hex('#818cf8')(text),
  dim: (text) => chalk.dim(text),
  bold: (text) => chalk.bold(text),
  
  header: (text) => {
    console.log();
    console.log(chalk.bold(text));
    console.log(chalk.dim('─'.repeat(text.length)));
  },
  
  blank: () => console.log(),
  
  errorWithSeverity: (error, severity = 'error') => {
    const logFn = severity === 'warn' ? logger.warn : logger.error;
    logFn(error instanceof Error ? error.message : String(error));
  },
};

// Legacy exports for backwards compatibility
export function setLogLevel(level: LogLevel): void {
  configureLogger({ level });
}

export function getLogLevel(): LogLevel {
  return globalConfig.level!;
}
```

### Migration Guide

#### rapid-mcp Migration

The rapid-mcp logger can be replaced with a re-export:

```typescript
// packages/rapid-mcp/src/utils/logger.ts (deprecated, re-export)
export { createLogger, configureLogger, type LogLevel } from '@a3t/rapid-core';

/**
 * @deprecated Use configureLogger({ enabled: false }) instead
 */
export function log(component: string, message: string, data?: unknown): void {
  createLogger(component).info(message, data);
}
```

#### daemon Migration

Add structured logging to daemon:

```typescript
// packages/daemon/src/server.ts
import { createLogger } from '@a3t/rapid-core';

const logger = createLogger('daemon');

// Before
console.log('Server started on port', port);

// After
logger.info('Server started', { port });
```

### Backwards Compatibility

| Current Usage | New Usage | Compatible |
|---------------|-----------|------------|
| `import { logger } from '@a3t/rapid-core'` | Same | ✅ Yes |
| `logger.info('msg')` | Same | ✅ Yes |
| `logger.success('msg')` | Same | ✅ Yes |
| `logger.error(rapidError)` | Same | ✅ Yes |
| `setLogLevel('debug')` | Same | ✅ Yes |
| `createLogger('comp')` | `import { createLogger } from '@a3t/rapid-core'` | ⚠️ Import change |
| `configureLogger({ level })` | Same | ✅ Yes |

### File Changes Summary

| Package | File | Change |
|---------|------|--------|
| `core` | `src/logger.ts` | Enhanced with namespacing, timestamps, formats |
| `core` | `src/index.ts` | Export `createLogger`, `configureLogger` |
| `rapid-mcp` | `src/utils/logger.ts` | Re-export from core (deprecate local impl) |
| `daemon` | `src/**/*.ts` | Replace console.log with createLogger |
| `agent-runner` | `src/**/*.ts` | Use createLogger for structured logs |

### Testing Strategy

1. **Unit tests** - Test all log levels, formats, and configurations
2. **Integration tests** - Verify imports work from all packages
3. **Visual tests** - Check output formatting in TTY vs non-TTY

### Implementation Timeline

1. **Phase 1** (1 day): Enhance core logger with new features
2. **Phase 2** (0.5 day): Update rapid-mcp to re-export from core
3. **Phase 3** (1 day): Migrate daemon to use structured logging
4. **Phase 4** (0.5 day): Update agent-runner logging
5. **Phase 5** (1 day): Testing and documentation

Total: ~4 days of implementation work

### Success Criteria

- [ ] Single logger implementation in `@a3t/rapid-core`
- [ ] All packages import logger from core
- [ ] Namespacing works: `[component]` prefix in logs
- [ ] Environment configuration preserved
- [ ] Pretty and JSON output formats available
- [ ] Backwards compatible with existing imports
- [ ] All tests pass
- [ ] daemon uses structured logging (no raw console.log)

## Alternatives Considered

### Option A: Shared utilities package
Create `@a3t/rapid-utils` for shared code.
- **Pros**: Clean separation, smaller core package
- **Cons**: Another package to maintain, more complex dependency graph

### Option B: Use external logging library (pino, winston)
Replace custom logger with established library.
- **Pros**: Battle-tested, rich features
- **Cons**: Added dependency, may be overkill for CLI tool

### Option C: Keep separate implementations
Document differences and leave as-is.
- **Pros**: No migration work
- **Cons**: Technical debt continues, inconsistent behavior

**Recommendation**: Enhance core logger (this proposal) as it minimizes changes while consolidating functionality.

## References

- [Current core logger](../../packages/core/src/logger.ts)
- [Current rapid-mcp logger](../../packages/rapid-mcp/src/utils/logger.ts)
- [Chalk documentation](https://github.com/chalk/chalk)
