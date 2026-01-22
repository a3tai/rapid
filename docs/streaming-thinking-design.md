# Claude Streaming Output Formats & Thinking Blocks Design Document

**Author:** Researcher Agent  
**Date:** 2026-01-22  
**Task ID:** a99193ce-bcc2-497f-a7c3-8cd71ec5da46

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Claude Code CLI Output Formats](#claude-code-cli-output-formats)
3. [Streaming Event Schema](#streaming-event-schema)
4. [Extended Thinking Events](#extended-thinking-events)
5. [Recommended Streaming Architecture](#recommended-streaming-architecture)
6. [UI Component Structure](#ui-component-structure)
7. [Example Code Snippets](#example-code-snippets)
8. [Best Practices](#best-practices)

---

## Executive Summary

This document provides a comprehensive design for capturing, parsing, and displaying Claude Code CLI output including extended thinking blocks. It covers the two main output formats (`--output-format json` and `--output-format stream-json`), documents the event structure for streaming responses, and provides UI component recommendations for visualizing thinking content.

### Key Findings

1. **`--output-format json`**: Returns complete response after execution; best for automation/scripting
2. **`--output-format stream-json`**: Real-time streaming via NDJSON; best for live UI updates
3. **Thinking events** use `thinking_delta` type within `content_block_delta` events
4. **SSE (Server-Sent Events)** is the recommended transport for web UIs
5. **Collapsible reasoning blocks** with duration indicators are the standard UI pattern

---

## Claude Code CLI Output Formats

### Format Comparison

| Feature | `--output-format json` | `--output-format stream-json` |
|---------|------------------------|-------------------------------|
| Output timing | After completion | Real-time streaming |
| Format | Single JSON object | NDJSON (newline-delimited) |
| Use case | Automation, scripts | Live UI, real-time display |
| Thinking blocks | Included in result | Streamed as deltas |
| Memory efficiency | Waits for full response | Processes incrementally |

### JSON Output Format

Complete response returned after execution:

```json
{
  "type": "result",
  "subtype": "success",
  "total_cost_usd": 0.0034,
  "is_error": false,
  "duration_ms": 2847,
  "duration_api_ms": 1923,
  "num_turns": 4,
  "result": "Response text here...",
  "session_id": "abc-123-def"
}
```

### Stream-JSON Output Format

Real-time NDJSON streaming with `--output-format stream-json`:

```bash
claude --output-format stream-json -p "your prompt"
```

Events are emitted one per line as they occur.

---

## Streaming Event Schema

### Event Types Overview

| Event Type | Description | When Emitted |
|------------|-------------|--------------|
| `message_start` | Beginning of assistant message | Start of response |
| `content_block_start` | Beginning of content block (text/thinking) | Before each block |
| `content_block_delta` | Incremental content update | During streaming |
| `content_block_stop` | End of content block | After block completes |
| `message_delta` | Message metadata update (usage stats) | Near end |
| `message_stop` | End of assistant message | Response complete |

### Message Start Event

```typescript
interface MessageStartEvent {
  type: "message_start";
  message: {
    id: string;          // e.g., "msg_012zEkenyT6heaYSDvDEDdXm"
    type: "message";
    role: "assistant";
    model: string;       // e.g., "claude-sonnet-4-5-20250929"
    content: [];         // Empty at start
    stop_reason: null;
    stop_sequence: null;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}
```

### Content Block Start Event

```typescript
interface ContentBlockStartEvent {
  type: "content_block_start";
  index: number;         // Position in content array
  content_block: {
    type: "text" | "thinking" | "tool_use";
    text?: string;       // Empty string for text blocks
    thinking?: string;   // For thinking blocks
  };
}
```

### Content Block Delta Event

```typescript
interface ContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;         // Correlates to content block
  delta: TextDelta | ThinkingDelta | InputJsonDelta;
}

interface TextDelta {
  type: "text_delta";
  text: string;          // Incremental text chunk
}

interface ThinkingDelta {
  type: "thinking_delta";
  thinking: string;      // Incremental thinking chunk
}

interface InputJsonDelta {
  type: "input_json_delta";
  partial_json: string;  // For tool use
}
```

### Content Block Stop Event

```typescript
interface ContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}
```

### Message Delta Event

```typescript
interface MessageDeltaEvent {
  type: "message_delta";
  delta: {
    stop_reason: "end_turn" | "tool_use" | "max_tokens" | null;
    stop_sequence: string | null;
  };
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
```

### Message Stop Event

```typescript
interface MessageStopEvent {
  type: "message_stop";
}
```

---

## Extended Thinking Events

### Thinking Block Structure

When extended thinking is enabled, Claude produces `thinking` content blocks:

```typescript
interface ThinkingContentBlock {
  type: "thinking";
  thinking: string;      // Full thinking content
  signature?: string;    // Required for multi-turn tool use
}

interface RedactedThinkingBlock {
  type: "redacted_thinking";
  data: string;          // Encrypted thinking content
}
```

### Streaming Thinking Events

During streaming, thinking content arrives via `thinking_delta` events:

```json
{
  "type": "content_block_start",
  "index": 0,
  "content_block": { "type": "thinking", "thinking": "" }
}

{
  "type": "content_block_delta",
  "index": 0,
  "delta": { "type": "thinking_delta", "thinking": "Let me analyze" }
}

{
  "type": "content_block_delta",
  "index": 0,
  "delta": { "type": "thinking_delta", "thinking": " this problem..." }
}

{
  "type": "content_block_stop",
  "index": 0
}
```

### Thinking Complete Event (for tool use)

When using tools with extended thinking, capture the signature:

```typescript
interface ThinkingCompleteEvent {
  type: "thinking_complete";
  thinking: string;
  signature: string;     // MUST be preserved for multi-turn
}
```

### Important: Preserving Thinking Blocks

For multi-turn conversations with tool use, thinking blocks **must** be passed back to the API:

```typescript
// Correct: Include full thinking blocks in assistant message
const messages = [
  { role: "user", content: "What's the weather?" },
  { role: "assistant", content: response.content }, // Includes thinking blocks
  { role: "user", content: toolResults }
];
```

---

## Recommended Streaming Architecture

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (React/Browser)                    │
├─────────────────────────────────────────────────────────────┤
│  StreamProcessor  │  MessageAccumulator  │  UI Components   │
└────────┬──────────┴───────────┬──────────┴────────┬─────────┘
         │                      │                   │
         ▼                      ▼                   ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SSE Client    │    │  State Manager  │    │ Thinking Block  │
│  (EventSource)  │    │   (Zustand/    │    │   Component     │
│                 │    │    Redux)       │    │                 │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend/CLI Process                       │
│    claude --output-format stream-json -p "prompt"           │
└─────────────────────────────────────────────────────────────┘
```

### Option 1: SSE (Server-Sent Events) - Recommended

Best for web applications. Simple, works through proxies, native browser support.

**Pros:**
- Simple HTTP connection
- Auto-reconnect support
- Works through firewalls/proxies
- Native EventSource API

**Cons:**
- Server-to-client only
- Limited to text data

### Option 2: WebSockets

Best for bidirectional communication needs.

**Pros:**
- Bidirectional communication
- Lower latency
- Binary data support

**Cons:**
- More complex setup
- May have firewall issues
- Requires connection management

### Option 3: Direct CLI Streaming

Best for desktop/Electron applications.

**Pros:**
- No server required
- Lowest latency
- Direct process communication

**Cons:**
- Node.js environment required
- Process management complexity

### Recommended: SSE with Backend Proxy

```typescript
// Backend: Stream Claude CLI output as SSE
import { spawn } from 'child_process';
import { Response } from 'express';

function streamClaude(prompt: string, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const claude = spawn('claude', [
    '--output-format', 'stream-json',
    '-p', prompt
  ]);

  claude.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      res.write(`data: ${line}\n\n`);
    }
  });

  claude.on('close', () => {
    res.write('data: [DONE]\n\n');
    res.end();
  });
}
```

---

## UI Component Structure

### Component Hierarchy

```
<ChatInterface>
  ├── <MessageList>
  │   └── <Message>
  │       ├── <ThinkingBlock>          // Collapsible reasoning
  │       │   ├── <ThinkingHeader>     // Duration, expand/collapse
  │       │   └── <ThinkingContent>    // Markdown rendered thinking
  │       ├── <TextBlock>              // Main response
  │       └── <ToolUseBlock>           // Tool call display
  ├── <StreamingIndicator>             // "Claude is thinking..."
  └── <InputArea>
```

### ThinkingBlock Component

Based on industry patterns (ChatGPT, Claude.ai, shadcn/ui):

```typescript
interface ThinkingBlockProps {
  thinking: string;
  isStreaming: boolean;
  duration?: number;           // Thinking duration in seconds
  defaultExpanded?: boolean;
}

interface ThinkingBlockState {
  isExpanded: boolean;
  contentLength: number;
}
```

**Visual Design Pattern:**

```
┌─────────────────────────────────────────────────┐
│ 💭 Thought for 12 seconds                    ▼  │
├─────────────────────────────────────────────────┤
│ Let me analyze this problem step by step...     │
│                                                 │
│ First, I need to consider...                    │
│ [Expandable content with markdown rendering]    │
└─────────────────────────────────────────────────┘
```

### Key UI Patterns

1. **Collapsible by default** - Auto-collapse when streaming finishes
2. **Duration indicator** - Show how long Claude was thinking
3. **Streaming indicator** - Animate while receiving thinking deltas
4. **Character/token count** - Optional, shows thinking length
5. **Copy functionality** - Allow copying thinking content

---

## Example Code Snippets

### 1. Stream Processor (TypeScript)

```typescript
type StreamEventHandler = {
  onThinkingStart?: () => void;
  onThinkingDelta?: (text: string) => void;
  onThinkingComplete?: (content: string, duration: number) => void;
  onTextDelta?: (text: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
};

class ClaudeStreamProcessor {
  private currentBlockType: string | null = null;
  private thinkingContent = '';
  private textContent = '';
  private thinkingStartTime: number | null = null;

  constructor(private handlers: StreamEventHandler) {}

  processEvent(event: string) {
    try {
      const data = JSON.parse(event);
      
      switch (data.type) {
        case 'content_block_start':
          this.handleBlockStart(data);
          break;
        case 'content_block_delta':
          this.handleDelta(data);
          break;
        case 'content_block_stop':
          this.handleBlockStop(data);
          break;
        case 'message_stop':
          this.handlers.onComplete?.();
          break;
      }
    } catch (error) {
      this.handlers.onError?.(error as Error);
    }
  }

  private handleBlockStart(data: ContentBlockStartEvent) {
    this.currentBlockType = data.content_block.type;
    
    if (this.currentBlockType === 'thinking') {
      this.thinkingContent = '';
      this.thinkingStartTime = Date.now();
      this.handlers.onThinkingStart?.();
    }
  }

  private handleDelta(data: ContentBlockDeltaEvent) {
    if (data.delta.type === 'thinking_delta') {
      this.thinkingContent += data.delta.thinking;
      this.handlers.onThinkingDelta?.(data.delta.thinking);
    } else if (data.delta.type === 'text_delta') {
      this.textContent += data.delta.text;
      this.handlers.onTextDelta?.(data.delta.text);
    }
  }

  private handleBlockStop(data: ContentBlockStopEvent) {
    if (this.currentBlockType === 'thinking' && this.thinkingStartTime) {
      const duration = (Date.now() - this.thinkingStartTime) / 1000;
      this.handlers.onThinkingComplete?.(this.thinkingContent, duration);
    }
    this.currentBlockType = null;
  }
}
```

### 2. React ThinkingBlock Component

```tsx
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Brain, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ThinkingBlockProps {
  thinking: string;
  isStreaming: boolean;
  duration?: number;
}

export function ThinkingBlock({ thinking, isStreaming, duration }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-collapse when streaming completes
  useEffect(() => {
    if (!isStreaming && thinking.length > 0) {
      const timer = setTimeout(() => setIsExpanded(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, thinking.length]);

  // Auto-scroll while streaming
  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [thinking, isStreaming]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(thinking);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)} seconds`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  return (
    <div className="thinking-block border rounded-lg bg-slate-50 dark:bg-slate-900">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {isStreaming ? (
              <span className="flex items-center gap-2">
                Thinking
                <span className="animate-pulse">...</span>
              </span>
            ) : (
              `Thought for ${formatDuration(duration || 0)}`
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
            title="Copy thinking"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 text-slate-400" />
            )}
          </button>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>
      
      {isExpanded && (
        <div
          ref={contentRef}
          className="px-4 pb-4 max-h-96 overflow-y-auto prose prose-sm dark:prose-invert"
        >
          <ReactMarkdown>{thinking}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
```

### 3. SSE Client Hook

```typescript
import { useEffect, useRef, useCallback } from 'react';

interface UseClaudeStreamOptions {
  onThinkingStart?: () => void;
  onThinkingDelta?: (text: string) => void;
  onThinkingComplete?: (content: string, duration: number) => void;
  onTextDelta?: (text: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function useClaudeStream(options: UseClaudeStreamOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const processorRef = useRef<ClaudeStreamProcessor | null>(null);

  const startStream = useCallback((prompt: string) => {
    // Cleanup existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    processorRef.current = new ClaudeStreamProcessor(options);
    
    const url = `/api/claude/stream?prompt=${encodeURIComponent(prompt)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        eventSource.close();
        return;
      }
      processorRef.current?.processEvent(event.data);
    };

    eventSource.onerror = (error) => {
      options.onError?.(new Error('Stream connection error'));
      eventSource.close();
    };
  }, [options]);

  const stopStream = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  return { startStream, stopStream };
}
```

### 4. Full Chat Component Integration

```tsx
import { useState, useCallback } from 'react';
import { useClaudeStream } from './useClaudeStream';
import { ThinkingBlock } from './ThinkingBlock';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  thinkingDuration?: number;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentThinking, setCurrentThinking] = useState('');
  const [currentText, setCurrentText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);

  const { startStream, stopStream } = useClaudeStream({
    onThinkingStart: () => {
      setIsThinking(true);
      setThinkingStartTime(Date.now());
      setCurrentThinking('');
    },
    onThinkingDelta: (text) => {
      setCurrentThinking(prev => prev + text);
    },
    onThinkingComplete: (content, duration) => {
      setIsThinking(false);
    },
    onTextDelta: (text) => {
      setCurrentText(prev => prev + text);
    },
    onComplete: () => {
      const duration = thinkingStartTime 
        ? (Date.now() - thinkingStartTime) / 1000 
        : 0;
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: currentText,
        thinking: currentThinking,
        thinkingDuration: duration
      }]);
      
      setCurrentThinking('');
      setCurrentText('');
      setThinkingStartTime(null);
    },
    onError: (error) => {
      console.error('Stream error:', error);
    }
  });

  const handleSubmit = useCallback((prompt: string) => {
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);
    startStream(prompt);
  }, [startStream]);

  return (
    <div className="chat-interface">
      {messages.map((msg, i) => (
        <div key={i} className="message">
          {msg.thinking && (
            <ThinkingBlock
              thinking={msg.thinking}
              isStreaming={false}
              duration={msg.thinkingDuration}
            />
          )}
          <div className="content">{msg.content}</div>
        </div>
      ))}
      
      {/* Streaming message */}
      {(currentThinking || currentText) && (
        <div className="message streaming">
          {currentThinking && (
            <ThinkingBlock
              thinking={currentThinking}
              isStreaming={isThinking}
            />
          )}
          {currentText && <div className="content">{currentText}</div>}
        </div>
      )}
    </div>
  );
}
```

---

## Best Practices

### 1. Stream Processing

- **Buffer NDJSON lines** - Handle partial lines at stream boundaries
- **Parse incrementally** - Don't wait for complete response
- **Handle errors gracefully** - Implement reconnection logic
- **Track block indices** - Events may arrive out of order

### 2. Thinking Block UI

- **Auto-collapse** after streaming completes (with delay)
- **Show duration** to indicate thinking effort
- **Enable copy** functionality for debugging
- **Limit height** with scroll for long thinking
- **Animate** during streaming for feedback

### 3. Multi-Turn Conversations

- **Preserve thinking blocks** when passing to API
- **Include signature** for tool use scenarios
- **Don't modify** thinking content between turns

### 4. Performance

- **Debounce UI updates** during rapid delta events
- **Use virtualization** for long message lists
- **Lazy render** markdown for better performance
- **Memoize** components to prevent unnecessary re-renders

### 5. Error Handling

- **Timeout handling** for stalled streams
- **Reconnection logic** for dropped connections
- **Fallback UI** for failed thinking extraction
- **User feedback** for stream errors

---

## References

1. [Anthropic SDK TypeScript Documentation](https://github.com/anthropics/anthropic-sdk-typescript)
2. [Anthropic Cookbook - Extended Thinking](https://github.com/anthropics/anthropic-cookbook/blob/main/extended_thinking/)
3. [Claude Code CLI Reference](https://blakecrosley.com/guide/claude-code)
4. [shadcn/ui AI Components](https://www.shadcn.io/ai)
5. [AWS Bedrock Extended Thinking Docs](https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-extended-thinking.html)
6. [Ably Anthropic Streaming Guide](https://ably.com/docs/guides/ai-transport/anthropic-message-per-response)

---

## Appendix: Claude Code CLI Flags

| Flag | Description |
|------|-------------|
| `--output-format json` | Complete JSON response after execution |
| `--output-format stream-json` | Real-time NDJSON streaming |
| `--include-partial-messages` | Include partial message events in stream |
| `-p "prompt"` | Print mode - single query and exit |
| `--verbose` | Include additional debug information |

---

*Document generated by RAPID Researcher Agent*
