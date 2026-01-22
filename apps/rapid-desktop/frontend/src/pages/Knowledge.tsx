import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useData } from '../hooks/useData';
import { useToast } from '../components/Toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Search, X, BookOpen, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KnowledgeEntry {
  key: string;
  value: unknown;
  memoryType: 'episodic' | 'semantic' | 'procedural' | 'decision_trace';
  confidence: number;
  tags: string[];
  createdAt: string;
  accessCount?: number;
}

interface ContextStats {
  totalEntries: number;
  byMemoryType: {
    episodic: number;
    semantic: number;
    procedural: number;
    decision_trace: number;
  };
}

const MEMORY_TYPES = ['all', 'episodic', 'semantic', 'procedural', 'decision_trace'] as const;

export function KnowledgePage() {
  const { callTool } = useData();
  const toast = useToast();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [filter, setFilter] = useState<(typeof MEMORY_TYPES)[number]>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeEntry | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch entries
      const listResult = (await callTool('context_list', {
        memoryType: filter === 'all' ? undefined : filter,
        limit: 100,
      })) as { structuredContent?: unknown };
      const listData = listResult?.structuredContent as { entries?: KnowledgeEntry[] };
      setEntries(listData?.entries || []);

      // Fetch stats
      const statsResult = (await callTool('context_stats', {})) as { structuredContent?: unknown };
      const statsData = statsResult?.structuredContent as ContextStats;
      setStats(statsData);
    } catch (err) {
      console.warn('Failed to fetch knowledge:', err);
      // No mock data - show empty state when backend unavailable
      setEntries([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [callTool, filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredEntries = entries.filter((entry) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        entry.key.toLowerCase().includes(query) ||
        entry.tags.some((t) => t.toLowerCase().includes(query)) ||
        String(entry.value).toLowerCase().includes(query)
      );
    }
    return true;
  });

  const handleForget = async (key: string) => {
    try {
      await callTool('context_forget', { key });
      toast.success('Knowledge Removed', `"${key}" has been forgotten`);
      await fetchData();
      setSelectedEntry(null);
    } catch (err) {
      toast.error('Failed to Remove', err instanceof Error ? err.message : 'Unknown error');
      console.error('Failed to forget:', err);
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Context Engine</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Stored knowledge and learned patterns
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Knowledge
        </Button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-4">
          <StatCard label="Total" value={stats.totalEntries} color="primary" />
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
            <Badge
              key={type}
              variant={filter === type ? 'default' : 'secondary'}
              className="cursor-pointer capitalize"
              onClick={() => setFilter(type)}
            >
              {type.replace('_', ' ')}
            </Badge>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search knowledge..."
            className="pl-10 w-64"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* List */}
        <Card className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground p-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading...
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground p-8">
                <div className="text-center">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No knowledge stored</p>
                  <p className="text-sm mt-1">Add knowledge to help agents learn</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
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
          </ScrollArea>
        </Card>

        {/* Detail panel */}
        {selectedEntry && (
          <Card className="w-96 overflow-auto">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{selectedEntry.key}</CardTitle>
                  <Badge variant={getTypeBadgeVariant(selectedEntry.memoryType)} className="mt-1">
                    {selectedEntry.memoryType.replace('_', ' ')}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedEntry(null)}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Value</Label>
                <pre className="mt-1 p-3 bg-muted rounded-lg text-sm font-mono overflow-auto max-h-48">
                  {typeof selectedEntry.value === 'string'
                    ? selectedEntry.value
                    : JSON.stringify(selectedEntry.value, null, 2)}
                </pre>
              </div>

              <div>
                <Label className="text-muted-foreground">Confidence</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Progress value={selectedEntry.confidence * 100} className="flex-1" />
                  <span className="text-sm">{Math.round(selectedEntry.confidence * 100)}%</span>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Tags</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedEntry.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Created</Label>
                <span className="text-sm block mt-1">
                  {formatDistanceToNow(new Date(selectedEntry.createdAt), { addSuffix: true })}
                </span>
              </div>

              <div className="pt-4 border-t">
                <Button
                  variant="ghost"
                  onClick={() => handleForget(selectedEntry.key)}
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Forget this knowledge
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add modal */}
      <AddKnowledgeModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onAdd={async (key, value, memoryType, tags) => {
          try {
            await callTool('context_learn', {
              key,
              value,
              memoryType,
              tags,
              confidence: 0.8,
            });
            toast.success('Knowledge Added', `"${key}" has been stored`);
            await fetchData();
          } catch (err) {
            toast.error('Failed to Add', err instanceof Error ? err.message : 'Unknown error');
            throw err;
          }
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    primary: 'text-primary',
    purple: 'text-purple-400',
    blue: 'text-blue-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
  };

  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={cn('text-2xl font-semibold', colorClasses[color])}>{value}</div>
      </CardContent>
    </Card>
  );
}

function KnowledgeRow({
  entry,
  isSelected,
  onClick,
}: {
  entry: KnowledgeEntry;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        'p-4 hover:bg-muted cursor-pointer transition-colors',
        isSelected && 'bg-muted'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{entry.key}</span>
            <Badge variant={getTypeBadgeVariant(entry.memoryType)} className="text-xs">
              {entry.memoryType.replace('_', ' ')}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-1 line-clamp-1">
            {typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)}
          </div>
        </div>
        <div className="ml-4 text-right">
          <div className="text-sm text-muted-foreground">
            {Math.round(entry.confidence * 100)}%
          </div>
        </div>
      </div>
      {entry.tags.length > 0 && (
        <div className="flex gap-1 mt-2">
          {entry.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {entry.tags.length > 3 && (
            <span className="text-xs text-muted-foreground">+{entry.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}

function getTypeBadgeVariant(
  type: KnowledgeEntry['memoryType']
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const variants: Record<string, 'default' | 'secondary'> = {
    episodic: 'default',
    semantic: 'secondary',
    procedural: 'secondary',
    decision_trace: 'secondary',
  };
  return variants[type] || 'secondary';
}

function AddKnowledgeModal({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (key: string, value: string, memoryType: string, tags: string[]) => Promise<void>;
}) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [memoryType, setMemoryType] = useState('semantic');
  const [tagsInput, setTagsInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!key.trim() || !value.trim()) return;
    setIsAdding(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await onAdd(key, value, memoryType, tags);
      onOpenChange(false);
      setKey('');
      setValue('');
      setMemoryType('semantic');
      setTagsInput('');
    } catch (err) {
      console.error('Failed to add knowledge:', err);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add Knowledge</DialogTitle>
          <DialogDescription>
            Store a new piece of knowledge for agents to use
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="key">Key</Label>
            <Input
              id="key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="auth-pattern, user-preference-tabs, etc."
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="value">Value</Label>
            <Textarea
              id="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="The knowledge content..."
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="memory-type">Memory Type</Label>
            <Select value={memoryType} onValueChange={setMemoryType}>
              <SelectTrigger id="memory-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semantic">Semantic (facts and definitions)</SelectItem>
                <SelectItem value="procedural">Procedural (how to do things)</SelectItem>
                <SelectItem value="episodic">Episodic (specific experiences)</SelectItem>
                <SelectItem value="decision_trace">
                  Decision Trace (why decisions were made)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="auth, security, patterns (comma separated)"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!key.trim() || !value.trim() || isAdding}>
            {isAdding ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Knowledge'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
