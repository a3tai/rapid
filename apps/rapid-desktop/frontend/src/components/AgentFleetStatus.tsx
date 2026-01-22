import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useAgents, useTasks, useAppStore } from '../stores/app';
import { useMcp } from '../hooks/useMcp';
import { useToast } from './Toast';
import { Skeleton } from './Skeleton';

export type AgentStatus = 'running' | 'idle' | 'error' | 'stopped';

export interface AgentFleetItem {
  id: string;
  name: string;
  type: 'orchestrator' | 'worker' | 'architect' | 'researcher' | 'unknown';
  status: AgentStatus;
  model?: 'opus' | 'sonnet' | 'haiku';
  worktree?: string;
  session?: string;
  currentTaskId?: string;
  currentTaskTitle?: string;
  startedAt?: string;
  sessionCost?: number;
  lastHeartbeat?: string;
}

export interface AgentFleetStatusProps {
  /** Optional title for the section */
  title?: string;
  /** Show spawn button */
  showSpawnButton?: boolean;
  /** Maximum number of agents to display */
  maxAgents?: number;
  /** Loading state */
  loading?: boolean;
  /** Optional custom class name */
  className?: string;
  /** Callback when spawn button is clicked */
  onSpawnClick?: () => void;
  /** Callback when view logs is clicked */
  onViewLogs?: (agentId: string, agentName: string) => void;
}

const STATUS_CONFIG: Record<AgentStatus, { color: string; bgColor: string; label: string }> = {
  running: {
    color: 'text-rapid-success',
    bgColor: 'bg-rapid-success',
    label: 'Running',
  },
  idle: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400',
    label: 'Idle',
  },
  error: {
    color: 'text-rapid-error',
    bgColor: 'bg-rapid-error',
    label: 'Error',
  },
  stopped: {
    color: 'text-rapid-muted',
    bgColor: 'bg-rapid-muted',
    label: 'Stopped',
  },
};

const MODEL_CONFIG: Record<string, { color: string; label: string }> = {
  opus: { color: 'text-violet-400', label: 'Opus' },
  sonnet: { color: 'text-amber-400', label: 'Sonnet' },
  haiku: { color: 'text-cyan-400', label: 'Haiku' },
};

const TYPE_CONFIG: Record<string, { icon: string; gradient: string }> = {
  orchestrator: { icon: '🎯', gradient: 'from-violet-500 to-purple-600' },
  worker: { icon: '⚡', gradient: 'from-blue-500 to-cyan-500' },
  architect: { icon: '🏗️', gradient: 'from-amber-500 to-orange-500' },
  researcher: { icon: '🔍', gradient: 'from-emerald-500 to-teal-500' },
  unknown: { icon: '🤖', gradient: 'from-gray-500 to-gray-600' },
};

/**
 * Determine agent status based on session and heartbeat
 */
function getAgentStatus(agent: { session?: string; lastHeartbeat?: string }): AgentStatus {
  if (!agent.session) return 'stopped';

  if (agent.lastHeartbeat) {
    const lastHeartbeat = new Date(agent.lastHeartbeat);
    const now = new Date();
    const diffMs = now.getTime() - lastHeartbeat.getTime();

    // If no heartbeat in 60s, consider idle
    if (diffMs > 60000) return 'idle';
    // If no heartbeat in 120s, consider error
    if (diffMs > 120000) return 'error';
  }

  return 'running';
}

/**
 * Infer agent type from name
 */
function getAgentType(name: string): AgentFleetItem['type'] {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('orchestrator')) return 'orchestrator';
  if (lowerName.includes('worker') || lowerName.includes('implementer')) return 'worker';
  if (lowerName.includes('architect')) return 'architect';
  if (lowerName.includes('researcher')) return 'researcher';
  return 'unknown';
}

/**
 * Infer model from agent name or type
 */
function getAgentModel(name: string): 'opus' | 'sonnet' | 'haiku' | undefined {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('orchestrator')) return 'opus';
  if (lowerName.includes('architect')) return 'sonnet';
  if (lowerName.includes('worker') || lowerName.includes('researcher')) return 'haiku';
  return undefined;
}

/**
 * Format duration from start time
 */
function formatDuration(startedAt?: string): string {
  if (!startedAt) return '--';
  try {
    return formatDistanceToNow(new Date(startedAt), { addSuffix: false });
  } catch {
    return '--';
  }
}

