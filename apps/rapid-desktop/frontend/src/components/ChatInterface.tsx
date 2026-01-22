import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useMcp } from '../hooks/useMcp';
import { Markdown } from './ui/markdown';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatInterface({ isOpen, onClose }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: "Welcome to RAPID. I'm your router agent. Tell me what you want to do and I'll coordinate the right agents to help you.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [routerAgentId, setRouterAgentId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { callTool, spawnAgent } = useMcp();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      // Ensure we have a rapid-router agent spawned
      if (!routerAgentId) {
        const systemMessage: ChatMessage = {
          id: `system-${Date.now()}`,
          role: 'system',
          content: 'Spawning rapid-router agent...',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, systemMessage]);

        // Spawn the rapid-router agent
        await spawnAgent('rapid-router', 'Handle user requests via chat interface');

        // Get the agent ID by checking bus_agents
        const agentsResult = await callTool('bus_agents', { maxAgeSeconds: 10 });
        const agentsData = agentsResult.structuredContent as { agents?: Array<{ id: string; name: string }> };
        const router = agentsData?.agents?.find((a) => a.name === 'rapid-router');

        if (router) {
          setRouterAgentId(router.id);

          const readyMessage: ChatMessage = {
            id: `system-${Date.now()}`,
            role: 'system',
            content: 'Router agent is ready. Processing your request...',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, readyMessage]);
        }
      }

      // Send message to the router agent via event bus
      await callTool('bus_send', {
        type: 'coordination',
        agentId: 'desktop-ui',
        agentName: 'desktop-ui',
        title: 'User Request',
        content: userMessage.content,
        toAgents: routerAgentId ? [routerAgentId] : null, // Broadcast if no specific agent
      });

      // Wait for response by checking bus_messages
      // In a real implementation, we'd use bus_wait or WebSocket streaming
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const messagesResult = await callTool('bus_messages', { limit: 5, brief: false });
      const messagesData = messagesResult.structuredContent as { messages?: Array<{
        id: string;
        fromAgent: { name: string };
        payload: { title?: string; content: string };
        timestamp: string;
      }> };

      // Find the latest response from rapid-router
      const routerResponse = messagesData?.messages?.find(
        (m) => m.fromAgent.name === 'rapid-router'
      );

      if (routerResponse) {
        const assistantMessage: ChatMessage = {
          id: routerResponse.id,
          role: 'assistant',
          content: routerResponse.payload.content || 'Processing your request...',
          timestamp: new Date(routerResponse.timestamp),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        // No response yet, show a placeholder
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: 'I\'m working on your request. You can check the Agents page to see the progress.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }

      setIsProcessing(false);
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'system',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* Chat Container */}
      <div
        className="relative w-full max-w-4xl h-[80vh] bg-rapid-surface/95 backdrop-blur-xl border border-rapid-border/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rapid-border/30 bg-rapid-surface/50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-rapid-accent animate-pulse" />
            <h2 className="text-lg font-mono font-medium text-rapid-text">
              RAPID Router
            </h2>
            <span className="text-xs text-rapid-muted font-mono px-2 py-1 bg-rapid-elevated/50 rounded">
              sonnet-4.5
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-rapid-muted hover:text-rapid-text transition-colors p-2 hover:bg-rapid-elevated/30 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={clsx(
                'flex',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={clsx(
                  'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  message.role === 'user'
                    ? 'bg-rapid-accent text-white'
                    : message.role === 'system'
                      ? 'bg-rapid-elevated/30 text-rapid-muted border border-rapid-border/30'
                      : 'bg-rapid-elevated text-rapid-text'
                )}
              >
                <Markdown>{message.content}</Markdown>
                <div
                  className={clsx(
                    'text-xs mt-2 opacity-60',
                    message.role === 'user' ? 'text-white/70' : 'text-rapid-muted'
                  )}
                >
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-rapid-elevated rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 text-rapid-muted">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-rapid-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-rapid-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-rapid-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-rapid-border/30 bg-rapid-surface/50">
          <div className="flex items-end gap-3">
            <div className="flex-1 bg-rapid-elevated/50 border border-rapid-border/50 rounded-xl focus-within:border-rapid-accent/50 transition-colors">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="What would you like to do?"
                className="w-full px-4 py-3 bg-transparent text-rapid-text placeholder-rapid-muted focus:outline-none"
                disabled={isProcessing}
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isProcessing}
              className={clsx(
                'px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2',
                input.trim() && !isProcessing
                  ? 'bg-rapid-accent text-white hover:bg-rapid-accent-muted shadow-lg shadow-rapid-accent/20'
                  : 'bg-rapid-elevated/50 text-rapid-muted cursor-not-allowed'
              )}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span>Send</span>
            </button>
          </div>
          <div className="flex items-center justify-between mt-3 text-xs text-rapid-muted">
            <span>Press Enter to send, Shift+Enter for new line</span>
            <span className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-rapid-elevated/50 rounded">ESC</kbd>
              to close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook for managing chat interface
export function useChatInterface() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((o) => !o),
  };
}
