# @a3t/rapid-eventbus

Event Bus for RAPID - Redis-backed (or in-memory) message bus for inter-agent communication.

## Overview

This package provides a robust event bus for coordinating multiple AI agents. It supports both Redis (for production) and in-memory (for development) backends, enabling real-time agent discovery, messaging, and coordination.

## Features

- 📨 **Message Types** - Coordination, discovery, completion, error, learning, question
- 🔄 **Automatic Fallback** - Redis with in-memory fallback
- 🤖 **Agent Discovery** - Find active agents in the system
- 💾 **Message Persistence** - Retrieve historical messages
- 🔍 **Message Filtering** - Query by type, sender, tags, timestamps
- ⏱️ **TTL Management** - Auto-cleanup with configurable retention
- 🛡️ **Type Safety** - Full TypeScript support

## Installation

```bash
npm install @a3t/rapid-eventbus
```

## Quick Start

```typescript
import { EventBus, InMemoryEventBus } from '@a3t/rapid-eventbus';

// Try Redis first, fallback to in-memory
const bus = new EventBus({
  redis: {
    host: 'localhost',
    port: 6379,
  },
});

// Register agent
await bus.register('my-agent', 'claude-orchestrator');

// Send message
await bus.send({
  type: 'coordination',
  from: 'my-agent',
  title: 'Starting task',
  content: 'Beginning work on feature X',
});

// Receive messages
const messages = await bus.getMessages({
  types: ['completion'],
  limit: 10,
});

// Monitor agents
const agents = await bus.getAgents();
```

## API

### EventBus

#### `register(agentId, agentName, worktree?, session?)`

Register an agent on the bus.

```typescript
const result = await bus.register('agent-123', 'claude', 'main');
// { agentId, registeredAt, projectId, mode }
```

#### `send(message)`

Send a message to all agents.

```typescript
await bus.send({
  type: 'coordination',
  from: 'agent-1',
  title: 'Task assignment',
  content: 'Please handle feature X',
  priority: 'high',
});
```

#### `getMessages(options?)`

Retrieve messages with filtering.

```typescript
const messages = await bus.getMessages({
  types: ['completion', 'error'],
  from: 'agent-1',
  limit: 20,
  since: new Date(Date.now() - 3600000), // Last hour
});
```

#### `poll(options?)`

Efficiently poll for new messages since last check.

```typescript
let cursor = new Date().toISOString();

while (true) {
  const { messages, nextCursor } = await bus.poll({
    cursor,
    limit: 5,
  });

  cursor = nextCursor;
  // Process messages
}
```

#### `getAgents(maxAgeSeconds?)`

List currently active agents.

```typescript
const agents = await bus.getAgents();
// [ { id, name, worktree, registeredAt } ]
```

#### `getStatus()`

Get event bus health and statistics.

```typescript
const status = await bus.getStatus();
// { mode, agents, messages, lastMessage }
```

## Message Types

### coordination
Inter-agent coordination and task assignment.

```typescript
{
  type: 'coordination',
  title: 'Task assigned',
  content: 'Please review pull request #42',
  actionable: true,
}
```

### discovery
Share information about capabilities and findings.

```typescript
{
  type: 'discovery',
  title: 'Found cache issues',
  content: 'Identified stale cache files in /tmp',
}
```

### completion
Report task or work completion.

```typescript
{
  type: 'completion',
  title: 'Task completed',
  content: 'Implemented feature X with 100% test coverage',
  actionable: false,
}
```

### error
Report errors and issues.

```typescript
{
  type: 'error',
  title: 'Build failed',
  content: 'TypeScript compilation error in src/index.ts:42',
  priority: 'high',
}
```

### learning
Share insights and lessons learned.

```typescript
{
  type: 'learning',
  title: 'Performance optimization',
  content: 'Using memoization improved function speed 10x',
}
```

### question
Ask questions to other agents.

```typescript
{
  type: 'question',
  title: 'How to handle edge case?',
  content: 'What is the best way to handle null values in this context?',
  actionable: true,
}
```

## Configuration

### Redis

```typescript
const bus = new EventBus({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: 0,
  },
  ttl: 86400, // 24 hours
});
```

### In-Memory (Development)

```typescript
const bus = new InMemoryEventBus({
  maxMessages: 1000,
  ttl: 3600, // 1 hour
});
```

## Integration with MCP

This package integrates with @a3t/rapid-mcp for agent access:

```typescript
// In rapid-mcp server
import { registerEventBusTools } from '@a3t/rapid-mcp';

server.addTool(registerEventBusTools({
  getEventBus: async (projectId) => {
    return new EventBus({ /* config */ });
  },
}));
```

## See Also

- [@a3t/rapid](https://www.npmjs.com/package/@a3t/rapid) - Main CLI
- [@a3t/rapid-mcp](https://www.npmjs.com/package/@a3t/rapid-mcp) - MCP Server
- [Redis](https://redis.io) - Backing store
- [RAPID Documentation](https://getrapid.dev)

## License

MIT © 2026 Rude Company LLC
