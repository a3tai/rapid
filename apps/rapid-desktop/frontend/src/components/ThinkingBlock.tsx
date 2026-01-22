/**
 * ThinkingBlock - Display Claude's extended thinking in a collapsible container
 *
 * Shows thinking content with:
 * - Animated indicator while streaming
 * - Collapsible container (collapsed by default when complete)
 * - Duration display
 * - Muted, italic styling to distinguish from regular output
 */

import { useState } from 'react';
import { clsx } from 'clsx';
import { Brain, ChevronDown, Loader2 } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export interface ThinkingBlockProps {
  /** The thinking content to display */
  content: string;
  /** Duration in milliseconds */
  duration?: number;
  /** Whether content is still streaming */
  isStreaming?: boolean;
  /** Whether to start collapsed (default: true when not streaming) */
  defaultCollapsed?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function ThinkingBlock({
  content,
  duration,
  isStreaming = false,
  defaultCollapsed,
  className,
}: ThinkingBlockProps) {
  // Default to open while streaming, collapsed when complete
  const [isOpen, setIsOpen] = useState(
    defaultCollapsed !== undefined ? !defaultCollapsed : isStreaming
  );

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={clsx('group', className)}
    >
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md hover:bg-rapid-elevated/50 transition-colors">
        {isStreaming ? (
          <Loader2 className="w-4 h-4 text-rapid-accent animate-spin" />
        ) : (
          <Brain className="w-4 h-4 text-rapid-muted" />
        )}
        <span className="text-sm font-mono text-rapid-muted">
          {isStreaming ? (
            <span className="text-rapid-accent">Thinking...</span>
          ) : (
            <>
              Thought
              {duration && (
                <span className="ml-1 text-rapid-muted/70">
                  ({formatDuration(duration)})
                </span>
              )}
            </>
          )}
        </span>
        <ChevronDown
          className={clsx(
            'w-4 h-4 text-rapid-muted/50 ml-auto transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-1.5 ml-6 p-3 bg-rapid-elevated/30 rounded-md border border-rapid-border/30">
          <p className="text-sm text-rapid-muted italic whitespace-pre-wrap leading-relaxed">
            {content}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * ToolCallBlock - Display a tool invocation
 */
export interface ToolCallBlockProps {
  name: string;
  input: Record<string, unknown>;
  isExecuting?: boolean;
  className?: string;
}

export function ToolCallBlock({
  name,
  input,
  isExecuting = false,
  className,
}: ToolCallBlockProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={clsx('group', className)}
    >
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md hover:bg-rapid-elevated/50 transition-colors">
        {isExecuting ? (
          <Loader2 className="w-4 h-4 text-rapid-warning animate-spin" />
        ) : (
          <span className="w-4 h-4 flex items-center justify-center text-rapid-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </span>
        )}
        <span className="text-sm font-mono">
          <span className="text-rapid-info">{name}</span>
          {isExecuting && (
            <span className="ml-2 text-rapid-warning">executing...</span>
          )}
        </span>
        <ChevronDown
          className={clsx(
            'w-4 h-4 text-rapid-muted/50 ml-auto transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-1.5 ml-6 p-3 bg-rapid-surface rounded-md border border-rapid-border/50">
          <pre className="text-xs font-mono text-rapid-muted overflow-x-auto">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * ToolResultBlock - Display the result of a tool call
 */
export interface ToolResultBlockProps {
  content: string;
  isError?: boolean;
  className?: string;
}

export function ToolResultBlock({
  content,
  isError = false,
  className,
}: ToolResultBlockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isLong = content.length > 500;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={clsx('group', className)}
    >
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md hover:bg-rapid-elevated/50 transition-colors">
        <span
          className={clsx(
            'w-4 h-4 flex items-center justify-center',
            isError ? 'text-rapid-error' : 'text-rapid-success'
          )}
        >
          {isError ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
        <span className="text-sm font-mono text-rapid-muted">
          {isError ? 'Error' : 'Result'}
          {isLong && !isOpen && (
            <span className="ml-2 text-rapid-muted/50">
              ({content.length} chars)
            </span>
          )}
        </span>
        <ChevronDown
          className={clsx(
            'w-4 h-4 text-rapid-muted/50 ml-auto transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div
          className={clsx(
            'mt-1.5 ml-6 p-3 rounded-md border',
            isError
              ? 'bg-rapid-error/10 border-rapid-error/30'
              : 'bg-rapid-surface border-rapid-border/50'
          )}
        >
          <pre className="text-xs font-mono text-rapid-muted overflow-x-auto whitespace-pre-wrap">
            {content}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
