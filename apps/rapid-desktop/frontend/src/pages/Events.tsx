import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { useMessages, type Message } from '../stores/app';
import { useData } from '../hooks/useData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  BookOpen,
  RefreshCw,
  Heart,
  Lightbulb,
  Vote,
  Pause,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MESSAGE_TYPES = [
  'all',
  'discovery',
  'completion',
  'coordination',
  'error',
  'question',
  'learning',
  'heartbeat',
  'suggestion',
  'vote',
] as const;

type FilterType = (typeof MESSAGE_TYPES)[number];

interface BusStatus {
  connected: boolean;
  mode: string;
  messageCount: number;
  activeAgents: number;
}

interface AgentHealth {
  id: string;
  name: string;
  lastSeen: string;
  status: 'active' | 'stale' | 'unknown';
  messageCount?: number;
}

// Safe date formatting helpers to prevent crashes on invalid date strings
function safeDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function safeFormat(dateStr: string | undefined, formatStr: string, fallback = 'N/A'): string {
  const d = safeDate(dateStr);
  return d ? format(d, formatStr) : fallback;
}

function safeFormatDistance(dateStr: string | undefined, fallback = 'unknown'): string {
  const d = safeDate(dateStr);
  return d ? formatDistanceToNow(d, { addSuffix: true }) : fallback;
}

