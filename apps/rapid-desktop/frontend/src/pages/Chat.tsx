import { useState, useEffect, useRef, useMemo } from 'react'
import { clsx } from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import { useAgents, useMessages } from '../stores/app'
import { useWails } from '../hooks/useWails'

const MESSAGE_TYPES = [
  'coordination',
  'discovery',
  'completion',
  'error',
  'question',
  'learning',
] as const

type MessageType = (typeof MESSAGE_TYPES)[number]

export function ChatPage() {
  const agents = useAgents()
  const messages = useMessages()
  const { sendMessage, getChatHistory } = useWails()

  const [selectedAgent, setSelectedAgent] = useState<string>('all')
  const [messageContent, setMessageContent] = useState('')
  const [messageType, setMessageType] = useState<MessageType>('coordination')
  const [isSending, setIsSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [chatHistory, setChatHistory] = useState(messages)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Filter messages based on selected agent and search query
  const filteredMessages = useMemo(() => {
    let result = chatHistory

    if (selectedAgent !== 'all') {
      result = result.filter((m) => m.fromAgent.id === selectedAgent || m.fromAgent.name === selectedAgent)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (m) =>
          m.fromAgent.name.toLowerCase().includes(query) ||
          m.payload.title?.toString().toLowerCase().includes(query) ||
          m.payload.content?.toString().toLowerCase().includes(query)
      )
    }

    return result
  }, [chatHistory, selectedAgent, searchQuery])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filteredMessages])

  // Update chat history from global messages
  useEffect(() => {
    setChatHistory(messages)
  }, [messages])

  // Handle sending message
  const handleSendMessage = async () => {
    if (!messageContent.trim()) {
      return
    }

    setIsSending(true)
    try {
      await sendMessage(selectedAgent === 'all' ? 'all' : selectedAgent, messageType, messageContent)
      setMessageContent('')
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setIsSending(false)
    }
  }

  // Get agent status (mock for now)
  const isAgentOnline = (agentId: string) => {
    return agents.some((a) => a.id === agentId)
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex gap-6 flex-1 overflow-hidden">
        {/* Agent Sidebar */}
        <div className="w-64 flex flex-col border-r border-rapid-border">
          {/* Header */}
          <div className="p-4 border-b border-rapid-border">
            <h3 className="font-semibold mb-4">Agents</h3>
            <button
              onClick={() => setSelectedAgent('all')}
              className={clsx(
                'w-full text-left px-3 py-2 rounded transition-colors mb-2',
                selectedAgent === 'all'
                  ? 'bg-rapid-accent text-white'
                  : 'hover:bg-rapid-elevated text-rapid-text'
              )}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span>Broadcast</span>
              </div>
            </button>
          </div>

          {/* Agent List */}
          <div className="flex-1 overflow-y-auto">
            {agents.length === 0 ? (
              <div className="p-4 text-center text-rapid-muted text-sm">
                No agents available
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent.id)}
                    className={clsx(
                      'w-full text-left px-3 py-2 rounded transition-colors',
                      selectedAgent === agent.id
                        ? 'bg-rapid-accent text-white'
                        : 'hover:bg-rapid-elevated text-rapid-text'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={clsx(
                          'w-2 h-2 rounded-full flex-shrink-0',
                          isAgentOnline(agent.id) ? 'bg-green-400 animate-pulse' : 'bg-gray-500'
                        )}
                      />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{agent.name}</div>
                        {agent.worktree && (
                          <div className="text-xs text-rapid-muted truncate">{agent.worktree}</div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 p-6">
            {filteredMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-rapid-muted">
                <div className="text-center">
                  <p className="text-lg font-medium mb-2">No messages</p>
                  <p className="text-sm">
                    {selectedAgent === 'all'
                      ? 'Send a message to start a conversation'
                      : 'No messages with this agent'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {filteredMessages.map((message) => (
                  <div key={message.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-sm">{message.fromAgent.name}</div>
                      <div className={clsx('text-xs px-2 py-0.5 rounded', getMessageTypeClass(message.type))}>
                        {message.type}
                      </div>
                      <div className="text-xs text-rapid-muted ml-auto">
                        {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
                      </div>
                    </div>
                    <div className="bg-rapid-elevated p-3 rounded text-sm">
                      <div className="font-medium mb-1">{message.payload.title}</div>
                      <div className="text-rapid-text">{message.payload.content}</div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Message Composer */}
          <div className="border-t border-rapid-border p-4 space-y-3">
            {/* Search Bar */}
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rapid-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="input pl-10 w-full text-sm"
              />
            </div>

            {/* Message Type Selector */}
            <div className="flex gap-2 flex-wrap">
              {MESSAGE_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setMessageType(type)}
                  className={clsx(
                    'text-xs px-2 py-1 rounded transition-colors',
                    messageType === type
                      ? 'bg-rapid-accent text-white'
                      : 'bg-rapid-elevated text-rapid-muted hover:text-rapid-text'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Message Input */}
            <textarea
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  handleSendMessage()
                }
              }}
              placeholder="Type your message... (Cmd+Enter to send)"
              className="input w-full resize-none"
              rows={3}
            />

            {/* Send Button */}
            <div className="flex justify-end">
              <button
                onClick={handleSendMessage}
                disabled={isSending || !messageContent.trim()}
                className="btn btn-primary"
              >
                {isSending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getMessageTypeClass(type: string): string {
  const baseClass = 'text-xs font-medium'
  switch (type) {
    case 'coordination':
      return `${baseClass} bg-blue-500/20 text-blue-400`
    case 'discovery':
      return `${baseClass} bg-green-500/20 text-green-400`
    case 'completion':
      return `${baseClass} bg-emerald-500/20 text-emerald-400`
    case 'error':
      return `${baseClass} bg-red-500/20 text-red-400`
    case 'question':
      return `${baseClass} bg-yellow-500/20 text-yellow-400`
    case 'learning':
      return `${baseClass} bg-purple-500/20 text-purple-400`
    default:
      return `${baseClass} bg-rapid-elevated text-rapid-muted`
  }
}
