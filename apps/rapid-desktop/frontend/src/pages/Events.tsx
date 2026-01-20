import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { formatDistanceToNow, format } from 'date-fns';
import { useMessages, type Message } from '../stores/app';

const MESSAGE_TYPES = [
  'all',
  'discovery',
  'completion',
  'coordination',
  'error',
  'question',
  'learning',
  'heartbeat',
] as const;

type FilterType = (typeof MESSAGE_TYPES)[number];

export function EventsPage() {
  const messages = useMessages();
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMessages = useMemo(() => {
    let result = messages;

    if (filter !== 'all') {
      result = result.filter((m) => m.type === filter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.fromAgent.name.toLowerCase().includes(query) ||
          m.payload.title?.toLowerCase().includes(query) ||
          m.payload.content?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [messages, filter, searchQuery]);

  const typeStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const msg of messages) {
      stats[msg.type] = (stats[msg.type] || 0) + 1;
    }
    return stats;
  }, [messages]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Event Bus</h2>
          <p className="text-rapid-muted text-sm mt-1">Real-time agent communication feed</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
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
              placeholder="Search events..."
              className="input pl-10 w-64"
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-2">
        {MESSAGE_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={clsx(
              'badge cursor-pointer transition-colors',
              filter === type
                ? type === 'all'
                  ? 'bg-rapid-accent text-white'
                  : getTypeBadgeClass(type as Message['type'])
                : 'badge-neutral hover:bg-rapid-border'
            )}
          >
            {type === 'all' ? 'All' : type}
            <span className="ml-1.5 opacity-70">
              {type === 'all' ? messages.length : typeStats[type] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Message list */}
      <div className="flex-1 card overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          {filteredMessages.length === 0 ? (
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
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <p className="text-lg font-medium">No events found</p>
                <p className="text-sm mt-1">
                  {filter !== 'all' || searchQuery
                    ? 'Try adjusting your filters'
                    : 'Events will appear here as agents communicate'}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-rapid-border">
              {filteredMessages.map((message) => (
                <MessageItem key={message.id} message={message} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageItem({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);

  const typeIcon = {
    discovery: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    completion: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    question: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    learning: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
    coordination: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
    heartbeat: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
    ),
    suggestion: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    vote: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  };

  const typeColor = {
    discovery: 'text-cyan-400 bg-cyan-400/10',
    error: 'text-red-400 bg-red-400/10',
    completion: 'text-green-400 bg-green-400/10',
    question: 'text-yellow-400 bg-yellow-400/10',
    learning: 'text-purple-400 bg-purple-400/10',
    coordination: 'text-blue-400 bg-blue-400/10',
    heartbeat: 'text-gray-400 bg-gray-400/10',
    suggestion: 'text-indigo-400 bg-indigo-400/10',
    vote: 'text-emerald-400 bg-emerald-400/10',
  };

  return (
    <div
      className={clsx(
        'p-4 hover:bg-rapid-elevated transition-colors cursor-pointer',
        expanded && 'bg-rapid-elevated'
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <div className={clsx('p-2 rounded-lg', typeColor[message.type])}>
          {typeIcon[message.type]}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{message.fromAgent.name}</span>
            <span className={clsx('badge', getTypeBadgeClass(message.type))}>{message.type}</span>
            <span className="text-sm text-rapid-muted ml-auto">
              {format(new Date(message.timestamp), 'HH:mm:ss')}
            </span>
          </div>

          {message.payload.title && (
            <div className="font-medium text-sm mt-1">{message.payload.title}</div>
          )}

          {message.payload.content && (
            <div className={clsx('text-sm text-rapid-muted mt-1', !expanded && 'line-clamp-2')}>
              {message.payload.content}
            </div>
          )}

          {expanded && Object.keys(message.payload).length > 2 && (
            <div className="mt-3 p-3 bg-rapid-bg rounded-lg">
              <pre className="text-xs font-mono text-rapid-muted overflow-auto">
                {JSON.stringify(message.payload, null, 2)}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-4 mt-2 text-xs text-rapid-muted">
            <span>ID: {message.id}</span>
            <span>Agent: {message.fromAgent.id}</span>
            <span>{formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getTypeBadgeClass(type: Message['type']): string {
  const classes: Record<string, string> = {
    discovery: 'badge-info',
    error: 'badge-error',
    completion: 'badge-success',
    question: 'badge-warning',
    learning: 'bg-purple-500/20 text-purple-400',
    coordination: 'bg-blue-500/20 text-blue-400',
    heartbeat: 'badge-neutral',
    suggestion: 'bg-indigo-500/20 text-indigo-400',
    vote: 'bg-emerald-500/20 text-emerald-400',
  };
  return classes[type] || 'badge-neutral';
}
