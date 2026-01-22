/**
 * AgentDetailPanel - Flyout panel with tabs for agent overview, logs, and metrics
 */

import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useAppStore, useTasks, type Agent } from '../stores/app';
import { useLogStream } from '../hooks/useLogStream';
import { useAgentMetrics, formatDuration, formatCost } from '../hooks/useAgentMetrics';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  X,
  Terminal,
  Square,
  FolderGit2,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  ArrowDown,
  Trash2,
  RefreshCw,
  Monitor,
  Target,
  Zap,
  Search,
  Palette,
  Scale,
  Cog,
  DollarSign,
  TrendingUp,
  BarChart3,
  Maximize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type AgentDetailTab = 'overview' | 'logs' | 'metrics';

interface AgentDetailPanelProps {
  agent: Agent;
  initialTab?: AgentDetailTab;
  onClose: () => void;
  onStop: () => Promise<void>;
}

export function AgentDetailPanel({
  agent,
  initialTab = 'overview',
  onClose,
  onStop,
}: AgentDetailPanelProps) {
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setAgentDetailTab = useAppStore((s) => s.setAgentDetailTab);
  const [activeTab, setActiveTab] = useState<AgentDetailTab>(initialTab);
  const [isStopping, setIsStopping] = useState(false);

  // Update tab when initialTab prop changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleViewFullPage = () => {
    setAgentDetailTab(activeTab);
    setActiveView('agent-detail');
    // Don't call onClose() - it would clear selectedAgent which the detail page needs
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      await onStop();
      onClose();
    } catch (err) {
      console.error('Failed to stop agent:', err);
    } finally {
      setIsStopping(false);
    }
  };

  // Role-based styling
  const roleConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    orchestrator: { icon: <Target className="w-5 h-5" />, color: 'text-violet-400' },
    worker: { icon: <Zap className="w-5 h-5" />, color: 'text-blue-400' },
    architect: { icon: <Cog className="w-5 h-5" />, color: 'text-amber-400' },
    researcher: { icon: <Search className="w-5 h-5" />, color: 'text-emerald-400' },
    designer: { icon: <Palette className="w-5 h-5" />, color: 'text-pink-400' },
    critic: { icon: <Scale className="w-5 h-5" />, color: 'text-red-400' },
  };

  const config = roleConfig[agent.name.toLowerCase()] || {
    icon: <Monitor className="w-5 h-5" />,
    color: 'text-muted-foreground',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Flyout Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-[520px] bg-card border-l shadow-2xl z-50 flex flex-col animate-in slide-in-from-right overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-muted/50">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center bg-muted', config.color)}>
              {config.icon}
            </div>
            <div>
              <h3 className="font-mono font-semibold capitalize">{agent.name}</h3>
              <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                {agent.id.substring(0, 24)}...
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" className="gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Live
            </Badge>
            <Button variant="ghost" size="icon" onClick={handleViewFullPage} title="View full page">
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AgentDetailTab)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-4 grid grid-cols-3">
            <TabsTrigger value="overview" className="gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Metrics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 overflow-auto m-0 p-4">
            <OverviewTab agent={agent} config={config} onViewLogs={() => setActiveTab('logs')} />
          </TabsContent>

          <TabsContent value="logs" className="flex-1 overflow-hidden m-0 flex flex-col">
            <LogsTab agentId={agent.id} agentName={agent.name} />
          </TabsContent>

          <TabsContent value="metrics" className="flex-1 overflow-auto m-0 p-4">
            <MetricsTab agentId={agent.id} />
          </TabsContent>
        </Tabs>

        {/* Footer Actions */}
        <div className="p-4 border-t bg-muted/30 flex justify-between gap-3">
          <Button
            variant="destructive"
            onClick={handleStop}
            disabled={isStopping}
            className="gap-2"
          >
            <Square className="w-4 h-4" />
            {isStopping ? 'Stopping...' : 'Stop Agent'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}

// Overview Tab
interface OverviewTabProps {
  agent: Agent;
  config: { icon: React.ReactNode; color: string };
  onViewLogs: () => void;
}

