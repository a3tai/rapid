/**
 * Hook for unified conversation management in chat
 *
 * Combines user messages with agent event bus messages into a single
 * chronological timeline for display.
 */

import { useState, useCallback, useMemo } from 'react';
import { useMessages } from '../stores/app';
import { useData } from './useData';
import type { Agent, Message, Task } from '../stores/app';

export type MessageType =
  | 'coordination'
  | 'question'
  | 'discovery'
  | 'completion'
  | 'error'
  | 'learning'
  | 'heartbeat'
  | 'suggestion'
  | 'vote';

export interface ConversationMessage {
  id: string;
  timestamp: string;
  /** 'user' for user messages, Agent object for agent messages */
  sender: 'user' | Agent;
  /** The message content */
  content: string;
  /** Extracted @mentions from the content */
  mentions: string[];
  /** Message type for agent messages */
  messageType?: MessageType;
  /** Title for agent messages (from payload) */
  title?: string;
  /** Rich embeds */
  embeds?: {
    tasks?: Task[];
    code?: { language: string; content: string }[];
  };
}

export interface UseConversationReturn {
  /** All messages in chronological order (oldest first) */
  messages: ConversationMessage[];
  /** Send a message to agents */
  sendMessage: (content: string, mentions: string[], messageType?: MessageType) => Promise<void>;
  /** Whether a message is being sent */
  isSending: boolean;
  /** Error from last send attempt */
  sendError: string | null;
  /** Clear the send error */
  clearError: () => void;
}

/** Extract @mentions from text */
function extractMentions(text: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}

/** Local storage key for user messages */
const USER_MESSAGES_KEY = 'rapid-chat-user-messages';

/** Load user messages from local storage */
function loadUserMessages(): ConversationMessage[] {
  try {
    const stored = localStorage.getItem(USER_MESSAGES_KEY);
    if (stored) {
      const messages = JSON.parse(stored);
      // Filter out old messages (keep last 24 hours)
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      return messages.filter(
        (m: ConversationMessage) => new Date(m.timestamp).getTime() > cutoff
      );
    }
  } catch (e) {
    console.error('[useConversation] Failed to load user messages:', e);
  }
  return [];
}

/** Save user messages to local storage */
function saveUserMessages(messages: ConversationMessage[]) {
  try {
    // Keep only last 100 user messages
    const toSave = messages.slice(-100);
    localStorage.setItem(USER_MESSAGES_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error('[useConversation] Failed to save user messages:', e);
  }
}

export function useConversation(): UseConversationReturn {
  const agentMessages = useMessages();
  const { sendMessage: sendToEventBus } = useData();

  // User messages stored locally (persisted to localStorage)
  const [userMessages, setUserMessages] = useState<ConversationMessage[]>(() => loadUserMessages());
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Convert agent messages to ConversationMessage format
  const convertedAgentMessages = useMemo((): ConversationMessage[] => {
    return agentMessages.map((msg: Message): ConversationMessage => ({
      id: msg.id,
      timestamp: msg.timestamp,
      sender: msg.fromAgent,
      content: msg.payload?.content || '',
      mentions: extractMentions(msg.payload?.content || ''),
      messageType: msg.type,
      title: msg.payload?.title,
    }));
  }, [agentMessages]);

  // Combine and sort all messages chronologically
  const messages = useMemo((): ConversationMessage[] => {
    const all = [...userMessages, ...convertedAgentMessages];
    // Sort oldest first for display
    return all.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [userMessages, convertedAgentMessages]);

  // Send a message
  const sendMessage = useCallback(
    async (content: string, mentions: string[], messageType: MessageType = 'coordination') => {
      if (!content.trim()) return;

      setIsSending(true);
      setSendError(null);

      // Create user message immediately for optimistic UI
      const userMessage: ConversationMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: new Date().toISOString(),
        sender: 'user',
        content: content.trim(),
        mentions,
      };

      // Add to local state
      setUserMessages((prev) => {
        const updated = [...prev, userMessage];
        saveUserMessages(updated);
        return updated;
      });

      try {
        // Send to event bus
        // The sendMessage function expects (messageType, title, content)
        const title = mentions.length > 0 ? `To: @${mentions.join(', @')}` : 'User message';
        await sendToEventBus(messageType, title, content);
      } catch (err) {
        console.error('[useConversation] Failed to send message:', err);
        setSendError(err instanceof Error ? err.message : 'Failed to send message');
      } finally {
        setIsSending(false);
      }
    },
    [sendToEventBus]
  );

  const clearError = useCallback(() => {
    setSendError(null);
  }, []);

  return {
    messages,
    sendMessage,
    isSending,
    sendError,
    clearError,
  };
}
