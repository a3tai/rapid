import { clsx } from 'clsx';
import type { ReactNode } from 'react';

// SVG icons for different empty state types
const Icons: Record<string, ReactNode> = {
  agents: (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  tasks: (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  ),
  messages: (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  ),
  knowledge: (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  suggestions: (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  ),
  approvals: (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  events: (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  ),
  data: (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
    </svg>
  ),
  search: (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
};

type IconType = keyof typeof Icons;

// Color configurations matching RAPID design system
const colorConfigs = {
  accent: {
    iconBg: 'bg-rapid-accent/20',
    iconGlow: 'bg-rapid-accent/10',
    iconColor: 'text-rapid-accent',
    buttonBg: 'bg-rapid-accent hover:bg-rapid-accent-muted',
  },
  info: {
    iconBg: 'bg-rapid-info/20',
    iconGlow: 'bg-rapid-info/10',
    iconColor: 'text-rapid-info',
    buttonBg: 'bg-rapid-info hover:bg-rapid-info/80',
  },
  success: {
    iconBg: 'bg-rapid-success/20',
    iconGlow: 'bg-rapid-success/10',
    iconColor: 'text-rapid-success',
    buttonBg: 'bg-rapid-success hover:bg-rapid-success/80',
  },
  warning: {
    iconBg: 'bg-rapid-warning/20',
    iconGlow: 'bg-rapid-warning/10',
    iconColor: 'text-rapid-warning',
    buttonBg: 'bg-rapid-warning hover:bg-rapid-warning/80 text-black',
  },
  muted: {
    iconBg: 'bg-rapid-elevated',
    iconGlow: 'bg-rapid-border/30',
    iconColor: 'text-rapid-muted',
    buttonBg: 'bg-rapid-elevated hover:bg-rapid-border',
  },
};

type ColorType = keyof typeof colorConfigs;

interface EmptyStateProps {
  /** Icon type to display */
  icon?: IconType | ReactNode;
  /** Main title */
  title: string;
  /** Description text */
  description?: string;
  /** Color theme */
  color?: ColorType;
  /** Primary action button */
  action?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  /** Secondary action link */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
}

const sizeConfigs = {
  sm: {
    container: 'py-6',
    iconWrapper: 'w-14 h-14',
    iconSize: 'w-7 h-7',
    title: 'text-sm',
    description: 'text-xs',
    button: 'px-3 py-1.5 text-xs',
    gap: 'mb-3',
  },
  md: {
    container: 'py-10',
    iconWrapper: 'w-20 h-20',
    iconSize: 'w-10 h-10',
    title: 'text-base',
    description: 'text-sm',
    button: 'px-4 py-2 text-sm',
    gap: 'mb-4',
  },
  lg: {
    container: 'py-16',
    iconWrapper: 'w-24 h-24',
    iconSize: 'w-12 h-12',
    title: 'text-lg',
    description: 'text-sm',
    button: 'px-5 py-2.5 text-sm',
    gap: 'mb-6',
  },
};

export function EmptyState({
  icon = 'data',
  title,
  description,
  color = 'accent',
  action,
  secondaryAction,
  size = 'md',
  className,
}: EmptyStateProps) {
  const colorConfig = colorConfigs[color];
  const sizeConfig = sizeConfigs[size];

  const iconElement =
    typeof icon === 'string' ? (
      <div className={clsx(colorConfig.iconColor, sizeConfig.iconSize)}>
        {Icons[icon]}
      </div>
    ) : (
      icon
    );

  return (
    <div className={clsx('flex flex-col items-center justify-center text-center', sizeConfig.container, className)}>
      {/* Animated icon container */}
      <div className={clsx('relative', sizeConfig.iconWrapper, sizeConfig.gap)}>
        {/* Glow effect */}
        <div
          className={clsx(
            'absolute inset-0 rounded-2xl blur-xl animate-pulse-slow',
            colorConfig.iconGlow
          )}
        />
        {/* Icon background */}
        <div
          className={clsx(
            'relative w-full h-full border border-rapid-border/50 rounded-2xl flex items-center justify-center backdrop-blur-sm',
            colorConfig.iconBg
          )}
        >
          {iconElement}
        </div>
      </div>

      {/* Title */}
      <h3 className={clsx('font-mono text-rapid-text', sizeConfig.title, 'mb-2')}>
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className={clsx('text-rapid-muted max-w-xs', sizeConfig.description, action ? 'mb-5' : '')}>
          {description}
        </p>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            <button
              onClick={action.onClick}
              className={clsx(
                'inline-flex items-center gap-2 text-white font-mono rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow',
                colorConfig.buttonBg,
                sizeConfig.button
              )}
            >
              {action.icon}
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className={clsx(
                'font-mono text-rapid-muted hover:text-rapid-text transition-colors',
                sizeConfig.button
              )}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Pre-configured empty states for common use cases

interface AgentsEmptyStateProps {
  onSpawn?: () => void;
}

export function AgentsEmptyState({ onSpawn }: AgentsEmptyStateProps) {
  return (
    <EmptyState
      icon="agents"
      title="No Agents Running"
      description="Spawn an agent to start autonomous development"
      color="accent"
      action={
        onSpawn
          ? {
              label: 'Spawn First Agent',
              onClick: onSpawn,
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              ),
            }
          : undefined
      }
      size="lg"
    />
  );
}

interface TasksEmptyStateProps {
  onCreate?: () => void;
}

export function TasksEmptyState({ onCreate }: TasksEmptyStateProps) {
  return (
    <EmptyState
      icon="tasks"
      title="No Tasks Yet"
      description="Create a task to assign work to your agents"
      color="info"
      action={
        onCreate
          ? {
              label: 'Create Task',
              onClick: onCreate,
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              ),
            }
          : undefined
      }
      size="lg"
    />
  );
}

interface MessagesEmptyStateProps {
  title?: string;
}

export function MessagesEmptyState({ title = 'No Activity' }: MessagesEmptyStateProps) {
  return (
    <EmptyState
      icon="messages"
      title={title}
      description="Events will appear here as agents communicate"
      color="muted"
      size="md"
    />
  );
}

export function KnowledgeEmptyState() {
  return (
    <EmptyState
      icon="knowledge"
      title="Knowledge Base Empty"
      description="Knowledge entries will accumulate as agents learn and discover"
      color="muted"
      size="lg"
    />
  );
}

interface SuggestionsEmptyStateProps {
  onPropose?: () => void;
}

export function SuggestionsEmptyState({ onPropose }: SuggestionsEmptyStateProps) {
  return (
    <EmptyState
      icon="suggestions"
      title="No Suggestions Yet"
      description="Agents will propose improvements and ideas here"
      color="warning"
      action={
        onPropose
          ? {
              label: 'Propose Suggestion',
              onClick: onPropose,
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              ),
            }
          : undefined
      }
      size="lg"
    />
  );
}

export function ApprovalsEmptyState() {
  return (
    <EmptyState
      icon="approvals"
      title="No Pending Approvals"
      description="All caught up! No actions require your review right now."
      color="success"
      size="lg"
    />
  );
}

interface SearchEmptyStateProps {
  query?: string;
  onClear?: () => void;
}

export function SearchEmptyState({ query, onClear }: SearchEmptyStateProps) {
  return (
    <EmptyState
      icon="search"
      title="No Results Found"
      description={query ? `No matches for "${query}"` : 'Try adjusting your search criteria'}
      color="muted"
      action={
        onClear
          ? {
              label: 'Clear Search',
              onClick: onClear,
            }
          : undefined
      }
      size="md"
    />
  );
}

interface DataEmptyStateProps {
  title?: string;
  description?: string;
}

export function DataEmptyState({
  title = 'No Data Available',
  description = 'Data will appear here once it becomes available'
}: DataEmptyStateProps) {
  return (
    <EmptyState
      icon="data"
      title={title}
      description={description}
      color="muted"
      size="md"
    />
  );
}
