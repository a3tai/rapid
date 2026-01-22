/**
 * TaskEmbed - Embedded task card in messages
 *
 * Displays task information inline within chat messages.
 * Following RAPID design guidelines.
 */

import { clsx } from 'clsx';
import type { Task } from '../../stores/app';

export interface TaskEmbedProps {
  task: Task;
  compact?: boolean;
}

/** Get status badge styles */
function getStatusStyles(status: Task['status']): string {
  switch (status) {
    case 'completed':
      return 'badge-success';
    case 'in_progress':
      return 'badge-info';
    case 'blocked':
      return 'badge-error';
    case 'cancelled':
      return 'badge-neutral';
    case 'pending':
    default:
      return 'badge-warning';
  }
}

/** Get priority indicator */
function getPriorityIndicator(priority: Task['priority']): string | null {
  switch (priority) {
    case 'urgent':
      return '!!!';
    case 'high':
      return '!!';
    default:
      return null;
  }
}

export function TaskEmbed({ task, compact = false }: TaskEmbedProps) {
  const priorityIndicator = getPriorityIndicator(task.priority);

  if (compact) {
    return (
      <div
        className={clsx(
          'inline-flex items-center gap-2 px-2 py-1',
          'bg-rapid-elevated/50 border border-rapid-border/50 rounded',
          'text-xs font-mono'
        )}
      >
        <span className="text-rapid-muted">📋</span>
        <span className="text-rapid-text truncate max-w-[200px]">{task.title}</span>
        <span className={clsx('badge', getStatusStyles(task.status))}>
          {task.status.replace('_', ' ')}
        </span>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'mt-2 p-3 rounded-lg',
        'bg-rapid-elevated/30 border border-rapid-border/50',
        'text-sm font-mono'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-rapid-muted">📋</span>
        <span className="font-medium text-rapid-text">{task.title}</span>
        {priorityIndicator && (
          <span className="text-rapid-error font-bold">{priorityIndicator}</span>
        )}
      </div>

      {/* Description if available */}
      {task.description && (
        <p className="text-rapid-muted text-xs mb-2 line-clamp-2">{task.description}</p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 text-[10px]">
        <span className={clsx('badge', getStatusStyles(task.status))}>
          {task.status.replace('_', ' ')}
        </span>

        {task.assignedTo && (
          <span className="text-rapid-muted">
            Assigned: <span className="text-rapid-accent">@{task.assignedTo}</span>
          </span>
        )}

        {task.tags && task.tags.length > 0 && (
          <span className="text-rapid-muted">
            {task.tags.map((tag) => `#${tag}`).join(' ')}
          </span>
        )}
      </div>
    </div>
  );
}

export default TaskEmbed;
