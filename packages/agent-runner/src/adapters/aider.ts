/**
 * Aider CLI Adapter
 *
 * Parses Aider CLI output. Aider doesn't have a native stream-json format,
 * so we parse its structured markdown output.
 */

import type { AgentConfig, CliAdapter, StreamEvent } from '../types.js';

export class AiderAdapter implements CliAdapter {
  name = 'aider' as const;
  isStreamFormat = false;

  private inThinking = false;
  private inDiff = false;

  async isAvailable(): Promise<boolean> {
    const { execSync } = await import('child_process');
    try {
      execSync('which aider', { stdio: 'ignore' });
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

    // Enable streaming
    args.push('--stream');

    // Auto-commit
    args.push('--auto-commits');

    // Yes to prompts for non-interactive mode
    args.push('--yes');

    // No check for updates
    args.push('--no-check-update');

    // Message/prompt
    args.push('--message', config.task);

    // Additional args
    if (config.additionalArgs) {
      args.push(...config.additionalArgs);
    }

    return args;
  }

  private getModelName(tier: string): string {
    switch (tier) {
      case 'opus':
        return 'claude-3-opus-20240229';
      case 'sonnet':
        return 'claude-3-5-sonnet-20241022';
      case 'haiku':
        return 'claude-3-haiku-20240307';
      default:
        return 'claude-3-5-sonnet-20241022';
    }
  }

  parseLine(line: string): StreamEvent | null {
    if (!line.trim()) return null;

    const timestamp = new Date().toISOString();

    // Detect thinking blocks (Aider shows these with specific prefixes)
    if (line.includes('Thinking...') || line.startsWith('> ')) {
      this.inThinking = true;
      return {
        source: 'aider',
        type: 'thinking',
        content: line.replace(/^> /, ''),
        timestamp,
      };
    }

    // Detect diff blocks
    if (line.startsWith('```diff') || line.startsWith('<<<<<<')) {
      this.inDiff = true;
      return {
        source: 'aider',
        type: 'diff',
        content: line,
        timestamp,
      };
    }

    if (this.inDiff) {
      if (line.startsWith('```') || line.startsWith('>>>>>>')) {
        this.inDiff = false;
      }
      return {
        source: 'aider',
        type: 'diff',
        content: line,
        timestamp,
      };
    }

    // Detect commit messages
    if (line.includes('Commit ') && line.includes(' ')) {
      const match = line.match(/Commit ([a-f0-9]+)/);
      return {
        source: 'aider',
        type: 'commit',
        content: match?.[1] || line,
        timestamp,
      };
    }

    // Detect tool use (file edits)
    if (line.includes('Editing ') || line.includes('Creating ')) {
      return {
        source: 'aider',
        type: 'tool_use',
        toolName: 'file_edit',
        content: line,
        timestamp,
      };
    }

    // Detect errors
    if (line.toLowerCase().includes('error') || line.startsWith('!')) {
      return {
        source: 'aider',
        type: 'error',
        content: line,
        isError: true,
        timestamp,
      };
    }

    // Detect completion
    if (line.includes('Tokens:') || line.includes('Cost:')) {
      // Parse token usage if possible
      const tokensMatch = line.match(/(\d+)\s*sent,\s*(\d+)\s*received/);
      return {
        source: 'aider',
        type: 'complete',
        content: line,
        usage: tokensMatch
          ? {
              inputTokens: parseInt(tokensMatch[1], 10),
              outputTokens: parseInt(tokensMatch[2], 10),
            }
          : undefined,
        timestamp,
      };
    }

    // Default: regular text
    if (this.inThinking) {
      // Check if thinking ended
      if (line.trim() === '' || !line.startsWith('>')) {
        this.inThinking = false;
      }
      return {
        source: 'aider',
        type: 'thinking',
        content: line,
        timestamp,
      };
    }

    return {
      source: 'aider',
      type: 'text',
      content: line,
      timestamp,
    };
  }

  reset(): void {
    this.inThinking = false;
    this.inDiff = false;
  }
}
