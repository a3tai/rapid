/**
 * Session Manager Tests
 */

import { describe, expect, it } from 'vitest';
import { SessionManager } from './session-manager.js';

describe('SessionManager', () => {
  it('should create a session', async () => {
    const manager = new SessionManager();
    const session = await manager.createSession({
      projectDir: '/tmp/test',
      agent: 'claude',
    });

    expect(session.id).toBeDefined();
    expect(session.projectDir).toBe('/tmp/test');
    expect(session.agent).toBe('claude');
    expect(session.state).toBe('created');
  });

  it('should list sessions', async () => {
    const manager = new SessionManager();
    await manager.createSession({
      projectDir: '/tmp/test',
      agent: 'claude',
    });

    const sessions = manager.listSessions();
    expect(sessions).toHaveLength(1);
  });

  it('should get session count', async () => {
    const manager = new SessionManager();
    expect(manager.count).toBe(0);

    await manager.createSession({
      projectDir: '/tmp/test',
      agent: 'claude',
    });

    expect(manager.count).toBe(1);
  });
});
