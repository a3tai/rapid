/**
 * Config Watcher
 *
 * Watches rapid.json files for changes and triggers hot-reload events.
 */

import { watch, type FSWatcher } from 'chokidar';
import { loadConfigFromFile, type RapidConfig } from '@a3t/rapid-core';
import type { DaemonEvent, EventListener } from './types.js';

export interface ConfigWatcherOptions {
  /** Debounce delay in ms (default: 100) */
  debounceDelay?: number;
  /** Event listener for config changes */
  onConfigChange?: (projectDir: string, config: RapidConfig | null) => void;
}

export class ConfigWatcher {
  private watcher: FSWatcher | null = null;
  private watchedPaths: Map<string, string> = new Map(); // configPath -> projectDir
  private configs: Map<string, RapidConfig | null> = new Map(); // projectDir -> config
  private eventListeners: Set<EventListener> = new Set();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private options: Required<ConfigWatcherOptions>;

  constructor(options: ConfigWatcherOptions = {}) {
    this.options = {
      debounceDelay: options.debounceDelay ?? 100,
      onConfigChange: options.onConfigChange ?? (() => {}),
    };
  }

  /**
   * Start watching config files
   */
  async start(): Promise<void> {
    if (this.watcher) {
      return;
    }

    this.watcher = watch([], {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100,
      },
    });

    this.watcher.on('change', (path) => {
      this.handleChange(path);
    });

    this.watcher.on('unlink', (path) => {
      this.handleDelete(path);
    });

    this.watcher.on('error', (error) => {
      console.error('Config watcher error:', error);
    });
  }

  /**
   * Stop watching config files
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Add a project directory to watch
   */
  async watchProject(projectDir: string, configPath: string): Promise<RapidConfig | null> {
    if (!this.watcher) {
      await this.start();
    }

    // Load initial config
    const config = await this.loadConfig(configPath);
    this.configs.set(projectDir, config);
    this.watchedPaths.set(configPath, projectDir);

    // Add to watcher
    this.watcher!.add(configPath);

    return config;
  }

  /**
   * Stop watching a project directory
   */
  unwatchProject(projectDir: string): void {
    // Find and remove config path
    for (const [configPath, dir] of this.watchedPaths.entries()) {
      if (dir === projectDir) {
        this.watcher?.unwatch(configPath);
        this.watchedPaths.delete(configPath);
        break;
      }
    }

    this.configs.delete(projectDir);
  }

  /**
   * Get cached config for a project
   */
  getConfig(projectDir: string): RapidConfig | null {
    return this.configs.get(projectDir) ?? null;
  }

  /**
   * Reload config for a project
   */
  async reloadConfig(projectDir: string): Promise<RapidConfig | null> {
    // Find config path
    let configPath: string | null = null;
    for (const [path, dir] of this.watchedPaths.entries()) {
      if (dir === projectDir) {
        configPath = path;
        break;
      }
    }

    if (!configPath) {
      return null;
    }

    const config = await this.loadConfig(configPath);
    this.configs.set(projectDir, config);

    return config;
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
   * Handle config file change
   */
  private handleChange(configPath: string): void {
    const projectDir = this.watchedPaths.get(configPath);
    if (!projectDir) {
      return;
    }

    // Debounce rapid changes
    const existingTimer = this.debounceTimers.get(configPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(configPath);

      const oldConfig = this.configs.get(projectDir);
      const newConfig = await this.loadConfig(configPath);
      this.configs.set(projectDir, newConfig);

      // Only emit if config actually changed
      if (JSON.stringify(oldConfig) !== JSON.stringify(newConfig)) {
        this.options.onConfigChange(projectDir, newConfig);
        this.emit({
          type: 'config.changed',
          timestamp: new Date(),
          data: { projectDir, config: newConfig },
        });
      }
    }, this.options.debounceDelay);

    this.debounceTimers.set(configPath, timer);
  }

  /**
   * Handle config file deletion
   */
  private handleDelete(configPath: string): void {
    const projectDir = this.watchedPaths.get(configPath);
    if (!projectDir) {
      return;
    }

    this.configs.set(projectDir, null);
    this.options.onConfigChange(projectDir, null);
    this.emit({
      type: 'config.changed',
      timestamp: new Date(),
      data: { projectDir, config: null, deleted: true },
    });
  }

  /**
   * Load config from file
   */
  private async loadConfig(configPath: string): Promise<RapidConfig | null> {
    try {
      const loaded = await loadConfigFromFile(configPath);
      return loaded.config;
    } catch {
      return null;
    }
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

  /**
   * Get all watched project directories
   */
  get watchedProjects(): string[] {
    return Array.from(this.configs.keys());
  }
}
