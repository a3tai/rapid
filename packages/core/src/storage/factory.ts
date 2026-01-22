/**
 * Storage Adapter Factory
 *
 * Creates storage adapters based on configuration.
 * Supports multiple backends: SQLite, File, Redis (future), PostgreSQL (future).
 *
 * IMPORTANT: Storage adapters should ONLY be used by:
 * - MCP Server (packages/rapid-mcp)
 * - Daemon (packages/daemon)
 *
 * Agents should NOT directly access storage. They interact with tasks through
 * MCP tools (task_create, task_update, task_claim, etc.) which delegate to
 * the storage adapter on the server side.
 *
 * Architecture:
 * ```
 * Agent --> MCP Tools --> StorageAdapter --> SQLite/File/Redis
 *                             ^
 *                             |
 * Daemon --> StorageAdapter --+
 * ```
 *
 * For containerized deployments, mount the SQLite database file into the
 * MCP container and configure the path via RAPID_STORAGE_PATH environment
 * variable.
 *
 * @module @a3t/rapid-core/storage
 */

import { join } from 'path';
import type { StorageAdapter, StorageAdapterConfig } from './types.js';
import { SQLiteStorageAdapter } from './sqlite-adapter.js';
import { FileStorageAdapter } from './file-adapter.js';

/**
 * Storage backend types
 */
export type StorageBackend = 'sqlite' | 'file' | 'redis' | 'postgres' | 'hybrid';

/**
 * Factory configuration
 */
export interface StorageFactoryConfig {
  /** Backend to use */
  backend: StorageBackend;

  /** Base path for storage files */
  basePath?: string;

  /** SQLite-specific options */
  sqlite?: {
    filename?: string;
    wal?: boolean;
    syncWrites?: boolean;
  };

  /** File-specific options */
  file?: {
    filename?: string;
    wal?: boolean;
  };

  /** Redis-specific options (future) */
  redis?: {
    url?: string;
    prefix?: string;
  };

  /** PostgreSQL-specific options (future) */
  postgres?: {
    connectionString?: string;
  };

  /** Common options */
  maxHistoryPerTask?: number;
  autoBackup?: boolean;
  backupInterval?: number;
}

/**
 * Default configuration values
 */
const DEFAULTS: Required<StorageFactoryConfig> = {
  backend: 'sqlite',
  basePath: '.rapid',
  sqlite: {
    filename: 'rapid.db',
    wal: true,
    syncWrites: false,
  },
  file: {
    filename: 'tasks.json',
    wal: true,
  },
  redis: {
    url: 'redis://localhost:6379',
    prefix: 'rapid:tasks',
  },
  postgres: {
    connectionString: '',
  },
  maxHistoryPerTask: 100,
  autoBackup: false,
  backupInterval: 3600000,
};

/**
 * Create a storage adapter based on configuration
 */
export function createStorageAdapter(config: Partial<StorageFactoryConfig> = {}): StorageAdapter {
  const fullConfig: Required<StorageFactoryConfig> = {
    ...DEFAULTS,
    ...config,
    sqlite: { ...DEFAULTS.sqlite, ...config.sqlite },
    file: { ...DEFAULTS.file, ...config.file },
    redis: { ...DEFAULTS.redis, ...config.redis },
    postgres: { ...DEFAULTS.postgres, ...config.postgres },
  };

  const basePath = fullConfig.basePath;

  switch (fullConfig.backend) {
    case 'sqlite': {
      const adapterConfig: StorageAdapterConfig = {
        path: join(basePath, fullConfig.sqlite.filename!),
        wal: fullConfig.sqlite.wal ?? true,
        syncWrites: fullConfig.sqlite.syncWrites ?? false,
        maxHistoryPerTask: fullConfig.maxHistoryPerTask,
        autoBackup: fullConfig.autoBackup,
        backupInterval: fullConfig.backupInterval,
      };
      return new SQLiteStorageAdapter(adapterConfig);
    }

    case 'file': {
      // File adapter expects a directory path (it creates tasks.json, history.json, etc inside)
      const adapterConfig: StorageAdapterConfig = {
        path: basePath,
        wal: fullConfig.file.wal ?? true,
        maxHistoryPerTask: fullConfig.maxHistoryPerTask,
        autoBackup: fullConfig.autoBackup,
        backupInterval: fullConfig.backupInterval,
      };
      return new FileStorageAdapter(adapterConfig);
    }

    case 'redis':
      throw new Error('Redis storage adapter not yet implemented');

    case 'postgres':
      throw new Error('PostgreSQL storage adapter not yet implemented');

    case 'hybrid':
      throw new Error('Hybrid storage adapter not yet implemented');

    default:
      throw new Error(`Unknown storage backend: ${fullConfig.backend}`);
  }
}

/**
 * Get the default storage adapter (SQLite with WAL)
 */
export function getDefaultStorageAdapter(basePath = '.rapid'): StorageAdapter {
  return createStorageAdapter({
    backend: 'sqlite',
    basePath,
    sqlite: {
      wal: true,
    },
  });
}

/**
 * Detect the best storage backend for the environment
 */
export function detectStorageBackend(): StorageBackend {
  // Check for environment variables
  if (process.env.RAPID_STORAGE_BACKEND) {
    return process.env.RAPID_STORAGE_BACKEND as StorageBackend;
  }

  // Check if PostgreSQL connection is configured
  if (process.env.RAPID_POSTGRES_URL || process.env.DATABASE_URL) {
    return 'postgres';
  }

  // Check if Redis is configured for storage
  if (process.env.RAPID_STORAGE_REDIS_URL) {
    return 'redis';
  }

  // Default to SQLite (most portable)
  return 'sqlite';
}

/**
 * Create a storage adapter based on environment detection
 */
export function createAutoStorageAdapter(basePath = '.rapid'): StorageAdapter {
  const backend = detectStorageBackend();
  return createStorageAdapter({ backend, basePath });
}
