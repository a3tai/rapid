/**
 * Gemini CLI Adapter
 *
 * Parses Gemini CLI stream-json output format.
 * Note: Gemini CLI uses a similar format to Claude's stream-json.
 */

import type { AgentConfig, CliAdapter, StreamEvent } from '../types.js';

interface GeminiStreamEvent {
  type: string;
  subtype?: string;
  content?: string;
  thinking?: string;
  tool_use?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  tool_result?: {
    id: string;
    content: string;
    is_error?: boolean;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: string;
}

export class GeminiAdapter implements CliAdapter {
  name = 'gemini' as const;
  isStreamFormat = true;

  async isAvailable(): Promise<boolean> {
    const { execSync } = await import('child_process');
    try {
      execSync('which gemini', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  buildArgs(config: AgentConfig): string[] {
    const args: string[] = [];

    // Model selection - Gemini uses different model names
    if (config.model) {
      args.push('--model', this.getModelName(config.model));
    }

    // Output format for streaming
    args.push('--output-format', 'stream-json');

    // Sandbox mode for permissions
    if (config.dangerouslySkipPermissions) {
      args.push('--sandbox', 'false');
    }

    // Additional args
    if (config.additionalArgs) {
      args.push(...config.additionalArgs);
    }

    return args;
  }

  private getModelName(tier: string): string {
    switch (tier) {
      case 'opus':
        return 'gemini-2.0-flash-thinking-exp';
      case 'sonnet':
        return 'gemini-2.0-flash';
      case 'haiku':
        return 'gemini-1.5-flash';
      default:
        return 'gemini-2.0-flash';
    }
  }

  parseLine(line: string): StreamEvent | null {
    if (!line.trim()) return null;

    try {
      const raw = JSON.parse(line) as GeminiStreamEvent;
      return this.parseGeminiEvent(raw);
    } catch {
      // Non-JSON line
      return {
        source: 'gemini',
        type: 'text',
        content: line,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private parseGeminiEvent(raw: GeminiStreamEvent): StreamEvent | null {
    const timestamp = new Date().toISOString();

    switch (raw.type) {
      case 'start':
        return {
          source: 'gemini',
          type: 'init',
          timestamp,
          raw,
        };

      case 'thinking':
        return {
          source: 'gemini',
          type: 'thinking',
          content: raw.thinking || raw.content,
          timestamp,
          raw,
        };

      case 'text':
      case 'content':
        return {
          source: 'gemini',
          type: 'text',
          content: raw.content,
          timestamp,
          raw,
        };

      case 'tool_use':
        return {
          source: 'gemini',
          type: 'tool_use',
          toolName: raw.tool_use?.name,
          toolUseId: raw.tool_use?.id,
          toolInput: raw.tool_use?.input,
          timestamp,
          raw,
        };

      case 'tool_result':
        return {
          source: 'gemini',
          type: 'tool_result',
          content: raw.tool_result?.content,
          toolUseId: raw.tool_result?.id,
          isError: raw.tool_result?.is_error,
          timestamp,
          raw,
        };

      case 'complete':
      case 'end':
        return {
          source: 'gemini',
          type: 'complete',
          usage: raw.usage
            ? {
                inputTokens: raw.usage.input_tokens,
                outputTokens: raw.usage.output_tokens,
              }
            : undefined,
          timestamp,
          raw,
        };

      case 'error':
        return {
          source: 'gemini',
          type: 'error',
          content: raw.error || 'Unknown error',
          isError: true,
          timestamp,
          raw,
        };

      default:
        return {
          source: 'gemini',
          type: 'text',
          content: JSON.stringify(raw),
          timestamp,
          raw,
        };
    }
  }
}
