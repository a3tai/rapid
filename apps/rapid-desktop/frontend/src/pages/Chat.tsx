import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useAgents, useMessages } from '../stores/app';
import { useMcp } from '../hooks/useMcp';
import { useLogStream } from '../hooks/useLogStream';

const MESSAGE_TYPES = [
  'coordination',
  'question',
  'discovery',
  'completion',
  'error',
  'learning',
] as const;

type MessageType = (typeof MESSAGE_TYPES)[number];

export function ChatPage() {
  const agents = useAgents();
  const messages = useMessages();
  const { sendMessage } = useMcp();

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('coordination');
  const [isSending, setIsSending] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Stream from selected agent or first available
  const streamAgentName = useMemo(() => {
    if (selectedAgent) {
      const agent = agents.find(a => a.id === selectedAgent);
      return agent?.name || null;
    }
    return agents[0]?.name || null;
  }, [selectedAgent, agents]);

  // Real-time log streaming
  const { connected, logs, error: streamError, clearLogs } = useLogStream(
    streamAgentName,
    true,
    1000
  );

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length]);

  const handleSendMessage = useCallback(async () => {
    if (!messageContent.trim() || isSending) return;
    setIsSending(true);
    try {
      await sendMessage(messageType, `${messageType} message`, messageContent);
      setMessageContent('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  }, [messageContent, messageType, isSending, sendMessage]);

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 right-1/4 w-96 h-96 bg-rapid-accent/5 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-mono font-normal tracking-wide text-rapid-text">
              Agent Output
            </h1>
            <p className="text-rapid-muted text-sm">Real-time streaming from agents</p>
          </div>

          {/* Connection Status */}
          <div className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono',
            connected
              ? 'bg-rapid-success/10 text-rapid-success border border-rapid-success/30'
              : 'bg-rapid-warning/10 text-rapid-warning border border-rapid-warning/30'
          )}>
            <div className={clsx(
              'w-2 h-2 rounded-full',
              connected ? 'bg-rapid-success animate-pulse' : 'bg-rapid-warning'
            )} />
            {connected ? 'STREAMING' : streamAgentName ? 'CONNECTING' : 'NO AGENT'}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Agent selector */}
          <select
            value={selectedAgent || ''}
            onChange={(e) => setSelectedAgent(e.target.value || null)}
            className="text-sm bg-rapid-elevated/50 border border-rapid-border/50 rounded-lg px-3 py-2 font-mono text-rapid-text"
          >
            <option value="">Auto (first agent)</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>

          <button
            onClick={clearLogs}
            className="px-3 py-2 text-sm font-mono text-rapid-muted hover:text-rapid-text bg-rapid-elevated/30 hover:bg-rapid-elevated/50 rounded-lg transition-colors"
          >
            Clear
          </button>

          <button
            onClick={() => setShowMessages(!showMessages)}
            className={clsx(
              'px-3 py-2 text-sm font-mono rounded-lg transition-colors',
              showMessages
                ? 'bg-rapid-accent text-white'
                : 'text-rapid-muted hover:text-rapid-text bg-rapid-elevated/30 hover:bg-rapid-elevated/50'
            )}
          >
            {showMessages ? 'Hide Messages' : 'Messages'} ({messages.length})
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex gap-4 min-h-0">
        {/* Terminal Output - Main Focus */}
        <div className="flex-1 flex flex-col min-h-0 rounded-xl overflow-hidden border border-rapid-border/40 bg-[#0a0a0f]">
          {/* Terminal Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-rapid-surface/50 border-b border-rapid-border/30">
            <div className="flex items-center gap-3">
              {/* macOS-style buttons */}
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs font-mono text-rapid-muted">
                {streamAgentName ? `agent-${streamAgentName}.log` : 'waiting for agent...'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-rapid-muted">
              <span>{logs.length} lines</span>
            </div>
          </div>

          {/* Terminal Content */}
          <div className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed">
            {streamError ? (
              <div className="text-red-400 py-8 text-center">
                <div className="text-lg mb-2">Connection Error</div>
                <div className="text-sm opacity-70">{streamError}</div>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-rapid-muted py-8 text-center">
                <div className="text-lg mb-2">
                  {!streamAgentName ? 'No Agents Running' : 'Waiting for output...'}
                </div>
                <div className="text-sm opacity-70">
                  {!streamAgentName
                    ? 'Spawn an agent to see real-time output'
                    : 'Agent output will appear here as it runs'}
                </div>
              </div>
            ) : (
              <>
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'hover:bg-white/5 px-1 -mx-1 rounded',
                      // Color code based on content
                      log.line.includes('error') || log.line.includes('Error') || log.line.includes('ERROR')
                        ? 'text-red-400' :
                      log.line.includes('warning') || log.line.includes('Warning') || log.line.includes('WARN')
                        ? 'text-yellow-400' :
                      log.line.includes('success') || log.line.includes('Success') || log.line.includes('✓') || log.line.includes('completed')
                        ? 'text-green-400' :
                      log.line.includes('───') || log.line.includes('═══') || log.line.includes('***')
                        ? 'text-rapid-accent' :
                      log.line.startsWith('>')  || log.line.startsWith('$')
                        ? 'text-cyan-400' :
                      log.line.includes('Read(') || log.line.includes('Edit(') || log.line.includes('Bash(')
                        ? 'text-purple-400' :
                      'text-rapid-text/90'
                    )}
                  >
                    {log.line}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </>
            )}
          </div>
        </div>

        {/* Messages Panel - Collapsible */}
        {showMessages && (
          <div className="w-80 flex flex-col rounded-xl overflow-hidden border border-rapid-border/40 bg-rapid-surface/30 backdrop-blur-sm flex-shrink-0">
            <div className="px-4 py-3 border-b border-rapid-border/30 bg-rapid-surface/50">
              <span className="text-sm font-mono text-rapid-text">Event Bus Messages</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.length === 0 ? (
                <div className="text-xs text-rapid-muted text-center py-8">No messages</div>
              ) : (
                messages.slice(0, 50).map((msg) => (
                  <div key={msg.id} className="text-xs bg-rapid-elevated/30 rounded-lg p-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-medium text-rapid-text">{msg.fromAgent.name}</span>
                      <span className={clsx(
                        'px-1.5 py-0.5 rounded text-[10px] font-mono',
                        msg.type === 'error' ? 'bg-red-500/20 text-red-400' :
                        msg.type === 'completion' ? 'bg-green-500/20 text-green-400' :
                        msg.type === 'discovery' ? 'bg-purple-500/20 text-purple-400' :
                        msg.type === 'coordination' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-rapid-border text-rapid-muted'
                      )}>{msg.type}</span>
                      <span className="text-rapid-muted ml-auto text-[10px]">
                        {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                    {msg.payload.title && (
                      <div className="font-medium text-rapid-text mb-0.5">{msg.payload.title}</div>
                    )}
                    <div className="text-rapid-muted line-clamp-3">{msg.payload.content}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Message Composer - Bottom Bar */}
      <div className="relative z-10 mt-4 flex-shrink-0">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-rapid-surface/30 border border-rapid-border/40 backdrop-blur-sm">
          <select
            value={messageType}
            onChange={(e) => setMessageType(e.target.value as MessageType)}
            className="text-xs bg-rapid-elevated/50 border border-rapid-border/50 rounded-lg px-3 py-2 font-mono text-rapid-muted"
          >
            {MESSAGE_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <input
            type="text"
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
            placeholder="Send a message to agents on the event bus..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-rapid-text placeholder-rapid-muted"
          />

          <button
            onClick={handleSendMessage}
            disabled={isSending || !messageContent.trim()}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-mono font-medium transition-all',
              messageContent.trim() && !isSending
                ? 'bg-rapid-accent text-white hover:bg-rapid-accent-muted'
                : 'bg-rapid-elevated/50 text-rapid-muted cursor-not-allowed'
            )}
          >
            {isSending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
