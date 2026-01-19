/**
 * Sandbox Manager Tests
 */

import { describe, expect, it } from 'vitest';
import { createSandboxManager, SandboxManager } from './manager.js';

describe('SandboxManager', () => {
  it('should create a sandbox manager', () => {
    const manager = createSandboxManager({
      enabled: true,
      mode: 'auto',
    });
    expect(manager).toBeInstanceOf(SandboxManager);
  });

  it('should return status when not initialized', async () => {
    const manager = createSandboxManager({
      enabled: true,
      mode: 'auto',
    });
    const status = await manager.getStatus();
    expect(status.available).toBeDefined();
    expect(status.platform).toBeDefined();
    expect(status.method).toBeDefined();
    expect(status.httpProxyRunning).toBe(false);
    expect(status.socksProxyRunning).toBe(false);
  });

  it('should detect platform correctly', async () => {
    const manager = createSandboxManager({
      enabled: true,
      mode: 'auto',
    });
    const status = await manager.getStatus();
    expect(['darwin', 'linux', 'win32', 'other']).toContain(status.platform);
  });
});