/**
 * Format cost as currency
 */
function formatCost(cost?: number): string {
  if (cost === undefined || cost === null) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cost);
}

/**
 * Status indicator dot with animation
 */
function StatusIndicator({ status }: { status: AgentStatus }) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <div className={clsx('w-2 h-2 rounded-full', config.bgColor)} />
        {status === 'running' && (
          <div className={clsx(
            'absolute inset-0 w-2 h-2 rounded-full animate-ping',
            config.bgColor,
            'opacity-75'
          )} />
        )}
      </div>
      <span className={clsx('text-[10px] font-mono uppercase', config.color)}>
        {config.label}
      </span>
    </div>
  );
}

/**
 * Model badge
 */
function ModelBadge({ model }: { model?: string }) {
  if (!model) return null;
  const config = MODEL_CONFIG[model] || { color: 'text-rapid-muted', label: model };

  return (
    <span className={clsx(
      'px-1.5 py-0.5 text-[10px] font-mono uppercase rounded',
      'bg-rapid-elevated/50 border border-rapid-border/30',
      config.color
    )}>
      {config.label}
    </span>
  );
}

/**
 * Single agent row in the fleet status list
 */
function AgentFleetRow({
  agent,
  onStop,
  onViewLogs,
  onRestart,
}: {
  agent: AgentFleetItem;
  onStop: () => void;
  onViewLogs: () => void;
  onRestart: () => void;
}) {
  const typeConfig = TYPE_CONFIG[agent.type] || TYPE_CONFIG.unknown;

  return (
    <div className={clsx(
      'group p-3 rounded-lg transition-all duration-200',
      'bg-rapid-elevated/30 hover:bg-rapid-elevated/50',
      'border border-transparent hover:border-rapid-border/30'
    )}>
      <div className="flex items-center gap-3">
        {/* Agent icon */}
        <div className={clsx(
          'w-10 h-10 rounded-lg flex items-center justify-center text-base',
          'bg-gradient-to-br shadow-sm',
          typeConfig.gradient
        )}>
          {typeConfig.icon}
        </div>

        {/* Agent info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-sm text-rapid-text capitalize truncate">
              {agent.name}
            </span>
            <ModelBadge model={agent.model} />
          </div>

          <div className="flex items-center gap-3 text-xs text-rapid-muted">
            <StatusIndicator status={agent.status} />

            {agent.currentTaskTitle && (
              <span className="truncate max-w-[150px]" title={agent.currentTaskTitle}>
                📋 {agent.currentTaskTitle}
              </span>
            )}

            {agent.startedAt && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatDuration(agent.startedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Cost */}
        {agent.sessionCost !== undefined && (
          <div className="text-right mr-2">
            <div className="text-xs text-rapid-muted">Cost</div>
            <div className="text-sm font-mono text-rapid-text">
              {formatCost(agent.sessionCost)}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onViewLogs(); }}
            className="p-1.5 rounded text-rapid-muted hover:text-rapid-text hover:bg-rapid-surface/50 transition-colors"
            title="View logs"
            aria-label={`View logs for ${agent.name}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </button>

          {agent.status === 'error' || agent.status === 'stopped' ? (
            <button
              onClick={(e) => { e.stopPropagation(); onRestart(); }}
              className="p-1.5 rounded text-rapid-muted hover:text-rapid-success hover:bg-rapid-success/10 transition-colors"
              title="Restart agent"
              aria-label={`Restart ${agent.name}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onStop(); }}
              className="p-1.5 rounded text-rapid-muted hover:text-rapid-error hover:bg-rapid-error/10 transition-colors"
              title="Stop agent"
              aria-label={`Stop ${agent.name}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for the agent fleet list
 */
function AgentFleetSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-3 rounded-lg bg-rapid-elevated/30">
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton height={14} width="40%" />
              <Skeleton height={10} width="60%" />
            </div>
            <Skeleton height={24} width={50} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state when no agents are running
 */
function EmptyState({ onSpawn }: { onSpawn?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-12 h-12 mb-3 rounded-lg bg-rapid-elevated/50 flex items-center justify-center">
        <svg className="w-6 h-6 text-rapid-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-sm text-rapid-muted mb-3">No agents running</p>
      {onSpawn && (
        <button
          onClick={onSpawn}
          className="text-xs text-rapid-accent hover:text-rapid-accent-muted transition-colors"
        >
          + Spawn first agent
        </button>
      )}
    </div>
  );
}

/**
 * AgentFleetStatus - Displays the status of all active agents in the fleet
 *
 * Shows live status indicators, agent details, and quick actions for each agent.
 * Designed for use in the Dashboard Phase 1.
 *
 * @example
 * ```tsx
 * <AgentFleetStatus
 *   title="Active Agents"
 *   showSpawnButton
 *   onSpawnClick={() => setShowModal(true)}
 * />
 * ```
 */
export function AgentFleetStatus({
  title = 'Agent Fleet',
  showSpawnButton = true,
  maxAgents = 10,
  loading = false,
  className,
  onSpawnClick,
  onViewLogs,
}: AgentFleetStatusProps) {
  const agents = useAgents();
  const tasks = useTasks();
  const { stopAgent, spawnAgent, fetchAgents } = useMcp();
  const toast = useToast();
  const setActiveView = useAppStore((s) => s.setActiveView);

  // Transform raw agents into fleet items with additional computed data
  const fleetItems: AgentFleetItem[] = agents.slice(0, maxAgents).map((agent) => {
    // Find current task for this agent
    const currentTask = tasks.find(
      (t) => t.assignedTo?.includes(agent.id) && t.status === 'in_progress'
    );

    return {
      id: agent.id,
      name: agent.name,
      type: getAgentType(agent.name),
      status: getAgentStatus(agent),
      model: getAgentModel(agent.name),
      worktree: agent.worktree,
      session: agent.session,
      currentTaskId: currentTask?.id,
      currentTaskTitle: currentTask?.title,
      // These would come from extended agent data if available
      startedAt: undefined,
      sessionCost: undefined,
      lastHeartbeat: undefined,
    };
  });

  const handleStop = async (agentId: string, agentName: string) => {
    try {
      await stopAgent(agentId);
      toast.success('Agent Stopped', `${agentName} has been terminated`);
      await fetchAgents();
    } catch (err) {
      toast.error('Failed to Stop Agent', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleRestart = async (agentName: string) => {
    try {
      await spawnAgent(agentName, 'Resume previous work');
      toast.success('Agent Restarted', `${agentName} has been restarted`);
      await fetchAgents();
    } catch (err) {
      toast.error('Failed to Restart Agent', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleViewLogs = (agentId: string, agentName: string) => {
    if (onViewLogs) {
      onViewLogs(agentId, agentName);
    } else {
      // Navigate to agents page as fallback
      setActiveView('agents');
    }
  };

  const runningCount = fleetItems.filter((a) => a.status === 'running').length;
  const idleCount = fleetItems.filter((a) => a.status === 'idle').length;

  return (
    <div className={clsx('card', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-rapid-border/30">
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-sm text-rapid-text">{title}</h3>
          <div className="flex items-center gap-2">
            {runningCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-rapid-success/10 text-rapid-success">
                {runningCount} running
              </span>
            )}
            {idleCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-yellow-500/10 text-yellow-400">
                {idleCount} idle
              </span>
            )}
          </div>
        </div>

        {showSpawnButton && (
          <button
            onClick={onSpawnClick}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
              'text-xs font-mono text-rapid-text',
              'bg-rapid-accent/10 hover:bg-rapid-accent/20',
              'border border-rapid-accent/30 hover:border-rapid-accent/50',
              'transition-all duration-200'
            )}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Spawn New
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {loading ? (
          <AgentFleetSkeleton count={3} />
        ) : fleetItems.length === 0 ? (
          <EmptyState onSpawn={showSpawnButton ? onSpawnClick : undefined} />
        ) : (
          <div className="space-y-2">
            {fleetItems.map((agent) => (
              <AgentFleetRow
                key={agent.id}
                agent={agent}
                onStop={() => handleStop(agent.id, agent.name)}
                onRestart={() => handleRestart(agent.name)}
                onViewLogs={() => handleViewLogs(agent.id, agent.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer - show if there are more agents than displayed */}
      {agents.length > maxAgents && (
        <div className="px-4 py-2 border-t border-rapid-border/30">
          <button
            onClick={() => setActiveView('agents')}
            className="text-xs text-rapid-accent hover:text-rapid-accent-muted transition-colors"
          >
            View all {agents.length} agents →
          </button>
        </div>
      )}
    </div>
  );
}

export default AgentFleetStatus;
