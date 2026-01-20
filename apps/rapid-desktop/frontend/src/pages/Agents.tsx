import { useState } from 'react'
import { clsx } from 'clsx'
import { useAgents, useAppStore } from '../stores/app'
import { useWails } from '../hooks/useWails'
import { useToast } from '../components/Toast'

const PERSONAS = [
  { id: 'orchestrator', name: 'Orchestrator', description: 'Coordinates tasks between agents' },
  { id: 'worker', name: 'Worker', description: 'Executes development tasks' },
  { id: 'designer', name: 'Designer', description: 'Researches and plans implementations' },
  { id: 'reviewer', name: 'Reviewer', description: 'Reviews code and provides feedback' },
]

export function AgentsPage() {
  const agents = useAgents()
  const selectedAgent = useAppStore((s) => s.selectedAgent)
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent)
  const { spawnAgent, stopAgent } = useWails()
  const [showSpawnModal, setShowSpawnModal] = useState(false)
  const toast = useToast()

  const handleStopAgent = async (agentId: string, agentName: string) => {
    try {
      await stopAgent(agentId)
      toast.success('Agent Stopped', `${agentName} has been terminated`)
    } catch (err) {
      toast.error('Failed to Stop Agent', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleSpawnAgent = async (persona: string, worktree: string) => {
    try {
      await spawnAgent(persona, worktree)
      toast.success('Agent Spawned', `${persona} agent started on ${worktree}`)
    } catch (err) {
      toast.error('Failed to Spawn Agent', err instanceof Error ? err.message : 'Unknown error')
      throw err
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Agent Management</h2>
          <p className="text-rapid-muted text-sm mt-1">
            Spawn, monitor, and manage AI agents
          </p>
        </div>
        <button
          onClick={() => setShowSpawnModal(true)}
          className="btn btn-primary"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Spawn Agent
        </button>
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-3 gap-4">
        {agents.length === 0 ? (
          <div className="col-span-3 card p-12 text-center">
            <div className="text-rapid-muted">
              <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-lg font-medium">No agents running</p>
              <p className="text-sm mt-1">Spawn an agent to get started</p>
            </div>
          </div>
        ) : (
          agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={selectedAgent === agent.id}
              onSelect={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
              onStop={() => handleStopAgent(agent.id, agent.name)}
            />
          ))
        )}
      </div>

      {/* Spawn modal */}
      {showSpawnModal && (
        <SpawnModal
          onClose={() => setShowSpawnModal(false)}
          onSpawn={handleSpawnAgent}
        />
      )}
    </div>
  )
}

interface AgentCardProps {
  agent: { id: string; name: string; worktree?: string; session?: string }
  isSelected: boolean
  onSelect: () => void
  onStop: () => void
}

function AgentCard({ agent, isSelected, onSelect, onStop }: AgentCardProps) {
  const personaColors: Record<string, string> = {
    orchestrator: 'from-purple-500 to-indigo-600',
    worker: 'from-blue-500 to-cyan-600',
    designer: 'from-pink-500 to-rose-600',
    reviewer: 'from-green-500 to-emerald-600',
  }

  const gradient = personaColors[agent.name] || 'from-gray-500 to-gray-600'

  return (
    <div
      className={clsx(
        'card p-4 cursor-pointer transition-all',
        isSelected && 'ring-2 ring-rapid-accent'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center',
              gradient
            )}
          >
            <span className="text-white font-semibold text-sm">
              {agent.name[0].toUpperCase()}
            </span>
          </div>
          <div>
            <div className="font-semibold capitalize">{agent.name}</div>
            <div className="text-xs text-rapid-muted font-mono">{agent.id}</div>
          </div>
        </div>
        <div className="status-dot status-dot-active" />
      </div>

      <div className="mt-4 space-y-2">
        {agent.worktree && (
          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-rapid-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
            </svg>
            <span className="text-rapid-muted">Worktree:</span>
            <span className="font-mono text-rapid-accent">{agent.worktree}</span>
          </div>
        )}
        {agent.session && (
          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-rapid-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span className="text-rapid-muted">Session:</span>
            <span className="font-mono truncate">{agent.session}</span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-rapid-border flex gap-2">
        <button
          className="btn btn-ghost text-sm flex-1"
          onClick={(e) => {
            e.stopPropagation()
            // View logs action
          }}
        >
          View Logs
        </button>
        <button
          className="btn btn-ghost text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10"
          onClick={(e) => {
            e.stopPropagation()
            onStop()
          }}
        >
          Stop
        </button>
      </div>
    </div>
  )
}

interface SpawnModalProps {
  onClose: () => void
  onSpawn: (persona: string, worktree: string) => Promise<void>
}

function SpawnModal({ onClose, onSpawn }: SpawnModalProps) {
  const [selectedPersona, setSelectedPersona] = useState('')
  const [worktree, setWorktree] = useState('main')
  const [isSpawning, setIsSpawning] = useState(false)

  const handleSpawn = async () => {
    if (!selectedPersona) return
    setIsSpawning(true)
    try {
      await onSpawn(selectedPersona, worktree)
      onClose()
    } catch (err) {
      console.error('Failed to spawn agent:', err)
    } finally {
      setIsSpawning(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card-elevated w-[480px] max-h-[80vh] overflow-auto animate-fade-in">
        <div className="p-4 border-b border-rapid-border">
          <h3 className="text-lg font-semibold">Spawn Agent</h3>
          <p className="text-sm text-rapid-muted mt-1">
            Select a persona and worktree for the new agent
          </p>
        </div>

        <div className="p-4 space-y-4">
          {/* Persona selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Persona</label>
            <div className="grid grid-cols-2 gap-2">
              {PERSONAS.map((persona) => (
                <button
                  key={persona.id}
                  onClick={() => setSelectedPersona(persona.id)}
                  className={clsx(
                    'p-3 rounded-lg border text-left transition-colors',
                    selectedPersona === persona.id
                      ? 'border-rapid-accent bg-rapid-accent/10'
                      : 'border-rapid-border bg-rapid-elevated hover:bg-rapid-border'
                  )}
                >
                  <div className="font-medium text-sm">{persona.name}</div>
                  <div className="text-xs text-rapid-muted mt-0.5">
                    {persona.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Worktree input */}
          <div>
            <label className="block text-sm font-medium mb-2">Worktree</label>
            <input
              type="text"
              value={worktree}
              onChange={(e) => setWorktree(e.target.value)}
              placeholder="main"
              className="input w-full"
            />
            <p className="text-xs text-rapid-muted mt-1">
              Branch or worktree name for the agent to work in
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-rapid-border flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleSpawn}
            disabled={!selectedPersona || isSpawning}
            className="btn btn-primary disabled:opacity-50"
          >
            {isSpawning ? 'Spawning...' : 'Spawn Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
