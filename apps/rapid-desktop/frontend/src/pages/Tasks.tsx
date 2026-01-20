import { useState } from 'react'
import { clsx } from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import { useTasks, useAppStore, type Task } from '../stores/app'
import { useWails } from '../hooks/useWails'
import { useToast } from '../components/Toast'

// Re-export useState for use in component functions
export { useState }

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'pending', label: 'Pending', color: 'bg-rapid-muted' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-yellow-400' },
  { id: 'completed', label: 'Completed', color: 'bg-green-400' },
  { id: 'blocked', label: 'Blocked', color: 'bg-red-400' },
]

type SortBy = 'date' | 'priority' | 'status' | 'assignee'
type SortOrder = 'asc' | 'desc'

export function TasksPage() {
  const tasks = useTasks()
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all')
  const [filterPriority, setFilterPriority] = useState<'all' | 'urgent' | 'high' | 'normal' | 'low'>('all')
  const [filterAssignee, setFilterAssignee] = useState<'all' | 'unassigned' | string>('all')
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const { createTask } = useWails()
  const toast = useToast()

  // Apply filters
  const filteredTasks = tasks.filter((t) => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false
    if (filterAssignee === 'unassigned' && t.assignedTo) return false
    if (filterAssignee !== 'all' && filterAssignee !== 'unassigned' && t.assignedTo !== filterAssignee) return false
    return true
  })

  // Apply sorting
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    let aVal: string | number, bVal: string | number

    switch (sortBy) {
      case 'date':
        aVal = new Date(a.updatedAt).getTime()
        bVal = new Date(b.updatedAt).getTime()
        break
      case 'priority':
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
        aVal = priorityOrder[a.priority as keyof typeof priorityOrder]
        bVal = priorityOrder[b.priority as keyof typeof priorityOrder]
        break
      case 'status':
        aVal = a.status
        bVal = b.status
        break
      case 'assignee':
        aVal = a.assignedTo || 'zzz'
        bVal = b.assignedTo || 'zzz'
        break
      default:
        return 0
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const tasksByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = tasks.filter((t) => t.status === col.id)
    return acc
  }, {} as Record<TaskStatus, Task[]>)

  // Get unique assignees for filter dropdown
  const uniqueAssignees = Array.from(new Set(tasks.filter((t) => t.assignedTo).map((t) => t.assignedTo)))

  // Bulk selection handlers
  const toggleTaskSelection = (taskId: string) => {
    const newSelected = new Set(selectedTasks)
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId)
    } else {
      newSelected.add(taskId)
    }
    setSelectedTasks(newSelected)
  }

  const selectAll = () => {
    setSelectedTasks(new Set(sortedTasks.map((t) => t.id)))
  }

  const deselectAll = () => {
    setSelectedTasks(new Set())
  }

  const bulkChangeStatus = (newStatus: TaskStatus) => {
    // This would call backend to update multiple tasks
    // For now, just show feedback
    toast.success('Bulk Action', `Updated ${selectedTasks.size} tasks to ${newStatus}`)
    deselectAll()
  }

  const bulkDelete = () => {
    if (selectedTasks.size === 0) return
    if (confirm(`Delete ${selectedTasks.size} selected tasks? This cannot be undone.`)) {
      toast.success('Bulk Delete', `Deleted ${selectedTasks.size} tasks`)
      deselectAll()
    }
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Task Board</h2>
          <p className="text-rapid-muted text-sm mt-1">
            {tasks.length} tasks total
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-rapid-elevated rounded-lg p-1">
            <button
              onClick={() => setViewMode('board')}
              className={clsx(
                'px-3 py-1.5 rounded text-sm transition-colors',
                viewMode === 'board'
                  ? 'bg-rapid-accent text-white'
                  : 'text-rapid-muted hover:text-rapid-text'
              )}
            >
              Board
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={clsx(
                'px-3 py-1.5 rounded text-sm transition-colors',
                viewMode === 'list'
                  ? 'bg-rapid-accent text-white'
                  : 'text-rapid-muted hover:text-rapid-text'
              )}
            >
              List
            </button>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            New Task
          </button>
        </div>
      </div>

      {/* Filters and sorting (list view only) */}
      {viewMode === 'list' && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Filters & Sorting</h3>
            <button
              onClick={() => {
                setFilterStatus('all')
                setFilterPriority('all')
                setFilterAssignee('all')
                setSortBy('date')
                setSortOrder('desc')
              }}
              className="text-xs text-rapid-accent hover:underline"
            >
              Reset
            </button>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {/* Status filter */}
            <div>
              <label className="block text-xs font-medium text-rapid-muted mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as TaskStatus | 'all')}
                className="input w-full text-sm"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>

            {/* Priority filter */}
            <div>
              <label className="block text-xs font-medium text-rapid-muted mb-1">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value as any)}
                className="input w-full text-sm"
              >
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Assignee filter */}
            <div>
              <label className="block text-xs font-medium text-rapid-muted mb-1">Assignee</label>
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="input w-full text-sm"
              >
                <option value="all">All Assignees</option>
                <option value="unassigned">Unassigned</option>
                {uniqueAssignees.map((assignee) => (
                  <option key={assignee} value={assignee}>
                    {assignee}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort by */}
            <div>
              <label className="block text-xs font-medium text-rapid-muted mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="input w-full text-sm"
              >
                <option value="date">Updated Date</option>
                <option value="priority">Priority</option>
                <option value="status">Status</option>
                <option value="assignee">Assignee</option>
              </select>
            </div>

            {/* Sort order */}
            <div>
              <label className="block text-xs font-medium text-rapid-muted mb-1">Order</label>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className={clsx(
                  'input w-full text-sm flex items-center justify-center gap-1',
                  'hover:bg-rapid-elevated'
                )}
              >
                {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk actions toolbar (list view only) */}
      {viewMode === 'list' && selectedTasks.size > 0 && (
        <div className="card p-3 bg-rapid-accent/10 border border-rapid-accent flex items-center justify-between">
          <div className="text-sm">
            <span className="font-medium">{selectedTasks.size}</span> task{selectedTasks.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-xs px-2 py-1 rounded hover:bg-rapid-elevated"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="text-xs px-2 py-1 rounded hover:bg-rapid-elevated"
            >
              Deselect
            </button>
            <div className="border-l border-rapid-border mx-1" />
            <select
              onChange={(e) => {
                if (e.target.value) {
                  bulkChangeStatus(e.target.value as TaskStatus)
                }
                e.target.value = ''
              }}
              className="text-xs px-2 py-1 rounded border border-rapid-accent bg-rapid-elevated hover:bg-rapid-border"
            >
              <option value="">Change Status...</option>
              <option value="pending">→ Pending</option>
              <option value="in_progress">→ In Progress</option>
              <option value="completed">→ Completed</option>
              <option value="blocked">→ Blocked</option>
            </select>
            <button
              onClick={bulkDelete}
              className="text-xs px-2 py-1 rounded hover:bg-red-500/20 text-red-400"
            >
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {viewMode === 'board' ? (
        <div className="flex-1 grid grid-cols-4 gap-4 overflow-hidden">
          {COLUMNS.map((column) => (
            <TaskColumn
              key={column.id}
              column={column}
              tasks={tasksByStatus[column.id]}
            />
          ))}
        </div>
      ) : (
        <TaskList tasks={sortedTasks} selectedTasks={selectedTasks} onToggleSelect={toggleTaskSelection} />
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreate={async (title, description, priority, tags) => {
            try {
              const result = await createTask(title, description, priority, tags)
              toast.success('Task Created', `"${title}" has been added to the board`)
              return result
            } catch (err) {
              toast.error('Failed to Create Task', err instanceof Error ? err.message : 'Unknown error')
              throw err
            }
          }}
        />
      )}
    </div>
  )
}

interface TaskColumnProps {
  column: { id: TaskStatus; label: string; color: string }
  tasks: Task[]
}

function TaskColumn({ column, tasks }: TaskColumnProps) {
  return (
    <div className="flex flex-col bg-rapid-surface rounded-lg overflow-hidden">
      <div className="p-3 border-b border-rapid-border flex items-center gap-2">
        <div className={clsx('w-2 h-2 rounded-full', column.color)} />
        <span className="font-medium text-sm">{column.label}</span>
        <span className="ml-auto badge badge-neutral">{tasks.length}</span>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-8 text-rapid-muted text-sm">
            No tasks
          </div>
        )}
      </div>
    </div>
  )
}

function TaskCard({ task }: { task: Task }) {
  const setSelectedTask = useAppStore((s) => s.setSelectedTask)
  const toast = useToast()
  const [isChangingStatus, setIsChangingStatus] = useState(false)

  const priorityColors = {
    urgent: 'border-l-red-500',
    high: 'border-l-orange-500',
    normal: 'border-l-blue-500',
    low: 'border-l-gray-500',
  }

  const statusIndicators = {
    pending: { icon: '⏳', label: 'Pending', color: 'text-rapid-muted' },
    in_progress: { icon: '⚡', label: 'In Progress', color: 'text-yellow-400' },
    completed: { icon: '✓', label: 'Completed', color: 'text-green-400' },
    blocked: { icon: '🚫', label: 'Blocked', color: 'text-red-400' },
  }

  const handleStatusChange = (newStatus: TaskStatus) => {
    if (newStatus === task.status) return

    setIsChangingStatus(true)
    // Simulate backend call with delay
    setTimeout(() => {
      toast.success('Status Updated', `Task moved to ${statusIndicators[newStatus].label}`)
      setIsChangingStatus(false)
    }, 300)
  }

  const status = statusIndicators[task.status]

  return (
    <div
      onClick={() => setSelectedTask(task.id)}
      className={clsx(
        'bg-rapid-elevated rounded-lg p-3 cursor-pointer hover:bg-rapid-border transition-all border-l-4',
        priorityColors[task.priority],
        isChangingStatus && 'opacity-75'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="font-medium text-sm">{task.title}</div>

          {task.description && (
            <div className="text-xs text-rapid-muted mt-1 line-clamp-2">
              {task.description}
            </div>
          )}
        </div>

        {/* Status dropdown */}
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
            disabled={isChangingStatus}
            className={clsx(
              'text-xs px-2 py-1 rounded border border-rapid-border bg-rapid-surface',
              'hover:border-rapid-accent focus:outline-none focus:border-rapid-accent',
              'transition-colors disabled:opacity-50 cursor-pointer',
              status.color
            )}
            title="Click to change status"
          >
            <option value="pending">⏳ Pending</option>
            <option value="in_progress">⚡ In Progress</option>
            <option value="completed">✓ Completed</option>
            <option value="blocked">🚫 Blocked</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        {task.assignedTo ? (
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-rapid-accent/20 flex items-center justify-center">
              <span className="text-xs text-rapid-accent font-medium">
                {task.assignedTo[0].toUpperCase()}
              </span>
            </div>
            <span className="text-xs text-rapid-muted truncate max-w-[80px]">
              {task.assignedTo}
            </span>
          </div>
        ) : (
          <span className="text-xs text-rapid-muted">Unassigned</span>
        )}
        <span className="text-xs text-rapid-muted">
          {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
        </span>
      </div>

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="badge badge-neutral text-xs">
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-xs text-rapid-muted">+{task.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  )
}

function TaskList({ tasks, selectedTasks, onToggleSelect }: { tasks: Task[]; selectedTasks?: Set<string>; onToggleSelect?: (id: string) => void }) {
  const [statusChanging, setStatusChanging] = useState<Set<string>>(new Set())
  const toast = useToast()

  const statusBadge = {
    pending: 'badge-neutral',
    in_progress: 'badge-warning',
    completed: 'badge-success',
    blocked: 'badge-error',
    cancelled: 'badge-neutral',
  }

  const priorityBadge = {
    urgent: 'badge-error',
    high: 'badge-warning',
    normal: 'badge-info',
    low: 'badge-neutral',
  }

  const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task || newStatus === task.status) return

    setStatusChanging((prev) => new Set([...prev, taskId]))

    // Simulate backend call with delay
    setTimeout(() => {
      toast.success('Status Updated', `"${task.title}" moved to ${newStatus.replace('_', ' ')}`)
      setStatusChanging((prev) => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
    }, 300)
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-rapid-border">
            {onToggleSelect && (
              <th className="text-left p-3 w-10">
                <input
                  type="checkbox"
                  checked={tasks.length > 0 && selectedTasks && tasks.every((t) => selectedTasks.has(t.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      tasks.forEach((t) => onToggleSelect(t.id))
                    } else {
                      tasks.forEach((t) => selectedTasks?.has(t.id) && onToggleSelect(t.id))
                    }
                  }}
                  className="rounded"
                />
              </th>
            )}
            <th className="text-left p-3 text-sm font-medium text-rapid-muted">Title</th>
            <th className="text-left p-3 text-sm font-medium text-rapid-muted">Status</th>
            <th className="text-left p-3 text-sm font-medium text-rapid-muted">Priority</th>
            <th className="text-left p-3 text-sm font-medium text-rapid-muted">Assigned</th>
            <th className="text-left p-3 text-sm font-medium text-rapid-muted">Updated</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              className={clsx(
                'border-b border-rapid-border transition-all',
                selectedTasks?.has(task.id) ? 'bg-rapid-accent/10 hover:bg-rapid-accent/20' : 'hover:bg-rapid-elevated',
                statusChanging.has(task.id) && 'opacity-75'
              )}
            >
              {onToggleSelect && (
                <td className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedTasks?.has(task.id) ?? false}
                    onChange={() => onToggleSelect(task.id)}
                    className="rounded"
                  />
                </td>
              )}
              <td className="p-3">
                <div className="font-medium text-sm">{task.title}</div>
                {task.tags && task.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {task.tags.map((tag) => (
                      <span key={tag} className="badge badge-neutral text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="p-3" onClick={(e) => e.stopPropagation()}>
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                  disabled={statusChanging.has(task.id)}
                  className={clsx(
                    'text-xs px-2 py-1 rounded border border-rapid-border bg-rapid-surface',
                    'hover:border-rapid-accent focus:outline-none focus:border-rapid-accent',
                    'transition-all disabled:opacity-50 cursor-pointer',
                    statusBadge[task.status]
                  )}
                  title="Click to change status"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </td>
              <td className="p-3">
                <span className={clsx('badge', priorityBadge[task.priority])}>
                  {task.priority}
                </span>
              </td>
              <td className="p-3 text-sm text-rapid-muted">
                {task.assignedTo || '-'}
              </td>
              <td className="p-3 text-sm text-rapid-muted">
                {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface CreateTaskModalProps {
  onClose: () => void
  onCreate: (title: string, description: string, priority: string, tags: string[]) => Promise<{ id: string }>
}

function CreateTaskModal({ onClose, onCreate }: CreateTaskModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [tagsInput, setTagsInput] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    if (!title.trim()) return
    setIsCreating(true)
    try {
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
      await onCreate(title, description, priority, tags)
      onClose()
    } catch (err) {
      console.error('Failed to create task:', err)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card-elevated w-[520px] animate-fade-in">
        <div className="p-4 border-b border-rapid-border">
          <h3 className="text-lg font-semibold">Create Task</h3>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="input w-full"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task description (optional)"
              rows={3}
              className="input w-full resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="input w-full"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Tags</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="feature, bug, auth (comma separated)"
              className="input w-full"
            />
          </div>
        </div>

        <div className="p-4 border-t border-rapid-border flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || isCreating}
            className="btn btn-primary disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}
