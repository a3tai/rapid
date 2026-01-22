/**
 * FormattedLogView - Display agent logs in a formatted, structured way
 */

import { useMemo, memo } from 'react';
import { clsx } from 'clsx';
import { ThinkingBlock, ToolCallBlock, ToolResultBlock } from './ThinkingBlock';

export interface LogLine {
  line: string;
  timestamp?: string;
}

interface ParsedItem {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'text';
  content: string;
  metadata?: {
    toolName?: string;
    toolParams?: Record<string, unknown>;
    isError?: boolean;
  };
}

function parseLogLines(logs: LogLine[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  let itemId = 0;
  let textBuffer: string[] = [];
  let inThinking = false;
  let thinkingBuffer: string[] = [];
  let inToolCall = false;
  let toolBuffer: string[] = [];
  let inToolResult = false;
  let resultBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length > 0) {
      const text = textBuffer.join('\n').trim();
      if (text) {
        items.push({ id: `item-${itemId++}`, type: 'text', content: text });
      }
      textBuffer = [];
    }
  };

  for (const log of logs) {
    const line = log.line;
    const trimmed = line.trim();

    // Detect thinking blocks
    if (trimmed.includes('thinking') && trimmed.includes('antml')) {
      flushText();
      inThinking = true;
      thinkingBuffer = [];
      continue;
    }
    if (inThinking && trimmed.includes('/antml:thinking')) {
      items.push({
        id: `item-${itemId++}`,
        type: 'thinking',
        content: thinkingBuffer.join('\n'),
      });
      inThinking = false;
      continue;
    }
    if (inThinking) {
      thinkingBuffer.push(line);
      continue;
    }

    // Detect tool calls
    if (trimmed.includes('function_calls') && !trimmed.includes('/')) {
      flushText();
      inToolCall = true;
      toolBuffer = [];
      continue;
    }
    if (inToolCall && trimmed.includes('/function_calls')) {
      const content = toolBuffer.join('\n');
      const nameMatch = content.match(/name="([^"]+)"/);
      items.push({
        id: `item-${itemId++}`,
        type: 'tool_call',
        content,
        metadata: { toolName: nameMatch?.[1] || 'unknown', toolParams: {} },
      });
      inToolCall = false;
      continue;
    }
    if (inToolCall) {
      toolBuffer.push(line);
      continue;
    }

    // Detect tool results
    if (trimmed.includes('function_results') && !trimmed.includes('/')) {
      flushText();
      inToolResult = true;
      resultBuffer = [];
      continue;
    }
    if (inToolResult && trimmed.includes('/function_results')) {
      items.push({
        id: `item-${itemId++}`,
        type: 'tool_result',
        content: resultBuffer.join('\n'),
        metadata: { isError: resultBuffer.some(l => l.includes('error')) },
      });
      inToolResult = false;
      continue;
    }
    if (inToolResult) {
      resultBuffer.push(line);
      continue;
    }

    // Regular text
    textBuffer.push(line);
  }

  flushText();
  return items;
}

interface FormattedLogViewProps {
  logs: LogLine[];
  className?: string;
}

export const FormattedLogView = memo(function FormattedLogView({
  logs,
  className,
}: FormattedLogViewProps) {
  const parsedItems = useMemo(() => parseLogLines(logs), [logs]);

  if (parsedItems.length === 0) {
    return (
      <div className={clsx('text-muted-foreground text-sm', className)}>
        No output yet...
      </div>
    );
  }

  return (
    <div className={clsx('space-y-2', className)}>
      {parsedItems.map((item) => {
        switch (item.type) {
          case 'thinking':
            return (
              <ThinkingBlock
                key={item.id}
                content={item.content}
                isStreaming={false}
              />
            );
          case 'tool_call':
            return (
              <ToolCallBlock
                key={item.id}
                name={item.metadata?.toolName || 'unknown'}
                input={item.metadata?.toolParams || {}}
              />
            );
          case 'tool_result':
            return (
              <ToolResultBlock
                key={item.id}
                content={item.content}
                isError={item.metadata?.isError}
              />
            );
          case 'text':
            return (
              <div
                key={item.id}
                className="font-mono text-sm whitespace-pre-wrap"
              >
                {item.content}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
});

export default FormattedLogView;
