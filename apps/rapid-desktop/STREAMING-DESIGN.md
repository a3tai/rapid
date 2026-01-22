# RAPID Agent Streaming Design

## Overview

This document describes the architecture for streaming Claude Code CLI output including thinking blocks to the RAPID desktop UI.

## Claude Code CLI Output Formats

### stream-json Format

```bash
claude -p "prompt" --output-format stream-json --verbose
```

**Note**: `--verbose` is required with `stream-json` in print mode.

### Message Types (NDJSON)

Each line is a JSON object with a `type` field:

| Type | Description |
|------|-------------|
| `system` | Session init with tools, MCP servers, model info |
| `assistant` | Claude's responses with content blocks |
| `user` | User messages and tool results |
| `result` | Final result with stats |

### Assistant Message Structure

```typescript
interface AssistantMessage {
  type: 'assistant';
  message: {
    model: string;
    id: string;
    role: 'assistant';
    content: ContentBlock[];
    stop_reason: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  session_id: string;
  uuid: string;
}
```

### Content Block Types

```typescript
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }  // Extended thinking
  | { type: 'tool_use'; id: string; name: string; input: object }
  | { type: 'tool_result'; tool_use_id: string; content: string };
```

## Extended Thinking

Extended thinking content appears as `thinking` content blocks. For Claude 4 models:
- Thinking is summarized by default
- Full thinking requires enterprise access
- Streaming thinking uses `thinking_delta` events

### Enabling Extended Thinking

In the agent-loop.sh, thinking is enabled by default with Claude 4 models. The `--output-format stream-json` flag captures thinking blocks when present.

## Architecture

### 1. Agent Loop (Docker Container)

```
agent-loop.sh
    │
    ├─▶ claude --output-format stream-json --verbose
    │       │
    │       └─▶ NDJSON to agent.log
    │
    └─▶ Optionally parse and forward events via bus_send
```

### 2. Daemon SSE Endpoint

```
GET /agents/:agentId/stream

Response: text/event-stream

event: text
data: {"content": "Hello", "timestamp": "..."}

event: thinking
data: {"content": "Let me analyze...", "timestamp": "..."}

event: tool_use
data: {"name": "Read", "input": {...}, "timestamp": "..."}

event: tool_result
data: {"tool_use_id": "...", "content": "...", "timestamp": "..."}

event: heartbeat
data: {"timestamp": "..."}
```

### 3. Frontend Hook

```typescript
// useAgentStream.ts
export function useAgentStream(agentId: string) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(`/agents/${agentId}/stream`);

    eventSource.addEventListener('text', (e) => {
      const data = JSON.parse(e.data);
      setEvents(prev => [...prev, { type: 'text', ...data }]);
    });

    eventSource.addEventListener('thinking', (e) => {
      const data = JSON.parse(e.data);
      setEvents(prev => [...prev, { type: 'thinking', ...data }]);
    });

    // ... other event types

    return () => eventSource.close();
  }, [agentId]);

  return { events, isStreaming };
}
```

## UI Components

### ThinkingBlock Component

```tsx
interface ThinkingBlockProps {
  content: string;
  duration?: number;
  isStreaming?: boolean;
  defaultCollapsed?: boolean;
}

export function ThinkingBlock({
  content,
  duration,
  isStreaming,
  defaultCollapsed = true
}: ThinkingBlockProps) {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-muted-foreground">
        {isStreaming ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Brain className="w-4 h-4" />
        )}
        <span className="text-sm font-mono">
          {isStreaming ? 'Thinking...' : `Thought for ${duration}ms`}
        </span>
        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-3 bg-muted/30 rounded-md border border-border/50">
          <p className="text-sm text-muted-foreground italic whitespace-pre-wrap">
            {content}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

### AgentOutputStream Component

```tsx
interface AgentOutputStreamProps {
  agentId: string;
  className?: string;
}

export function AgentOutputStream({ agentId, className }: AgentOutputStreamProps) {
  const { events, isStreaming } = useAgentStream(agentId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<'all' | 'text' | 'thinking' | 'tools'>('all');

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [events]);

  const filteredEvents = events.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'text') return e.type === 'text';
    if (filter === 'thinking') return e.type === 'thinking';
    if (filter === 'tools') return e.type === 'tool_use' || e.type === 'tool_result';
    return true;
  });

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={setFilter} className="px-4 py-2 border-b">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="thinking">Thinking</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Event stream */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-3">
          {filteredEvents.map((event, i) => (
            <StreamEventBlock key={i} event={event} />
          ))}
          {isStreaming && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Streaming...</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
```

## Styling Guidelines

### Thinking Blocks
- Background: `bg-muted/30` (subtle, not distracting)
- Text: `text-muted-foreground italic`
- Icon: Brain or Sparkles
- Animation: Subtle pulse while streaming

### Tool Calls
- Badge: Tool name with appropriate color
- Code block: Syntax highlighted input
- Collapsible: Large outputs collapsed by default

### Text Output
- Normal styling, markdown rendering
- Code blocks with syntax highlighting
- Links clickable

## Implementation Tasks

1. **agent-loop.sh**: Add `--output-format stream-json --verbose`
2. **Daemon**: Add SSE endpoint `/agents/:agentId/stream`
3. **Frontend**: Create `useAgentStream` hook
4. **Components**: ThinkingBlock, ToolCallBlock, AgentOutputStream
5. **Integration**: Update Agents page to use new components

## Event Schema (TypeScript)

```typescript
interface StreamEvent {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'error';
  timestamp: string;
  content?: string;
  toolName?: string;
  toolInput?: object;
  toolUseId?: string;
  duration?: number;
}

interface SystemInit {
  type: 'system';
  subtype: 'init';
  session_id: string;
  model: string;
  tools: string[];
  mcp_servers: { name: string; status: string }[];
}
```

## Performance Considerations

1. **Debounce rendering**: Don't re-render on every delta
2. **Virtual scrolling**: For long output streams
3. **Lazy loading**: Only parse visible events
4. **Memory limits**: Cap event history at 1000 events
5. **Compression**: Consider gzip for SSE responses
