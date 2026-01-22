/**
 * MessageComposer - Input with @mention autocomplete
 *
 * Handles message composition with @mention support.
 * Following RAPID design guidelines.
 */

import { useRef, useCallback, useState } from 'react';
import { clsx } from 'clsx';
import { MentionDropdown } from './MentionDropdown';
import { useAgentMentions } from '../../hooks/useAgentMentions';
import type { Agent } from '../../stores/app';

export interface MessageComposerProps {
  agents: Agent[];
  onSend: (content: string, mentions: string[]) => Promise<void>;
  isSending?: boolean;
  placeholder?: string;
}

export function MessageComposer({
  agents,
  onSend,
  isSending = false,
  placeholder = 'Message @orchestrator, @worker...',
}: MessageComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  const {
    mentions,
    showAutocomplete,
    filteredAgents,
    selectedIndex,
    selectAgent,
    handleInputChange,
    handleKeyDown: handleMentionKeyDown,
    resetAutocomplete,
  } = useAgentMentions(agents);

  // Handle input change
  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const cursorPosition = e.target.selectionStart || value.length;
      setInputValue(value);
      handleInputChange(value, cursorPosition);
    },
    [handleInputChange]
  );

  // Handle agent selection from dropdown
  const onAgentSelect = useCallback(
    (agent: Agent) => {
      const newValue = selectAgent(agent, inputValue);
      setInputValue(newValue);

      // Focus and move cursor to end
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newValue.length, newValue.length);
        }
      }, 0);
    },
    [selectAgent, inputValue]
  );

  // Handle keyboard events
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // First check if mention autocomplete wants to handle it
      const handled = handleMentionKeyDown(e);

      if (handled) {
        // If Tab/Enter was pressed with autocomplete open, select the agent
        if ((e.key === 'Tab' || e.key === 'Enter') && filteredAgents[selectedIndex]) {
          onAgentSelect(filteredAgents[selectedIndex]);
        }
        return;
      }

      // Handle send on Enter (without Shift)
      if (e.key === 'Enter' && !e.shiftKey && !showAutocomplete) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleMentionKeyDown, filteredAgents, selectedIndex, onAgentSelect, showAutocomplete]
  );

  // Handle send
  const handleSend = useCallback(async () => {
    const content = inputValue.trim();
    if (!content || isSending) return;

    try {
      await onSend(content, mentions);
      setInputValue('');
      resetAutocomplete();
    } catch (err) {
      console.error('[MessageComposer] Failed to send:', err);
    }
  }, [inputValue, isSending, onSend, mentions, resetAutocomplete]);

  // Handle hover on dropdown item
  const onHover = useCallback((_index: number) => {
    // The useAgentMentions hook handles selection state
    // We don't need to do anything here for now
  }, []);

  return (
    <div className="px-4 py-3 border-t border-rapid-border/30">
      <div className="relative">
        {/* Mention autocomplete dropdown */}
        {showAutocomplete && (
          <MentionDropdown
            agents={filteredAgents}
            selectedIndex={selectedIndex}
            onSelect={onAgentSelect}
            onHover={onHover}
          />
        )}

        {/* Input container */}
        <div
          className={clsx(
            'flex items-center gap-2',
            'bg-rapid-elevated/50 border border-rapid-border/50 rounded-lg',
            'px-3 py-2',
            'focus-within:border-rapid-accent/50 focus-within:ring-1 focus-within:ring-rapid-accent/20',
            'transition-all duration-150'
          )}
        >
          {/* @ icon */}
          <span className="text-rapid-muted text-sm">[@]</span>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={isSending}
            className={clsx(
              'flex-1 bg-transparent border-none outline-none',
              'text-sm text-rapid-text placeholder-rapid-muted',
              'font-mono',
              isSending && 'opacity-50'
            )}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={isSending || !inputValue.trim()}
            className={clsx(
              'px-3 py-1.5 rounded-md text-sm font-mono font-medium',
              'transition-all duration-150',
              inputValue.trim() && !isSending
                ? 'bg-rapid-accent text-white hover:bg-rapid-accent-muted'
                : 'bg-rapid-elevated/50 text-rapid-muted cursor-not-allowed'
            )}
          >
            {isSending ? (
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </span>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="mt-2 text-[10px] text-rapid-muted">
        Press <kbd className="px-1 py-0.5 bg-rapid-elevated rounded text-[9px]">Enter</kbd> to
        send · <kbd className="px-1 py-0.5 bg-rapid-elevated rounded text-[9px]">@</kbd> to
        mention agents
      </div>
    </div>
  );
}

export default MessageComposer;
