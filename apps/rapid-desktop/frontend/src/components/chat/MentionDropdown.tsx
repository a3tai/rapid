/**
 * MentionDropdown - Autocomplete dropdown for @mentions
 *
 * Shows filtered list of agents when user types @.
 * Supports keyboard navigation.
 */

import { clsx } from 'clsx';
import type { Agent } from '../../stores/app';

export interface MentionDropdownProps {
  agents: Agent[];
  selectedIndex: number;
  onSelect: (agent: Agent) => void;
  onHover: (index: number) => void;
}

/** Generate avatar gradient based on name */
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

export function MentionDropdown({
  agents,
  selectedIndex,
  onSelect,
  onHover,
}: MentionDropdownProps) {
  if (agents.length === 0) {
    return (
      <div
        className={clsx(
          'absolute bottom-full left-0 right-0 mb-2',
          'bg-rapid-elevated border border-rapid-border rounded-lg',
          'shadow-lg p-3 text-center'
        )}
      >
        <span className="text-sm text-rapid-muted">No matching agents</span>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'absolute bottom-full left-0 right-0 mb-2',
        'bg-rapid-elevated border border-rapid-border rounded-lg',
        'shadow-lg overflow-hidden max-h-[200px] overflow-y-auto'
      )}
    >
      <div className="py-1">
        {agents.map((agent, index) => (
          <button
            key={agent.id}
            onClick={() => onSelect(agent)}
            onMouseEnter={() => onHover(index)}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2',
              'text-left transition-colors',
              index === selectedIndex
                ? 'bg-rapid-accent/20 text-rapid-accent'
                : 'text-rapid-text hover:bg-rapid-surface'
            )}
          >
            {/* Avatar */}
            <div
              className={clsx(
                'w-6 h-6 rounded flex-shrink-0 flex items-center justify-center',
                'text-white text-[10px] font-semibold',
                `bg-gradient-to-br ${getAvatarGradient(agent.name)}`
              )}
            >
              {agent.name.slice(0, 2).toUpperCase()}
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm truncate">@{agent.name}</div>
              {agent.worktree && (
                <div className="text-[10px] text-rapid-muted truncate">
                  {agent.worktree}
                </div>
              )}
            </div>

            {/* Status indicator */}
            <div className="w-2 h-2 rounded-full bg-rapid-success flex-shrink-0" />
          </button>
        ))}
      </div>

      {/* Keyboard hint */}
      <div className="px-3 py-2 border-t border-rapid-border/50 bg-rapid-surface/50">
        <span className="text-[10px] text-rapid-muted">
          ↑↓ to navigate · Enter to select · Esc to close
        </span>
      </div>
    </div>
  );
}

export default MentionDropdown;
