import { useState, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useMessages, useAgents, type Message } from '../stores/app';

interface ActivityItem {
  id: string;
  type: 'message' | 'agent_join' | 'agent_leave' | 'task_update';
  agentName: string;
  agentId: string;
  action: string;
  detail?: string;
  timestamp: string;
  color: string;
}

export function ActivityFeed() {
  const messages = useMessages();
  const agents = useAgents();
  const [isLive, setIsLive] = useState(true);

  // Convert messages to activity items
  const activities = useMemo(() => {
    const items: ActivityItem[] = messages.slice(0, 15).map((msg) => ({
      id: msg.id,
      type: 'message',
      agentName: msg.fromAgent.name,
      agentId: msg.fromAgent.id,
      action: getActionText(msg),
      detail: msg.payload.title || undefined,
      timestamp: msg.timestamp,
      color: getMessageColor(msg.type),
    }));
    return items;
  }, [messages]);

  // Pulse effect for new activity
  const [pulseId, setPulseId] = useState<string | null>(null);

  useEffect(() => {
    if (activities.length > 0 && isLive) {
      setPulseId(activities[0].id);
      const timer = setTimeout(() => setPulseId(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [activities, isLive]);

  return (
    <div className="card h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-rapid-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">Activity</h3>
          {isLive && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-green-400">Live</span>
            </div>
          )}
        </div>
        <button
          onClick={() => setIsLive(!isLive)}
          className={clsx(
            'text-xs px-2 py-1 rounded transition-colors',
            isLive
              ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
              : 'bg-rapid-elevated text-rapid-muted hover:text-rapid-text'
          )}
        >
          {isLive ? 'Pause' : 'Resume'}
        </button>
      </div>

      {/* Activity timeline */}
      <div className="flex-1 overflow-auto">
        {activities.length === 0 ? (
          <div className="flex items-center justify-center h-full text-rapid-muted text-sm">
            <div className="text-center">
              <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-rapid-elevated flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <p>No activity yet</p>
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-rapid-border" />

            {/* Activity items */}
            {activities.map((activity, index) => (
              <ActivityRow
                key={activity.id}
                activity={activity}
                isPulsing={pulseId === activity.id}
                isFirst={index === 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Active agents footer */}
      <div className="p-3 border-t border-rapid-border bg-rapid-elevated/50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-rapid-muted">Active:</span>
          <div className="flex -space-x-2">
            {agents.slice(0, 5).map((agent) => (
              <div
                key={agent.id}
                title={agent.name}
                className={clsx(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border-2 border-rapid-surface',
                  getAgentColor(agent.name)
                )}
              >
                {agent.name[0].toUpperCase()}
              </div>
            ))}
            {agents.length > 5 && (
              <div className="w-6 h-6 rounded-full bg-rapid-border flex items-center justify-center text-xs text-rapid-muted border-2 border-rapid-surface">
                +{agents.length - 5}
              </div>
            )}
          </div>
          {agents.length === 0 && <span className="text-xs text-rapid-muted">No agents</span>}
        </div>
      </div>
    </div>
  );
}

interface ActivityRowProps {
  activity: ActivityItem;
  isPulsing: boolean;
  isFirst: boolean;
}

function ActivityRow({ activity, isPulsing, isFirst }: ActivityRowProps) {
  return (
    <div
      className={clsx(
        'relative pl-12 pr-4 py-3 transition-colors',
        isPulsing && 'bg-rapid-accent/5'
      )}
    >
      {/* Timeline dot */}
      <div
        className={clsx(
          'absolute left-4 top-4 w-4 h-4 rounded-full border-2 border-rapid-surface flex items-center justify-center',
          activity.color,
          isPulsing && 'ring-4 ring-rapid-accent/20'
        )}
      >
        {isFirst && <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      </div>

      {/* Content */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{activity.agentName}</span>
          <span className="text-rapid-muted text-sm">{activity.action}</span>
        </div>
        {activity.detail && (
          <p className="text-sm text-rapid-muted truncate mt-0.5">{activity.detail}</p>
        )}
        <span className="text-xs text-rapid-muted">
          {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

function getActionText(msg: Message): string {
  const actions: Record<string, string> = {
    discovery: 'discovered',
    error: 'reported error',
    completion: 'completed task',
    question: 'asked',
    learning: 'learned',
    coordination: 'coordinated',
    heartbeat: 'is active',
    suggestion: 'suggested',
    vote: 'voted',
  };
  return actions[msg.type] || msg.type;
}

function getMessageColor(type: Message['type']): string {
  const colors: Record<string, string> = {
    discovery: 'bg-cyan-400',
    error: 'bg-red-400',
    completion: 'bg-green-400',
    question: 'bg-yellow-400',
    learning: 'bg-purple-400',
    coordination: 'bg-blue-400',
    heartbeat: 'bg-gray-400',
    suggestion: 'bg-indigo-400',
    vote: 'bg-emerald-400',
  };
  return colors[type] || 'bg-gray-400';
}

function getAgentColor(name: string): string {
  const colors: Record<string, string> = {
    orchestrator: 'bg-purple-500 text-white',
    worker: 'bg-blue-500 text-white',
    designer: 'bg-pink-500 text-white',
    reviewer: 'bg-green-500 text-white',
  };
  return colors[name.toLowerCase()] || 'bg-rapid-accent text-white';
}
