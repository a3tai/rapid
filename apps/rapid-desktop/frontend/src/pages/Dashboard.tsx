import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useAgents, useTasks, useSuggestions, useDaemonStatus, useAppStore } from '../stores/app';
import type { Task, Suggestion } from '../stores/app';
import { SecurityPanel } from '../components/SecurityPanel';
import { ActivityFeed } from '../components/ActivityFeed';
import { PerformanceMonitor } from '../components/PerformanceMonitor';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { ExportReports } from '../components/ExportReports';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Monitor, Zap, CheckCircle, Clock, ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Dashboard() {
  const agents = useAgents();
  const tasks = useTasks();
  const suggestions = useSuggestions();
  const daemonStatus = useDaemonStatus();
  const setActiveView = useAppStore((s) => s.setActiveView);

  const taskStats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  };

  const suggestionStats = {
    voting: suggestions.filter((s) => s.status === 'proposed' || s.status === 'voting').length,
  };

  // Generate mock sparkline data based on task counts
  const taskSparklineData = useMemo(() => {
    // Generate 12 data points representing last 12 time periods
    const base = taskStats.completed;
    return Array.from({ length: 12 }, (_, i) => ({
      value: Math.max(0, base - Math.floor(Math.random() * 5) + (i * 0.5)),
    }));
  }, [taskStats.completed]);

  const agentSparklineData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      value: Math.max(0, agents.length - Math.floor(Math.random() * 2) + (i % 3 === 0 ? 1 : 0)),
    }));
  }, [agents.length]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Top toolbar with export */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <ExportReports />
      </div>

      {/* Stats cards - responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          label="Active Agents"
          value={agents.length}
          icon={<Monitor className="w-5 h-5" />}
          color="accent"
          sparklineData={agentSparklineData}
          sparklineColor="hsl(var(--primary))"
        />
        <StatCard
          label="Tasks In Progress"
          value={taskStats.inProgress}
          icon={<Zap className="w-5 h-5" />}
          color="warning"
          sparklineData={taskSparklineData}
          sparklineColor="hsl(var(--warning))"
        />
        <StatCard
          label="Tasks Completed"
          value={taskStats.completed}
          icon={<CheckCircle className="w-5 h-5" />}
          color="success"
          sparklineData={taskSparklineData}
          sparklineColor="hsl(var(--success))"
        />
        <StatCard
          label="Daemon Uptime"
          value={daemonStatus?.uptime ? formatUptime(daemonStatus.uptime) : '--'}
          icon={<Clock className="w-5 h-5" />}
          color="info"
        />
      </div>

      {/* Main content grid - stacks on mobile, 2 cols on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Left column - Agents and Tasks */}
        <div className="space-y-4 md:space-y-6">
          {/* Agents panel */}
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setActiveView('agents')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Active Agents</h2>
                <Badge variant="secondary">{agents.length}</Badge>
              </div>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {agents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Monitor className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No agents active</p>
                    </div>
                  ) : (
                    agents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                          <div>
                            <div className="font-medium text-sm">{agent.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {agent.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                        {agent.worktree && (
                          <Badge variant="info" className="font-mono text-xs">
                            {agent.worktree}
                          </Badge>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Recent tasks panel */}
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setActiveView('tasks')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Recent Tasks</h2>
                <Badge variant="secondary">{tasks.length}</Badge>
              </div>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {tasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No tasks yet</p>
                    </div>
                  ) : (
                    tasks.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} />)
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Activity Feed and Suggestions */}
        <div className="space-y-4 md:space-y-6">
          {/* Activity feed - real-time timeline */}
          <div className="h-64 md:h-80">
            <ActivityFeed />
          </div>

          {/* Suggestions panel */}
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setActiveView('suggestions')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Active Suggestions</h2>
                <Badge variant="warning">{suggestionStats.voting}</Badge>
              </div>
              <div className="space-y-2">
                {suggestions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No suggestions yet</p>
                  </div>
                ) : (
                  suggestions
                    .slice(0, 3)
                    .map((suggestion) => (
                      <SuggestionRow key={suggestion.id} suggestion={suggestion} />
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Security panel */}
      <Card>
        <CardContent className="p-4">
          <SecurityPanel />
        </CardContent>
      </Card>

      {/* Bottom grid: Connection status and Performance monitor - stacks on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* Connection status */}
        <Card>
          <CardContent className="p-4">
            <h2 className="font-semibold mb-4">Real-time Connection</h2>
            <ConnectionStatus variant="full" showDataSource showLastUpdate />
          </CardContent>
        </Card>

        {/* Performance monitor */}
        <Card className="md:col-span-2">
          <CardContent className="p-4">
            <PerformanceMonitor />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'accent' | 'success' | 'warning' | 'error' | 'info';
  sparklineData?: { value: number }[];
  sparklineColor?: string;
}

function StatCard({ label, value, icon, color, sparklineData, sparklineColor }: StatCardProps) {
  const colorClasses = {
    accent: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-destructive/10 text-destructive',
    info: 'bg-info/10 text-info',
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
          </div>
          <div className={cn('p-3 rounded-lg', colorClasses[color])}>{icon}</div>
        </div>
        {sparklineData && sparklineData.length > 0 && (
          <div className="h-8 mt-3 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData}>
                <defs>
                  <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={sparklineColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={sparklineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  content={() => null}
                  cursor={false}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={sparklineColor}
                  strokeWidth={1.5}
                  fill={`url(#gradient-${color})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaskRow({ task }: { task: Task }) {
  const statusVariant = {
    pending: 'secondary' as const,
    in_progress: 'warning' as const,
    completed: 'success' as const,
    blocked: 'destructive' as const,
    cancelled: 'secondary' as const,
  };

  const priorityIcon = {
    urgent: '⚡',
    high: '↑',
    normal: '',
    low: '',
  };

  return (
    <div className="p-3 bg-muted/50 rounded-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">
            {priorityIcon[task.priority] && (
              <span className="text-warning mr-1">{priorityIcon[task.priority]}</span>
            )}
            {task.title}
          </div>
          {task.assignedTo && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Assigned to {task.assignedTo}
            </div>
          )}
        </div>
        <Badge variant={statusVariant[task.status]}>{task.status.replace('_', ' ')}</Badge>
      </div>
    </div>
  );
}

function SuggestionRow({ suggestion }: { suggestion: Suggestion }) {
  const categoryVariant = {
    feature: 'default' as const,
    fix: 'destructive' as const,
    improvement: 'info' as const,
    refactor: 'warning' as const,
    docs: 'secondary' as const,
  };

  const totalVotes = suggestion.approveCount + suggestion.rejectCount + suggestion.abstainCount;
  const approvePercent =
    totalVotes > 0 ? Math.round((suggestion.approveCount / totalVotes) * 100) : 0;

  return (
    <div className="p-3 bg-muted/50 rounded-lg">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm truncate">{suggestion.title}</span>
            <Badge variant={categoryVariant[suggestion.category]} className="text-xs">
              {suggestion.category}
            </Badge>
          </div>
          {(suggestion.status === 'proposed' || suggestion.status === 'voting') &&
            totalVotes > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ThumbsUp className="w-3 h-3" />
                  {suggestion.approveCount}
                </span>
                <span className="flex items-center gap-1">
                  <ThumbsDown className="w-3 h-3" />
                  {suggestion.rejectCount}
                </span>
                <span className="text-muted-foreground">({approvePercent}%)</span>
              </div>
            )}
          <div className="text-xs text-muted-foreground mt-1">
            {suggestion.proposedByName} •{' '}
            {formatDistanceToNow(new Date(suggestion.createdAt), { addSuffix: true })}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
