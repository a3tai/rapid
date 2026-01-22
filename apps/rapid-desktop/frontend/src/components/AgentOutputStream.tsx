/**
 * AgentOutputStream - Display streaming agent output beautifully
 *
 * Features:
 * - Collapsible thinking blocks with duration
 * - Tool invocation display with input/output
 * - Text output with markdown support
 * - Token usage stats
 * - Auto-scroll to bottom
 */

import { useEffect, useRef, memo } from 'react';
import { clsx } from 'clsx';
import { Loader2, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ThinkingBlock, ToolCallBlock, ToolResultBlock } from './ThinkingBlock';
import { useAgentStream, type ThinkingBlock as ThinkingBlockType, type ToolInvocation } from '@/hooks/useAgentStream';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Markdown } from '@/components/ui/markdown';

export interface AgentOutputStreamProps {
  /** Agent name/ID to stream */
  agentName: string | null;
  /** Whether streaming is enabled */
  enabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Whether to auto-scroll to bottom */
  autoScroll?: boolean;
  /** Max height for the container */
  maxHeight?: string;
}

/**
 * Render a thinking block
 */
const ThinkingBlockRenderer = memo(function ThinkingBlockRenderer({
  block,
}: {
  block: ThinkingBlockType;
}) {
  return (
    <ThinkingBlock
      content={block.content}
      duration={block.duration}
      isStreaming={!block.isComplete}
      defaultCollapsed={block.isComplete}
      className="mb-2"
    />
  );
});

/**
 * Render a tool invocation
 */
const ToolInvocationRenderer = memo(function ToolInvocationRenderer({
  tool,
}: {
  tool: ToolInvocation;
}) {
  return (
    <div className="mb-2 space-y-1">
      <ToolCallBlock
        name={tool.name}
        input={tool.input}
        isExecuting={!tool.isComplete}
        className="mb-1"
      />
      {tool.isComplete && tool.result && (
        <ToolResultBlock
          content={tool.result}
          isError={tool.isError}
        />
      )}
    </div>
  );
});

/**
 * Text output block
 */
