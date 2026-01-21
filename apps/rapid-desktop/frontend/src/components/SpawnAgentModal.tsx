import { useState, useCallback, useEffect } from 'react';
import { useMcp } from '../hooks/useMcp';

interface Persona {
  name: string;
  description?: string;
}

interface SpawnAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  type?: 'worker' | 'orchestrator';
}

/**
 * Modal for spawning new agents (workers or orchestrators)
 */
export function SpawnAgentModal({ isOpen, onClose, type = 'worker' }: SpawnAgentModalProps) {
  const [selectedPersona, setSelectedPersona] = useState('worker');
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [task, setTask] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { spawnAgent, callTool } = useMcp();

  // Fetch available personas when modal opens
  useEffect(() => {
    if (isOpen) {
      callTool('persona_list', {})
        .then((result) => {
          const data = result.structuredContent as { personas?: Persona[] };
          if (data?.personas) {
            setPersonas(data.personas);
            // Set default based on type
            const defaultPersona = type === 'orchestrator' ? 'orchestrator' : 'worker';
            const hasDefault = data.personas.some((p) => p.name === defaultPersona);
            setSelectedPersona(hasDefault ? defaultPersona : data.personas[0]?.name || 'worker');
          }
        })
        .catch(console.error);
    }
  }, [isOpen, type, callTool]);

  const handleSpawn = useCallback(async () => {
    if (!selectedPersona) {
      setError('Please select a persona');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await spawnAgent(selectedPersona, task || `Work as ${selectedPersona}`);
      setTask('');
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to spawn agent';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [selectedPersona, task, spawnAgent, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-rapid-surface border border-rapid-border rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-rapid-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Spawn {type === 'orchestrator' ? 'Orchestrator' : 'Worker'} Agent
            </h2>
            <button
              onClick={onClose}
              className="text-rapid-muted hover:text-rapid-text transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-700 rounded-lg">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Persona selection */}
          <div>
            <label className="block text-sm font-medium text-rapid-text mb-2">Persona</label>
            <select
              value={selectedPersona}
              onChange={(e) => {
                setSelectedPersona(e.target.value);
                setError(null);
              }}
              className="w-full px-3 py-2 bg-rapid-elevated border border-rapid-border rounded-lg text-rapid-text focus:outline-none focus:border-rapid-accent"
              disabled={loading}
            >
              {personas.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} {p.description ? `- ${p.description}` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-rapid-muted">Select the agent persona to spawn</p>
          </div>

          {/* Task description */}
          <div>
            <label className="block text-sm font-medium text-rapid-text mb-2">
              Task (optional)
            </label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe what this agent should work on..."
              rows={3}
              className="w-full px-3 py-2 bg-rapid-elevated border border-rapid-border rounded-lg text-rapid-text placeholder-rapid-muted focus:outline-none focus:border-rapid-accent resize-none"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-rapid-muted">What should this agent work on?</p>
          </div>

          {/* Agent type info */}
          <div className="p-3 bg-rapid-elevated rounded-lg border border-rapid-border">
            <p className="text-xs text-rapid-muted">
              <strong className="text-rapid-text block mb-1">
                {type === 'orchestrator' ? 'Orchestrator' : 'Worker'} Agent
              </strong>
              {type === 'orchestrator'
                ? 'Orchestrators coordinate multiple workers and manage task distribution'
                : 'Workers execute tasks assigned by orchestrators'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-rapid-border flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-rapid-elevated text-rapid-text rounded-lg font-medium hover:bg-rapid-elevated/80 transition-colors disabled:opacity-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSpawn}
            className="flex-1 px-4 py-2 bg-rapid-accent text-rapid-surface rounded-lg font-medium hover:bg-rapid-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            disabled={loading || !selectedPersona}
          >
            {loading ? (
              <>
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
                Spawning...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                Spawn Agent
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
