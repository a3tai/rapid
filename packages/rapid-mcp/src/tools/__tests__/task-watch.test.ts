import { describe, it, expect, beforeEach } from 'vitest';
import { registerTaskWatchTools } from '../task-watch.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('Task Watch Tools', () => {
  let mockServer: McpServer;
  let registeredTools: Map<string, { handler: any; config: any }> = new Map();

  beforeEach(() => {
    registeredTools.clear();
    mockServer = {
      registerTool: (name: string, config: any, handler: any) => {
        registeredTools.set(name, { handler, config });
      },
    } as any;
  });

  it('should register task_watch tool', () => {
    registerTaskWatchTools(mockServer, {
      config: { name: 'test', version: '1.0.0', projectDir: '/test' },
      projectDir: '/test',
      verbose: false,
    });

    expect(registeredTools.has('task_watch')).toBe(true);
  });

  it('should register task_get_details tool', () => {
    registerTaskWatchTools(mockServer, {
      config: { name: 'test', version: '1.0.0', projectDir: '/test' },
      projectDir: '/test',
      verbose: false,
    });

    expect(registeredTools.has('task_get_details')).toBe(true);
  });

  it('should handle task_watch with no tasks', async () => {
    registerTaskWatchTools(mockServer, {
      config: { name: 'test', version: '1.0.0', projectDir: '/test' },
      projectDir: '/test',
      verbose: false,
    });

    const handler = registeredTools.get('task_watch')!.handler;
    const result = await handler({
      capabilities: ['python', 'testing'],
      maxResults: 10,
    });

    expect(result.structuredContent.tasks).toEqual([]);
    expect(result.structuredContent.count).toBe(0);
    expect(result.structuredContent.nextCheck).toBeDefined();
  });

  it('should return empty array for task_get_details with invalid task ID', async () => {
    registerTaskWatchTools(mockServer, {
      config: { name: 'test', version: '1.0.0', projectDir: '/test' },
      projectDir: '/test',
      verbose: false,
    });

    const handler = registeredTools.get('task_get_details')!.handler;
    const result = await handler({
      taskId: 'non-existent-id',
    });

    expect(result.structuredContent.found).toBe(false);
    expect(result.structuredContent.task).toBeUndefined();
  });

  it('should have task_watch input schema', () => {
    registerTaskWatchTools(mockServer, {
      config: { name: 'test', version: '1.0.0', projectDir: '/test' },
      projectDir: '/test',
      verbose: false,
    });

    const toolConfig = registeredTools.get('task_watch')!.config;
    expect(toolConfig.inputSchema).toBeDefined();
    expect(toolConfig.title).toBe('Watch for Task Auto-Discovery');
  });

  it('should have task_get_details input schema', () => {
    registerTaskWatchTools(mockServer, {
      config: { name: 'test', version: '1.0.0', projectDir: '/test' },
      projectDir: '/test',
      verbose: false,
    });

    const toolConfig = registeredTools.get('task_get_details')!.config;
    expect(toolConfig.inputSchema).toBeDefined();
    expect(toolConfig.title).toBe('Get Task Details');
  });
});