const TextOutputBlock = memo(function TextOutputBlock({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  if (!content.trim()) return null;

  return (
    <div className={clsx('mb-2', className)}>
      <Markdown>{content}</Markdown>
    </div>
  );
});

/**
 * Usage stats display
 */
const UsageStats = memo(function UsageStats({
  inputTokens,
  outputTokens,
  className,
}: {
  inputTokens: number;
  outputTokens: number;
  className?: string;
}) {
  if (inputTokens === 0 && outputTokens === 0) return null;

  const totalTokens = inputTokens + outputTokens;
  // Rough cost estimate (sonnet pricing)
  const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  return (
    <div className={clsx('flex items-center gap-4 text-xs text-rapid-muted font-mono', className)}>
      <span className="flex items-center gap-1">
        <Zap className="w-3 h-3" />
        {totalTokens.toLocaleString()} tokens
      </span>
      <span>↓{inputTokens.toLocaleString()}</span>
      <span>↑{outputTokens.toLocaleString()}</span>
      {cost > 0 && (
        <span className="text-rapid-muted/70">
          ~${cost.toFixed(4)}
        </span>
      )}
    </div>
  );
});

/**
 * Status indicator
 */
const StatusIndicator = memo(function StatusIndicator({
  isStreaming,
  isThinking,
  isExecutingTool,
  error,
  className,
}: {
  isStreaming: boolean;
  isThinking: boolean;
  isExecutingTool: boolean;
  error: string | null;
  className?: string;
}) {
  if (error) {
    return (
      <div className={clsx('flex items-center gap-2 text-rapid-error', className)}>
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm">Error: {error}</span>
      </div>
    );
  }

  if (isThinking) {
    return (
      <div className={clsx('flex items-center gap-2 text-rapid-accent', className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Thinking...</span>
      </div>
    );
  }

  if (isExecutingTool) {
    return (
      <div className={clsx('flex items-center gap-2 text-rapid-warning', className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Executing tool...</span>
      </div>
    );
  }

  if (isStreaming) {
    return (
      <div className={clsx('flex items-center gap-2 text-rapid-info', className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Running...</span>
      </div>
    );
  }

  return (
    <div className={clsx('flex items-center gap-2 text-rapid-success', className)}>
      <CheckCircle2 className="w-4 h-4" />
      <span className="text-sm">Completed</span>
    </div>
  );
});

/**
 * Main AgentOutputStream component
 */
export function AgentOutputStream({
  agentName,
  enabled = true,
  className,
  autoScroll = true,
  maxHeight = '600px',
}: AgentOutputStreamProps) {
  const {
    thinkingBlocks,
    toolInvocations,
    textContent,
    isStreaming,
    isThinking,
    isExecutingTool,
    usage,
    error,
    events,
  } = useAgentStream(agentName, enabled);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [autoScroll, events.length, textContent]);

  if (!agentName) {
    return (
      <div className={clsx('flex items-center justify-center text-rapid-muted h-32', className)}>
        <p className="text-sm">Select an agent to view output</p>
      </div>
    );
  }

  // Interleave events in chronological order
  const renderContent = () => {
    const items: { type: 'thinking' | 'tool' | 'text'; key: string; element: React.ReactNode }[] = [];

    // Add thinking blocks
    thinkingBlocks.forEach((block) => {
      items.push({
        type: 'thinking',
        key: block.id,
        element: <ThinkingBlockRenderer key={block.id} block={block} />,
      });
    });

    // Add tool invocations
    toolInvocations.forEach((tool) => {
      items.push({
        type: 'tool',
        key: tool.id,
        element: <ToolInvocationRenderer key={tool.id} tool={tool} />,
      });
    });

    // Add text content at the end
    if (textContent) {
      items.push({
        type: 'text',
        key: 'text-output',
        element: <TextOutputBlock key="text-output" content={textContent} />,
      });
    }

    return items.map(item => item.element);
  };

  return (
    <div className={clsx('flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between py-2 px-3 border-b border-rapid-border/50">
        <StatusIndicator
          isStreaming={isStreaming}
          isThinking={isThinking}
          isExecutingTool={isExecutingTool}
          error={error}
        />
        <UsageStats
          inputTokens={usage.inputTokens}
          outputTokens={usage.outputTokens}
        />
      </div>

      {/* Content */}
      <ScrollArea style={{ maxHeight }} className="flex-1">
        <div ref={scrollRef} className="p-3 space-y-2">
          {renderContent()}
          {events.length === 0 && !isStreaming && (
            <div className="flex items-center justify-center text-rapid-muted h-24">
              <p className="text-sm">No output yet</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Compact version for embedding in cards
 */
export function AgentOutputCompact({
  agentName,
  enabled = true,
  maxLines = 10,
  className,
}: {
  agentName: string | null;
  enabled?: boolean;
  maxLines?: number;
  className?: string;
}) {
  const { textContent, isStreaming, isThinking, error } = useAgentStream(agentName, enabled);

  // Get last N lines
  const lines = textContent.split('\n').filter(l => l.trim()).slice(-maxLines);

  return (
    <div className={clsx('font-mono text-xs', className)}>
      {/* Status indicator */}
      <div className="flex items-center gap-2 mb-2">
        {error ? (
          <AlertCircle className="w-3 h-3 text-rapid-error" />
        ) : isThinking ? (
          <Loader2 className="w-3 h-3 text-rapid-accent animate-spin" />
        ) : isStreaming ? (
          <Loader2 className="w-3 h-3 text-rapid-info animate-spin" />
        ) : (
          <CheckCircle2 className="w-3 h-3 text-rapid-success" />
        )}
        <span className="text-rapid-muted">
          {error ? 'Error' : isThinking ? 'Thinking...' : isStreaming ? 'Running...' : 'Complete'}
        </span>
      </div>

      {/* Output lines */}
      <div className="space-y-0.5 text-rapid-muted">
        {lines.map((line, i) => (
          <div key={i} className="truncate">
            {line}
          </div>
        ))}
        {lines.length === 0 && !isStreaming && (
          <span className="text-rapid-muted/50">No output</span>
        )}
      </div>
    </div>
  );
}

export default AgentOutputStream;
