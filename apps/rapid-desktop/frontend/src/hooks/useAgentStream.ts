/**
 * useAgentStream - Hook for streaming and parsing agent output
 *
 * Parses NDJSON stream events from AI coding CLIs (Claude, Gemini, etc.)
 * into structured events for display.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import * as AppService from '@bindings/rapid-desktop/appservice';

/**
 * Event types from AI coding CLIs
 */
export type StreamEventType =
  | 'init'
  | 'thinking'
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'diff'
  | 'commit'
  | 'complete'
  | 'error';

/**
 * Unified stream event from any supported CLI tool
 */
export interface StreamEvent {
  id: string;
  source: 'claude' | 'gemini' | 'opencode' | 'aider' | 'unknown';
  type: StreamEventType;
  content?: string;
  timestamp: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;
  isError?: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  raw?: unknown;
}

/**
 * Aggregated thinking block
 */
export interface ThinkingBlock {
  id: string;
  content: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  isComplete: boolean;
}

/**
 * Aggregated tool invocation
 */
export interface ToolInvocation {
  id: string;
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  startTime: string;
  endTime?: string;
  result?: string;
  isError?: boolean;
  isComplete: boolean;
}

/**
 * Hook state
 */
export interface AgentStreamState {
  events: StreamEvent[];
  thinkingBlocks: ThinkingBlock[];
  toolInvocations: ToolInvocation[];
  textContent: string;
  isStreaming: boolean;
  currentThinking: ThinkingBlock | null;
  currentTool: ToolInvocation | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  error: string | null;
}

/**
 * Parse a raw log line into a stream event
 */
function parseLogLine(line: string, index: number): StreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const timestamp = new Date().toISOString();
  const id = `evt-${index}-${Date.now()}`;

  // Try to parse as JSON (NDJSON format)
  try {
    const raw = JSON.parse(trimmed);
    return parseClaudeEvent(raw, id, timestamp);
  } catch {
    // Not JSON - treat as plain text
    return {
      id,
      source: 'unknown',
      type: 'text',
      content: trimmed,
      timestamp,
    };
  }
}

/**
 * Parse Claude stream-json event
 */
function parseClaudeEvent(raw: Record<string, unknown>, id: string, timestamp: string): StreamEvent | null {
  const type = raw.type as string;

  switch (type) {
    case 'message_start': {
      const message = raw.message as { id?: string; usage?: { input_tokens?: number; output_tokens?: number } } | undefined;
      return {
        id,
        source: 'claude',
        type: 'init',
        timestamp,
        usage: message?.usage ? {
          inputTokens: message.usage.input_tokens || 0,
          outputTokens: message.usage.output_tokens || 0,
        } : undefined,
        raw,
      };
    }

    case 'content_block_start': {
      const block = raw.content_block as { type?: string; text?: string; thinking?: string; name?: string; id?: string } | undefined;
      if (block?.type === 'thinking') {
        return {
          id,
          source: 'claude',
          type: 'thinking',
          content: block.thinking || '',
          timestamp,
          raw,
        };
      } else if (block?.type === 'text') {
        return {
          id,
          source: 'claude',
          type: 'text',
          content: block.text || '',
          timestamp,
          raw,
        };
      } else if (block?.type === 'tool_use') {
        return {
          id,
          source: 'claude',
          type: 'tool_use',
          toolName: block.name,
          toolUseId: block.id,
          timestamp,
          raw,
        };
      }
      return null;
    }

    case 'content_block_delta': {
      const delta = raw.delta as { type?: string; text?: string; thinking?: string } | undefined;
      if (delta?.type === 'thinking_delta') {
        return {
          id,
          source: 'claude',
          type: 'thinking',
          content: delta.thinking || '',
          timestamp,
          raw,
        };
      } else if (delta?.type === 'text_delta') {
        return {
          id,
          source: 'claude',
          type: 'text',
          content: delta.text || '',
          timestamp,
          raw,
        };
      }
      return null;
    }

    case 'content_block_stop':
      // Block ended - signal completion
      return {
        id,
        source: 'claude',
        type: 'complete',
        timestamp,
        raw,
      };

    case 'message_delta': {
      const delta = raw.delta as { stop_reason?: string } | undefined;
      const usage = raw.usage as { input_tokens?: number; output_tokens?: number } | undefined;
      return {
        id,
        source: 'claude',
        type: 'complete',
        content: delta?.stop_reason || 'end_turn',
        usage: usage ? {
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
        } : undefined,
        timestamp,
        raw,
      };
    }

    case 'message_stop':
      return {
        id,
        source: 'claude',
        type: 'complete',
        timestamp,
        raw,
      };

    case 'error': {
      const error = raw.error as { message?: string } | undefined;
      return {
        id,
        source: 'claude',
        type: 'error',
        content: error?.message || 'Unknown error',
        isError: true,
        timestamp,
        raw,
      };
    }

    default:
      // Unknown event type - pass through
      return {
        id,
        source: 'claude',
        type: 'text',
        content: JSON.stringify(raw),
        timestamp,
        raw,
      };
  }
}

/**
 * Hook to stream and parse agent output
 */
