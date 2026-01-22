import { useState, useEffect } from 'react';
import { useAgents, useAppStore } from '../stores/app';
import { useData } from '../hooks/useData';
import { useToast } from '../components/Toast';
import { AgentDetailPanel } from '../components/AgentDetailPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Loader2,
  Monitor,
  Terminal,
  Square,
  FolderGit2,
  Target,
  Zap,
  Cog,
  Search,
  Palette,
  Scale,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PersonaInfo {
  id: string;
  name: string;
  description: string;
  model?: string;
  capabilities?: string[];
}

// Minimal fallback - persona_list should provide all available personas
const DEFAULT_PERSONAS: PersonaInfo[] = [
  { id: 'worker', name: 'Worker', description: 'Executes development tasks', model: 'haiku' },
  { id: 'orchestrator', name: 'Orchestrator', description: 'Coordinates tasks between agents', model: 'opus' },
];

export function AgentsPage() {
  const agents = useAgents();
  const selectedAgent = useAppStore((s) => s.selectedAgent);
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent);
  const agentDetailTab = useAppStore((s) => s.agentDetailTab);
  const setAgentDetailTab = useAppStore((s) => s.setAgentDetailTab);
  const { spawnAgent, stopAgent, callTool, fetchAgents } = useData();
  const [showSpawnModal, setShowSpawnModal] = useState(false);
  const [personas, setPersonas] = useState<PersonaInfo[]>(DEFAULT_PERSONAS);
  const [personasLoading, setPersonasLoading] = useState(true);
  const toast = useToast();

  // Find the selected agent object
  const selectedAgentObj = agents.find((a) => a.id === selectedAgent);

  useEffect(() => {
    const loadPersonas = async () => {
      setPersonasLoading(true);
      try {
        const result = await callTool('persona_list', { includePrompts: false }) as { structuredContent?: unknown };
        const data = result?.structuredContent as { personas?: Array<{ name: string; description?: string; model?: string }> };
        if (data?.personas && data.personas.length > 0) {
          // Sort personas alphabetically, but put worker and orchestrator first
          const sorted = data.personas
            .map(p => ({
              id: p.name,
              name: p.name,
              description: p.description || `${p.name} persona`,
              model: p.model,
            }))
            .sort((a, b) => {
              // Priority order for common personas
              const priority = ['worker', 'orchestrator', 'architect', 'researcher'];
              const aIdx = priority.indexOf(a.id.toLowerCase());
              const bIdx = priority.indexOf(b.id.toLowerCase());
              if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
              if (aIdx !== -1) return -1;
              if (bIdx !== -1) return 1;
              return a.name.localeCompare(b.name);
            });
          setPersonas(sorted);
        }
      } catch (err) {
        console.warn('Failed to load personas, using defaults:', err);
      } finally {
        setPersonasLoading(false);
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
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-mono font-normal tracking-wide">
            Agents
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Spawn, monitor, and manage AI agents
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="flex items-center gap-6 mr-4">
            <div className="text-center">
              <div className="text-2xl font-mono" aria-label={`${agents.length} active agents`}>{agents.length}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Active</div>
            </div>
            <div className="w-px h-8 bg-border" aria-hidden="true" />
            <div className="text-center">
              <div className="text-2xl font-mono text-success" aria-label={`${agents.filter(a => a.session).length} running agents`}>{agents.filter(a => a.session).length}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Running</div>
            </div>
          </div>

          <Button onClick={() => setShowSpawnModal(true)} className="gap-2" aria-label="Spawn a new agent">
            <Plus className="w-4 h-4" aria-hidden="true" />
            Spawn Agent
          </Button>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="relative z-10 flex-1 overflow-auto">
        {agents.length === 0 ? (
          <EmptyState onSpawn={() => setShowSpawnModal(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" role="region" aria-label="Active agents">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isSelected={selectedAgent === agent.id}
                onSelect={() => {
                  setSelectedAgent(agent.id === selectedAgent ? null : agent.id);
                  setAgentDetailTab('overview');
                }}
                onStop={() => handleStopAgent(agent.id, agent.name)}
                onViewOutput={() => {
                  setSelectedAgent(agent.id);
                  setAgentDetailTab('logs');
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <SpawnModal
        open={showSpawnModal}
        onOpenChange={setShowSpawnModal}
        onSpawn={handleSpawnAgent}
        personas={personas}
        personasLoading={personasLoading}
      />

      {/* Agent Detail Panel */}
      {selectedAgentObj && (
        <AgentDetailPanel
          agent={selectedAgentObj}
          initialTab={agentDetailTab}
          onClose={() => setSelectedAgent(null)}
          onStop={async () => {
            await handleStopAgent(selectedAgentObj.id, selectedAgentObj.name);
          }}
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
          <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl animate-pulse" aria-hidden="true" />
          <div className="relative w-full h-full bg-card border rounded-2xl flex items-center justify-center">
            <Monitor className="w-10 h-10 text-primary" aria-hidden="true" />
          </div>
        </div>

        <h3 className="text-lg font-mono mb-2">No Agents Running</h3>
        <p className="text-muted-foreground text-sm mb-6">
          Spawn an agent to start autonomous development
        </p>

        <Button onClick={onSpawn} className="gap-2" aria-label="Spawn the first agent">
          <Plus className="w-4 h-4" aria-hidden="true" />
          Spawn First Agent
        </Button>
      </div>
    </div>
  );
}

interface AgentCardProps {
  agent: { id: string; name: string; worktree?: string; session?: string };
  isSelected: boolean;
  onSelect: () => void;
  onStop: () => void;
  onViewOutput: () => void;
}

function AgentCard({ agent, isSelected, onSelect, onStop, onViewOutput }: AgentCardProps) {
  const roleConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    orchestrator: {
      icon: <Target className="w-5 h-5" />,
      color: 'text-violet-400'
    },
    worker: {
      icon: <Zap className="w-5 h-5" />,
      color: 'text-blue-400'
    },
    architect: {
      icon: <Cog className="w-5 h-5" />,
      color: 'text-amber-400'
    },
    researcher: {
      icon: <Search className="w-5 h-5" />,
      color: 'text-emerald-400'
    },
    designer: {
      icon: <Palette className="w-5 h-5" />,
      color: 'text-pink-400'
    },
    critic: {
      icon: <Scale className="w-5 h-5" />,
      color: 'text-red-400'
    },
  };

  const config = roleConfig[agent.name.toLowerCase()] || {
    icon: <Monitor className="w-5 h-5" />,
    color: 'text-muted-foreground'
  };

  return (
    <Card
      onClick={onSelect}
      className={cn(
        'cursor-pointer transition-all duration-200 hover:bg-muted/50',
        isSelected && 'ring-2 ring-primary border-primary/50'
      )}
      role="button"
      tabIndex={0}
      aria-label={`${agent.name} agent, ${isSelected ? 'selected' : 'not selected'}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center bg-muted',
              config.color
            )} aria-hidden="true">
              {config.icon}
            </div>

            <div>
              <h3 className="font-mono font-medium capitalize">{agent.name}</h3>
              <p className="text-xs text-muted-foreground font-mono truncate max-w-[140px]">
                {agent.id.substring(0, 20)}...
              </p>
            </div>
          </div>

          {/* Status indicator */}
          <Badge variant="success" className="gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" aria-hidden="true" />
            Live
          </Badge>
        </div>

        {/* Metadata */}
        <div className="space-y-2 mb-4">
          {agent.worktree && (
            <div className="flex items-center gap-2 text-xs">
              <FolderGit2 className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">Worktree:</span>
              <span className={cn('font-mono truncate', config.color)}>{agent.worktree}</span>
            </div>
          )}
          {agent.session && (
            <div className="flex items-center gap-2 text-xs">
              <Terminal className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">Session:</span>
              <span className="font-mono truncate">{agent.session}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onViewOutput(); }}
            className="flex-1 gap-1.5"
            aria-label={`View output for ${agent.name}`}
          >
            <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
            Output
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onStop(); }}
            className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label={`Stop ${agent.name}`}
          >
            <Square className="w-3.5 h-3.5" aria-hidden="true" />
            Stop
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface SpawnModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSpawn: (persona: string, task: string) => Promise<void>;
  personas: PersonaInfo[];
  personasLoading?: boolean;
}

function SpawnModal({ open, onOpenChange, onSpawn, personas, personasLoading }: SpawnModalProps) {
  const [selectedPersona, setSelectedPersona] = useState('');
  const [task, setTask] = useState('');
  const [isSpawning, setIsSpawning] = useState(false);

  const handleSpawn = async () => {
    if (!selectedPersona || !task.trim()) return;
    setIsSpawning(true);
    try {
      await onSpawn(selectedPersona, task);
      onOpenChange(false);
      setSelectedPersona('');
      setTask('');
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

  // Get selected persona info for display
  const selectedPersonaInfo = personas.find(p => p.id === selectedPersona);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Spawn Agent</DialogTitle>
          <DialogDescription>Select a persona and describe the task</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Persona Dropdown */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider">
              Persona
              {personasLoading && (
                <Loader2 className="w-3 h-3 ml-2 inline animate-spin" aria-hidden="true" />
              )}
            </Label>
            <Select value={selectedPersona} onValueChange={setSelectedPersona} disabled={personasLoading}>
              <SelectTrigger className="w-full" aria-label="Select agent persona">
                <SelectValue placeholder={personasLoading ? "Loading personas..." : "Select a persona..."} />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {personas.map((persona) => (
                  <SelectItem key={persona.id} value={persona.id} className="capitalize">
                    {persona.name}
                    {persona.model && (
                      <span className={cn('ml-2 text-[10px] font-mono uppercase', modelColors[persona.model] || 'text-muted-foreground')}>
                        ({persona.model})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Show model badge next to selected persona */}
            {selectedPersonaInfo?.model && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">Model:</span>
                <span className={cn('text-xs font-mono uppercase', modelColors[selectedPersonaInfo.model] || 'text-muted-foreground')}>
                  {selectedPersonaInfo.model}
                </span>
              </div>
            )}
            {/* Show description of selected persona */}
            {selectedPersonaInfo && (
              <p className="text-xs text-muted-foreground mt-1">
                {selectedPersonaInfo.description}
              </p>
            )}
            {!personasLoading && personas.length > 2 && (
              <p className="text-[10px] text-muted-foreground">
                {personas.length} personas available
              </p>
            )}
          </div>

          {/* Task Input */}
          <div className="space-y-2">
            <Label htmlFor="task" className="text-xs uppercase tracking-wider">Task Description</Label>
            <Textarea
              id="task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe what you want the agent to accomplish..."
              rows={4}
              className="resize-none"
              aria-label="Task description for the spawned agent"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSpawn}
            disabled={!selectedPersona || !task.trim() || isSpawning}
            aria-label={isSpawning ? 'Spawning agent' : 'Spawn agent with selected persona and task'}
          >
            {isSpawning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                Spawning...
              </>
            ) : (
              'Spawn Agent'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