export function EventsPage() {
  const messages = useMessages();
  const { callTool, fetchMessages, fetchAgents } = useData();

  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [busStatus, setBusStatus] = useState<BusStatus | null>(null);
  const [agentHealth, setAgentHealth] = useState<AgentHealth[]>([]);
  const [isPolling, setIsPolling] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
  const prevMessageCount = useRef(messages.length);

  // Fetch bus status
  const fetchBusStatus = useCallback(async () => {
    try {
      const result = await callTool('bus_status', {}) as { structuredContent?: unknown };
      const data = result?.structuredContent as {
        connected?: boolean;
        mode?: string;
        messageCount?: number;
        activeAgents?: number;
      };
      setBusStatus({
        connected: data?.connected ?? true,
        mode: data?.mode || 'unknown',
        messageCount: data?.messageCount || 0,
        activeAgents: data?.activeAgents || 0,
      });
    } catch (err) {
      console.error('Failed to fetch bus status:', err);
      setBusStatus({ connected: false, mode: 'error', messageCount: 0, activeAgents: 0 });
    }
  }, [callTool]);

  // Fetch agent health - agents are stale if no heartbeat in 15 minutes (900 seconds)
  const STALE_THRESHOLD_SECONDS = 900; // 15 minutes

  const fetchAgentHealth = useCallback(async () => {
    try {
      const result = await callTool('bus_health', { staleThresholdSeconds: STALE_THRESHOLD_SECONDS }) as { structuredContent?: unknown };
      const data = result?.structuredContent as {
        activeAgents?: Array<{ id: string; name: string; lastSeen: string }>;
        staleAgents?: Array<{ id: string; name: string; lastSeen: string }>;
      };

      const healthList: AgentHealth[] = [];
      if (data?.activeAgents) {
        healthList.push(...data.activeAgents.map(a => ({
          ...a,
          status: 'active' as const,
        })));
      }
      if (data?.staleAgents) {
        healthList.push(...data.staleAgents.map(a => ({
          ...a,
          status: 'stale' as const,
        })));
      }
      setAgentHealth(healthList);
    } catch (err) {
      console.error('Failed to fetch agent health:', err);
    }
  }, [callTool]);

  // Auto-cleanup stale agents (15 min timeout)
  const cleanupStaleAgents = useCallback(async () => {
    try {
      const result = await callTool('bus_health', { cleanupStale: true, staleThresholdSeconds: STALE_THRESHOLD_SECONDS }) as { structuredContent?: unknown };
      const data = result?.structuredContent as { cleanedUp?: number };
      if (data?.cleanedUp && data.cleanedUp > 0) {
        console.log(`Cleaned up ${data.cleanedUp} stale agents`);
      }
      await fetchAgentHealth();
      await fetchAgents();
    } catch (err) {
      console.error('Failed to cleanup stale agents:', err);
    }
  }, [callTool, fetchAgentHealth, fetchAgents]);

  // Poll for updates
  useEffect(() => {
    if (!isPolling) return;

    const poll = async () => {
      await Promise.all([
        fetchMessages(100),
        fetchAgents(),
        fetchBusStatus(),
        fetchAgentHealth(),
      ]);
      setLastUpdate(new Date());
    };

    poll(); // Initial fetch
    const interval = setInterval(poll, 1500); // Poll every 1.5s for real-time feel

    return () => clearInterval(interval);
  }, [isPolling, fetchMessages, fetchAgents, fetchBusStatus, fetchAgentHealth]);

  // Auto-cleanup stale agents every minute
  useEffect(() => {
    const cleanup = setInterval(cleanupStaleAgents, 60000); // Every 60 seconds
    return () => clearInterval(cleanup);
  }, [cleanupStaleAgents]);

  // Track new messages for highlighting
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      const newIds = new Set(messages.slice(0, messages.length - prevMessageCount.current).map(m => m.id));
      setNewMessageIds(newIds);
      // Clear highlighting after 3 seconds
      setTimeout(() => setNewMessageIds(new Set()), 3000);
    }
    prevMessageCount.current = messages.length;
  }, [messages]);

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
    <div className="space-y-4 h-full flex flex-col">
      {/* Header with Bus Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-xl font-semibold">Event Bus</h2>
            <p className="text-muted-foreground text-sm mt-1">Real-time agent communication</p>
          </div>
          {/* Bus Status Indicator */}
          {busStatus && (
            <Card className={cn(
              'px-4 py-2',
              busStatus.connected
                ? 'bg-success/10 border-success/30'
                : 'bg-destructive/10 border-destructive/30'
            )}>
              <CardContent className="p-0 flex items-center gap-3">
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  busStatus.connected ? 'bg-success animate-pulse' : 'bg-destructive'
                )} />
                <span className={cn(
                  'text-sm font-medium',
                  busStatus.connected ? 'text-success' : 'text-destructive'
                )}>
                  {busStatus.connected ? 'Connected' : 'Disconnected'}
                </span>
                <span className="text-xs opacity-70">({busStatus.mode})</span>
                <div className="border-l border-current/30 pl-3 ml-1">
                  <span className="text-xs">{busStatus.messageCount} msgs</span>
                </div>
                <div className="border-l border-current/30 pl-3">
                  <span className="text-xs">{busStatus.activeAgents} agents</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Last Update */}
          <span className="text-xs text-muted-foreground">
            Updated: {format(lastUpdate, 'HH:mm:ss')}
          </span>
          {/* Polling Toggle */}
          <Button
            variant={isPolling ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsPolling(!isPolling)}
            className="gap-2"
          >
            {isPolling ? (
              <>
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                Live
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Paused
              </>
            )}
          </Button>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              className="pl-10 w-64"
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-2">
        {MESSAGE_TYPES.map((type) => (
          <Badge
            key={type}
            variant={filter === type ? 'default' : 'secondary'}
            className="cursor-pointer"
            onClick={() => setFilter(type)}
          >
            {type === 'all' ? 'All' : type}
            <span className="ml-1.5 opacity-70">
              {type === 'all' ? messages.length : typeStats[type] || 0}
            </span>
          </Badge>
        ))}
      </div>

      {/* Main content with sidebar */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Message list */}
        <Card className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1">
            {filteredMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground p-8">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No events found</p>
                  <p className="text-sm mt-1">
                    {filter !== 'all' || searchQuery
                      ? 'Try adjusting your filters'
                      : 'Events will appear here as agents communicate'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredMessages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    isNew={newMessageIds.has(message.id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Agent Health Sidebar */}
        <Card className="w-64 flex-shrink-0 overflow-hidden flex flex-col">
          <div className="p-3 border-b">
            <h3 className="font-semibold text-sm">Agent Health</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {agentHealth.filter(a => a.status === 'active').length} active,{' '}
              {agentHealth.filter(a => a.status === 'stale').length} stale
            </p>
          </div>
          <ScrollArea className="flex-1">
            {agentHealth.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No agents registered
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {agentHealth.map((agent) => (
                  <Card
                    key={agent.id}
                    className={cn(
                      'p-2',
                      agent.status === 'active'
                        ? 'bg-success/10 border-success/20'
                        : 'bg-warning/10 border-warning/20'
                    )}
                  >
                    <CardContent className="p-0">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'w-2 h-2 rounded-full',
                          agent.status === 'active' ? 'bg-success animate-pulse' : 'bg-warning'
                        )} />
                        <span className="font-medium text-sm truncate">{agent.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 pl-4">
                        {agent.status === 'active' ? 'Active' : 'Stale'} •{' '}
                        {safeFormatDistance(agent.lastSeen)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
          {/* Quick Actions */}
          <div className="p-2 border-t space-y-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={cleanupStaleAgents}
              className="w-full gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Cleanup Stale Agents
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              Auto-cleanup: 15 min timeout
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MessageItem({ message, isNew = false }: { message: Message; isNew?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const typeIcon: Record<Message['type'], React.ReactNode> = {
    discovery: <Search className="w-5 h-5" />,
    error: <AlertCircle className="w-5 h-5" />,
    completion: <CheckCircle className="w-5 h-5" />,
    question: <HelpCircle className="w-5 h-5" />,
    learning: <BookOpen className="w-5 h-5" />,
    coordination: <RefreshCw className="w-5 h-5" />,
    heartbeat: <Heart className="w-5 h-5" />,
    suggestion: <Lightbulb className="w-5 h-5" />,
    vote: <Vote className="w-5 h-5" />,
  };

  const typeColor: Record<Message['type'], string> = {
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

  const typeBadgeVariant: Record<Message['type'], 'info' | 'destructive' | 'success' | 'warning' | 'secondary'> = {
    discovery: 'info',
    error: 'destructive',
    completion: 'success',
    question: 'warning',
    learning: 'secondary',
    coordination: 'info',
    heartbeat: 'secondary',
    suggestion: 'secondary',
    vote: 'success',
  };

  return (
    <div
      className={cn(
        'p-4 hover:bg-muted transition-all cursor-pointer',
        expanded && 'bg-muted',
        isNew && 'bg-primary/10 border-l-2 border-primary animate-pulse'
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg', typeColor[message.type])}>
          {typeIcon[message.type]}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{message.fromAgent.name}</span>
            <Badge variant={typeBadgeVariant[message.type]}>{message.type}</Badge>
            <span className="text-sm text-muted-foreground ml-auto">
              {safeFormat(message.timestamp, 'HH:mm:ss')}
            </span>
          </div>

          {message.payload.title && (
            <div className="font-medium text-sm mt-1">{message.payload.title}</div>
          )}

          {message.payload.content && (
            <div className={cn('text-sm text-muted-foreground mt-1', !expanded && 'line-clamp-2')}>
              {message.payload.content}
            </div>
          )}

          {expanded && Object.keys(message.payload).length > 2 && (
            <div className="mt-3 p-3 bg-background rounded-lg">
              <pre className="text-xs font-mono text-muted-foreground overflow-auto">
                {JSON.stringify(message.payload, null, 2)}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>ID: {message.id}</span>
            <span>Agent: {message.fromAgent.id}</span>
            <span>{safeFormatDistance(message.timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
