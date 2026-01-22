import { clsx } from 'clsx';
import { useEffect } from 'react';
import { getKeyboardShortcuts, type KeyboardShortcut } from '../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Render a keyboard key badge
 */
function KeyBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={clsx(
        'inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5',
        'text-xs font-mono bg-rapid-elevated border border-rapid-border rounded',
        'text-rapid-muted',
        className
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * Format a shortcut for display
 */
function ShortcutKeys({ shortcut }: { shortcut: KeyboardShortcut }) {
  const keys: React.ReactNode[] = [];

  if (shortcut.modifiers) {
    shortcut.modifiers.forEach((mod, i) => {
      if (mod === 'meta') {
        keys.push(<KeyBadge key={`mod-${i}`}>⌘</KeyBadge>);
      } else if (mod === 'ctrl') {
        keys.push(<KeyBadge key={`mod-${i}`}>Ctrl</KeyBadge>);
      } else if (mod === 'alt') {
        keys.push(<KeyBadge key={`mod-${i}`}>Alt</KeyBadge>);
      } else if (mod === 'shift') {
        keys.push(<KeyBadge key={`mod-${i}`}>⇧</KeyBadge>);
      }
    });
  }

  keys.push(<KeyBadge key="key">{shortcut.key}</KeyBadge>);

  return <span className="flex items-center gap-1">{keys}</span>;
}

/**
 * Keyboard shortcuts help modal
 *
 * Shows all available keyboard shortcuts organized by category.
 * Can be opened with "?" key.
 */
export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  const shortcuts = getKeyboardShortcuts();

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Group shortcuts by category
  const grouped = shortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) acc[shortcut.category] = [];
      acc[shortcut.category].push(shortcut);
      return acc;
    },
    {} as Record<string, KeyboardShortcut[]>
  );

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    modal: 'Modals & Dialogs',
    action: 'Actions',
  };

  const categoryOrder = ['navigation', 'modal', 'action'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-help-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg bg-rapid-surface border border-rapid-border rounded-xl shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rapid-border">
          <div className="flex items-center gap-3">
            <svg
              className="w-5 h-5 text-rapid-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <h2 id="keyboard-help-title" className="text-lg font-semibold">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-rapid-muted hover:text-rapid-text hover:bg-rapid-elevated transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-6">
            {categoryOrder.map((category) => {
              const items = grouped[category];
              if (!items || items.length === 0) return null;

              return (
                <div key={category}>
                  <h3 className="text-xs font-medium text-rapid-muted uppercase tracking-wider mb-3">
                    {categoryLabels[category] || category}
                  </h3>
                  <div className="space-y-2">
                    {items.map((shortcut, i) => (
                      <div
                        key={`${shortcut.key}-${i}`}
                        className="flex items-center justify-between py-1.5"
                      >
                        <span className="text-sm text-rapid-text">{shortcut.description}</span>
                        <ShortcutKeys shortcut={shortcut} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-rapid-border bg-rapid-elevated/50">
          <p className="text-xs text-rapid-muted text-center">
            Press <KeyBadge>Escape</KeyBadge> or click outside to close
          </p>
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcutsHelp;
