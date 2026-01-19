/**
 * Tests for Event Bus Messages
 */

import { describe, it, expect } from 'vitest';
import {
  MessageSchema,
  MessageType,
  MessagePriority,
  createMessage,
  getMessageIcon,
  formatMessageForDisplay,
  formatMessagesForInjection,
} from './messages.js';

describe('MessageType', () => {
  it('should include all expected types', () => {
    const types = MessageType.options;
    expect(types).toContain('discovery');
    expect(types).toContain('error');
    expect(types).toContain('completion');
    expect(types).toContain('question');
    expect(types).toContain('learning');
    expect(types).toContain('coordination');
    expect(types).toContain('heartbeat');
  });
});

describe('MessagePriority', () => {
  it('should include all expected priorities', () => {
    const priorities = MessagePriority.options;
    expect(priorities).toContain('low');
    expect(priorities).toContain('normal');
    expect(priorities).toContain('high');
    expect(priorities).toContain('urgent');
  });
});

describe('createMessage', () => {
  it('should create a valid message', () => {
    const msg = createMessage(
      'discovery',
      { id: 'agent-1', name: 'claude' },
      { title: 'Test', content: 'Test content' }
    );

    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeDefined();
    expect(msg.type).toBe('discovery');
    expect(msg.fromAgent.id).toBe('agent-1');
    expect(msg.fromAgent.name).toBe('claude');
    expect(msg.payload.title).toBe('Test');
    expect(msg.payload.content).toBe('Test content');
    expect(msg.priority).toBe('normal');
    expect(msg.payload.actionable).toBe(false);
  });

  it('should set custom priority', () => {
    const msg = createMessage(
      'error',
      { id: 'agent-1', name: 'claude' },
      { title: 'Error', content: 'Error content' },
      { priority: 'urgent' }
    );

    expect(msg.priority).toBe('urgent');
  });

  it('should set target agents', () => {
    const msg = createMessage(
      'coordination',
      { id: 'agent-1', name: 'claude' },
      { title: 'Coordination', content: 'Content' },
      { toAgents: ['agent-2', 'agent-3'] }
    );

    expect(msg.toAgents).toEqual(['agent-2', 'agent-3']);
  });
});

describe('MessageSchema', () => {
  it('should validate a valid message', () => {
    const msg = createMessage(
      'discovery',
      { id: 'agent-1', name: 'claude' },
      { title: 'Test', content: 'Content' }
    );

    const result = MessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('should reject invalid message type', () => {
    const invalid = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'invalid-type',
      fromAgent: { id: 'agent-1', name: 'claude' },
      priority: 'normal',
      payload: { title: 'Test', content: 'Content', actionable: false },
    };

    const result = MessageSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('getMessageIcon', () => {
  it('should return correct icons for each type', () => {
    expect(getMessageIcon('discovery')).toBe('💡');
    expect(getMessageIcon('error')).toBe('❌');
    expect(getMessageIcon('completion')).toBe('✅');
    expect(getMessageIcon('question')).toBe('❓');
    expect(getMessageIcon('learning')).toBe('📚');
    expect(getMessageIcon('coordination')).toBe('🔒');
    expect(getMessageIcon('heartbeat')).toBe('💓');
  });
});

describe('formatMessageForDisplay', () => {
  it('should format message for display', () => {
    const msg = createMessage(
      'discovery',
      { id: 'agent-1', name: 'claude', worktree: 'feat/auth' },
      { title: 'Found pattern', content: 'JWT validation at src/auth.ts' }
    );

    const formatted = formatMessageForDisplay(msg);

    expect(formatted).toContain('💡');
    expect(formatted).toContain('DISCOVERY');
    expect(formatted).toContain('Found pattern');
    expect(formatted).toContain('claude (feat/auth)');
    expect(formatted).toContain('JWT validation at src/auth.ts');
  });
});

describe('formatMessagesForInjection', () => {
  it('should return empty string for empty array', () => {
    expect(formatMessagesForInjection([])).toBe('');
  });

  it('should format messages for context injection', () => {
    const messages = [
      createMessage(
        'discovery',
        { id: 'agent-1', name: 'opencode', worktree: 'backend/' },
        { title: 'Found API pattern', content: 'REST endpoints at /api/v1' }
      ),
      createMessage(
        'error',
        { id: 'agent-2', name: 'aider', worktree: 'tests/' },
        { title: 'Test failure', content: 'AuthTest failed' }
      ),
    ];

    const formatted = formatMessagesForInjection(messages);

    expect(formatted).toContain('## Messages from Other Agents');
    expect(formatted).toContain('<agent-message type="discovery"');
    expect(formatted).toContain('from="opencode (backend/)"');
    expect(formatted).toContain('Found API pattern');
    expect(formatted).toContain('<agent-message type="error"');
    expect(formatted).toContain('from="aider (tests/)"');
    expect(formatted).toContain('Test failure');
  });
});
