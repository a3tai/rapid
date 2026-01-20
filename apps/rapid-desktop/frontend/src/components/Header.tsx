import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { useActiveView, useAppStore, useAgents, useTasks } from '../stores/app';
import { ConnectionStatusBadge } from './ConnectionStatus';
import { useToast } from './Toast';

const viewTitles: Record<string, { title: string; subtitle?: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview of your workspace' },
  agents: { title: 'Agents', subtitle: 'Manage AI agents' },
  tasks: { title: 'Tasks', subtitle: 'Track work items' },
  events: { title: 'Event Bus', subtitle: 'Agent communication' },
  approvals: { title: 'Approvals', subtitle: 'Security authorizations' },
  knowledge: { title: 'Knowledge', subtitle: 'Context engine' },
  suggestions: { title: 'Suggestions', subtitle: 'Team proposals and voting' },
  config: { title: 'Configuration', subtitle: 'Project settings' },
};

export function Header() {
  const activeView = useActiveView();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const agents = useAgents();
  const tasks = useTasks();
  const toast = useToast();
  const [showQuickActions, setShowQuickActions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeAgents = agents.length;
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const pendingTasks = tasks.filter((t) => t.status === 'pending').length;

  const viewInfo = viewTitles[activeView] || { title: activeView };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowQuickActions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const quickActions = [
    {
      label: 'New Task',
      icon: <TaskIcon />,
      action: () => {
        setActiveView('tasks');
        toast.info('Navigate to Tasks', 'Use the "New Task" button to create a task');
      },
    },
    {
      label: 'Spawn Agent',
      icon: <AgentIcon />,
      action: () => {
        setActiveView('agents');
        toast.info('Navigate to Agents', 'Use the "Spawn Agent" button to start an agent');
      },
    },
    {
      label: 'View Approvals',
      icon: <ShieldIcon />,
      action: () => setActiveView('approvals'),
    },
    {
      label: 'Add Knowledge',
      icon: <BookIcon />,
      action: () => {
        setActiveView('knowledge');
        toast.info('Navigate to Knowledge', 'Use "Add Knowledge" to store information');
      },
    },
  ];

  return (
    <header className="h-14 bg-rapid-surface border-b border-rapid-border flex items-center justify-between px-6 wails-drag">
      {/* Left: Title and subtitle */}
      <div className="flex items-center gap-4 wails-no-drag">
        <div>
          <h1 className="text-lg font-semibold leading-tight">{viewInfo.title}</h1>
          {viewInfo.subtitle && <p className="text-xs text-rapid-muted">{viewInfo.subtitle}</p>}
        </div>
      </div>

      {/* Right: Stats and actions */}
      <div className="flex items-center gap-4 wails-no-drag">
        {/* Connection status */}
        <ConnectionStatusBadge />

        {/* Quick stats */}
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => setActiveView('agents')}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-rapid-elevated transition-colors"
          >
            <div
              className={clsx(
                'status-dot',
                activeAgents > 0 ? 'status-dot-active' : 'status-dot-offline'
              )}
            />
            <span className="text-rapid-muted">
              <span className="text-rapid-text font-medium">{activeAgents}</span> agent
              {activeAgents !== 1 ? 's' : ''}
            </span>
          </button>

          <button
            onClick={() => setActiveView('tasks')}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-rapid-elevated transition-colors"
          >
            <svg
              className="w-4 h-4 text-yellow-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <span className="text-rapid-muted">
              <span className="text-rapid-text font-medium">{inProgressTasks}</span> active
            </span>
          </button>

          {pendingTasks > 0 && <span className="badge badge-neutral">{pendingTasks} pending</span>}
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-rapid-border" />

        {/* Quick actions dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowQuickActions(!showQuickActions)}
            className={clsx(
              'btn btn-primary text-sm flex items-center gap-1.5',
              showQuickActions && 'bg-blue-600'
            )}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            Quick Actions
            <svg
              className={clsx('w-3 h-3 transition-transform', showQuickActions && 'rotate-180')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {/* Dropdown menu */}
          {showQuickActions && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-rapid-surface border border-rapid-border rounded-lg shadow-xl overflow-hidden animate-fade-in z-50">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => {
                    action.action();
                    setShowQuickActions(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-rapid-elevated transition-colors"
                >
                  <span className="text-rapid-muted">{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function TaskIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}
