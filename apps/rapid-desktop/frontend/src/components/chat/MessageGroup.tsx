/**
 * MessageGroup - Grouped messages from the same sender
 *
 * Messages from the same sender within 5 minutes are grouped.
 * Only the first message shows avatar. Following Slack-style flat design.
 */

import { useMemo } from 'react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import type { ConversationMessage } from '../../hooks/useConversation';
import type { Agent } from '../../stores/app';

export interface MessageGroupProps {
  messages: ConversationMessage[];
  showAvatar?: boolean;
}

/** Generate avatar color based on name */
function getAvatarGradient(name: string): string {
  const gradients = [
    'from-violet-500 to-blue-500',
    'from-blue-500 to-cyan-500',
    'from-cyan-500 to-teal-500',
    'from-teal-500 to-green-500',
    'from-green-500 to-lime-500',
    'from-amber-500 to-orange-500',
    'from-orange-500 to-red-500',
    'from-red-500 to-pink-500',
    'from-pink-500 to-purple-500',
    'from-purple-500 to-violet-500',
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return gradients[Math.abs(hash) % gradients.length];
}

/** Get sender name */
function getSenderName(sender: 'user' | Agent): string {
  return sender === 'user' ? 'you' : sender.name;
}

/** Get message type badge styles */
function getMessageTypeBadge(type?: string): { className: string; label: string } | null {
  switch (type) {
    case 'error':
      return { className: 'badge-error', label: 'error' };
    case 'completion':
      return { className: 'badge-success', label: 'done' };
    case 'discovery':
      return { className: 'badge-primary', label: 'discovery' };
    case 'question':
      return { className: 'badge-warning', label: 'question' };
    case 'coordination':
      return { className: 'badge-info', label: 'coordination' };
    case 'learning':
      return { className: 'badge-primary', label: 'learning' };
    default:
      return null;
  }
}

/** Highlight @mentions in text */
function renderContentWithMentions(content: string): React.ReactNode {
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span
          key={i}
          className="bg-rapid-accent/15 text-rapid-accent font-medium px-0.5 rounded"
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

export function MessageGroup({ messages, showAvatar = true }: MessageGroupProps) {
  if (messages.length === 0) return null;

  const firstMessage = messages[0];
  const sender = firstMessage.sender;
  const senderName = getSenderName(sender);
  const isUser = sender === 'user';

  // Format timestamp
  const timestamp = useMemo(() => {
    return format(new Date(firstMessage.timestamp), 'h:mm a');
  }, [firstMessage.timestamp]);

  return (
    <div
      className={clsx(
        'flex gap-3 px-5 py-2',
        'hover:bg-rapid-elevated/20 transition-colors duration-150',
        'group relative'
      )}
    >
      {/* Avatar - only shown for first message in group */}
      {showAvatar ? (
        <div
          className={clsx(
            'w-9 h-9 rounded flex-shrink-0 flex items-center justify-center',
            'text-white text-xs font-semibold',
            isUser
              ? 'bg-gradient-to-br from-slate-500 to-slate-600'
              : `bg-gradient-to-br ${getAvatarGradient(senderName)}`
          )}
        >
          {senderName.slice(0, 2).toUpperCase()}
        </div>
      ) : (
        <div className="w-9 flex-shrink-0" />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header - only shown with avatar */}
        {showAvatar && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span
              className={clsx(
                'font-semibold text-sm',
                isUser ? 'text-rapid-text' : 'text-rapid-accent'
              )}
            >
              {senderName}
            </span>
            <span className="text-[11px] text-rapid-muted">{timestamp}</span>
            {!isUser && firstMessage.messageType && (
              (() => {
                const badge = getMessageTypeBadge(firstMessage.messageType);
                return badge ? (
                  <span className={clsx('badge text-[10px] px-1.5 py-0', badge.className)}>
                    {badge.label}
                  </span>
                ) : null;
              })()
            )}
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div key={msg.id} className={clsx(i > 0 && 'mt-1')}>
            {/* Title if present (for agent messages) */}
            {msg.title && i === 0 && (
              <div className="font-medium text-rapid-text mb-1">{msg.title}</div>
            )}

            {/* Message content */}
            <div className="text-rapid-text text-sm leading-relaxed whitespace-pre-wrap">
              {renderContentWithMentions(msg.content)}
            </div>

            {/* Rich embeds would go here */}
          </div>
        ))}
      </div>

      {/* Hover actions - appears on group hover */}
      <div
        className={clsx(
          'absolute right-4 -top-3',
          'hidden group-hover:flex items-center gap-0.5',
          'bg-rapid-elevated border border-rapid-border rounded-lg',
          'shadow-lg px-1 py-0.5'
        )}
      >
        <button
          className="p-1.5 text-rapid-muted hover:text-rapid-text hover:bg-rapid-surface rounded transition-colors"
          title="React"
        >
          <span className="text-sm">😊</span>
        </button>
        <button
          className="p-1.5 text-rapid-muted hover:text-rapid-text hover:bg-rapid-surface rounded transition-colors"
          title="Reply"
        >
          <span className="text-sm">↩</span>
        </button>
        <button
          className="p-1.5 text-rapid-muted hover:text-rapid-text hover:bg-rapid-surface rounded transition-colors"
          title="More"
        >
          <span className="text-sm">⋯</span>
        </button>
      </div>
    </div>
  );
}

export default MessageGroup;
