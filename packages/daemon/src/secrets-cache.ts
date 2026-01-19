/**
 * Secrets Cache
 *
 * In-memory TTL-based cache for credentials to avoid repeated lookups.
 */

import { loadSecrets } from '@a3t/rapid-core';
import type { RapidConfig } from '@a3t/rapid-core';
import type { SecretsCacheEntry, DaemonEvent, EventListener } from './types.js';
import { DEFAULT_SECRETS_TTL } from './types.js';

export interface SecretsCacheOptions {
  /** Time-to-live for cached secrets in ms (default: 5 minutes) */
  ttl?: number;
  /** Auto-refresh secrets before expiry */
  autoRefresh?: boolean;
  /** Refresh threshold before expiry (default: 30 seconds) */
  refreshThreshold?: number;
}

export class SecretsCache {
  private cache: Map<string, SecretsCacheEntry> = new Map();
  private projectConfigs: Map<string, RapidConfig> = new Map();
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();
  private eventListeners: Set<EventListener> = new Set();
  private options: Required<SecretsCacheOptions>;

  constructor(options: SecretsCacheOptions = {}) {
    this.options = {
      ttl: options.ttl ?? DEFAULT_SECRETS_TTL,
      autoRefresh: options.autoRefresh ?? false,
      refreshThreshold: options.refreshThreshold ?? 30 * 1000,
    };
  }

  /**
   * Get a secret from cache or load it
   */
  async get(key: string, projectDir: string, config?: RapidConfig): Promise<string | null> {
    const cacheKey = this.makeCacheKey(key, projectDir);
    const entry = this.cache.get(cacheKey);

    // Return cached value if valid
    if (entry && !this.isExpired(entry)) {
      return entry.value;
    }

    // Load secrets if we have config
    if (config) {
      await this.loadSecretsForProject(projectDir, config);
      const newEntry = this.cache.get(cacheKey);
      return newEntry?.value ?? null;
    }

    // Try to use cached config
    const cachedConfig = this.projectConfigs.get(projectDir);
    if (cachedConfig) {
      await this.loadSecretsForProject(projectDir, cachedConfig);
      const newEntry = this.cache.get(cacheKey);
      return newEntry?.value ?? null;
    }

    return null;
  }

  /**
   * Load all secrets for a project
   */
  async loadSecretsForProject(
    projectDir: string,
    config: RapidConfig
  ): Promise<Record<string, string>> {
    this.projectConfigs.set(projectDir, config);

    try {
      if (!config.secrets) {
        return {};
      }
      const secrets = await loadSecrets(config.secrets);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.options.ttl);

      // Cache each secret
      for (const [key, value] of Object.entries(secrets)) {
        const cacheKey = this.makeCacheKey(key, projectDir);
        this.cache.set(cacheKey, {
          value,
          source: this.determineSource(config),
          cachedAt: now,
          expiresAt,
        });
      }

      // Set up auto-refresh if enabled
      if (this.options.autoRefresh) {
        this.scheduleRefresh(projectDir, config);
      }

      this.emit({
        type: 'secrets.refreshed',
        timestamp: now,
        data: { projectDir, count: Object.keys(secrets).length },
      });

      return secrets;
    } catch (error) {
      console.error('Failed to load secrets:', error);
      return {};
    }
  }

  /**
   * Refresh secrets for a project
   */
  async refresh(projectDir: string): Promise<void> {
    const config = this.projectConfigs.get(projectDir);
    if (!config) {
      return;
    }

    // Clear existing cache for this project
    this.clearProject(projectDir);

    // Reload secrets
    await this.loadSecretsForProject(projectDir, config);
  }

  /**
   * Clear cache for a project
   */
  clearProject(projectDir: string): void {
    const prefix = `${projectDir}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }

    // Clear refresh timer
    const timer = this.refreshTimers.get(projectDir);
    if (timer) {
      clearTimeout(timer);
      this.refreshTimers.delete(projectDir);
    }
  }

  /**
   * Clear all cached secrets
   */
  clearAll(): void {
    this.cache.clear();

    // Clear all refresh timers
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();
  }

  /**
   * Add an event listener
   */
  addEventListener(listener: EventListener): void {
    this.eventListeners.add(listener);
  }

  /**
   * Remove an event listener
   */
  removeEventListener(listener: EventListener): void {
    this.eventListeners.delete(listener);
  }

  /**
   * Get cache stats
   */
  getStats(): {
    totalEntries: number;
    expiredEntries: number;
    projects: number;
  } {
    let expiredCount = 0;
    for (const entry of this.cache.values()) {
      if (this.isExpired(entry)) {
        expiredCount++;
      }
    }

    return {
      totalEntries: this.cache.size,
      expiredEntries: expiredCount,
      projects: this.projectConfigs.size,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Make a cache key
   */
  private makeCacheKey(key: string, projectDir: string): string {
    return `${projectDir}:${key}`;
  }

  /**
   * Check if an entry is expired
   */
  private isExpired(entry: SecretsCacheEntry): boolean {
    if (!entry.expiresAt) {
      return false;
    }
    return new Date() > entry.expiresAt;
  }

  /**
   * Determine the source from config
   */
  private determineSource(config: RapidConfig): 'env' | '1password' | 'vault' | 'external' {
    return config.secrets?.provider ?? 'env';
  }

  /**
   * Schedule auto-refresh
   */
  private scheduleRefresh(projectDir: string, config: RapidConfig): void {
    // Clear existing timer
    const existingTimer = this.refreshTimers.get(projectDir);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule refresh before TTL expires
    const refreshDelay = Math.max(0, this.options.ttl - this.options.refreshThreshold);

    const timer = setTimeout(async () => {
      await this.loadSecretsForProject(projectDir, config);
    }, refreshDelay);

    this.refreshTimers.set(projectDir, timer);
  }

  /**
   * Emit an event
   */
  private emit(event: DaemonEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    }
  }
}
