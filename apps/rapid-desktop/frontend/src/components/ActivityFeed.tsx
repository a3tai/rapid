/**
 * Activity Feed Component
 *
 * Displays real-time events from the RAPID event bus with:
 * - Event type icons and color coding
 * - Filter dropdown by event type
 * - Live/pause toggle
 * - Timeline visualization
 */

import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useMessages, useAgents, type Message } from '../stores/app';

// Event type configuration with icons, colors, and labels
const EVENT_CONFIG: Record<
  string,
  { icon: string; color: string; bgColor: string; label: string; category: EventCategory }
> = {
  completion: {
    icon: '✅',
    color: 'text-green-400',
    bgColor: 'bg-green-400',
    label: 'Task Completed',
    category: 'tasks',
  },
  error: {
    icon: '⚠️',
    color: 'text-red-400',
    bgColor: 'bg-red-400',
    label: 'Error',
    category: 'errors',
  },
  discovery: {
    icon: '🔍',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-400',
    label: 'Discovery',
    category: 'general',
  },
  question: {
    icon: '❓',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400',
    label: 'Question',
    category: 'general',
  },
  learning: {
    icon: '📚',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400',
    label: 'Learning',
    category: 'general',
  },
  coordination: {
    icon: '💬',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400',
    label: 'Coordination',
    category: 'messages',
  },
  heartbeat: {
    icon: '💗',
    color: 'text-gray-400',
    bgColor: 'bg-gray-400',
    label: 'Heartbeat',
    category: 'system',
  },
  suggestion: {
    icon: '💡',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-400',
    label: 'Suggestion',
    category: 'general',
  },
  vote: {
    icon: '🗳️',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-400',
    label: 'Vote',
    category: 'general',
  },
  // Extended event types from task description
  tool_call: {
    icon: '🔧',
    color: 'text-orange-400',
    bgColor: 'bg-orange-400',
    label: 'Tool Call',
    category: 'tools',
  },
  task_assignment: {
    icon: '📋',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400',
    label: 'Task Assigned',
    category: 'tasks',
  },
  agent_spawn: {
    icon: '🚀',
    color: 'text-green-400',
    bgColor: 'bg-green-400',
    label: 'Agent Spawned',
    category: 'agents',
  },
  agent_stop: {
    icon: '🛑',
    color: 'text-red-400',
    bgColor: 'bg-red-400',
    label: 'Agent Stopped',
    category: 'agents',
  },
  budget_alert: {
    icon: '💰',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400',
    label: 'Budget Alert',
    category: 'budget',
  },
};

// Event categories for filtering
type EventCategory = 'all' | 'tasks' | 'agents' | 'messages' | 'tools' | 'budget' | 'errors' | 'system' | 'general';

const CATEGORY_OPTIONS: { value: EventCategory; label: string; icon: string }[] = [
  { value: 'all', label: 'All Events', icon: '📊' },
  { value: 'tasks', label: 'Tasks', icon: '✅' },
  { value: 'agents', label: 'Agents', icon: '🚀' },
  { value: 'messages', label: 'Messages', icon: '💬' },
  { value: 'tools', label: 'Tool Calls', icon: '🔧' },
  { value: 'budget', label: 'Budget', icon: '💰' },
  { value: 'errors', label: 'Errors', icon: '⚠️' },
  { value: 'system', label: 'System', icon: '💗' },
];

interface ActivityItem {
  id: string;
  type: string;
  agentName: string;
  agentId: string;
  action: string;
  detail?: string;
  timestamp: string;
  icon: string;
  color: string;
  bgColor: string;
  category: EventCategory;
}

