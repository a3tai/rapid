/**
 * AgentDetail - Full page view for agent details
 *
 * Comprehensive view with tabs for Overview, Logs, and Metrics.
 * Provides more space than the preview flyout for detailed analysis.
 */

import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useAppStore, useAgents, useTasks, type Agent } from '../stores/app';
import { useLogStream } from '../hooks/useLogStream';
import { useAgentMetrics, formatDuration, formatCost } from '../hooks/useAgentMetrics';
import { useData } from '../hooks/useData';
import { useToast } from '../components/Toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
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
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function AgentDetailPage() {
  const agents = useAgents();
  const selectedAgentId = useAppStore((s) => s.selectedAgent);
  const agentDetailTab = useAppStore((s) => s.agentDetailTab);
  const setAgentDetailTab = useAppStore((s) => s.setAgentDetailTab);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent);
  const { stopAgent, fetchAgents } = useData();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState(agentDetailTab);
  const [isStopping, setIsStopping] = useState(false);

  // Find the agent
  const agent = agents.find((a) => a.id === selectedAgentId);

  // Sync tab state
  useEffect(() => {
    setActiveTab(agentDetailTab);
  }, [agentDetailTab]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as typeof agentDetailTab);
    setAgentDetailTab(tab as typeof agentDetailTab);
  };

  const handleBack = () => {
    setActiveView('agents');
  };

  const handleStop = async () => {
    if (!agent) return;
    setIsStopping(true);
    try {
      await stopAgent(agent.id);
      toast.success('Agent Stopped', `${agent.name} has been terminated`);
      await fetchAgents();
      setActiveView('agents');
      setSelectedAgent(null);
    } catch (err) {
      toast.error('Failed to Stop Agent', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsStopping(false);
    }
  };

  // Role-based styling
  const roleConfig: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
    orchestrator: { icon: <Target className="w-6 h-6" />, color: 'text-violet-400', bgColor: 'bg-violet-500/10' },
    worker: { icon: <Zap className="w-6 h-6" />, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    architect: { icon: <Cog className="w-6 h-6" />, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
    researcher: { icon: <Search className="w-6 h-6" />, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
    designer: { icon: <Palette className="w-6 h-6" />, color: 'text-pink-400', bgColor: 'bg-pink-500/10' },
    critic: { icon: <Scale className="w-6 h-6" />, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  };

  if (!agent) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Monitor className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Agent Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The agent may have been stopped or is no longer available.
          </p>
          <Button onClick={handleBack} variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Agents
          </Button>
        </div>
      </div>
    );
  }

  const config = roleConfig[agent.name.toLowerCase()] || {
    icon: <Monitor className="w-6 h-6" />,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center', config.bgColor, config.color)}>
            {config.icon}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-mono font-semibold capitalize">{agent.name}</h1>
              <Badge variant="success" className="gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Live
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono">{agent.id}</p>
          </div>
        </div>

        <Button
          variant="destructive"
          onClick={handleStop}
          disabled={isStopping}
          className="gap-2"
        >
          <Square className="w-4 h-4" />
          {isStopping ? 'Stopping...' : 'Stop Agent'}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-fit">
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Terminal className="w-4 h-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="metrics" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Metrics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 overflow-auto mt-6">
          <OverviewTab agent={agent} config={config} />
        </TabsContent>

        <TabsContent value="logs" className="flex-1 overflow-hidden mt-6">
          <LogsTab agentId={agent.id} agentName={agent.name} />
        </TabsContent>

        <TabsContent value="metrics" className="flex-1 overflow-auto mt-6">
          <MetricsTab agentId={agent.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Overview Tab - Full Page Version
interface AgentDetails {
  status?: string;
  model?: string;
  task?: string;
  startedAt?: string;
  worktree?: string;
  pid?: number;
}

interface OverviewTabProps {
  agent: Agent;
  config: { icon: React.ReactNode; color: string; bgColor: string };
}

function OverviewTab({ agent, config }: OverviewTabProps) {
  const tasks = useTasks();
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const { callTool } = useData();
  const [copiedId, setCopiedId] = useState(false);
  const [agentDetails, setAgentDetails] = useState<AgentDetails | null>(null);

  // Fetch additional agent details from MCP
  useEffect(() => {
    const fetchDetails = async () => {
      try {
        // Try persona_agents first
        const result = await callTool('persona_agents', { statusFilter: 'all' }) as { structuredContent?: unknown };
        const data = result?.structuredContent as {
          agents?: Array<{
            agentId: string;
            persona?: string;
            status?: string;
            task?: string;
            worktree?: string;
            startedAt?: string;
            pid?: number;
            model?: string;
          }>;
        };

        if (data?.agents) {
          const details = data.agents.find(a => a.agentId === agent.id);
          if (details) {
            setAgentDetails({
              status: details.status,
              model: details.model,
              task: details.task,
              startedAt: details.startedAt,
              worktree: details.worktree || agent.worktree,
              pid: details.pid,
            });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch agent details:', err);
      }
    };
    fetchDetails();
  }, [agent.id, agent.worktree, callTool]);

  // Find tasks assigned to this agent
  const assignedTasks = tasks.filter(
    (t) => t.assignedTo === agent.id || t.assignedTo === agent.name
  );
  const currentTask = assignedTasks.find((t) => t.status === 'in_progress');
  const pendingTasks = assignedTasks.filter((t) => t.status === 'pending');
  const completedTasks = assignedTasks.filter((t) => t.status === 'completed');

  const handleTaskClick = (taskId: string) => {
    setSelectedTask(taskId);
    setActiveView('tasks');
  };

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(agent.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Determine worktree to display (from details or agent object)
  const worktree = agentDetails?.worktree || agent.worktree;

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Left Column - Agent Info */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agent Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Persona</span>
              <span className={cn('font-mono capitalize font-medium', config.color)}>{agent.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">ID</span>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-muted px-2 py-1 rounded truncate max-w-[160px]">
                  {agent.id}
                </code>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyId}>
                  {copiedId ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            </div>
            {agentDetails?.model && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Model</span>
                <Badge variant="secondary" className="font-mono text-xs">
                  {agentDetails.model}
                </Badge>
              </div>
            )}
            {worktree && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <FolderGit2 className="w-4 h-4" />
                  Worktree
                </span>
                <span className="font-mono text-sm">{worktree}</span>
              </div>
            )}
            {agent.session && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Terminal className="w-4 h-4" />
                  Session
                </span>
                <span className="font-mono text-sm truncate max-w-[160px]">{agent.session}</span>
              </div>
            )}
            {agentDetails?.pid && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">PID</span>
                <span className="font-mono text-sm">{agentDetails.pid}</span>
              </div>
            )}
            {agentDetails?.startedAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  Started
                </span>
                <span className="text-sm">
                  {formatDistanceToNow(new Date(agentDetails.startedAt), { addSuffix: true })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Spawned Task Description */}
        {agentDetails?.task && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spawned With Task</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{agentDetails.task}</p>
            </CardContent>
          </Card>
        )}

        {/* Task Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Task Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-mono text-blue-400">{pendingTasks.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Pending</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-mono text-yellow-400">{currentTask ? 1 : 0}</div>
                <div className="text-xs text-muted-foreground mt-1">Active</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-mono text-green-400">{completedTasks.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Column - Current Task */}
      <div className="space-y-6">
        {currentTask ? (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                Current Task
              </CardTitle>
            </CardHeader>
            <CardContent>
              <button
                onClick={() => handleTaskClick(currentTask.id)}
                className="w-full text-left hover:bg-muted/50 -mx-2 px-2 py-3 rounded-lg transition-colors"
              >
                <div className="font-medium">{currentTask.title}</div>
                {currentTask.description && (
                  <div className="text-sm text-muted-foreground mt-2 line-clamp-3">
                    {currentTask.description}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  Started {formatDistanceToNow(new Date(currentTask.updatedAt), { addSuffix: true })}
                </div>
                {currentTask.tags && currentTask.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {currentTask.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-5 h-5 text-muted-foreground" />
                Current Task
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No active task</p>
                <p className="text-xs mt-1">Agent is idle or waiting for assignment</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Tasks */}
        {pendingTasks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pending Tasks ({pendingTasks.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingTasks.slice(0, 5).map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleTaskClick(task.id)}
                  className="w-full text-left p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="font-medium text-sm">{task.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                  </div>
                </button>
              ))}
              {pendingTasks.length > 5 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  +{pendingTasks.length - 5} more pending tasks
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right Column - Recent Completed */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently Completed</CardTitle>
            <CardDescription>Last 5 completed tasks</CardDescription>
          </CardHeader>
          <CardContent>
            {completedTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No completed tasks yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {completedTasks.slice(0, 5).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleTaskClick(task.id)}
                    className="w-full text-left p-3 rounded-lg bg-green-500/5 hover:bg-green-500/10 transition-colors border border-green-500/20"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <div className="font-medium text-sm truncate">{task.title}</div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 ml-6">
                      {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Logs Tab - Full Page Version
interface LogsTabProps {
  agentId: string;
  agentName: string;
}

function LogsTab({ agentId, agentName }: LogsTabProps) {
  // Try both agentName and agentId for log lookup
  const nameStream = useLogStream(agentName, true, 5000);
  const idStream = useLogStream(agentId, true, 5000);

  // Prefer stream with more logs, or the one that's connected
  const useNameStream = nameStream.logs.length >= idStream.logs.length;
  const { connected, logs, error, clearLogs } = useNameStream ? nameStream : idStream;

  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
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

  // Filter logs by search term
  const filteredLogs = searchTerm
    ? logs.filter((log) => log.line.toLowerCase().includes(searchTerm.toLowerCase()))
    : logs;

  return (
    <Card className="h-full flex flex-col">
      {/* Log Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <Badge variant={connected ? 'success' : 'warning'} className="gap-1.5">
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              connected ? 'bg-success animate-pulse' : 'bg-warning'
            )} />
            {connected ? 'Streaming' : 'Connecting'}
          </Badge>
          <span className="text-sm text-muted-foreground">{logs.length} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 px-3 text-sm bg-muted border-0 rounded-md w-48 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button
            variant={autoScroll ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
          >
            Auto-scroll {autoScroll ? 'ON' : 'OFF'}
          </Button>
          <Button variant="ghost" size="icon" onClick={clearLogs}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Log Output */}
      <div
        ref={outputRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-4 bg-black/30 font-mono text-sm leading-relaxed"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            {logs.length === 0
              ? connected ? 'Waiting for output...' : 'Connecting to stream...'
              : 'No logs match your filter'}
          </div>
        ) : (
          filteredLogs.map((log, i) => (
            <div key={i} className="hover:bg-muted/30 px-2 -mx-2 py-0.5 rounded">
              {log.line}
            </div>
          ))
        )}
      </div>

      {/* Log Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t text-sm text-muted-foreground">
        <span>
          {searchTerm ? `${filteredLogs.length} of ${logs.length} lines` : `${logs.length} lines`}
        </span>
        {!autoScroll && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => {
              setAutoScroll(true);
              outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
            }}
          >
            <ArrowDown className="w-4 h-4 mr-1" />
            Jump to bottom
          </Button>
        )}
      </div>
    </Card>
  );
}

// Metrics Tab - Full Page Version
interface MetricsTabProps {
  agentId: string;
}

function MetricsTab({ agentId }: MetricsTabProps) {
  const { metrics, budget, costSummary, loading, error, refetch } = useAgentMetrics(agentId, true);

  if (loading && !metrics && !budget) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-muted-foreground animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Loading metrics...</p>
        </div>
      </div>
    );
  }

  const hasData = metrics || budget || costSummary;

  if (!hasData && !loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <BarChart3 className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Metrics Recorded</h3>
          <p className="text-muted-foreground mb-4">
            Metrics will appear as the agent completes tasks
          </p>
          <Button variant="outline" onClick={refetch} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  // Find agent-specific cost from summary
  const agentCost = costSummary?.byAgent?.find(a => a.agentId === agentId)?.cost || 0;

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="px-4 py-3 bg-destructive/10 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Tasks Completed</p>
                <p className="text-2xl font-mono font-semibold">{metrics?.completed || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Success Rate</p>
                <p className="text-2xl font-mono font-semibold">
                  {metrics?.successRate ? `${(metrics.successRate * 100).toFixed(0)}%` : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Completion</p>
                <p className="text-2xl font-mono font-semibold">
                  {metrics?.avgCompletionTimeMs ? formatDuration(metrics.avgCompletionTimeMs) : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Cost</p>
                <p className="text-2xl font-mono font-semibold">
                  {agentCost > 0 ? formatCost(agentCost) : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Budget Card */}
        {budget && budget.limit > 0 && (
          <Card className={cn(budget.exceeded && 'border-destructive/50')}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Budget Usage
                {budget.exceeded && (
                  <Badge variant="destructive" className="ml-auto">Exceeded</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Spent</span>
                <span className="font-mono text-lg">{formatCost(budget.spent)}</span>
              </div>
              <Progress
                value={Math.min(budget.percentUsed, 100)}
                className={cn('h-3', budget.exceeded && '[&>div]:bg-destructive')}
              />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{budget.percentUsed.toFixed(1)}% used</span>
                <span>Limit: {formatCost(budget.limit)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Task Statistics */}
        {metrics && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Task Statistics (24h)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-muted-foreground">Completed</span>
                </div>
                <span className="font-mono text-lg">{metrics.completed}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <span className="text-muted-foreground">Failed</span>
                </div>
                <span className="font-mono text-lg">{metrics.failed}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-amber-500" />
                  <span className="text-muted-foreground">Avg Completion Time</span>
                </div>
                <span className="font-mono text-lg">{formatDuration(metrics.avgCompletionTimeMs)}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cost by Model */}
      {costSummary && costSummary.byModel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Cost by Model (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {costSummary.byModel.map((model) => (
                <div key={model.model} className="flex items-center gap-4">
                  <span className="text-sm font-mono w-32 truncate">{model.model}</span>
                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${(model.cost / costSummary.totalCost) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono w-20 text-right">{formatCost(model.cost)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <span className="font-medium">Total</span>
              <span className="font-mono font-medium text-lg">{formatCost(costSummary.totalCost)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center">
        <Button variant="outline" onClick={refetch} disabled={loading} className="gap-2">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh Metrics
        </Button>
      </div>
    </div>
  );
}
