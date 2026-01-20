import { useState } from 'react'
import { clsx } from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import { useTasks, useAppStore, type Task } from '../stores/app'
import { useWails } from '../hooks/useWails'
import { useToast } from '../components/Toast'

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'pending', label: 'Pending', color: 'bg-rapid-muted' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-yellow-400' },
  { id: 'completed', label: 'Completed', color: 'bg-green-400' },
  { id: 'blocked', label: 'Blocked', color: 'bg-red-400' },
]

export function TasksPage() {
  const tasks = useTasks()
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const { createTask } = useWails()
  const toast = useToast()

  const tasksByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = tasks.filter((t) => t.status === col.id)
    return acc
  }, {} as Record<TaskStatus, Task[]>)

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
        <TaskList tasks={tasks} />
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

  const priorityColors = {
    urgent: 'border-l-red-500',
    high: 'border-l-orange-500',
    normal: 'border-l-blue-500',
    low: 'border-l-gray-500',
  }

  return (
    <div
      onClick={() => setSelectedTask(task.id)}
      className={clsx(
        'bg-rapid-elevated rounded-lg p-3 cursor-pointer hover:bg-rapid-border transition-colors border-l-4',
        priorityColors[task.priority]
      )}
    >
      <div className="font-medium text-sm">{task.title}</div>

      {task.description && (
        <div className="text-xs text-rapid-muted mt-1 line-clamp-2">
          {task.description}
        </div>
      )}

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

function TaskList({ tasks }: { tasks: Task[] }) {
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

  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-rapid-border">
            <th className="text-left p-3 text-sm font-medium text-rapid-muted">Title</th>
            <th className="text-left p-3 text-sm font-medium text-rapid-muted">Status</th>
            <th className="text-left p-3 text-sm font-medium text-rapid-muted">Priority</th>
            <th className="text-left p-3 text-sm font-medium text-rapid-muted">Assigned</th>
            <th className="text-left p-3 text-sm font-medium text-rapid-muted">Updated</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-b border-rapid-border hover:bg-rapid-elevated">
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
              <td className="p-3">
                <span className={clsx('badge', statusBadge[task.status])}>
                  {task.status.replace('_', ' ')}
                </span>
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
