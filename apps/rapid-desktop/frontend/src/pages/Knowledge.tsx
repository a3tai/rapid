import { useState, useEffect, useCallback } from 'react'
import { clsx } from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import { useData } from '../hooks/useData'
import { useToast } from '../components/Toast'

interface KnowledgeEntry {
  key: string
  value: unknown
  memoryType: 'episodic' | 'semantic' | 'procedural' | 'decision_trace'
  confidence: number
  tags: string[]
  createdAt: string
  accessCount?: number
}

interface ContextStats {
  totalEntries: number
  byMemoryType: {
    episodic: number
    semantic: number
    procedural: number
    decision_trace: number
  }
}

const MEMORY_TYPES = ['all', 'episodic', 'semantic', 'procedural', 'decision_trace'] as const

export function KnowledgePage() {
  const { callTool } = useData()
  const toast = useToast()
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [stats, setStats] = useState<ContextStats | null>(null)
  const [filter, setFilter] = useState<typeof MEMORY_TYPES[number]>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeEntry | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch entries
      const listResult = await callTool('context_list', {
        memoryType: filter === 'all' ? undefined : filter,
        limit: 100,
      })
      const listData = listResult.structuredContent as { entries?: KnowledgeEntry[] }
      setEntries(listData?.entries || [])

      // Fetch stats
      const statsResult = await callTool('context_stats', {})
      const statsData = statsResult.structuredContent as ContextStats
      setStats(statsData)
    } catch (err) {
      console.warn('Failed to fetch knowledge:', err)
      // Mock data for demo
      setEntries([
        {
          key: 'auth-pattern',
          value: 'Use JWT tokens with refresh token rotation',
          memoryType: 'procedural',
          confidence: 0.9,
          tags: ['auth', 'security'],
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          key: 'user-preference-tabs',
          value: 'Prefer 2-space indentation',
          memoryType: 'semantic',
          confidence: 0.8,
          tags: ['preferences', 'formatting'],
          createdAt: new Date(Date.now() - 172800000).toISOString(),
        },
      ])
      setStats({
        totalEntries: 2,
        byMemoryType: { episodic: 0, semantic: 1, procedural: 1, decision_trace: 0 },
      })
    } finally {
      setLoading(false)
    }
  }, [callTool, filter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredEntries = entries.filter((entry) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        entry.key.toLowerCase().includes(query) ||
        entry.tags.some((t) => t.toLowerCase().includes(query)) ||
        String(entry.value).toLowerCase().includes(query)
      )
    }
    return true
  })

  const handleForget = async (key: string) => {
    try {
      await callTool('context_forget', { key })
      toast.success('Knowledge Removed', `"${key}" has been forgotten`)
      await fetchData()
      setSelectedEntry(null)
    } catch (err) {
      toast.error('Failed to Remove', err instanceof Error ? err.message : 'Unknown error')
      console.error('Failed to forget:', err)
    }
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Context Engine</h2>
          <p className="text-rapid-muted text-sm mt-1">
            Stored knowledge and learned patterns
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Knowledge
        </button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-4">
          <StatCard label="Total" value={stats.totalEntries} color="accent" />
          <StatCard label="Episodic" value={stats.byMemoryType.episodic} color="purple" />
          <StatCard label="Semantic" value={stats.byMemoryType.semantic} color="blue" />
          <StatCard label="Procedural" value={stats.byMemoryType.procedural} color="green" />
          <StatCard label="Decisions" value={stats.byMemoryType.decision_trace} color="yellow" />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          {MEMORY_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={clsx(
                'badge cursor-pointer transition-colors capitalize',
                filter === type
                  ? 'bg-rapid-accent text-white'
                  : 'badge-neutral hover:bg-rapid-border'
              )}
            >
              {type.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rapid-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search knowledge..."
            className="input pl-10 w-64"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* List */}
        <div className="flex-1 card overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full text-rapid-muted">
                Loading...
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex items-center justify-center h-full text-rapid-muted">
                <div className="text-center">
                  <svg
                    className="w-12 h-12 mx-auto mb-4 opacity-50"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                  <p className="text-lg font-medium">No knowledge stored</p>
                  <p className="text-sm mt-1">Add knowledge to help agents learn</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-rapid-border">
                {filteredEntries.map((entry) => (
                  <KnowledgeRow
                    key={entry.key}
                    entry={entry}
                    isSelected={selectedEntry?.key === entry.key}
                    onClick={() => setSelectedEntry(entry)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedEntry && (
          <div className="w-96 card p-4 overflow-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold">{selectedEntry.key}</h3>
                <span className={clsx('badge mt-1', getTypeBadge(selectedEntry.memoryType))}>
                  {selectedEntry.memoryType.replace('_', ' ')}
                </span>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-rapid-muted hover:text-rapid-text"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-rapid-muted mb-1">Value</label>
                <pre className="p-3 bg-rapid-bg rounded-lg text-sm font-mono overflow-auto max-h-48">
                  {typeof selectedEntry.value === 'string'
                    ? selectedEntry.value
                    : JSON.stringify(selectedEntry.value, null, 2)}
                </pre>
              </div>

              <div>
                <label className="block text-sm font-medium text-rapid-muted mb-1">Confidence</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-rapid-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rapid-accent"
                      style={{ width: `${selectedEntry.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-sm">{Math.round(selectedEntry.confidence * 100)}%</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-rapid-muted mb-1">Tags</label>
                <div className="flex flex-wrap gap-1">
                  {selectedEntry.tags.map((tag) => (
                    <span key={tag} className="badge badge-neutral text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-rapid-muted mb-1">Created</label>
                <span className="text-sm">
                  {formatDistanceToNow(new Date(selectedEntry.createdAt), { addSuffix: true })}
                </span>
              </div>

              <div className="pt-4 border-t border-rapid-border">
                <button
                  onClick={() => handleForget(selectedEntry.key)}
                  className="btn btn-ghost text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full"
                >
                  Forget this knowledge
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add modal */}
      {showAddModal && (
        <AddKnowledgeModal
          onClose={() => setShowAddModal(false)}
          onAdd={async (key, value, memoryType, tags) => {
            try {
              await callTool('context_learn', {
                key,
                value,
                memoryType,
                tags,
                confidence: 0.8,
              })
              toast.success('Knowledge Added', `"${key}" has been stored`)
              await fetchData()
            } catch (err) {
              toast.error('Failed to Add', err instanceof Error ? err.message : 'Unknown error')
              throw err
            }
          }}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    accent: 'text-rapid-accent',
    purple: 'text-purple-400',
    blue: 'text-blue-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
  }

  return (
    <div className="card p-3">
      <div className="text-sm text-rapid-muted">{label}</div>
      <div className={clsx('text-2xl font-semibold', colorClasses[color])}>{value}</div>
    </div>
  )
}

function KnowledgeRow({
  entry,
  isSelected,
  onClick,
}: {
  entry: KnowledgeEntry
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <div
      className={clsx(
        'p-4 hover:bg-rapid-elevated cursor-pointer transition-colors',
        isSelected && 'bg-rapid-elevated'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{entry.key}</span>
            <span className={clsx('badge text-xs', getTypeBadge(entry.memoryType))}>
              {entry.memoryType.replace('_', ' ')}
            </span>
          </div>
          <div className="text-sm text-rapid-muted mt-1 line-clamp-1">
            {typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)}
          </div>
        </div>
        <div className="ml-4 text-right">
          <div className="text-sm text-rapid-muted">
            {Math.round(entry.confidence * 100)}%
          </div>
        </div>
      </div>
      {entry.tags.length > 0 && (
        <div className="flex gap-1 mt-2">
          {entry.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="badge badge-neutral text-xs">
              {tag}
            </span>
          ))}
          {entry.tags.length > 3 && (
            <span className="text-xs text-rapid-muted">+{entry.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  )
}

function getTypeBadge(type: KnowledgeEntry['memoryType']): string {
  const badges: Record<string, string> = {
    episodic: 'bg-purple-500/20 text-purple-400',
    semantic: 'bg-blue-500/20 text-blue-400',
    procedural: 'bg-green-500/20 text-green-400',
    decision_trace: 'bg-yellow-500/20 text-yellow-400',
  }
  return badges[type] || 'badge-neutral'
}

function AddKnowledgeModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (key: string, value: string, memoryType: string, tags: string[]) => Promise<void>
}) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [memoryType, setMemoryType] = useState('semantic')
  const [tagsInput, setTagsInput] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = async () => {
    if (!key.trim() || !value.trim()) return
    setIsAdding(true)
    try {
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
      await onAdd(key, value, memoryType, tags)
      onClose()
    } catch (err) {
      console.error('Failed to add knowledge:', err)
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card-elevated w-[520px] animate-fade-in">
        <div className="p-4 border-b border-rapid-border">
          <h3 className="text-lg font-semibold">Add Knowledge</h3>
          <p className="text-sm text-rapid-muted mt-1">
            Store a new piece of knowledge for agents to use
          </p>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Key</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="auth-pattern, user-preference-tabs, etc."
              className="input w-full"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Value</label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="The knowledge content..."
              rows={4}
              className="input w-full resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Memory Type</label>
            <select
              value={memoryType}
              onChange={(e) => setMemoryType(e.target.value)}
              className="input w-full"
            >
              <option value="semantic">Semantic (facts and definitions)</option>
              <option value="procedural">Procedural (how to do things)</option>
              <option value="episodic">Episodic (specific experiences)</option>
              <option value="decision_trace">Decision Trace (why decisions were made)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Tags</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="auth, security, patterns (comma separated)"
              className="input w-full"
            />
          </div>
        </div>

        <div className="p-4 border-t border-rapid-border flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!key.trim() || !value.trim() || isAdding}
            className="btn btn-primary disabled:opacity-50"
          >
            {isAdding ? 'Adding...' : 'Add Knowledge'}
          </button>
        </div>
      </div>
    </div>
  )
}
