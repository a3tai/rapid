/**
 * Chat Page - Slack-Inspired Agent Communication
 *
 * Three-panel layout:
 * - Left: Agent sidebar (260px)
 * - Center: Conversation timeline (flex-1, min 400px)
 * - Right: Agent brain panel (400px, collapsible)
 *
 * Following RAPID design guidelines with Slack UX patterns.
 */

import { useState, useMemo, useCallback } from 'react';
import { useAgents } from '../stores/app';
import { useConversation } from '../hooks/useConversation';
import { AgentSidebar, ConversationPane, AgentBrainPanel, MessageComposer } from '../components/chat';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, SlidersHorizontal } from 'lucide-react';

export function ChatPage() {
  const agents = useAgents();
  const { messages, sendMessage, isSending } = useConversation();

  // Selected agent for brain panel
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Get the selected agent object
  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    return agents.find((a) => a.id === selectedAgentId) || null;
  }, [selectedAgentId, agents]);

  // Handle agent selection
  const handleSelectAgent = useCallback((agentId: string | null) => {
    setSelectedAgentId(agentId);
  }, []);

  // Handle close brain panel
  const handleCloseBrainPanel = useCallback(() => {
    setSelectedAgentId(null);
  }, []);

  // Handle send message
  const handleSendMessage = useCallback(
    async (content: string, mentions: string[]) => {
      await sendMessage(content, mentions);
    },
    [sendMessage]
  );

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-border/30 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-mono font-normal tracking-wide">RAPID Chat</h1>
          <Badge variant="secondary" className="font-mono">
            {agents.length} agents · {messages.length} messages
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Search button */}
          <Button variant="outline" size="sm" className="gap-2 font-mono">
            <kbd className="text-xs opacity-70">⌘K</kbd>
            <Search className="w-4 h-4" />
            <span>Search</span>
          </Button>

          {/* Filter button */}
          <Button variant="outline" size="sm" className="gap-2 font-mono">
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filter</span>
          </Button>
        </div>
      </div>

      {/* Main three-panel layout */}
      <div className="relative z-10 flex-1 flex min-h-0">
        {/* Left: Agent Sidebar */}
        <AgentSidebar
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
        />

        {/* Center: Conversation */}
        <div className="flex-1 flex flex-col min-w-[400px] min-h-0">
          <ConversationPane messages={messages} isLoading={isSending} />

          {/* Message Composer */}
          <MessageComposer
            agents={agents}
            onSend={handleSendMessage}
            isSending={isSending}
          />
        </div>

        {/* Right: Agent Brain Panel (collapsible) */}
        {selectedAgentId && (
          <AgentBrainPanel agent={selectedAgent} onClose={handleCloseBrainPanel} />
        )}
      </div>
    </div>
  );
}

export default ChatPage;
