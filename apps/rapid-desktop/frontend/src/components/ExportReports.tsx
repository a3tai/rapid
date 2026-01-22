/**
 * Export Reports Component
 *
 * Provides data export functionality for:
 * - Cost reports (CSV)
 * - Task lists (CSV/JSON)
 * - Agent metrics (JSON)
 */

import { useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useCostSummary, useCostRecords, formatCost, formatTokens } from '../hooks/useCostData';
import { useTasks } from '../stores/app';
import { useData } from '../hooks/useData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, FileJson, FileText, FileCode, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExportFormat {
  id: string;
  name: string;
  icon: React.ReactNode;
  mimeType: string;
  extension: string;
}

const EXPORT_FORMATS: ExportFormat[] = [
  { id: 'csv', name: 'CSV', icon: <FileText className="w-4 h-4" />, mimeType: 'text/csv', extension: 'csv' },
  { id: 'json', name: 'JSON', icon: <FileJson className="w-4 h-4" />, mimeType: 'application/json', extension: 'json' },
  {
    id: 'jsonl',
    name: 'JSONL',
    icon: <FileCode className="w-4 h-4" />,
    mimeType: 'application/jsonl',
    extension: 'jsonl',
  },
];

const REPORT_TYPES = [
  { id: 'cost', name: 'Cost Report', description: 'Spending by model, agent, and session' },
  { id: 'tasks', name: 'Task List', description: 'All tasks with status and metrics' },
  { id: 'metrics', name: 'Agent Metrics', description: 'Task completion, timing, budget' },
];

const TIME_RANGES = [
  { id: '24h', name: 'Last 24 hours', hours: 24 },
  { id: '7d', name: 'Last 7 days', hours: 168 },
  { id: '30d', name: 'Last 30 days', hours: 720 },
  { id: 'custom', name: 'Custom range', hours: 0 },
];

interface ExportOptions {
  reportType: string;
  format: string;
  timeRange: string;
  startDate?: Date;
  endDate?: Date;
}

