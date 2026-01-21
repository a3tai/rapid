import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useAgents, useAppStore } from '../stores/app';
import { useMcp } from '../hooks/useMcp';
import { useToast } from '../components/Toast';
import { useLogStream } from '../hooks/useLogStream';

interface PersonaInfo {
  id: string;
  name: string;
  description: string;
  model?: string;
  capabilities?: string[];
}

const DEFAULT_PERSONAS: PersonaInfo[] = [
  { id: 'orchestrator', name: 'Orchestrator', description: 'Coordinates tasks between agents', model: 'opus' },
  { id: 'worker', name: 'Worker', description: 'Executes development tasks', model: 'haiku' },
  { id: 'architect', name: 'Architect', description: 'Designs system architecture', model: 'sonnet' },
  { id: 'researcher', name: 'Researcher', description: 'Researches and investigates', model: 'haiku' },
];

export function AgentsPage() {
  const agents = useAgents();
  const selectedAgent = useAppStore((s) => s.selectedAgent);
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent);
  const { spawnAgent, stopAgent, callTool, fetchAgents } = useMcp();
  const [showSpawnModal, setShowSpawnModal] = useState(false);
  const [personas, setPersonas] = useState<PersonaInfo[]>(DEFAULT_PERSONAS);
  const [showOutputModal, setShowOutputModal] = useState<{ agentId: string; agentName: string } | null>(null);
  const toast = useToast();

  useEffect(() => {
    const loadPersonas = async () => {
      try {
        const result = await callTool('persona_list', { includePrompts: false });
        const data = result.structuredContent as { personas?: Array<{ name: string; description?: string; model?: string }> };
        if (data?.personas && data.personas.length > 0) {
          setPersonas(data.personas.map(p => ({
            id: p.name,
            name: p.name,
            description: p.description || `${p.name} persona`,
            model: p.model,
          })));
        }
      } catch (err) {
        console.warn('Failed to load personas:', err);
      }
    };
    loadPersonas();
  }, [callTool]);

  const handleStopAgent = async (agentId: string, agentName: string) => {
    try {
      await stopAgent(agentId);
      toast.success('Agent Stopped', `${agentName} has been terminated`);
      await fetchAgents();
    } catch (err) {
      toast.error('Failed to Stop Agent', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleSpawnAgent = async (persona: string, task: string) => {
    try {
      await spawnAgent(persona, task);
      toast.success('Agent Spawned', `${persona} agent started`);
      await fetchAgents();
    } catch (err) {
      toast.error('Failed to Spawn Agent', err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  };

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/4 w-96 h-96 bg-rapid-accent/10 rounded-full blur-[100px] animate-pulse-slow" />
        <div className="absolute -bottom-20 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] animate-pulse-slow" style={{ animationDelay: '-1.5s' }} />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-mono font-normal tracking-wide text-rapid-text">
            Agents
          </h1>
          <p className="text-rapid-muted text-sm mt-1">
            Spawn, monitor, and manage AI agents
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="flex items-center gap-6 mr-4">
            <div className="text-center">
              <div className="text-2xl font-mono text-rapid-text">{agents.length}</div>
              <div className="text-xs text-rapid-muted uppercase tracking-wider">Active</div>
            </div>
            <div className="w-px h-8 bg-rapid-border" />
            <div className="text-center">
              <div className="text-2xl font-mono text-rapid-success">{agents.filter(a => a.session).length}</div>
              <div className="text-xs text-rapid-muted uppercase tracking-wider">Running</div>
            </div>
          </div>

          <button
            onClick={() => setShowSpawnModal(true)}
            className="group relative px-5 py-2.5 rounded-lg font-mono text-sm overflow-hidden"
          >
            {/* Button gradient background */}
            <div className="absolute inset-0 bg-gradient-to-r from-rapid-accent to-purple-500 transition-all duration-300 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent" />
            <div className="relative flex items-center gap-2 text-white font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Spawn Agent
            </div>
          </button>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="relative z-10 flex-1 overflow-auto">
        {agents.length === 0 ? (
          <EmptyState onSpawn={() => setShowSpawnModal(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent, index) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                index={index}
                isSelected={selectedAgent === agent.id}
                onSelect={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
                onStop={() => handleStopAgent(agent.id, agent.name)}
                onViewOutput={() => setShowOutputModal({ agentId: agent.id, agentName: agent.name })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showSpawnModal && (
        <SpawnModal
          onClose={() => setShowSpawnModal(false)}
          onSpawn={handleSpawnAgent}
          personas={personas}
        />
      )}

      {showOutputModal && (
        <OutputModal
          agentId={showOutputModal.agentId}
          agentName={showOutputModal.agentName}
          onClose={() => setShowOutputModal(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ onSpawn }: { onSpawn: () => void }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md">
        {/* Animated icon */}
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div className="absolute inset-0 bg-rapid-accent/20 rounded-2xl blur-xl animate-pulse-slow" />
          <div className="relative w-full h-full bg-rapid-surface/80 border border-rapid-border/50 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            <svg className="w-10 h-10 text-rapid-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        <h3 className="text-lg font-mono text-rapid-text mb-2">No Agents Running</h3>
        <p className="text-rapid-muted text-sm mb-6">
          Spawn an agent to start autonomous development
        </p>

        <button
          onClick={onSpawn}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-rapid-accent hover:bg-rapid-accent-muted text-white font-mono text-sm rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Spawn First Agent
        </button>
      </div>
    </div>
  );
}

interface AgentCardProps {
  agent: { id: string; name: string; worktree?: string; session?: string };
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onStop: () => void;
  onViewOutput: () => void;
}

function AgentCard({ agent, index, isSelected, onSelect, onStop, onViewOutput }: AgentCardProps) {
  const roleConfig: Record<string, { gradient: string; icon: string; color: string }> = {
    orchestrator: {
      gradient: 'from-violet-500 to-purple-600',
      icon: '🎯',
      color: 'text-violet-400'
    },
    worker: {
      gradient: 'from-blue-500 to-cyan-500',
      icon: '⚡',
      color: 'text-blue-400'
    },
    architect: {
      gradient: 'from-amber-500 to-orange-500',
      icon: '🏗️',
      color: 'text-amber-400'
    },
    researcher: {
      gradient: 'from-emerald-500 to-teal-500',
      icon: '🔍',
      color: 'text-emerald-400'
    },
    designer: {
      gradient: 'from-pink-500 to-rose-500',
      icon: '🎨',
      color: 'text-pink-400'
    },
    critic: {
      gradient: 'from-red-500 to-orange-500',
      icon: '⚖️',
      color: 'text-red-400'
    },
  };

  const config = roleConfig[agent.name.toLowerCase()] || {
    gradient: 'from-gray-500 to-gray-600',
    icon: '🤖',
    color: 'text-gray-400'
  };

  return (
    <div
      onClick={onSelect}
      className={clsx(
        'group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300',
        'bg-rapid-surface/40 border border-rapid-border/40 backdrop-blur-sm',
        'hover:bg-rapid-surface/60 hover:border-rapid-border/60 hover:-translate-y-1',
        isSelected && 'ring-2 ring-rapid-accent border-rapid-accent/50'
      )}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      {/* Hover glow effect */}
      <div className={clsx(
        'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300',
        'bg-gradient-to-br', config.gradient, 'blur-xl'
      )} style={{ opacity: 0.05 }} />

      <div className="relative p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className={clsx(
              'w-12 h-12 rounded-xl flex items-center justify-center text-xl',
              'bg-gradient-to-br shadow-lg', config.gradient
            )}>
              {config.icon}
            </div>

            <div>
              <h3 className="font-mono text-rapid-text font-medium capitalize">{agent.name}</h3>
              <p className="text-xs text-rapid-muted font-mono truncate max-w-[140px]">
                {agent.id.substring(0, 20)}...
              </p>
            </div>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-rapid-success/10 border border-rapid-success/20">
            <div className="w-1.5 h-1.5 rounded-full bg-rapid-success animate-pulse" />
            <span className="text-[10px] text-rapid-success font-mono uppercase">Live</span>
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-2 mb-4">
          {agent.worktree && (
            <div className="flex items-center gap-2 text-xs">
              <svg className="w-3.5 h-3.5 text-rapid-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
              </svg>
              <span className="text-rapid-muted">Worktree:</span>
              <span className={clsx('font-mono truncate', config.color)}>{agent.worktree}</span>
            </div>
          )}
          {agent.session && (
            <div className="flex items-center gap-2 text-xs">
              <svg className="w-3.5 h-3.5 text-rapid-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span className="text-rapid-muted">Session:</span>
              <span className="font-mono text-rapid-text/80 truncate">{agent.session}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-3 border-t border-rapid-border/30">
          <button
            onClick={(e) => { e.stopPropagation(); onViewOutput(); }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono text-rapid-muted hover:text-rapid-text hover:bg-rapid-elevated/50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Output
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onStop(); }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
            </svg>
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}

interface SpawnModalProps {
  onClose: () => void;
  onSpawn: (persona: string, task: string) => Promise<void>;
  personas: PersonaInfo[];
}

function SpawnModal({ onClose, onSpawn, personas }: SpawnModalProps) {
  const [selectedPersona, setSelectedPersona] = useState('');
  const [task, setTask] = useState('');
  const [isSpawning, setIsSpawning] = useState(false);

  const handleSpawn = async () => {
    if (!selectedPersona || !task.trim()) return;
    setIsSpawning(true);
    try {
      await onSpawn(selectedPersona, task);
      onClose();
    } catch (err) {
      console.error('Failed to spawn:', err);
    } finally {
      setIsSpawning(false);
    }
  };

  const modelColors: Record<string, string> = {
    opus: 'text-violet-400',
    sonnet: 'text-amber-400',
    haiku: 'text-cyan-400',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-rapid-bg/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-[520px] max-h-[80vh] overflow-auto bg-rapid-surface/90 border border-rapid-border/60 rounded-xl shadow-2xl backdrop-blur-md animate-fade-in">
        {/* Header */}
        <div className="sticky top-0 p-5 border-b border-rapid-border/50 bg-rapid-surface/50 backdrop-blur-sm">
          <h2 className="text-lg font-mono text-rapid-text">Spawn Agent</h2>
          <p className="text-sm text-rapid-muted mt-1">
            Select a persona and describe the task
          </p>
        </div>

        <div className="p-5 space-y-5">
          {/* Persona Grid */}
          <div>
            <label className="block text-xs font-mono text-rapid-muted uppercase tracking-wider mb-3">
              Persona
            </label>
            <div className="grid grid-cols-2 gap-2">
              {personas.map((persona) => (
                <button
                  key={persona.id}
                  onClick={() => setSelectedPersona(persona.id)}
                  className={clsx(
                    'p-3 rounded-lg border text-left transition-all duration-200',
                    selectedPersona === persona.id
                      ? 'border-rapid-accent bg-rapid-accent/10'
                      : 'border-rapid-border/50 bg-rapid-elevated/30 hover:border-rapid-border hover:bg-rapid-elevated/50'
                  )}
                >
                  <div className="font-mono text-sm text-rapid-text capitalize">{persona.name}</div>
                  <div className="text-xs text-rapid-muted mt-0.5 line-clamp-1">{persona.description}</div>
                  {persona.model && (
                    <div className={clsx('text-[10px] font-mono mt-1.5 uppercase', modelColors[persona.model] || 'text-rapid-muted')}>
                      {persona.model}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Task Input */}
          <div>
            <label className="block text-xs font-mono text-rapid-muted uppercase tracking-wider mb-3">
              Task Description
            </label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe what you want the agent to accomplish..."
              className="w-full h-28 px-4 py-3 bg-rapid-elevated/30 border border-rapid-border/50 rounded-lg text-rapid-text placeholder-rapid-muted text-sm resize-none focus:outline-none focus:border-rapid-accent focus:ring-1 focus:ring-rapid-accent transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 p-5 border-t border-rapid-border/50 bg-rapid-surface/50 backdrop-blur-sm flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-mono text-rapid-muted hover:text-rapid-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSpawn}
            disabled={!selectedPersona || !task.trim() || isSpawning}
            className={clsx(
              'px-5 py-2 rounded-lg text-sm font-mono font-medium transition-all duration-200',
              selectedPersona && task.trim() && !isSpawning
                ? 'bg-rapid-accent text-white hover:bg-rapid-accent-muted hover:-translate-y-0.5 hover:shadow-glow'
                : 'bg-rapid-elevated text-rapid-muted cursor-not-allowed'
            )}
          >
            {isSpawning ? 'Spawning...' : 'Spawn Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface OutputModalProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
}

function OutputModal({ agentId, agentName, onClose }: OutputModalProps) {
  const { connected, logs, error, clearLogs } = useLogStream(agentName, true, 2000);
  const [autoScroll, setAutoScroll] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (outputRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
      setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-rapid-bg/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-4xl h-[80vh] flex flex-col bg-rapid-surface/90 border border-rapid-border/60 rounded-xl shadow-2xl backdrop-blur-md animate-fade-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-rapid-border/50 bg-rapid-surface/50">
          <div>
            <h2 className="font-mono text-rapid-text capitalize">{agentName} Output</h2>
            <p className="text-xs text-rapid-muted font-mono">{agentId}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Status */}
            <div className={clsx(
              'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-mono',
              connected
                ? 'bg-rapid-success/10 border border-rapid-success/20 text-rapid-success'
                : 'bg-rapid-warning/10 border border-rapid-warning/20 text-rapid-warning'
            )}>
              <div className={clsx('w-1.5 h-1.5 rounded-full', connected ? 'bg-rapid-success animate-pulse' : 'bg-rapid-warning')} />
              {connected ? 'STREAMING' : 'CONNECTING'}
            </div>

            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={clsx(
                'px-2 py-1 rounded text-xs font-mono transition-colors',
                autoScroll ? 'bg-rapid-accent/20 text-rapid-accent' : 'text-rapid-muted hover:text-rapid-text'
              )}
            >
              Auto-scroll {autoScroll ? 'ON' : 'OFF'}
            </button>

            <button onClick={clearLogs} className="p-1.5 text-rapid-muted hover:text-rapid-text transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>

            <button onClick={onClose} className="p-1.5 text-rapid-muted hover:text-rapid-text transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs font-mono">
            {error}
          </div>
        )}

        {/* Log Output */}
        <div
          ref={outputRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto p-4 bg-black/20 font-mono text-xs leading-relaxed"
        >
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-rapid-muted">
              {connected ? 'Waiting for output...' : 'Connecting to stream...'}
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="text-rapid-text/90 hover:bg-rapid-elevated/30 px-1 -mx-1 rounded">
                {log.line}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-rapid-border/50 bg-rapid-elevated/30 text-xs text-rapid-muted font-mono">
          <span>{logs.length} lines</span>
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
              }}
              className="text-rapid-accent hover:underline"
            >
              Jump to bottom
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
