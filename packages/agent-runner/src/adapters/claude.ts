/**
 * Claude CLI Adapter
 *
 * Parses Claude Code CLI stream-json output format.
 */

import type { AgentConfig, CliAdapter, StreamEvent, ClaudeStreamEvent } from '../types.js';

export class ClaudeAdapter implements CliAdapter {
  name = 'claude' as const;
  isStreamFormat = true;

  private currentThinkingContent = '';
  private currentTextContent = '';
  private currentToolId: string | null = null;
  private currentToolName: string | null = null;
  private currentToolInput = '';

  async isAvailable(): Promise<boolean> {
    const { execSync } = await import('child_process');
    try {
      execSync('which claude', { stdio: 'ignore' });
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

    // Output format for streaming
    args.push('--output-format', 'stream-json');
    args.push('--verbose');

    // Permission settings
    if (config.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    // MCP server
    if (config.mcpUrl) {
      args.push('--mcp-server', config.mcpUrl);
    }

    // Prompt mode - read from stdin
    args.push('-p', '-');

    // Additional args
    if (config.additionalArgs) {
      args.push(...config.additionalArgs);
    }

    return args;
  }

  private getModelName(tier: string): string {
    switch (tier) {
      case 'opus':
        return 'claude-opus-4-5-20251101';
      case 'sonnet':
        return 'claude-sonnet-4-20250514';
      case 'haiku':
        return 'claude-haiku-3-5-20241022';
      default:
        return 'claude-sonnet-4-20250514';
    }
  }

  parseLine(line: string): StreamEvent | null {
    if (!line.trim()) return null;

    try {
      const raw = JSON.parse(line) as ClaudeStreamEvent;
      return this.parseClaudeEvent(raw);
    } catch {
      // Non-JSON line - could be stderr or other output
      return {
        source: 'claude',
        type: 'text',
        content: line,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private parseClaudeEvent(raw: ClaudeStreamEvent): StreamEvent | null {
    const timestamp = new Date().toISOString();

    switch (raw.type) {
      case 'message_start':
        return {
          source: 'claude',
          type: 'init',
          timestamp,
          eventId: raw.message?.id,
          usage: raw.message?.usage
            ? {
                inputTokens: raw.message.usage.input_tokens,
                outputTokens: raw.message.usage.output_tokens,
                cacheCreationInputTokens: raw.message.usage.cache_creation_input_tokens,
                cacheReadInputTokens: raw.message.usage.cache_read_input_tokens,
              }
            : undefined,
          raw,
        };

      case 'content_block_start':
        if (raw.content_block?.type === 'thinking') {
          this.currentThinkingContent = raw.content_block.thinking || '';
          return {
            source: 'claude',
            type: 'thinking',
            content: this.currentThinkingContent,
            timestamp,
            raw,
          };
        } else if (raw.content_block?.type === 'text') {
          this.currentTextContent = raw.content_block.text || '';
          return {
            source: 'claude',
            type: 'text',
            content: this.currentTextContent,
            timestamp,
            raw,
          };
        } else if (raw.content_block?.type === 'tool_use') {
          this.currentToolId = raw.content_block.id || null;
          this.currentToolName = raw.content_block.name || null;
          this.currentToolInput = '';
          return {
            source: 'claude',
            type: 'tool_use',
            toolName: this.currentToolName || undefined,
            toolUseId: this.currentToolId || undefined,
            toolInput: raw.content_block.input,
            timestamp,
            raw,
          };
        }
        return null;

      case 'content_block_delta':
        if (raw.delta?.type === 'thinking_delta') {
          this.currentThinkingContent += raw.delta.thinking || '';
          return {
            source: 'claude',
            type: 'thinking',
            content: raw.delta.thinking || '',
            timestamp,
            raw,
          };
        } else if (raw.delta?.type === 'text_delta') {
          this.currentTextContent += raw.delta.text || '';
          return {
            source: 'claude',
            type: 'text',
            content: raw.delta.text || '',
            timestamp,
            raw,
          };
        } else if (raw.delta?.type === 'input_json_delta') {
          this.currentToolInput += raw.delta.partial_json || '';
          return null; // Accumulate, emit on block_stop
        }
        return null;

      case 'content_block_stop':
        // Emit completed tool input if we were building one
        if (this.currentToolId && this.currentToolInput) {
          try {
            const input = JSON.parse(this.currentToolInput);
            const event: StreamEvent = {
              source: 'claude',
              type: 'tool_use',
              toolName: this.currentToolName || undefined,
              toolUseId: this.currentToolId,
              toolInput: input,
              timestamp,
              raw,
            };
            this.currentToolId = null;
            this.currentToolName = null;
            this.currentToolInput = '';
            return event;
          } catch {
            // Incomplete JSON
          }
        }
        return null;

      case 'message_delta':
        if (raw.delta && 'stop_reason' in raw.delta) {
          return {
            source: 'claude',
            type: 'complete',
            content: (raw.delta as { stop_reason?: string }).stop_reason || 'end_turn',
            timestamp,
            raw,
          };
        }
        return null;

      case 'message_stop':
        return {
          source: 'claude',
          type: 'complete',
          timestamp,
          raw,
        };

      case 'error':
        return {
          source: 'claude',
          type: 'error',
          content: raw.error?.message || 'Unknown error',
          isError: true,
          timestamp,
          raw,
        };

      default:
        // Unknown event type - pass through as text
        return {
          source: 'claude',
          type: 'text',
          content: JSON.stringify(raw),
          timestamp,
          raw,
        };
    }
  }

  /**
   * Reset internal state between conversations
   */
  reset(): void {
    this.currentThinkingContent = '';
    this.currentTextContent = '';
    this.currentToolId = null;
    this.currentToolName = null;
    this.currentToolInput = '';
  }
}
