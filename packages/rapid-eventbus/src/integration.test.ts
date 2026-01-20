/**
 * Integration Tests for Event Bus with Redis
 *
 * These tests verify the event bus works correctly with actual Redis.
 * Tests are skipped if Redis is not available.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { EventBus, type EventBusConfig } from './bus.js';
import { createMessage, type AgentInfo } from './messages.js';
import { getRedisStatus, startRedis, stopRedis } from './redis-container.js';

// Test configuration
const TEST_PROJECT_ID = 'integration-test';
const REDIS_TIMEOUT = 30000; // 30 seconds for Redis operations

// Check if Redis is available for tests
async function isRedisAvailable(): Promise<{ available: boolean; url?: string }> {
  try {
    // First check if Redis is already running
    const status = await getRedisStatus();
    if (status.running && status.url) {
      return { available: true, url: status.url };
    }

    // Check for REDIS_URL environment variable
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      return { available: true, url: redisUrl };
    }

    return { available: false };
  } catch {
    return { available: false };
  }
}

describe('Event Bus Integration Tests', () => {
  let bus: EventBus | null = null;
  let redisUrl: string | undefined;
  let redisAvailable = false;

  beforeAll(async () => {
    const status = await isRedisAvailable();
    redisAvailable = status.available;
    redisUrl = status.url;

    if (!redisAvailable) {
      console.log('⚠️  Redis not available - integration tests will be skipped');
      console.log('   Start Redis with: rapid start or docker run -d -p 6379:6379 redis:7-alpine');
    }
  }, REDIS_TIMEOUT);

  afterAll(async () => {
    if (bus) {
      await bus.disconnect();
    }
  });

  beforeEach(async () => {
    if (!redisAvailable || !redisUrl) {
      return;
    }

    // Create fresh bus for each test
    if (bus) {
      await bus.disconnect();
    }

    const config: EventBusConfig = {
      redis: { url: redisUrl },
      projectId: `${TEST_PROJECT_ID}-${Date.now()}`,
    };
    bus = new EventBus(config);
    await bus.connect();
  });

  describe('Connection Management', () => {
    it.skipIf(!redisAvailable)('should connect to Redis successfully', async () => {
      expect(bus).not.toBeNull();
      const stats = await bus!.getStats();
      expect(stats.connected).toBe(true);
    });

    it.skipIf(!redisAvailable)('should handle disconnect gracefully', async () => {
      await bus!.disconnect();
      // Reconnect for other tests
      await bus!.connect();
      const stats = await bus!.getStats();
      expect(stats.connected).toBe(true);
    });
  });

  describe('Agent Registration', () => {
    it.skipIf(!redisAvailable)('should register agent and persist in Redis', async () => {
      const agent: AgentInfo = {
        id: `test-agent-${Date.now()}`,
        name: 'test-worker',
        worktree: 'feat/test',
      };

      const agentId = await bus!.registerAgent(agent);
      expect(agentId).toBe(agent.id);

      // Verify agent is in registry
      const agents = await bus!.getActiveAgents(300);
      const found = agents.find((a) => a.id === agent.id);
      expect(found).toBeDefined();
      expect(found?.name).toBe('test-worker');
    });

    it.skipIf(!redisAvailable)('should track multiple agents', async () => {
      const agents: AgentInfo[] = [
        { id: `agent-1-${Date.now()}`, name: 'orchestrator' },
        { id: `agent-2-${Date.now()}`, name: 'worker-1' },
        { id: `agent-3-${Date.now()}`, name: 'worker-2' },
      ];

      for (const agent of agents) {
        await bus!.registerAgent(agent);
      }

      const activeAgents = await bus!.getActiveAgents(300);
      expect(activeAgents.length).toBeGreaterThanOrEqual(3);
    });

    it.skipIf(!redisAvailable)('should unregister agent', async () => {
      const agent: AgentInfo = {
        id: `unregister-test-${Date.now()}`,
        name: 'temp-agent',
      };

      await bus!.registerAgent(agent);
      let agents = await bus!.getActiveAgents(300);
      expect(agents.find((a) => a.id === agent.id)).toBeDefined();

      const removed = await bus!.unregisterAgent(agent.id);
      expect(removed).toBe(true);

      agents = await bus!.getActiveAgents(300);
      expect(agents.find((a) => a.id === agent.id)).toBeUndefined();
    });
  });

  describe('Heartbeat Protocol', () => {
    it.skipIf(!redisAvailable)('should update agent timestamp on heartbeat', async () => {
      const agent: AgentInfo = {
        id: `heartbeat-test-${Date.now()}`,
        name: 'heartbeat-agent',
      };

      await bus!.registerAgent(agent);

      // Wait a bit then send heartbeat
      await new Promise((resolve) => setTimeout(resolve, 100));
      await bus!.heartbeat(agent.id);

      // Agent should still be active
      const agents = await bus!.getActiveAgents(1); // Very short window
      const found = agents.find((a) => a.id === agent.id);
      expect(found).toBeDefined();
    });

    it.skipIf(!redisAvailable)('should mark agent as stale without heartbeat', async () => {
      const agent: AgentInfo = {
        id: `stale-test-${Date.now()}`,
        name: 'stale-agent',
      };

      await bus!.registerAgent(agent);

      // With a 0-second window, agent should be stale
      const agents = await bus!.getActiveAgents(0);
      const found = agents.find((a) => a.id === agent.id);
      expect(found).toBeUndefined();
    });
  });

  describe('Message Persistence', () => {
    it.skipIf(!redisAvailable)('should persist messages to Redis stream', async () => {
      const agent: AgentInfo = {
        id: `sender-${Date.now()}`,
        name: 'sender',
      };

      const message = await bus!.sendMessage('discovery', agent, {
        title: 'Test Discovery',
        content: 'Found important pattern in codebase',
      });

      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();

      // Verify message is in history
      const history = await bus!.getHistory({ hours: 1 });
      const found = history.find((m) => m.id === message.id);
      expect(found).toBeDefined();
      expect(found?.payload.title).toBe('Test Discovery');
    });

    it.skipIf(!redisAvailable)('should filter messages by type', async () => {
      const agent: AgentInfo = { id: `filter-test-${Date.now()}`, name: 'filter-agent' };

      // Send different message types
      await bus!.sendMessage('discovery', agent, { title: 'Discovery', content: 'Found something' });
      await bus!.sendMessage('error', agent, { title: 'Error', content: 'Something failed' });
      await bus!.sendMessage('completion', agent, { title: 'Done', content: 'Task completed' });

      // Filter by type
      const errors = await bus!.getHistory({ hours: 1, types: ['error'] });
      const errorsOnly = errors.filter((m) => m.fromAgent.id === agent.id);
      expect(errorsOnly.every((m) => m.type === 'error')).toBe(true);
    });

    it.skipIf(!redisAvailable)('should retrieve messages with cursor pagination', async () => {
      const agent: AgentInfo = { id: `pagination-${Date.now()}`, name: 'paginator' };

      // Send multiple messages
      for (let i = 0; i < 5; i++) {
        await bus!.sendMessage('coordination', agent, {
          title: `Message ${i}`,
          content: `Content ${i}`,
        });
      }

      // Get first batch
      const result1 = await bus!.getMessages({ limit: 2 });
      expect(result1.messages.length).toBeLessThanOrEqual(2);
      expect(result1.cursor).toBeDefined();
    });
  });

  describe('Pub/Sub Delivery', () => {
    it.skipIf(!redisAvailable)('should deliver messages via pub/sub', async () => {
      const receivedMessages: unknown[] = [];

      // Subscribe to messages
      await bus!.subscribe((message) => {
        receivedMessages.push(message);
      });

      const agent: AgentInfo = { id: `pubsub-${Date.now()}`, name: 'pubsub-agent' };

      // Send message
      await bus!.sendMessage('coordination', agent, {
        title: 'Pub/Sub Test',
        content: 'Testing real-time delivery',
      });

      // Wait for delivery (should be fast)
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(receivedMessages.length).toBeGreaterThan(0);
    }, 5000);
  });

  describe('Concurrent Operations', () => {
    it.skipIf(!redisAvailable)('should handle concurrent agent registrations', async () => {
      const registrations = [];

      for (let i = 0; i < 10; i++) {
        registrations.push(
          bus!.registerAgent({
            id: `concurrent-${Date.now()}-${i}`,
            name: `worker-${i}`,
          })
        );
      }

      await Promise.all(registrations);

      const agents = await bus!.getActiveAgents(300);
      expect(agents.length).toBeGreaterThanOrEqual(10);
    });

    it.skipIf(!redisAvailable)('should handle concurrent message sends', async () => {
      const agent: AgentInfo = { id: `concurrent-sender-${Date.now()}`, name: 'sender' };
      const sends = [];

      for (let i = 0; i < 20; i++) {
        sends.push(
          bus!.sendMessage('coordination', agent, {
            title: `Concurrent ${i}`,
            content: `Message ${i}`,
          })
        );
      }

      const messages = await Promise.all(sends);
      expect(messages.length).toBe(20);
      expect(messages.every((m) => m.id)).toBe(true);
    });
  });

  describe('Statistics', () => {
    it.skipIf(!redisAvailable)('should return accurate statistics', async () => {
      const stats = await bus!.getStats();

      expect(typeof stats.connected).toBe('boolean');
      expect(typeof stats.messageCount).toBe('number');
      expect(typeof stats.activeAgents).toBe('number');
      expect(typeof stats.streamLength).toBe('number');
    });
  });
});

// Standalone test that can run without full Redis setup
describe('Event Bus Unit Tests (No Redis)', () => {
  it('should create EventBus instance', () => {
    const config: EventBusConfig = {
      redis: { url: 'redis://localhost:6379' },
      projectId: 'unit-test',
    };
    const bus = new EventBus(config);
    expect(bus).toBeDefined();
  });
});
