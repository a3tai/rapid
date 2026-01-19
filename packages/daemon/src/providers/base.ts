/**
 * Base Environment Provider
 *
 * Abstract base class for environment providers.
 */

import type {
  EnvironmentProvider,
  ProviderType,
  ProviderInitOptions,
  Session,
  EnvironmentHandle,
  ExecuteOptions,
  ExecuteResult,
} from '../types.js';

export abstract class BaseProvider implements EnvironmentProvider {
  abstract readonly type: ProviderType;
  abstract readonly name: string;

  protected initialized = false;
  protected options: ProviderInitOptions = {};

  /**
   * Check if this provider is available on the current system
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Initialize the provider
   */
  async initialize(options: ProviderInitOptions): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.options = options;
    await this.doInitialize(options);
    this.initialized = true;
  }

  /**
   * Provider-specific initialization
   */
  protected abstract doInitialize(options: ProviderInitOptions): Promise<void>;

  /**
   * Create and start an environment for a session
   */
  abstract createEnvironment(session: Session): Promise<EnvironmentHandle>;

  /**
   * Stop an environment
   */
  abstract stopEnvironment(handle: EnvironmentHandle): Promise<void>;

  /**
   * Execute a command in the environment
   */
  abstract execute(
    handle: EnvironmentHandle,
    command: string[],
    options?: ExecuteOptions
  ): Promise<ExecuteResult>;

  /**
   * Clean up provider resources
   */
  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    await this.doCleanup();
    this.initialized = false;
  }

  /**
   * Provider-specific cleanup
   */
  protected abstract doCleanup(): Promise<void>;

  /**
   * Ensure provider is initialized
   */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} is not initialized`);
    }
  }
}
