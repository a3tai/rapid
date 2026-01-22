/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTasks, useAgents, useAppStore, type Task } from '../stores/app';
import { useData } from '../hooks/useData';
import { useToast } from '../components/Toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Markdown } from '@/components/ui/markdown';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  LayoutGrid,
  List,
  Plus,
  X,
  Loader2,
  GripVertical,
  Clock,
  Zap,
  CheckCircle,
  AlertCircle,
  XCircle,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';

const COLUMNS: { id: TaskStatus; label: string; color: string; icon: React.ReactNode }[] = [
  { id: 'pending', label: 'Pending', color: 'bg-muted', icon: <Clock className="w-3 h-3" /> },
  { id: 'in_progress', label: 'In Progress', color: 'bg-yellow-400', icon: <Zap className="w-3 h-3" /> },
  { id: 'completed', label: 'Completed', color: 'bg-green-400', icon: <CheckCircle className="w-3 h-3" /> },
  { id: 'blocked', label: 'Blocked', color: 'bg-red-400', icon: <AlertCircle className="w-3 h-3" /> },
];

type SortBy = 'date' | 'priority' | 'status' | 'assignee';
type SortOrder = 'asc' | 'desc';

export function TasksPage() {
  const tasks = useTasks();
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<
    'all' | 'urgent' | 'high' | 'normal' | 'low'
  >('all');
  const [filterAssignee, setFilterAssignee] = useState<'all' | 'unassigned' | string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const { updateTaskStatus, createTask } = useData();
  const toast = useToast();

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Apply filters
  const filteredTasks = tasks.filter((t) => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (filterAssignee === 'unassigned' && t.assignedTo) return false;
    if (
      filterAssignee !== 'all' &&
      filterAssignee !== 'unassigned' &&
      t.assignedTo !== filterAssignee
    )
      return false;
    return true;
  });

  // Apply sorting
  const sortedTasks = [...filteredTasks].sort((a, b) => {
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

  // Track recently moved tasks for celebration animation
  const [recentlyMoved, setRecentlyMoved] = useState<Set<string>>(new Set());

  const tasksByStatus = useMemo(() => {
    return COLUMNS.reduce(
      (acc, col) => {
        acc[col.id] = tasks.filter((t) => t.status === col.id);
        return acc;
      },
      {} as Record<TaskStatus, Task[]>
    );
  }, [tasks]);

  // DnD event handlers
  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Visual feedback handled by CSS
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if dropped on a column or another task
    const task = tasks.find((t) => t.id === activeId);
    if (!task) return;

    // Determine target status - either the column ID or the status of the task dropped on
    let targetStatus: TaskStatus | null = null;

    if (COLUMNS.some((c) => c.id === overId)) {
      targetStatus = overId as TaskStatus;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        targetStatus = overTask.status;
      }
    }

    if (targetStatus && targetStatus !== task.status) {
      try {
        await updateTaskStatus(activeId, targetStatus);

        // Add to recently moved for celebration animation
        setRecentlyMoved((prev) => new Set([...prev, activeId]));

        // Remove from recently moved after animation completes
        setTimeout(() => {
          setRecentlyMoved((prev) => {
            const next = new Set(prev);
            next.delete(activeId);
            return next;
          });
        }, 1500);

        toast.success('Task Moved', `"${task.title}" moved to ${targetStatus.replace('_', ' ')}`);
      } catch (err) {
        toast.error('Move Failed', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  };

  // Get unique assignees for filter dropdown
  const uniqueAssignees = Array.from(
    new Set(tasks.filter((t) => t.assignedTo).map((t) => t.assignedTo))
  );

  // Bulk selection handlers
  const toggleTaskSelection = (taskId: string) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  };

  const selectAll = () => {
    setSelectedTasks(new Set(sortedTasks.map((t) => t.id)));
  };

  const deselectAll = () => {
    setSelectedTasks(new Set());
  };

  const bulkChangeStatus = async (newStatus: TaskStatus) => {
    try {
      const taskIds = Array.from(selectedTasks);
      const updates = taskIds.map((id) => updateTaskStatus(id, newStatus));
      await Promise.all(updates);
      toast.success('Bulk Action', `Updated ${selectedTasks.size} tasks to ${newStatus}`);
      deselectAll();
    } catch (err) {
      toast.error(
        'Bulk Status Update Failed',
        err instanceof Error ? err.message : 'Unknown error'
      );
    }
  };

  const bulkDelete = () => {
    if (selectedTasks.size === 0) return;
    if (confirm(`Delete ${selectedTasks.size} selected tasks? This cannot be undone.`)) {
      toast.success('Bulk Delete', `Deleted ${selectedTasks.size} tasks`);
      deselectAll();
    }
  };

  // Get selected task details
  const selectedTaskId = useAppStore((s) => s.selectedTask);
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="space-y-6 h-full flex flex-col relative">
      {/* Task Detail Flyout Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onStatusChange={async (newStatus) => {
            try {
              await updateTaskStatus(selectedTask.id, newStatus);
              toast.success('Status Updated', `Task moved to ${newStatus.replace('_', ' ')}`);
            } catch (err) {
              toast.error('Update Failed', err instanceof Error ? err.message : 'Unknown error');
            }
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Task Board</h2>
          <p className="text-muted-foreground text-sm mt-1">{tasks.length} tasks total</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'board' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('board')}
              className="gap-1"
            >
              <LayoutGrid className="w-4 h-4" />
              Board
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="gap-1"
            >
              <List className="w-4 h-4" />
              List
            </Button>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Button>
        </div>
      </div>

      {/* Filters and sorting (list view only) */}
      {viewMode === 'list' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Filters & Sorting</h3>
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setFilterStatus('all');
                  setFilterPriority('all');
                  setFilterAssignee('all');
                  setSortBy('date');
                  setSortOrder('desc');
                }}
                className="text-xs h-auto p-0"
              >
                Reset
              </Button>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {/* Status filter */}
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={filterStatus}
                  onValueChange={(v) => setFilterStatus(v as TaskStatus | 'all')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
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
                  onValueChange={(v) => setFilterPriority(v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Assignees</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {uniqueAssignees.map((assignee) => (
                      <SelectItem key={assignee} value={assignee || ''}>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Updated Date</SelectItem>
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
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="w-full justify-center gap-1"
                >
                  {sortOrder === 'asc' ? (
                    <>
                      <ArrowUp className="w-4 h-4" /> Ascending
                    </>
                  ) : (
                    <>
                      <ArrowDown className="w-4 h-4" /> Descending
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk actions toolbar (list view only) */}
      {viewMode === 'list' && selectedTasks.size > 0 && (
        <Card className="bg-primary/10 border-primary">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{selectedTasks.size}</span> task
              {selectedTasks.size !== 1 ? 's' : ''} selected
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAll}>
                Deselect
              </Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Select
                onValueChange={(v) => {
                  if (v) bulkChangeStatus(v as TaskStatus);
                }}
              >
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <SelectValue placeholder="Change Status..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">→ Pending</SelectItem>
                  <SelectItem value="in_progress">→ In Progress</SelectItem>
                  <SelectItem value="completed">→ Completed</SelectItem>
                  <SelectItem value="blocked">→ Blocked</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={bulkDelete}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                Delete Selected
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {viewMode === 'board' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 grid grid-cols-4 gap-4 overflow-hidden">
            {COLUMNS.map((column) => (
              <TaskColumn
                key={column.id}
                column={column}
                tasks={tasksByStatus[column.id]}
                recentlyMoved={recentlyMoved}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="rotate-3 opacity-90">
                <TaskCardContent task={activeTask} isDragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <TaskList
          tasks={sortedTasks}
          selectedTasks={selectedTasks}
          onToggleSelect={toggleTaskSelection}
        />
      )}

      {/* Create modal */}
      <CreateTaskModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreate={async (title, description, priority, tags) => {
          try {
            const result = await createTask(title, description, priority, tags);
            toast.success('Task Created', `"${title}" has been added to the board`);
            return result;
          } catch (err) {
            toast.error(
              'Failed to Create Task',
              err instanceof Error ? err.message : 'Unknown error'
            );
            throw err;
          }
        }}
      />
    </div>
  );
}

interface TaskColumnProps {
  column: { id: TaskStatus; label: string; color: string; icon: React.ReactNode };
  tasks: Task[];
  recentlyMoved: Set<string>;
}

function TaskColumn({ column, tasks, recentlyMoved }: TaskColumnProps) {
  const { setNodeRef, isOver } = useSortable({
    id: column.id,
    data: { type: 'column', column },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col bg-card rounded-lg overflow-hidden border transition-all duration-200',
        isOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      <div className="p-3 border-b flex items-center gap-2">
        <div className={cn('w-2 h-2 rounded-full', column.color)} />
        <span className="font-medium text-sm">{column.label}</span>
        <Badge variant="secondary" className="ml-auto">
          {tasks.length}
        </Badge>
      </div>
      <ScrollArea className="flex-1">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="p-2 space-y-2">
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                isCelebrating={recentlyMoved.has(task.id)}
              />
            ))}
            {tasks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Drop tasks here
              </div>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

// Sortable wrapper for task cards with drag handle
function SortableTaskCard({ task, isCelebrating }: { task: Task; isCelebrating?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group',
        isDragging && 'opacity-50 scale-[0.98]',
        isCelebrating && 'animate-task-celebrate'
      )}
    >
      {/* Celebration glimmer overlay */}
      {isCelebrating && (
        <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none z-10">
          <div className="absolute inset-0 animate-glimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
      )}

      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          'absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing',
          'text-muted-foreground hover:text-foreground'
        )}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      <TaskCardContent task={task} isDragging={isDragging} />
    </div>
  );
}

// The actual card content, used both in the sortable card and drag overlay
function TaskCardContent({ task, isDragging }: { task: Task; isDragging?: boolean }) {
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);
  const toast = useToast();
  const { updateTaskStatus } = useData();
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const priorityColors = {
    urgent: 'border-l-red-500',
    high: 'border-l-orange-500',
    normal: 'border-l-blue-500',
    low: 'border-l-gray-500',
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (newStatus === task.status) return;

    setIsChangingStatus(true);
    try {
      await updateTaskStatus(task.id, newStatus);
      toast.success('Status Updated', `Task moved to ${newStatus.replace('_', ' ')}`);
    } catch (err) {
      toast.error('Status Update Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsChangingStatus(false);
    }
  };

  return (
    <div
      onClick={() => !isDragging && setSelectedTask(task.id)}
      className={cn(
        'bg-muted/50 rounded-lg p-3 pl-7 cursor-pointer hover:bg-muted transition-all border-l-4',
        priorityColors[task.priority],
        isChangingStatus && 'opacity-75',
        isDragging && 'shadow-2xl ring-2 ring-primary'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="font-medium text-sm">{task.title}</div>

          {task.description && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {task.description}
            </div>
          )}
        </div>

        {/* Status dropdown - hidden while dragging */}
        {!isDragging && (
          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <Select
              value={task.status}
              onValueChange={(v) => handleStatusChange(v as TaskStatus)}
              disabled={isChangingStatus}
            >
              <SelectTrigger className="h-7 text-xs w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        {task.assignedTo ? (
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-xs text-primary font-medium">
                {task.assignedTo[0].toUpperCase()}
              </span>
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-[80px]">
              {task.assignedTo}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        )}
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
        </span>
      </div>

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {task.tags.length > 3 && (
            <span className="text-xs text-muted-foreground">+{task.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}

function TaskList({
  tasks,
  selectedTasks,
  onToggleSelect,
}: {
  tasks: Task[];
  selectedTasks?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const [statusChanging, setStatusChanging] = useState<Set<string>>(new Set());
  const toast = useToast();
  const { updateTaskStatus } = useData();

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || newStatus === task.status) return;

    setStatusChanging((prev) => new Set([...prev, taskId]));

    try {
      await updateTaskStatus(taskId, newStatus);
      toast.success('Status Updated', `"${task.title}" moved to ${newStatus.replace('_', ' ')}`);
    } catch (err) {
      toast.error('Status Update Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setStatusChanging((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const priorityVariant = {
    urgent: 'destructive' as const,
    high: 'warning' as const,
    normal: 'info' as const,
    low: 'secondary' as const,
  };

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {onToggleSelect && (
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    tasks.length > 0 && selectedTasks && tasks.every((t) => selectedTasks.has(t.id))
                  }
                  onCheckedChange={(checked) => {
                    if (checked) {
                      tasks.forEach((t) => onToggleSelect(t.id));
                    } else {
                      tasks.forEach((t) => selectedTasks?.has(t.id) && onToggleSelect(t.id));
                    }
                  }}
                />
              </TableHead>
            )}
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TableRow
              key={task.id}
              className={cn(
                selectedTasks?.has(task.id) && 'bg-primary/10',
                statusChanging.has(task.id) && 'opacity-75'
              )}
            >
              {onToggleSelect && (
                <TableCell>
                  <Checkbox
                    checked={selectedTasks?.has(task.id) ?? false}
                    onCheckedChange={() => onToggleSelect(task.id)}
                  />
                </TableCell>
              )}
              <TableCell>
                <div className="font-medium text-sm">{task.title}</div>
                {task.tags && task.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {task.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Select
                  value={task.status}
                  onValueChange={(v) => handleStatusChange(task.id, v as TaskStatus)}
                  disabled={statusChanging.has(task.id)}
                >
                  <SelectTrigger className="h-7 text-xs w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Badge variant={priorityVariant[task.priority]}>{task.priority}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {task.assignedTo || '-'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (
    title: string,
    description: string,
    priority: string,
    tags: string[]
  ) => Promise<{ id: string }>;
}

function CreateTaskModal({ open, onOpenChange, onCreate }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [tagsInput, setTagsInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setIsCreating(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await onCreate(title, description, priority, tags);
      onOpenChange(false);
      setTitle('');
      setDescription('');
      setPriority('normal');
      setTagsInput('');
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>Add a new task to the board</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task description (optional)"
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="feature, bug, auth (comma separated)"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!title.trim() || isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Task'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TaskDetailPanelProps {
  task: Task;
  onClose: () => void;
  onStatusChange: (status: TaskStatus) => Promise<void>;
}

function TaskDetailPanel({ task, onClose, onStatusChange }: TaskDetailPanelProps) {
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const agents = useAgents();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent);
  const setAgentDetailTab = useAppStore((s) => s.setAgentDetailTab);

  // Find agent by ID or name for display and navigation
  const assignedAgent = task.assignedTo
    ? agents.find((a) => a.id === task.assignedTo || a.name === task.assignedTo)
    : null;

  // Get display name - prefer agent name, fall back to shortened ID
  const getDisplayName = () => {
    if (assignedAgent?.name) return assignedAgent.name;
    if (!task.assignedTo) return '';
    // If it's a UUID, show shortened version
    if (task.assignedTo.match(/^[a-f0-9-]{36}$/i)) {
      return `Agent ${task.assignedTo.slice(0, 8)}`;
    }
    // Extract persona name from format like "orchestrator-abc123"
    const match = task.assignedTo.match(/^([a-zA-Z-]+)-[a-f0-9]+$/);
    return match ? match[1] : task.assignedTo;
  };

  const handleNavigateToAgent = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!task.assignedTo) return;
    // If we found the agent, use its ID, otherwise try using assignedTo directly
    const agentId = assignedAgent?.id || task.assignedTo;
    console.log('Navigating to agent:', agentId, 'agents list:', agents);
    setSelectedAgent(agentId);
    setAgentDetailTab('logs'); // Open logs tab by default when coming from tasks
    setActiveView('agents');
  };

  const priorityColors = {
    urgent: 'bg-red-500',
    high: 'bg-orange-500',
    normal: 'bg-blue-500',
    low: 'bg-gray-500',
  };

  const statusConfig = {
    pending: { label: 'Pending', icon: <Clock className="w-4 h-4" />, color: 'bg-muted' },
    in_progress: { label: 'In Progress', icon: <Zap className="w-4 h-4" />, color: 'bg-yellow-500' },
    completed: { label: 'Completed', icon: <CheckCircle className="w-4 h-4" />, color: 'bg-green-500' },
    blocked: { label: 'Blocked', icon: <AlertCircle className="w-4 h-4" />, color: 'bg-red-500' },
    cancelled: { label: 'Cancelled', icon: <XCircle className="w-4 h-4" />, color: 'bg-gray-500' },
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (newStatus === task.status) return;
    setIsChangingStatus(true);
    try {
      await onStatusChange(newStatus);
    } finally {
      setIsChangingStatus(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Flyout Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-card border-l shadow-2xl z-50 flex flex-col animate-in slide-in-from-right overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-muted/50">
          <div className="flex items-center gap-3">
            <div className={cn('w-3 h-3 rounded-full', priorityColors[task.priority])} />
            <h3 className="font-semibold text-lg">Task Details</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-6">
            {/* Title */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Title
              </Label>
              <h2 className="text-xl font-semibold mt-2">{task.title}</h2>
            </div>

            {/* Status Selector */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Status
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(statusConfig).map(([key, config]) => (
                  <Button
                    key={key}
                    variant={task.status === key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleStatusChange(key as TaskStatus)}
                    disabled={isChangingStatus}
                    className="gap-2"
                  >
                    {config.icon}
                    {config.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Description
                </Label>
                <div className="bg-muted rounded-lg p-4 mt-2">
                  <Markdown>{task.description}</Markdown>
                </div>
              </div>
            )}

            {/* Priority */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Priority
              </Label>
              <div className="flex items-center gap-2 mt-2">
                <div className={cn('w-3 h-3 rounded-full', priorityColors[task.priority])} />
                <span className="font-medium capitalize">{task.priority}</span>
              </div>
            </div>

            {/* Assigned To */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Assigned To
              </Label>
              {task.assignedTo ? (
                <button
                  onClick={(e) => handleNavigateToAgent(e)}
                  type="button"
                  className="flex items-center gap-3 mt-2 group cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded-lg transition-colors text-left w-full"
                  title={`View ${getDisplayName()} logs`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                    <span className="text-primary font-medium">
                      {getDisplayName()[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <span className="font-medium group-hover:text-primary transition-colors">
                    {getDisplayName()}
                  </span>
                  <svg
                    className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </button>
              ) : (
                <span className="text-muted-foreground italic mt-2 block">Unassigned</span>
              )}
            </div>

            {/* Tags */}
            {task.tags && task.tags.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Tags
                </Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {task.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Created
                </Label>
                <span className="text-sm block mt-2">
                  {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                </span>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Updated
                </Label>
                <span className="text-sm block mt-2">
                  {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
                </span>
              </div>
            </div>

            {/* Task ID */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Task ID
              </Label>
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono text-muted-foreground block mt-2">
                {task.id}
              </code>
            </div>
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="p-4 border-t bg-muted/30 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
