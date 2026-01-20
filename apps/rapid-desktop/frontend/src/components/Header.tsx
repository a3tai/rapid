import { useActiveView, useAgents, useTasks } from '../stores/app'

const viewTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  agents: 'Agents',
  tasks: 'Tasks',
  events: 'Event Bus',
  config: 'Configuration',
}

export function Header() {
  const activeView = useActiveView()
  const agents = useAgents()
  const tasks = useTasks()

  const activeAgents = agents.length
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length

  return (
    <header className="h-14 bg-rapid-surface border-b border-rapid-border flex items-center justify-between px-6 wails-drag">
      <div className="flex items-center gap-4 wails-no-drag">
        <h1 className="text-lg font-semibold">{viewTitles[activeView]}</h1>
      </div>

      <div className="flex items-center gap-4 wails-no-drag">
        {/* Quick stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="status-dot status-dot-active" />
            <span className="text-rapid-muted">
              <span className="text-rapid-text font-medium">{activeAgents}</span> agents
            </span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-rapid-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-rapid-muted">
              <span className="text-rapid-text font-medium">{inProgressTasks}</span> active
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary text-sm">
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            New Task
          </button>
        </div>
      </div>
    </header>
  )
}