function OverviewTab({ agent, config, onViewLogs }: OverviewTabProps) {
  const tasks = useTasks();
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);
  const setActiveView = useAppStore((s) => s.setActiveView);

  // Find tasks assigned to this agent
  const assignedTasks = tasks.filter(
    (t) => t.assignedTo === agent.id || t.assignedTo === agent.name
  );
  const currentTask = assignedTasks.find((t) => t.status === 'in_progress');
  const completedCount = assignedTasks.filter((t) => t.status === 'completed').length;
  const pendingCount = assignedTasks.filter((t) => t.status === 'pending').length;

  const handleTaskClick = (taskId: string) => {
    setSelectedTask(taskId);
    setActiveView('tasks');
  };

  return (
    <div className="space-y-4">
      {/* Agent Info */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">Agent Info</CardTitle>
        </CardHeader>
        <CardContent className="py-3 px-4 pt-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Persona</span>
            <div className="flex items-center gap-2">
              <span className={cn('font-mono capitalize', config.color)}>{agent.name}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">ID</span>
            <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded truncate max-w-[180px]">
              {agent.id}
            </code>
          </div>
          {agent.worktree && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <FolderGit2 className="w-3.5 h-3.5" />
                Worktree
              </span>
              <span className="font-mono text-sm">{agent.worktree}</span>
            </div>
          )}
          {agent.session && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                Session
              </span>
              <span className="font-mono text-sm truncate max-w-[180px]">{agent.session}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task Summary */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">Task Summary</CardTitle>
        </CardHeader>
        <CardContent className="py-3 px-4 pt-0">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              <div className="text-lg font-mono text-blue-400">{pendingCount}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              <div className="text-lg font-mono text-yellow-400">{currentTask ? 1 : 0}</div>
              <div className="text-xs text-muted-foreground">Active</div>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              <div className="text-lg font-mono text-green-400">{completedCount}</div>
              <div className="text-xs text-muted-foreground">Done</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Task */}
      {currentTask && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              Current Task
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3 px-4 pt-0">
            <button
              onClick={() => handleTaskClick(currentTask.id)}
              className="w-full text-left hover:bg-muted/50 -mx-2 px-2 py-2 rounded-lg transition-colors"
            >
              <div className="font-medium text-sm">{currentTask.title}</div>
              {currentTask.description && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {currentTask.description}
                </div>
              )}
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Started {formatDistanceToNow(new Date(currentTask.updatedAt), { addSuffix: true })}
              </div>
            </button>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="py-3 px-4 pt-0">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onViewLogs} className="flex-1 gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              View Logs
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Logs Tab
interface LogsTabProps {
  agentId: string;
  agentName: string;
}

