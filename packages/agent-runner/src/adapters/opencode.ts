/**
 * OpenCode CLI Adapter
 *
 * Parses OpenCode CLI output. OpenCode uses a similar event stream format.
 */

import type { AgentConfig, CliAdapter, StreamEvent } from '../types.js';

interface OpenCodeEvent {
  event: string;
  data?: {
    content?: string;
    thinking?: string;
    tool?: {
      name: string;
      id: string;
      input?: Record<string, unknown>;
    };
    result?: {
      content: string;
      error?: boolean;
    };
    usage?: {
      input: number;
      output: number;
    };
    error?: string;
  };
}

export class OpenCodeAdapter implements CliAdapter {
  name = 'opencode' as const;
  isStreamFormat = true;

  async isAvailable(): Promise<boolean> {
    const { execSync } = await import('child_process');
    try {
      execSync('which opencode', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  buildArgs(config: AgentConfig): string[] {
    const args: string[] = [];

    // Model selection
    if (config.model) {
      args.push('--model', this.getModelName(config.model));
    }

    // Output as event stream
    args.push('--output', 'events');

    // Non-interactive mode
    args.push('--non-interactive');

    // Auto-approve for permissions
    if (config.dangerouslySkipPermissions) {
      args.push('--auto-approve');
    }

    // Task as positional argument
    args.push(config.task);

    // Additional args
    if (config.additionalArgs) {
      args.push(...config.additionalArgs);
    }

    return args;
  }

  private getModelName(tier: string): string {
    switch (tier) {
      case 'opus':
        return 'anthropic/claude-3-opus';
      case 'sonnet':
        return 'anthropic/claude-3.5-sonnet';
      case 'haiku':
        return 'anthropic/claude-3-haiku';
      default:
        return 'anthropic/claude-3.5-sonnet';
    }
  }

  parseLine(line: string): StreamEvent | null {
    if (!line.trim()) return null;

    // OpenCode uses SSE format: "event: <type>\ndata: <json>"
    // But when piped, it's often just JSON per line
    try {
      // Handle SSE format
      if (line.startsWith('event:') || line.startsWith('data:')) {
        return null; // Skip SSE framing, wait for data line
      }

      const raw = JSON.parse(line) as OpenCodeEvent;
      return this.parseOpenCodeEvent(raw);
    } catch {
      // Non-JSON line
      return {
        source: 'opencode',
        type: 'text',
        content: line,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private parseOpenCodeEvent(raw: OpenCodeEvent): StreamEvent | null {
    const timestamp = new Date().toISOString();

    switch (raw.event) {
      case 'start':
      case 'init':
        return {
          source: 'opencode',
          type: 'init',
          timestamp,
          raw,
        };

      case 'thinking':
        return {
          source: 'opencode',
          type: 'thinking',
          content: raw.data?.thinking || raw.data?.content,
          timestamp,
          raw,
        };

      case 'text':
      case 'content':
      case 'assistant':
        return {
          source: 'opencode',
          type: 'text',
          content: raw.data?.content,
          timestamp,
          raw,
        };

      case 'tool_call':
      case 'tool_use':
        return {
          source: 'opencode',
          type: 'tool_use',
          toolName: raw.data?.tool?.name,
          toolUseId: raw.data?.tool?.id,
          toolInput: raw.data?.tool?.input,
          timestamp,
          raw,
        };

      case 'tool_result':
        return {
          source: 'opencode',
          type: 'tool_result',
          content: raw.data?.result?.content,
          isError: raw.data?.result?.error,
          timestamp,
          raw,
        };

      case 'done':
      case 'complete':
      case 'end':
        return {
          source: 'opencode',
          type: 'complete',
          usage: raw.data?.usage
            ? {
                inputTokens: raw.data.usage.input,
                outputTokens: raw.data.usage.output,
              }
            : undefined,
          timestamp,
          raw,
        };

      case 'error':
        return {
          source: 'opencode',
          type: 'error',
          content: raw.data?.error || 'Unknown error',
          isError: true,
          timestamp,
          raw,
        };

      default:
        return {
          source: 'opencode',
          type: 'text',
          content: JSON.stringify(raw),
          timestamp,
          raw,
        };
    }
  }
}
