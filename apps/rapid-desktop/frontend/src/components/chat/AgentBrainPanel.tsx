/**
 * AgentBrainPanel - Right panel showing agent's "brain" (real-time logs)
 *
 * Displays live streaming logs from the selected agent.
 * "Teleport into agent's brain" - see what they're thinking/doing.
 */

import { useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useLogStream } from '../../hooks/useLogStream';
import type { Agent } from '../../stores/app';

export interface AgentBrainPanelProps {
  agent: Agent | null;
  onClose: () => void;
}

/** Color code log lines based on content */
function getLogLineColor(line: string): string {
  if (line.includes('error') || line.includes('Error') || line.includes('ERROR')) {
    return 'text-red-400';
  }
  if (line.includes('warning') || line.includes('Warning') || line.includes('WARN')) {
    return 'text-yellow-400';
  }
  if (line.includes('success') || line.includes('Success') || line.includes('✓') || line.includes('completed')) {
    return 'text-green-400';
  }
  if (line.includes('───') || line.includes('═══') || line.includes('***')) {
    return 'text-rapid-accent';
  }
  if (line.startsWith('>') || line.startsWith('$')) {
    return 'text-cyan-400';
  }
  if (line.includes('Read(') || line.includes('Edit(') || line.includes('Bash(') || line.includes('Write(')) {
    return 'text-purple-400';
  }
  return 'text-rapid-text/90';
}

/** Generate avatar gradient based on name */
function getAvatarGradient(name: string): string {
  const gradients = [
    'from-violet-500 to-blue-500',
    'from-blue-500 to-cyan-500',
    'from-cyan-500 to-teal-500',
    'from-teal-500 to-green-500',
    'from-green-500 to-lime-500',
    'from-amber-500 to-orange-500',
    'from-orange-500 to-red-500',
    'from-red-500 to-pink-500',
    'from-pink-500 to-purple-500',
    'from-purple-500 to-violet-500',
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return gradients[Math.abs(hash) % gradients.length];
}

export function AgentBrainPanel({ agent, onClose }: AgentBrainPanelProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Stream logs from the selected agent
  const { logs, connected, error, clearLogs } = useLogStream(agent?.name || null, !!agent, 500);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length]);

  if (!agent) {
    return (
      <div
        className={clsx(
          'w-[400px] flex-shrink-0 flex flex-col',
          'bg-rapid-surface border-l border-rapid-border/50',
          'items-center justify-center text-center p-8'
        )}
      >
        <div className="w-12 h-12 rounded-full bg-rapid-elevated/50 flex items-center justify-center mb-3">
          <span className="text-xl">🧠</span>
        </div>
        <p className="text-sm text-rapid-muted">
          Select an agent to view their brain
        </p>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'w-[400px] flex-shrink-0 flex flex-col',
        'bg-rapid-surface border-l border-rapid-border/50',
        'animate-slide-in-right'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-rapid-border/30">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className={clsx(
              'w-8 h-8 rounded flex items-center justify-center',
              'text-white text-xs font-semibold',
              `bg-gradient-to-br ${getAvatarGradient(agent.name)}`
            )}
          >
            {agent.name.slice(0, 2).toUpperCase()}
          </div>

          <div>
            <div className="font-mono font-medium text-rapid-text text-sm">
              {agent.name}
            </div>
            {agent.worktree && (
              <div className="text-[10px] text-rapid-muted">{agent.worktree}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live indicator */}
          <div
            className={clsx(
              'flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono',
              connected
                ? 'bg-rapid-success/10 text-rapid-success'
                : 'bg-rapid-warning/10 text-rapid-warning'
            )}
          >
            <div
              className={clsx(
                'w-1.5 h-1.5 rounded-full',
                connected ? 'bg-rapid-success animate-pulse' : 'bg-rapid-warning'
              )}
            />
            {connected ? 'LIVE' : 'CONNECTING'}
          </div>

          {/* Clear button */}
          <button
            onClick={clearLogs}
            className="p-1.5 text-rapid-muted hover:text-rapid-text hover:bg-rapid-elevated rounded transition-colors"
            title="Clear logs"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 text-rapid-muted hover:text-rapid-text hover:bg-rapid-elevated rounded transition-colors"
            title="Close panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed bg-[#0a0a0f]">
        {error ? (
          <div className="text-red-400 py-8 text-center">
            <div className="text-lg mb-2">Connection Error</div>
            <div className="text-sm opacity-70">{error}</div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-rapid-muted py-8 text-center">
            <div className="text-lg mb-2">Waiting for output...</div>
            <div className="text-sm opacity-70">
              Agent output will appear here as it runs
            </div>
          </div>
        ) : (
          <>
            {logs.map((log, i) => (
              <div
                key={i}
                className={clsx(
                  'hover:bg-white/5 px-1 -mx-1 rounded',
                  getLogLineColor(log.line)
                )}
              >
                {log.line}
              </div>
            ))}
            <div ref={logsEndRef} />
          </>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-2 border-t border-rapid-border/30 bg-rapid-surface/50">
        <div className="flex items-center justify-between text-[10px] text-rapid-muted font-mono">
          <span>{logs.length} lines</span>
          <span>Agent ID: {agent.id.slice(0, 8)}...</span>
        </div>
      </div>
    </div>
  );
}

export default AgentBrainPanel;