export function useAgentStream(
  agentName: string | null,
  enabled: boolean = true,
  maxEvents: number = 1000
) {
  const [state, setState] = useState<AgentStreamState>({
    events: [],
    thinkingBlocks: [],
    toolInvocations: [],
    textContent: '',
    isStreaming: false,
    currentThinking: null,
    currentTool: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    error: null,
  });

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastLogCountRef = useRef(0);
  const eventIndexRef = useRef(0);

  const clearStream = useCallback(() => {
    setState({
      events: [],
      thinkingBlocks: [],
      toolInvocations: [],
      textContent: '',
      isStreaming: false,
      currentThinking: null,
      currentTool: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      error: null,
    });
    lastLogCountRef.current = 0;
    eventIndexRef.current = 0;
  }, []);

  const processEvent = useCallback((event: StreamEvent) => {
    setState(prev => {
      const newState = { ...prev };
      newState.events = [...prev.events, event].slice(-maxEvents);

      switch (event.type) {
        case 'init':
          newState.isStreaming = true;
          if (event.usage) {
            newState.usage = {
              inputTokens: newState.usage.inputTokens + event.usage.inputTokens,
              outputTokens: newState.usage.outputTokens + event.usage.outputTokens,
            };
          }
          break;

        case 'thinking': {
          const content = event.content || '';
          if (!prev.currentThinking) {
            // Start new thinking block
            const block: ThinkingBlock = {
              id: `think-${Date.now()}`,
              content,
              startTime: event.timestamp,
              isComplete: false,
            };
            newState.currentThinking = block;
            newState.thinkingBlocks = [...prev.thinkingBlocks, block];
          } else {
            // Append to current thinking block
            const updated = {
              ...prev.currentThinking,
              content: prev.currentThinking.content + content,
            };
            newState.currentThinking = updated;
            newState.thinkingBlocks = prev.thinkingBlocks.map(b =>
              b.id === updated.id ? updated : b
            );
          }
          break;
        }

        case 'text': {
          newState.textContent = prev.textContent + (event.content || '');
          // End current thinking block when text starts
          if (prev.currentThinking) {
            const completed: ThinkingBlock = {
              ...prev.currentThinking,
              endTime: event.timestamp,
              duration: new Date(event.timestamp).getTime() -
                new Date(prev.currentThinking.startTime).getTime(),
              isComplete: true,
            };
            newState.currentThinking = null;
            newState.thinkingBlocks = prev.thinkingBlocks.map(b =>
              b.id === completed.id ? completed : b
            );
          }
          break;
        }

        case 'tool_use': {
          // End current thinking block
          if (prev.currentThinking) {
            const completed: ThinkingBlock = {
              ...prev.currentThinking,
              endTime: event.timestamp,
              duration: new Date(event.timestamp).getTime() -
                new Date(prev.currentThinking.startTime).getTime(),
              isComplete: true,
            };
            newState.currentThinking = null;
            newState.thinkingBlocks = prev.thinkingBlocks.map(b =>
              b.id === completed.id ? completed : b
            );
          }

          // Create tool invocation
          const tool: ToolInvocation = {
            id: `tool-${Date.now()}`,
            toolUseId: event.toolUseId || '',
            name: event.toolName || 'unknown',
            input: event.toolInput || {},
            startTime: event.timestamp,
            isComplete: false,
          };
          newState.currentTool = tool;
          newState.toolInvocations = [...prev.toolInvocations, tool];
          break;
        }

        case 'tool_result': {
          if (prev.currentTool) {
            const completed: ToolInvocation = {
              ...prev.currentTool,
              endTime: event.timestamp,
              result: event.content,
              isError: event.isError,
              isComplete: true,
            };
            newState.currentTool = null;
            newState.toolInvocations = prev.toolInvocations.map(t =>
              t.id === completed.id ? completed : t
            );
          }
          break;
        }

        case 'complete': {
          // Complete any pending blocks
          if (prev.currentThinking) {
            const completed: ThinkingBlock = {
              ...prev.currentThinking,
              endTime: event.timestamp,
              duration: new Date(event.timestamp).getTime() -
                new Date(prev.currentThinking.startTime).getTime(),
              isComplete: true,
            };
            newState.currentThinking = null;
            newState.thinkingBlocks = prev.thinkingBlocks.map(b =>
              b.id === completed.id ? completed : b
            );
          }
          if (prev.currentTool) {
            const completed: ToolInvocation = {
              ...prev.currentTool,
              endTime: event.timestamp,
              isComplete: true,
            };
            newState.currentTool = null;
            newState.toolInvocations = prev.toolInvocations.map(t =>
              t.id === completed.id ? completed : t
            );
          }
          if (event.usage) {
            newState.usage = {
              inputTokens: newState.usage.inputTokens + event.usage.inputTokens,
              outputTokens: newState.usage.outputTokens + event.usage.outputTokens,
            };
          }
          newState.isStreaming = false;
          break;
        }

        case 'error': {
          newState.error = event.content || 'Unknown error';
          newState.isStreaming = false;
          break;
        }
      }

      return newState;
    });
  }, [maxEvents]);

  const fetchLogs = useCallback(async () => {
    if (!agentName) return;

    try {
      const entries = await AppService.GetAgentLogs(agentName, 500);

      if (entries && entries.length > lastLogCountRef.current) {
        const newEntries = entries.slice(lastLogCountRef.current);
        lastLogCountRef.current = entries.length;

        for (const entry of newEntries) {
          const line = (entry as { message?: string; content?: string; line?: string }).message ||
            (entry as { content?: string }).content ||
            (entry as { line?: string }).line || '';
          const event = parseLogLine(line, eventIndexRef.current++);
          if (event) {
            processEvent(event);
          }
        }
      }
    } catch (err) {
      console.error(`[useAgentStream] Error fetching logs:`, err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to fetch logs',
      }));
    }
  }, [agentName, processEvent]);

  useEffect(() => {
    if (!enabled || !agentName) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchLogs();

    // Poll every 500ms for faster updates
    pollingRef.current = setInterval(fetchLogs, 500);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [agentName, enabled, fetchLogs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // Compute derived state
  const isThinking = useMemo(() => state.currentThinking !== null, [state.currentThinking]);
  const isExecutingTool = useMemo(() => state.currentTool !== null, [state.currentTool]);

  return {
    ...state,
    isThinking,
    isExecutingTool,
    clearStream,
  };
}
