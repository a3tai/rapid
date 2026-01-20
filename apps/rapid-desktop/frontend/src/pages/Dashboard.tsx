import { clsx } from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import { useAgents, useTasks, useSuggestions, useDaemonStatus, useAppStore } from '../stores/app'
import type { Task, Suggestion } from '../stores/app'
import { SecurityPanel } from '../components/SecurityPanel'
import { ActivityFeed } from '../components/ActivityFeed'

export function Dashboard() {
  const agents = useAgents()
  const tasks = useTasks()
  const suggestions = useSuggestions()
  const daemonStatus = useDaemonStatus()
  const setActiveView = useAppStore((s) => s.setActiveView)

  const taskStats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  }

  const suggestionStats = {
    voting: suggestions.filter((s) => s.status === 'proposed' || s.status === 'voting').length,
  }

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Active Agents"
          value={agents.length}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
          color="accent"
        />
        <StatCard
          label="Tasks In Progress"
          value={taskStats.inProgress}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
          color="warning"
        />
        <StatCard
          label="Tasks Completed"
          value={taskStats.completed}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="success"
        />
        <StatCard
          label="Daemon Uptime"
          value={daemonStatus?.uptime ? formatUptime(daemonStatus.uptime) : '--'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="info"
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-4 gap-6">
        {/* Left column - Agents and Tasks */}
        <div className="col-span-2 space-y-6">
          {/* Agents panel */}
          <div className="card p-4 cursor-pointer hover:border-rapid-accent/50 transition-colors" onClick={() => setActiveView('agents')}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Active Agents</h2>
              <span className="badge badge-neutral">{agents.length}</span>
            </div>
            <div className="space-y-2">
              {agents.length === 0 ? (
                <div className="text-center py-8 text-rapid-muted">
                  No agents active
                </div>
              ) : (
                agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-3 bg-rapid-elevated rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="status-dot status-dot-active" />
                      <div>
                        <div className="font-medium text-sm">{agent.name}</div>
                        <div className="text-xs text-rapid-muted">{agent.id}</div>
                      </div>
                    </div>
                    {agent.worktree && (
                      <span className="badge badge-info font-mono text-xs">
                        {agent.worktree}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent tasks panel */}
          <div className="card p-4 cursor-pointer hover:border-rapid-accent/50 transition-colors" onClick={() => setActiveView('tasks')}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Recent Tasks</h2>
              <span className="badge badge-neutral">{tasks.length}</span>
            </div>
            <div className="space-y-2">
              {tasks.length === 0 ? (
                <div className="text-center py-8 text-rapid-muted">
                  No tasks yet
                </div>
              ) : (
                tasks.slice(0, 5).map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right column - Activity Feed and Suggestions */}
        <div className="col-span-2 space-y-6">
          {/* Activity feed - real-time timeline */}
          <div className="h-80">
            <ActivityFeed />
          </div>

          {/* Suggestions panel */}
          <div className="card p-4 cursor-pointer hover:border-rapid-accent/50 transition-colors" onClick={() => setActiveView('suggestions')}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Active Suggestions</h2>
              <span className="badge badge-warning">{suggestionStats.voting}</span>
            </div>
            <div className="space-y-2">
              {suggestions.length === 0 ? (
                <div className="text-center py-8 text-rapid-muted">
                  No suggestions yet
                </div>
              ) : (
                suggestions.slice(0, 3).map((suggestion) => (
                  <SuggestionRow key={suggestion.id} suggestion={suggestion} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Security panel */}
      <div className="card p-4">
        <SecurityPanel />
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  color: 'accent' | 'success' | 'warning' | 'error' | 'info'
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  const colorClasses = {
    accent: 'bg-rapid-accent/10 text-rapid-accent',
    success: 'bg-green-500/10 text-green-400',
    warning: 'bg-yellow-500/10 text-yellow-400',
    error: 'bg-red-500/10 text-red-400',
    info: 'bg-cyan-500/10 text-cyan-400',
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-rapid-muted">{label}</div>
          <div className="text-2xl font-semibold mt-1">{value}</div>
        </div>
        <div className={clsx('p-3 rounded-lg', colorClasses[color])}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task }: { task: Task }) {
  const statusBadge = {
    pending: 'badge-neutral',
    in_progress: 'badge-warning',
    completed: 'badge-success',
    blocked: 'badge-error',
    cancelled: 'badge-neutral',
  }

  const priorityIcon = {
    urgent: '!!!',
    high: '!!',
    normal: '',
    low: '',
  }

  return (
    <div className="p-3 bg-rapid-elevated rounded-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">
            {priorityIcon[task.priority] && (
              <span className="text-red-400 mr-1">{priorityIcon[task.priority]}</span>
            )}
            {task.title}
          </div>
          {task.assignedTo && (
            <div className="text-xs text-rapid-muted mt-0.5">
              Assigned to {task.assignedTo}
            </div>
          )}
        </div>
        <span className={clsx('badge', statusBadge[task.status])}>
          {task.status.replace('_', ' ')}
        </span>
      </div>
    </div>
  )
}

function SuggestionRow({ suggestion }: { suggestion: Suggestion }) {
  const categoryBadge = {
    feature: 'badge-primary',
    fix: 'badge-error',
    improvement: 'badge-info',
    refactor: 'badge-warning',
    docs: 'badge-secondary',
  }

  const statusIcon = {
    proposed: '💭',
    voting: '🗳️',
    approved: '✅',
    rejected: '❌',
    orchestrator_approved: '✅',
    orchestrator_vetoed: '❌',
    implemented: '🚀',
  }

  const totalVotes = suggestion.approveCount + suggestion.rejectCount + suggestion.abstainCount
  const approvePercent = totalVotes > 0 ? Math.round((suggestion.approveCount / totalVotes) * 100) : 0

  return (
    <div className="p-3 bg-rapid-elevated rounded-lg">
      <div className="flex items-start gap-2">
        <span className="text-sm">{statusIcon[suggestion.status]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm truncate">{suggestion.title}</span>
            <span className={clsx('badge text-xs', categoryBadge[suggestion.category])}>
              {suggestion.category}
            </span>
          </div>
          {(suggestion.status === 'proposed' || suggestion.status === 'voting') && totalVotes > 0 && (
            <div className="text-xs text-rapid-muted">
              {approvePercent}% ({suggestion.approveCount}✓ {suggestion.rejectCount}✗)
            </div>
          )}
          <div className="text-xs text-rapid-muted mt-1">
            {suggestion.proposedByName} • {formatDistanceToNow(new Date(suggestion.createdAt), { addSuffix: true })}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}
