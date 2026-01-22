/**
 * AgentItem - Single agent in the sidebar
 *
 * Shows agent name, status indicator, and optional badges.
 * Following RAPID design guidelines with Slack-inspired UX.
 */

import { clsx } from 'clsx';
import type { Agent } from '../../stores/app';

export type AgentStatus = 'online' | 'away' | 'offline' | 'dnd';

export interface AgentItemProps {
  agent: Agent;
  status?: AgentStatus;
  isLeader?: boolean;
  selected?: boolean;
  unreadCount?: number;
  onClick?: () => void;
}

/** Get status indicator styles */
function getStatusStyles(status: AgentStatus): string {
  switch (status) {
    case 'online':
      return 'bg-rapid-success shadow-[0_0_6px_rgba(34,197,94,0.5)]';
    case 'away':
      return 'border-2 border-rapid-warning bg-transparent';
    case 'dnd':
      return 'bg-rapid-error';
    case 'offline':
    default:
      return 'border-2 border-rapid-muted bg-transparent';
  }
}

/** Generate avatar color based on agent name */
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

  // Simple hash of name to pick a gradient
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return gradients[Math.abs(hash) % gradients.length];
}

export function AgentItem({
  agent,
  status = 'offline',
  isLeader = false,
  selected = false,
  unreadCount = 0,
  onClick,
}: AgentItemProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-3 py-2 rounded-md',
        'transition-all duration-150',
        'text-left',
        selected
          ? 'bg-rapid-accent/10 text-rapid-accent'
          : 'text-rapid-muted hover:text-rapid-text hover:bg-rapid-elevated/50'
      )}
    >
      {/* Avatar with status indicator */}
      <div className="relative flex-shrink-0">
        <div
          className={clsx(
            'w-8 h-8 rounded bg-gradient-to-br flex items-center justify-center',
            'text-white text-xs font-semibold',
            getAvatarGradient(agent.name)
          )}
        >
          {agent.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Status dot */}
        <div
          className={clsx(
            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full',
            'border border-rapid-surface',
            getStatusStyles(status)
          )}
        />
      </div>

      {/* Name and badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'font-mono text-sm truncate',
              selected ? 'font-semibold' : 'font-normal'
            )}
          >
            @{agent.name}
          </span>

          {isLeader && (
            <span className="badge badge-primary text-[10px] px-1.5 py-0">
              lead
            </span>
          )}
        </div>

        {/* Worktree/session info if available */}
        {agent.worktree && (
          <div className="text-[10px] text-rapid-muted/60 truncate">
            {agent.worktree}
          </div>
        )}
      </div>

      {/* Unread indicator */}
      {unreadCount > 0 && (
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-rapid-accent flex items-center justify-center">
          <span className="text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        </div>
      )}
    </button>
  );
}

export default AgentItem;