export function ExportReports() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ExportOptions>({
    reportType: 'cost',
    format: 'csv',
    timeRange: '24h',
  });
  const [isExporting, setIsExporting] = useState(false);
  const [lastExport, setLastExport] = useState<{ timestamp: string; type: string } | null>(null);

  const { callTool } = useData();
  const tasks = useTasks();
  const { data: costSummary } = useCostSummary(getHoursFromRange(options.timeRange));
  const { data: costRecords } = useCostRecords({}, true, 120000);

  function getHoursFromRange(rangeId: string): number {
    const range = TIME_RANGES.find((r) => r.id === rangeId);
    return range?.hours || 24;
  }

  const generateCostReport = useCallback((): unknown => {
    if (!costSummary) return null;

    return {
      timestamp: new Date().toISOString(),
      period: {
        hours: getHoursFromRange(options.timeRange),
        startDate: options.startDate?.toISOString(),
        endDate: options.endDate?.toISOString(),
      },
      summary: {
        totalCost: costSummary.totalCost,
        inputTokens: costSummary.inputTokens,
        outputTokens: costSummary.outputTokens,
        cacheReadTokens: costSummary.cacheReadTokens || 0,
        cacheWriteTokens: costSummary.cacheWriteTokens || 0,
      },
      byModel: costSummary.byModel.map((m) => ({
        model: m.model,
        cost: m.cost,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        percentOfTotal: m.percentOfTotal,
      })),
      byAgent: costSummary.byAgent.map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        cost: a.cost,
        tasksCompleted: a.tasksCompleted,
        costPerTask: a.costPerTask,
      })),
      detailedRecords: costRecords.slice(0, 100).map((r) => ({
        timestamp: r.timestamp,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cost: r.cost,
        agentId: r.agentId,
        taskId: r.taskId,
      })),
    };
  }, [costSummary, costRecords, options.timeRange, options.startDate, options.endDate]);

  const generateTaskReport = useCallback((): unknown => {
    return {
      timestamp: new Date().toISOString(),
      totalTasks: tasks.length,
      byStatus: {
        pending: tasks.filter((t) => t.status === 'pending').length,
        inProgress: tasks.filter((t) => t.status === 'in_progress').length,
        completed: tasks.filter((t) => t.status === 'completed').length,
        blocked: tasks.filter((t) => t.status === 'blocked').length,
        cancelled: tasks.filter((t) => t.status === 'cancelled').length,
      },
      byPriority: {
        urgent: tasks.filter((t) => t.priority === 'urgent').length,
        high: tasks.filter((t) => t.priority === 'high').length,
        normal: tasks.filter((t) => t.priority === 'normal').length,
        low: tasks.filter((t) => t.priority === 'low').length,
      },
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assignedTo: t.assignedTo,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        tags: t.tags || [],
      })),
    };
  }, [tasks]);

  const generateMetricsReport = useCallback(async (): Promise<unknown> => {
    try {
      const metricsResult = await callTool('metrics_agent_report', {
        periodHours: getHoursFromRange(options.timeRange),
      });

      const metricsData = metricsResult?.structuredContent as {
        agents?: Array<{
          agentId: string;
          agentName?: string;
          completed: number;
          failed: number;
          avgCompletionTimeMs?: number;
          successRate?: number;
        }>;
      } | null;

      return {
        timestamp: new Date().toISOString(),
        period: {
          hours: getHoursFromRange(options.timeRange),
        },
        costSummary,
        agents: (metricsData?.agents || []).map((a) => ({
          agentId: a.agentId,
          agentName: a.agentName,
          tasksCompleted: a.completed,
          tasksFailed: a.failed,
          successRate: a.successRate || 0,
          avgCompletionMs: a.avgCompletionTimeMs || 0,
        })),
      };
    } catch (error) {
      console.error('Failed to generate metrics report:', error);
      return null;
    }
  }, [callTool, costSummary, options.timeRange]);

  const convertToCSV = (data: unknown): string => {
    if (typeof data !== 'object' || data === null) return '';

    const obj = data as Record<string, unknown>;

    if (Array.isArray(obj.tasks)) {
      const tasks = obj.tasks as Array<Record<string, unknown>>;
      const headers = ['ID', 'Title', 'Status', 'Priority', 'Assigned To', 'Created At', 'Updated At'];
      const rows = tasks.map((t) => [
        String(t.id || ''),
        String(t.title || ''),
        String(t.status || ''),
        String(t.priority || ''),
        String(t.assignedTo || ''),
        String(t.createdAt || ''),
        String(t.updatedAt || ''),
      ]);
      return [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    }

    if (Array.isArray(obj.byModel)) {
      const models = obj.byModel as Array<Record<string, unknown>>;
      const headers = ['Model', 'Cost', 'Input Tokens', 'Output Tokens', '% of Total'];
      const rows = models.map((m) => [
        String(m.model || ''),
        String(m.cost || '0'),
        String(m.inputTokens || '0'),
        String(m.outputTokens || '0'),
        String(m.percentOfTotal || '0'),
      ]);
      return [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    }

    return '';
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let data: unknown = null;

      switch (options.reportType) {
        case 'cost':
          data = generateCostReport();
          break;
        case 'tasks':
          data = generateTaskReport();
          break;
        case 'metrics':
          data = await generateMetricsReport();
          break;
        default:
          break;
      }

      if (!data) {
        console.error('No data to export');
        return;
      }

      const format = EXPORT_FORMATS.find((f) => f.id === options.format);
      const reportType = REPORT_TYPES.find((t) => t.id === options.reportType);
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${reportType?.name.replace(/\s+/g, '-').toLowerCase()}-${timestamp}.${format?.extension}`;

      let content = '';
      if (options.format === 'csv') {
        content = convertToCSV(data);
      } else if (options.format === 'jsonl') {
        if (typeof data === 'object' && data !== null) {
          const obj = data as Record<string, unknown>;
          if (Array.isArray(obj.tasks) || Array.isArray(obj.byModel) || Array.isArray(obj.agents)) {
            const items = (obj.tasks || obj.byModel || obj.agents) as Array<unknown>;
            content = items.map((item) => JSON.stringify(item)).join('\n');
          } else {
            content = JSON.stringify(data);
          }
        }
      } else {
        content = JSON.stringify(data, null, 2);
      }

      downloadFile(content, filename, format?.mimeType || 'application/json');

      setLastExport({
        timestamp: new Date().toISOString(),
        type: reportType?.name || options.reportType,
      });

      setIsOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <Download className="w-4 h-4" />
        Export
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Export Reports</DialogTitle>
            <DialogDescription>
              Export data in various formats for offline analysis and reporting
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Report Type Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Report Type</Label>
              <div className="grid grid-cols-2 gap-3">
                {REPORT_TYPES.map((type) => (
                  <div
                    key={type.id}
                    className={cn(
                      'p-3 border rounded-lg cursor-pointer transition-colors',
                      options.reportType === type.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                    onClick={() => setOptions({ ...options, reportType: type.id })}
                  >
                    <div className="font-medium text-sm">{type.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{type.description}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Time Range Selection */}
            <div className="space-y-3">
              <Label htmlFor="time-range" className="text-base font-semibold">
                Time Range
              </Label>
              <Select value={options.timeRange} onValueChange={(value) => setOptions({ ...options, timeRange: value })}>
                <SelectTrigger id="time-range">
                  <Clock className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map((range) => (
                    <SelectItem key={range.id} value={range.id}>
                      {range.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {options.timeRange === 'custom' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label htmlFor="start-date" className="text-sm mb-2 block">
                      Start Date
                    </Label>
                    <Input
                      id="start-date"
                      type="date"
                      onChange={(e) =>
                        setOptions({
                          ...options,
                          startDate: e.target.value ? new Date(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="end-date" className="text-sm mb-2 block">
                      End Date
                    </Label>
                    <Input
                      id="end-date"
                      type="date"
                      onChange={(e) =>
                        setOptions({
                          ...options,
                          endDate: e.target.value ? new Date(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Format Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Export Format</Label>
              <div className="grid grid-cols-3 gap-3">
                {EXPORT_FORMATS.map((format) => (
                  <button
                    key={format.id}
                    className={cn(
                      'p-3 border rounded-lg cursor-pointer transition-colors flex flex-col items-center gap-2',
                      options.format === format.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                    onClick={() => setOptions({ ...options, format: format.id })}
                  >
                    <div className="text-xl">{format.icon}</div>
                    <div className="font-medium text-sm">{format.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Data Preview */}
            {(options.reportType === 'cost' || options.reportType === 'tasks') && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-48">
                    {options.reportType === 'cost' && costSummary && (
                      <div className="space-y-2 text-sm pr-4">
                        <div className="flex justify-between">
                          <span>Total Cost:</span>
                          <span className="font-semibold">{formatCost(costSummary.totalCost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Input Tokens:</span>
                          <span>{formatTokens(costSummary.inputTokens)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Output Tokens:</span>
                          <span>{formatTokens(costSummary.outputTokens)}</span>
                        </div>
                        <div className="mt-3 pt-3 border-t space-y-1">
                          <div className="font-semibold">By Model:</div>
                          {costSummary.byModel.map((m) => (
                            <div key={m.model} className="flex justify-between text-xs">
                              <span>{m.model}</span>
                              <span>{formatCost(m.cost)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {options.reportType === 'tasks' && (
                      <div className="space-y-2 text-sm pr-4">
                        <div className="flex justify-between">
                          <span>Total Tasks:</span>
                          <span className="font-semibold">{tasks.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Completed:</span>
                          <Badge variant="default" className="text-xs">
                            {tasks.filter((t) => t.status === 'completed').length}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>In Progress:</span>
                          <Badge variant="secondary" className="text-xs">
                            {tasks.filter((t) => t.status === 'in_progress').length}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Pending:</span>
                          <Badge variant="outline" className="text-xs">
                            {tasks.filter((t) => t.status === 'pending').length}
                          </Badge>
                        </div>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Last Export Info */}
            {lastExport && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm">
                <div className="font-medium text-green-500">✓ Export successful</div>
                <div className="text-muted-foreground mt-1">
                  {lastExport.type} exported {formatDistanceToNow(new Date(lastExport.timestamp), { addSuffix: true })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
