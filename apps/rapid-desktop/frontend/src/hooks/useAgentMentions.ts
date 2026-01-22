/**
 * Hook for @mention parsing and autocomplete in chat
 *
 * Features:
 * - Parse @mentions from input text
 * - Autocomplete dropdown state management
 * - Keyboard navigation (↑↓ to select, Enter to confirm, Esc to close)
 */

import { useState, useCallback, useMemo } from 'react';
import type { Agent } from '../stores/app';

export interface UseAgentMentionsReturn {
  /** Parsed mentions from input (agent names without @) */
  mentions: string[];
  /** Whether to show the autocomplete dropdown */
  showAutocomplete: boolean;
  /** Text after the last @ for filtering */
  autocompleteQuery: string;
  /** Filtered list of matching agents */
  filteredAgents: Agent[];
  /** Current keyboard selection index */
  selectedIndex: number;
  /** Start position of the current mention being typed */
  mentionStartIndex: number;
  /** Select an agent from the dropdown - returns updated input */
  selectAgent: (agent: Agent, currentInput: string) => string;
  /** Handle input change - updates autocomplete state */
  handleInputChange: (value: string, cursorPosition: number) => void;
  /** Handle keyboard events for navigation */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  /** Reset the autocomplete state */
  resetAutocomplete: () => void;
}

/**
 * Extract @mentions from text
 */
function extractMentions(text: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}

/**
 * Find the @ symbol position being typed at cursor
 */
function findMentionAtCursor(text: string, cursorPosition: number): { start: number; query: string } | null {
  // Look backwards from cursor for @
  let atIndex = -1;
  for (let i = cursorPosition - 1; i >= 0; i--) {
    const char = text[i];
    // Stop if we hit whitespace or another special char
    if (/\s/.test(char)) break;
    if (char === '@') {
      atIndex = i;
      break;
    }
  }

  if (atIndex === -1) return null;

  // Extract the query (text after @ up to cursor)
  const query = text.slice(atIndex + 1, cursorPosition);

  // Only show autocomplete if query is valid (alphanumeric)
  if (!/^\w*$/.test(query)) return null;

  return { start: atIndex, query };
}

export function useAgentMentions(agents: Agent[]): UseAgentMentionsReturn {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [currentInput, setCurrentInput] = useState('');

  // Extract mentions from the current input
  const mentions = useMemo(() => extractMentions(currentInput), [currentInput]);

  // Filter agents based on the autocomplete query
  const filteredAgents = useMemo(() => {
    if (!autocompleteQuery && !showAutocomplete) return agents;

    const query = autocompleteQuery.toLowerCase();
    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.id.toLowerCase().includes(query)
    );
  }, [agents, autocompleteQuery, showAutocomplete]);

  // Handle input change and update autocomplete state
  const handleInputChange = useCallback(
    (value: string, cursorPosition: number) => {
      setCurrentInput(value);

      const mentionInfo = findMentionAtCursor(value, cursorPosition);

      if (mentionInfo) {
        setShowAutocomplete(true);
        setAutocompleteQuery(mentionInfo.query);
        setMentionStartIndex(mentionInfo.start);
        // Reset selection when query changes
        if (mentionInfo.query !== autocompleteQuery) {
          setSelectedIndex(0);
        }
      } else {
        setShowAutocomplete(false);
        setAutocompleteQuery('');
        setMentionStartIndex(-1);
      }
    },
    [autocompleteQuery]
  );

  // Select an agent and insert the mention
  const selectAgent = useCallback(
    (agent: Agent, input: string): string => {
      if (mentionStartIndex === -1) return input;

      // Replace the @query with @agentname
      const before = input.slice(0, mentionStartIndex);
      const afterCursor = input.slice(mentionStartIndex + 1 + autocompleteQuery.length);
      const newInput = `${before}@${agent.name}${afterCursor ? ' ' + afterCursor.trimStart() : ' '}`;

      // Reset autocomplete state
      setShowAutocomplete(false);
      setAutocompleteQuery('');
      setMentionStartIndex(-1);
      setSelectedIndex(0);
      setCurrentInput(newInput);

      return newInput;
    },
    [mentionStartIndex, autocompleteQuery]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!showAutocomplete || filteredAgents.length === 0) return false;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredAgents.length);
          return true;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredAgents.length) % filteredAgents.length);
          return true;

        case 'Tab':
        case 'Enter':
          if (filteredAgents[selectedIndex]) {
            e.preventDefault();
            // Return true to indicate the event was handled
            // The caller should call selectAgent with the current input
            return true;
          }
          return false;

        case 'Escape':
          e.preventDefault();
          setShowAutocomplete(false);
          setAutocompleteQuery('');
          setMentionStartIndex(-1);
          return true;

        default:
          return false;
      }
    },
    [showAutocomplete, filteredAgents, selectedIndex]
  );

  // Reset autocomplete state
  const resetAutocomplete = useCallback(() => {
    setShowAutocomplete(false);
    setAutocompleteQuery('');
    setMentionStartIndex(-1);
    setSelectedIndex(0);
    setCurrentInput('');
  }, []);

  return {
    mentions,
    showAutocomplete,
    autocompleteQuery,
    filteredAgents,
    selectedIndex,
    mentionStartIndex,
    selectAgent,
    handleInputChange,
    handleKeyDown,
    resetAutocomplete,
  };
}
