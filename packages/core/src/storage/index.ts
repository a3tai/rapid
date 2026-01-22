/**
 * Storage Module
 *
 * Durable storage for RAPID tasks with support for multiple backends.
 *
 * @module @a3t/rapid-core/storage
 */

// Types
export * from './types.js';

// Adapters
export { SQLiteStorageAdapter } from './sqlite-adapter.js';
export { FileStorageAdapter } from './file-adapter.js';

// Factory
export {
  createStorageAdapter,
  getDefaultStorageAdapter,
  detectStorageBackend,
  createAutoStorageAdapter,
  type StorageBackend,
  type StorageFactoryConfig,
} from './factory.js';
