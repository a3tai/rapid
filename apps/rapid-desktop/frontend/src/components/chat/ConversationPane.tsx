/**
 * ConversationPane - Central message timeline
 *
 * Displays all messages grouped by sender with auto-scroll.
 * Following RAPID design guidelines with Slack-inspired flat design.
 */

import { useEffect, useRef, useMemo } from 'react';
import { clsx } from 'clsx';
import { MessageGroup } from './MessageGroup';
import type { ConversationMessage } from '../../hooks/useConversation';
import type { Agent } from '../../stores/app';

export interface ConversationPaneProps {
  messages: ConversationMessage[];
  isLoading?: boolean;
}

/** Group consecutive messages from the same sender within 5 minutes */
function groupMessages(messages: ConversationMessage[]): ConversationMessage[][] {
  if (messages.length === 0) return [];

  const groups: ConversationMessage[][] = [];
  let currentGroup: ConversationMessage[] = [];

  for (const msg of messages) {
    if (currentGroup.length === 0) {
      currentGroup.push(msg);
      continue;
    }

    const lastMsg = currentGroup[currentGroup.length - 1];
    const lastSenderId = lastMsg.sender === 'user' ? 'user' : (lastMsg.sender as Agent).id;
    const currentSenderId = msg.sender === 'user' ? 'user' : (msg.sender as Agent).id;

    // Check if same sender and within 5 minutes
    const timeDiff =
      new Date(msg.timestamp).getTime() - new Date(lastMsg.timestamp).getTime();
    const sameGroup = lastSenderId === currentSenderId && timeDiff < 5 * 60 * 1000;

    if (sameGroup) {
      currentGroup.push(msg);
    } else {
      groups.push(currentGroup);
      currentGroup = [msg];
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

export function ConversationPane({ messages, isLoading = false }: ConversationPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Group messages
  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  return (
    <div
      ref={containerRef}
      className={clsx(
        'flex-1 flex flex-col min-h-0 min-w-[400px]',
        'overflow-y-auto'
      )}
    >
      {/* Empty state */}
      {messages.length === 0 && !isLoading && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
          <div className="w-16 h-16 rounded-full bg-rapid-elevated/50 flex items-center justify-center mb-4">
            <span className="text-2xl">💬</span>
          </div>
          <h3 className="text-lg font-mono text-rapid-text mb-2">Start a conversation</h3>
          <p className="text-sm text-rapid-muted max-w-md">
            Send a message to communicate with agents. Use @mentions to direct your
            message to specific agents.
          </p>
        </div>
      )}

      {/* Messages */}
      {messageGroups.length > 0 && (
        <div className="py-4">
          {messageGroups.map((group, index) => (
            <MessageGroup
              key={`${group[0].id}-${index}`}
              messages={group}
              showAvatar={true}
            />
          ))}
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-center gap-2 px-5 py-2 text-rapid-muted">
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-rapid-accent animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-rapid-accent animate-pulse delay-100" />
            <div className="w-2 h-2 rounded-full bg-rapid-accent animate-pulse delay-200" />
          </div>
          <span className="text-xs">Sending...</span>
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}

export default ConversationPane;
