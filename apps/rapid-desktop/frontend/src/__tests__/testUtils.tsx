/**
 * Create mock data for testing
 */
export const mockData = {
  agent: {
    id: 'test-agent-1',
    name: 'test-worker',
    worktree: 'main',
    session: 'test-session',
  },
  task: {
    id: 'task-1',
    title: 'Test Task',
    status: 'pending' as const,
    priority: 'normal' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['test'],
  },
  message: {
    id: 'msg-1',
    type: 'discovery' as const,
    fromAgent: {
      id: 'agent-1',
      name: 'worker',
    },
    timestamp: new Date().toISOString(),
    payload: {
      title: 'Test Message',
      content: 'Test content',
    },
  },
  daemonStatus: {
    running: true,
    socketPath: '/tmp/rapid.sock',
    version: '0.1.0',
    uptime: 3600,
    sessions: 2,
  },
  config: {
    project: {
      name: 'test-project',
      root: '/home/test/projects/test',
      description: 'Test project',
    },
    sandbox: {
      preset: 'balanced' as const,
    },
    personas: {
      claude: {
        systemPrompt: 'You are a helpful assistant',
        capabilities: ['code', 'analysis'],
      },
    },
    mcp: {
      enabled: true,
      servers: {
        example: {
          command: 'example-server',
          args: ['--verbose'],
        },
      },
    },
  },
}

/**
 * Wait for async operations in tests
 */
export async function waitForAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
