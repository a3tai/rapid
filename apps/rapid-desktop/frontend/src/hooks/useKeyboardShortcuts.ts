import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../stores/app';

export type ViewId =
  | 'dashboard'
  | 'agents'
  | 'tasks'
  | 'events'
  | 'chat'
  | 'approvals'
  | 'knowledge'
  | 'suggestions'
  | 'config';

export interface KeyboardShortcut {
  key: string;
  modifiers?: ('meta' | 'ctrl' | 'alt' | 'shift')[];
  description: string;
  action: () => void;
  category: 'navigation' | 'action' | 'modal';
}

/**
 * View mapping for number key shortcuts
 * 1-9 maps to the sidebar navigation items in order
 */
const viewByNumber: Record<string, ViewId> = {
  '1': 'dashboard',
  '2': 'agents',
  '3': 'tasks',
  '4': 'events',
  '5': 'chat',
  '6': 'approvals',
  '7': 'knowledge',
  '8': 'suggestions',
  '9': 'config',
};

/**
 * Check if an event target is an input element
 */
function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false;
  const tagName = (target as HTMLElement).tagName?.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    (target as HTMLElement).isContentEditable
  );
}

/**
 * Hook for global keyboard shortcuts
 *
 * Features:
 * - Number keys (1-9) for quick view/tab switching
 * - ? to show keyboard shortcuts help modal
 * - Escape to close any open modal
 * - Prevents shortcuts when user is typing in an input
 *
 * @param options.onShowHelp Callback when ? is pressed to show help modal
 * @param options.onCloseModal Callback when Escape is pressed to close modals
 * @param options.disabled Disable all shortcuts
 */
export function useKeyboardShortcuts(options: {
  onShowHelp?: () => void;
  onCloseModal?: () => void;
  disabled?: boolean;
} = {}) {
  const { onShowHelp, onCloseModal, disabled = false } = options;
  const setActiveView = useAppStore((s) => s.setActiveView);

  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      if (isInputElement(e.target)) return;

      // Skip if modifier keys are held (except for specific shortcuts)
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey;

      // Number keys 1-9 for quick view switching (no modifiers)
      if (!hasModifier && e.key >= '1' && e.key <= '9') {
        const view = viewByNumber[e.key];
        if (view) {
          e.preventDefault();
          setActiveView(view);
        }
        return;
      }

      // ? to show keyboard shortcuts help (Shift+/ on most keyboards)
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        onShowHelp?.();
        return;
      }

      // Escape to close modals (global)
      if (e.key === 'Escape') {
        // Don't prevent default - let modals handle their own escape
        onCloseModal?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, setActiveView, onShowHelp, onCloseModal]);
}

/**
 * Hook to manage keyboard shortcuts help modal state
 */
export function useKeyboardHelp() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((o) => !o), []);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}

/**
 * Get all available keyboard shortcuts for display in help modal
 */
export function getKeyboardShortcuts(): KeyboardShortcut[] {
  return [
    // Navigation shortcuts
    {
      key: '1',
      description: 'Go to Dashboard',
      action: () => {},
      category: 'navigation',
    },
    {
      key: '2',
      description: 'Go to Agents',
      action: () => {},
      category: 'navigation',
    },
    {
      key: '3',
      description: 'Go to Tasks',
      action: () => {},
      category: 'navigation',
    },
    {
      key: '4',
      description: 'Go to Event Bus',
      action: () => {},
      category: 'navigation',
    },
    {
      key: '5',
      description: 'Go to Chat',
      action: () => {},
      category: 'navigation',
    },
    {
      key: '6',
      description: 'Go to Approvals',
      action: () => {},
      category: 'navigation',
    },
    {
      key: '7',
      description: 'Go to Knowledge',
      action: () => {},
      category: 'navigation',
    },
    {
      key: '8',
      description: 'Go to Suggestions',
      action: () => {},
      category: 'navigation',
    },
    {
      key: '9',
      description: 'Go to Config',
      action: () => {},
      category: 'navigation',
    },
    // Modal shortcuts
    {
      key: 'K',
      modifiers: ['meta'],
      description: 'Open Command Palette',
      action: () => {},
      category: 'modal',
    },
    {
      key: '?',
      description: 'Show Keyboard Shortcuts',
      action: () => {},
      category: 'modal',
    },
    {
      key: 'Escape',
      description: 'Close Modal / Dialog',
      action: () => {},
      category: 'modal',
    },
    // Action shortcuts (within command palette)
    {
      key: '↑ ↓',
      description: 'Navigate list items',
      action: () => {},
      category: 'action',
    },
    {
      key: 'Enter',
      description: 'Select / Confirm',
      action: () => {},
      category: 'action',
    },
  ];
}