function LogsTab({ agentId, agentName }: LogsTabProps) {
  // Try both agentName and agentId for log lookup
  const nameStream = useLogStream(agentName, true, 2000);
  const idStream = useLogStream(agentId, true, 2000);

  // Prefer stream with more logs, or the one that's connected
  const useNameStream = nameStream.logs.length >= idStream.logs.length;
  const { connected, logs, error, clearLogs } = useNameStream ? nameStream : idStream;

  const [autoScroll, setAutoScroll] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (outputRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
      setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Log Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Badge variant={connected ? 'success' : 'warning'} className="gap-1.5">
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              connected ? 'bg-success animate-pulse' : 'bg-warning'
            )} />
            {connected ? 'Streaming' : 'Connecting'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoScroll ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
            className="h-7 text-xs"
          >
            Auto-scroll {autoScroll ? 'ON' : 'OFF'}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearLogs}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs font-mono">
          {error}
        </div>
      )}

      {/* Log Output */}
      <div
        ref={outputRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-4 bg-black/20 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            {connected ? 'Waiting for output...' : 'Connecting to stream...'}
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="hover:bg-muted/30 px-1 -mx-1 rounded">
              {log.line}
            </div>
          ))
        )}
      </div>

      {/* Log Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground font-mono">
        <span>{logs.length} lines</span>
        {!autoScroll && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => {
              setAutoScroll(true);
              outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
            }}
          >
            <ArrowDown className="w-3 h-3 mr-1" />
            Jump to bottom
          </Button>
        )}
      </div>
    </div>
  );
}

// Metrics Tab
interface MetricsTabProps {
  agentId: string;
}

function MetricsTab({ agentId }: MetricsTabProps) {
  const { metrics, budget, costSummary, loading, error, refetch } = useAgentMetrics(agentId, true);

  if (loading && !metrics && !budget) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading metrics...</p>
        </div>
      </div>
    );
  }

  const hasData = metrics || budget || costSummary;

  if (!hasData && !loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No metrics recorded yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Metrics will appear as the agent completes tasks
          </p>
          <Button variant="ghost" size="sm" onClick={refetch} className="mt-4 gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  // Find agent-specific cost from summary
  const agentCost = costSummary?.byAgent?.find(a => a.agentId === agentId)?.cost || 0;

  return (
    <div className="space-y-4">
      {/* Error Banner */}
      {error && (
        <div className="px-3 py-2 bg-destructive/10 rounded-lg text-destructive text-xs">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          icon={<CheckCircle className="w-4 h-4 text-green-500" />}
          label="Tasks Completed"
          value={metrics?.completed?.toString() || '0'}
        />
        <KpiCard
          icon={<TrendingUp className="w-4 h-4 text-blue-500" />}
          label="Success Rate"
          value={metrics?.successRate ? `${(metrics.successRate * 100).toFixed(0)}%` : '-'}
        />
        <KpiCard
          icon={<Clock className="w-4 h-4 text-amber-500" />}
          label="Avg Time"
          value={metrics?.avgCompletionTimeMs ? formatDuration(metrics.avgCompletionTimeMs) : '-'}
        />
        <KpiCard
          icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
          label="Cost"
          value={agentCost > 0 ? formatCost(agentCost) : '-'}
        />
      </div>

      {/* Budget Card */}
      {budget && budget.limit > 0 && (
        <Card className={cn(budget.exceeded && 'border-destructive/50 bg-destructive/5')}>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Budget Usage
              {budget.exceeded && (
                <Badge variant="destructive" className="ml-auto">Exceeded</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3 px-4 pt-0 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Spent</span>
              <span className="font-mono">{formatCost(budget.spent)}</span>
            </div>
            <Progress
              value={Math.min(budget.percentUsed, 100)}
              className={cn(budget.exceeded && '[&>div]:bg-destructive')}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{budget.percentUsed.toFixed(0)}% used</span>
              <span>Limit: {formatCost(budget.limit)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task Stats Card */}
      {metrics && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Task Statistics (24h)
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3 px-4 pt-0 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-muted-foreground">Completed</span>
              </div>
              <span className="font-mono">{metrics.completed}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-muted-foreground">Failed</span>
              </div>
              <span className="font-mono">{metrics.failed}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-muted-foreground">Avg Time</span>
              </div>
              <span className="font-mono">{formatDuration(metrics.avgCompletionTimeMs)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost by Model */}
      {costSummary && costSummary.byModel.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Cost by Model (24h)
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3 px-4 pt-0 space-y-2">
            {costSummary.byModel.map((model) => (
              <div key={model.model} className="flex items-center justify-between">
                <span className="text-sm font-mono text-muted-foreground">{model.model}</span>
                <span className="text-sm font-mono">{formatCost(model.cost)}</span>
              </div>
            ))}
            <div className="pt-2 border-t flex items-center justify-between">
              <span className="text-sm font-medium">Total</span>
              <span className="text-sm font-mono font-medium">{formatCost(costSummary.totalCost)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center pt-2">
        <Button variant="ghost" size="sm" onClick={refetch} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh Metrics
        </Button>
      </div>
    </div>
  );
}

// KPI Card Component
interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
}

function KpiCard({ icon, label, value, subValue }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="text-xl font-mono font-semibold">{value}</div>
        {subValue && <div className="text-xs text-muted-foreground">{subValue}</div>}
      </CardContent>
    </Card>
  );
}
