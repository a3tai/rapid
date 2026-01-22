import { useState, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useTasks, useAppStore } from '../stores/app';
import type { Task } from '../stores/app';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Clock,
  Zap,
  CheckCircle,
  AlertCircle,
  Eye,
  ArrowUp,
  ArrowDown,
  X as XIcon,
} from 'lucide-react';

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
type SortBy = 'date' | 'priority' | 'status' | 'assignee';
type SortOrder = 'asc' | 'desc';

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: <Clock className="w-3 h-3" />, color: 'bg-blue-500' },
  in_progress: { label: 'In Progress', icon: <Zap className="w-3 h-3" />, color: 'bg-yellow-500' },
  completed: { label: 'Completed', icon: <CheckCircle className="w-3 h-3" />, color: 'bg-green-500' },
  blocked: { label: 'Blocked', icon: <AlertCircle className="w-3 h-3" />, color: 'bg-red-500' },
  cancelled: { label: 'Cancelled', icon: <XIcon className="w-3 h-3" />, color: 'bg-gray-500' },
};

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: 'destructive' },
  high: { label: 'High', color: 'warning' },
  normal: { label: 'Normal', color: 'info' },
  low: { label: 'Low', color: 'secondary' },
};

export function TaskQueueListView() {
  const tasks = useTasks();
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);

  // Filter state
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<'all' | 'urgent' | 'high' | 'normal' | 'low'>(
    'all'
  );
  const [filterAssignee, setFilterAssignee] = useState<'all' | 'unassigned' | string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Get unique assignees for filter
  const uniqueAssignees = useMemo(
    () => Array.from(new Set(tasks.filter((t) => t.assignedTo).map((t) => t.assignedTo))),
    [tasks]
  );

  // Apply filters
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
      if (filterAssignee === 'unassigned' && t.assignedTo) return false;
      if (
        filterAssignee !== 'all' &&
        filterAssignee !== 'unassigned' &&
        t.assignedTo !== filterAssignee
      )
        return false;
      if (
        searchQuery &&
        !t.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !t.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    });
  }, [tasks, filterStatus, filterPriority, filterAssignee, searchQuery]);

  // Apply sorting
  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks].sort((a, b) => {
      let aVal: string | number, bVal: string | number;

      switch (sortBy) {
        case 'date':
          aVal = new Date(a.updatedAt).getTime();
          bVal = new Date(b.updatedAt).getTime();
          break;
        case 'priority': {
          const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
          aVal = priorityOrder[a.priority as keyof typeof priorityOrder];
          bVal = priorityOrder[b.priority as keyof typeof priorityOrder];
          break;
        }
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'assignee':
          aVal = a.assignedTo || 'zzz';
          bVal = b.assignedTo || 'zzz';
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredTasks, sortBy, sortOrder]);

  const priorityVariant = {
    urgent: 'destructive' as const,
    high: 'warning' as const,
    normal: 'info' as const,
    low: 'secondary' as const,
  };

  const statusVariant = {
    pending: 'secondary' as const,
    in_progress: 'warning' as const,
    completed: 'success' as const,
    blocked: 'destructive' as const,
    cancelled: 'secondary' as const,
  };

  const resetFilters = () => {
    setFilterStatus('all');
    setFilterPriority('all');
    setFilterAssignee('all');
    setSearchQuery('');
    setSortBy('date');
    setSortOrder('desc');
  };

  const hasActiveFilters =
    filterStatus !== 'all' ||
    filterPriority !== 'all' ||
    filterAssignee !== 'all' ||
    searchQuery !== '';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Task Queue</h2>
          <p className="text-sm text-muted-foreground">
            {sortedTasks.length} of {tasks.length} tasks
          </p>
        </div>
      </div>

      {/* Filters Card */}
      <Card className="bg-muted/50">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Filters & Sorting</h3>
            {hasActiveFilters && (
              <Button variant="link" size="sm" onClick={resetFilters} className="h-auto p-0">
                Reset
              </Button>
            )}
          </div>

          {/* Search */}
          <div>
            <Label className="text-xs mb-2 block">Search</Label>
            <Input
              placeholder="Search tasks by title or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Filter Controls */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
            {/* Status filter */}
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={filterStatus}
                onValueChange={(v) => setFilterStatus(v as TaskStatus | 'all')}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority filter */}
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select
                value={filterPriority}
                onValueChange={(v) =>
                  setFilterPriority(v as 'all' | 'urgent' | 'high' | 'normal' | 'low')
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assignee filter */}
            <div className="space-y-1">
              <Label className="text-xs">Assignee</Label>
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {uniqueAssignees.map((assignee) => (
                    <SelectItem key={assignee} value={assignee}>
                      {assignee}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort by */}
            <div className="space-y-1">
              <Label className="text-xs">Sort By</Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Updated</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="assignee">Assignee</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort order */}
            <div className="space-y-1">
              <Label className="text-xs">Order</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="h-8 w-full justify-center gap-1 text-xs"
              >
                {sortOrder === 'asc' ? (
                  <ArrowUp className="w-3 h-3" />
                ) : (
                  <ArrowDown className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Table */}
      <Card>
        <ScrollArea>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No tasks match your filters
                  </TableCell>
                </TableRow>
              ) : (
                sortedTasks.map((task) => (
                  <TableRow key={task.id}>
                    {/* Title */}
                    <TableCell>
                      <button
                        onClick={() => setSelectedTask(task.id)}
                        className="text-left font-medium text-sm hover:text-primary transition-colors line-clamp-2"
                      >
                        {task.title}
                      </button>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Badge variant={statusVariant[task.status]} className="font-normal">
                        <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
                        {STATUS_CONFIG[task.status].label}
                      </Badge>
                    </TableCell>

                    {/* Priority */}
                    <TableCell>
                      <Badge variant={priorityVariant[task.priority]} className="font-normal">
                        {PRIORITY_CONFIG[task.priority].label}
                      </Badge>
                    </TableCell>

                    {/* Assigned */}
                    <TableCell>
                      {task.assignedTo ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-medium text-primary">
                              {task.assignedTo[0]?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground truncate max-w-[100px]">
                            {task.assignedTo}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Unassigned</span>
                      )}
                    </TableCell>

                    {/* Progress */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden flex-shrink-0">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{
                              width: `${task.status === 'completed' ? 100 : task.status === 'in_progress' ? 50 : 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {task.status === 'completed' ? 100 : task.status === 'in_progress' ? 50 : 0}%
                        </span>
                      </div>
                    </TableCell>

                    {/* Updated */}
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTask(task.id)}
                        title="View details"
                        className="h-7 px-2"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
}