export function ActivityFeed() {
  const messages = useMessages();
  const agents = useAgents();
  const [isLive, setIsLive] = useState(true);
  const [filter, setFilter] = useState<EventCategory>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Convert messages to activity items with enhanced metadata
  const activities = useMemo(() => {
    const items: ActivityItem[] = messages.slice(0, 50).map((msg) => {
      const config = EVENT_CONFIG[msg.type] || {
        icon: '📝',
        color: 'text-gray-400',
        bgColor: 'bg-gray-400',
        label: msg.type,
        category: 'general' as EventCategory,
      };

      return {
        id: msg.id,
        type: msg.type,
        agentName: msg.fromAgent.name,
        agentId: msg.fromAgent.id,
        action: getActionText(msg),
        detail: msg.payload.title || msg.payload.content?.slice(0, 100) || undefined,
        timestamp: msg.timestamp,
        icon: config.icon,
        color: config.color,
        bgColor: config.bgColor,
        category: config.category,
      };
    });
    return items;
  }, [messages]);

  // Filter activities by category
  const filteredActivities = useMemo(() => {
    if (filter === 'all') return activities.slice(0, 20);
    return activities.filter((a) => a.category === filter).slice(0, 20);
  }, [activities, filter]);

  // Count events by category for badges
  const categoryCounts = useMemo(() => {
    const counts: Record<EventCategory, number> = {
      all: activities.length,
      tasks: 0,
      agents: 0,
      messages: 0,
      tools: 0,
      budget: 0,
      errors: 0,
      system: 0,
      general: 0,
    };
    activities.forEach((a) => {
      counts[a.category]++;
    });
    return counts;
  }, [activities]);

  const selectedOption = CATEGORY_OPTIONS.find((o) => o.value === filter) || CATEGORY_OPTIONS[0];

  return (
    <div className="card h-full flex flex-col">
      {/* Header with filter */}
      <div className="p-4 border-b border-rapid-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">Activity</h3>
          {isLive && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-green-400">Live</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Filter dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-rapid-elevated text-rapid-muted hover:text-rapid-text transition-colors"
            >
              <span>{selectedOption.icon}</span>
              <span>{selectedOption.label}</span>
              <svg
                className={clsx('w-3 h-3 transition-transform', showFilterMenu && 'rotate-180')}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {showFilterMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-rapid-surface border border-rapid-border rounded-lg shadow-lg z-10 py-1">
                {CATEGORY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setFilter(option.value);
                      setShowFilterMenu(false);
                    }}
                    className={clsx(
                      'w-full flex items-center justify-between px-3 py-2 text-sm transition-colors',
                      filter === option.value
                        ? 'bg-rapid-accent/10 text-rapid-accent'
                        : 'text-rapid-muted hover:text-rapid-text hover:bg-rapid-elevated'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span>{option.icon}</span>
                      <span>{option.label}</span>
                    </span>
                    {categoryCounts[option.value] > 0 && (
                      <span className="text-xs bg-rapid-border px-1.5 rounded">
                        {categoryCounts[option.value]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Live toggle */}
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
      </div>

      {/* Activity timeline */}
      <div className="flex-1 overflow-auto">
        {filteredActivities.length === 0 ? (
          <div className="flex items-center justify-center h-full text-rapid-muted text-sm">
            <div className="text-center">
              <div className="text-3xl mb-2">{selectedOption.icon}</div>
              <p>No {filter === 'all' ? 'activity' : filter} events yet</p>
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-rapid-border" />

            {/* Activity items */}
            {filteredActivities.map((activity, index) => (
              <ActivityRow key={activity.id} activity={activity} isFirst={index === 0} />
            ))}
          </div>
        )}
      </div>

      {/* Active agents footer */}
      <div className="p-3 border-t border-rapid-border bg-rapid-elevated/50">
        <div className="flex items-center justify-between">
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

          {/* Event count */}
          <span className="text-xs text-rapid-muted">
            {filteredActivities.length} events
          </span>
        </div>
      </div>
    </div>
  );
}

interface ActivityRowProps {
  activity: ActivityItem;
  isFirst: boolean;
}

function ActivityRow({ activity, isFirst }: ActivityRowProps) {
  return (
    <div
      className={clsx(
        'relative pl-12 pr-4 py-3 transition-colors hover:bg-rapid-elevated/30',
        isFirst && 'bg-rapid-accent/5'
      )}
    >
      {/* Timeline dot with icon */}
      <div
        className={clsx(
          'absolute left-3 top-3 w-6 h-6 rounded-full flex items-center justify-center text-sm',
          'bg-rapid-surface border border-rapid-border'
        )}
        title={EVENT_CONFIG[activity.type]?.label || activity.type}
      >
        {activity.icon}
      </div>

      {/* Content */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx('font-medium text-sm', activity.color)}>{activity.agentName}</span>
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
    coordination: 'sent message',
    heartbeat: 'is active',
    suggestion: 'suggested',
    vote: 'voted',
    tool_call: 'called tool',
    task_assignment: 'was assigned task',
    agent_spawn: 'spawned',
    agent_stop: 'stopped',
    budget_alert: 'budget alert',
  };
  return actions[msg.type] || msg.type;
}

function getAgentColor(name: string): string {
  const colors: Record<string, string> = {
    orchestrator: 'bg-purple-500 text-white',
    worker: 'bg-blue-500 text-white',
    implementer: 'bg-blue-500 text-white',
    architect: 'bg-indigo-500 text-white',
    designer: 'bg-pink-500 text-white',
    reviewer: 'bg-green-500 text-white',
    'rapid-router': 'bg-violet-500 text-white',
    'frontend-developer': 'bg-cyan-500 text-white',
    'backend-developer': 'bg-orange-500 text-white',
  };

  // Check for partial matches
  const nameLower = name.toLowerCase();
  for (const [key, value] of Object.entries(colors)) {
    if (nameLower.includes(key)) {
      return value;
    }
  }

  return 'bg-rapid-accent text-white';
}
