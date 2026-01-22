import { clsx } from 'clsx';
<<<<<<< HEAD
import { useAppStore, useActiveView, useDaemonStatus, useSidebarCollapsed } from '../stores/app';
=======
import { useState, useEffect } from 'react';
import { useAppStore, useActiveView, useDaemonStatus } from '../stores/app';
>>>>>>> 20a78b8 (feat(desktop): add AgentFleetStatus, tests, and UI improvements)

export interface SidebarProps {
  /** Control sidebar open/closed state from parent (for mobile) */
  isOpen?: boolean;
  /** Callback when sidebar should close (mobile) */
  onClose?: () => void;
}

const navItems = [
  {
    id: 'dashboard' as const,
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        />
      </svg>
    ),
  },
  {
    id: 'agents' as const,
    label: 'Agents',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    id: 'tasks' as const,
    label: 'Tasks',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
    ),
  },
  {
    id: 'events' as const,
    label: 'Event Bus',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
  },
  {
    id: 'chat' as const,
    label: 'Chat',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 20.59c5.165 0 9-3.075 9-6.876 0-3.8-3.835-6.875-9-6.875-5.164 0-9 3.075-9 6.875 0 1.238.29 2.41.843 3.41C2.969 18.745 1 19.962 1 21.5c0 .828.39 1.608 1.073 2.178 1.224.985 3.5.323 4.967-1.482 1.465 1.805 3.74 2.467 4.96 1.482z"
        />
      </svg>
    ),
  },
  {
    id: 'approvals' as const,
    label: 'Approvals',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
  },
  {
    id: 'knowledge' as const,
    label: 'Knowledge',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
  {
    id: 'suggestions' as const,
    label: 'Suggestions',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
    ),
  },
  {
    id: 'config' as const,
    label: 'Config',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
];

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const activeView = useActiveView();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const daemonStatus = useDaemonStatus();
<<<<<<< HEAD
  const collapsed = useSidebarCollapsed();

  return (
    <aside
      className={clsx(
        'bg-rapid-surface border-r border-rapid-border flex flex-col transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Navigation */}
      <nav className={clsx('flex-1 pt-4 space-y-1', collapsed ? 'px-2' : 'px-3')} aria-label="Main navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
            aria-current={activeView === item.id ? 'page' : undefined}
            className={clsx(
              'w-full flex items-center rounded-lg text-sm font-medium transition-colors',
              collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2',
=======
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle navigation click on mobile - close sidebar after selection
  const handleNavClick = (viewId: typeof navItems[number]['id']) => {
    setActiveView(viewId);
    if (isMobile && onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'bg-rapid-surface border-r border-rapid-border flex flex-col transition-transform duration-300 ease-in-out z-50',
          // Mobile: fixed position, slides in from left
          'fixed md:relative',
          'h-full md:h-auto',
          'w-64',
          // Mobile: translate off-screen when closed
          isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0'
        )}
      >
      {/* Logo - macOS traffic lights need ~52px clearance from top */}
      <div className="pt-14 pb-4 px-4 border-b border-rapid-border wails-drag">
        <div className="wails-no-drag flex items-center">
          <span className="font-mono text-xl font-normal tracking-[0.1em] bg-gradient-to-br from-rapid-text to-rapid-accent bg-clip-text text-transparent">
            RAPID
          </span>
          <span className="font-mono text-xl text-rapid-accent animate-cursor-blink">_</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNavClick(item.id)}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              // Touch-friendly: minimum 44px touch target
              'min-h-[44px]',
>>>>>>> 20a78b8 (feat(desktop): add AgentFleetStatus, tests, and UI improvements)
              activeView === item.id
                ? 'bg-rapid-accent text-white'
                : 'text-rapid-muted hover:text-rapid-text hover:bg-rapid-elevated active:bg-rapid-elevated'
            )}
          >
            {item.icon}
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Status footer */}
      <div className={clsx('border-t border-rapid-border', collapsed ? 'p-2' : 'p-4')} role="status" aria-live="polite">
        <div className={clsx('flex items-center text-sm', collapsed ? 'justify-center' : 'gap-2')}>
          <div
            className={clsx(
              'status-dot',
              daemonStatus?.running ? 'status-dot-active' : 'status-dot-offline'
            )}
            aria-hidden="true"
          />
          {!collapsed && (
            <span className="text-rapid-muted">
              {daemonStatus?.running ? 'Daemon running' : 'Daemon offline'}
            </span>
          )}
        </div>
        {!collapsed && daemonStatus?.version && (
          <div className="mt-1 text-xs text-rapid-muted">v{daemonStatus.version}</div>
        )}
      </div>
      </aside>
    </>
  );
}

/**
 * Mobile menu toggle button component
 */
export function MobileMenuButton({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'md:hidden p-2 rounded-lg transition-colors',
        'text-rapid-muted hover:text-rapid-text hover:bg-rapid-elevated',
        // Touch-friendly minimum size
        'min-w-[44px] min-h-[44px]',
        'flex items-center justify-center'
      )}
      aria-label={isOpen ? 'Close menu' : 'Open menu'}
      aria-expanded={isOpen}
    >
      {isOpen ? (
        // X icon
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      ) : (
        // Hamburger icon
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      )}
    </button>
  );
}
