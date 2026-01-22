import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

interface Node {
  id: string;
  label: string;
  status: string;
}

interface Edge {
  source: string;
  target: string;
}

interface GraphData {
  nodes: Node[];
  edges: Edge[];
  stats: {
    totalTasks: number;
    nodeCount: number;
    edgeCount: number;
  };
}

interface DependencyGraphProps {
  apiUrl?: string;
  statusFilter?: string;
  height?: string;
}

export function DependencyGraph({
  apiUrl = 'http://localhost:3200/api/dependencies',
  statusFilter = 'all',
  height = 'h-96',
}: DependencyGraphProps) {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    fetchGraph();
    const interval = setInterval(fetchGraph, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [statusFilter]);

  const fetchGraph = async () => {
    try {
      const url = new URL(apiUrl);
      url.searchParams.set('status', statusFilter);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Failed to fetch graph');
      const graphData = await response.json() as GraphData;
      setData(graphData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={clsx('card p-8 flex items-center justify-center', height)}>
        <div className="text-rapid-muted">Loading dependency graph...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={clsx('card p-8 flex items-center justify-center bg-red-500/10', height)}>
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className={clsx('card p-8 flex items-center justify-center', height)}>
        <div className="text-rapid-muted">No tasks with dependencies</div>
      </div>
    );
  }

  // Simple force-directed layout algorithm
  const positions = calculateLayout(data.nodes, data.edges);

  // Calculate SVG bounds
  const padding = 40;
  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = Math.max(600, maxX - minX + padding * 2);
  const height_val = Math.max(400, maxY - minY + padding * 2);

  const statusColors: Record<string, string> = {
    pending: '#64748b',
    in_progress: '#eab308',
    completed: '#22c55e',
    blocked: '#ef4444',
    cancelled: '#94a3b8',
  };

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="card p-3 text-center">
          <div className="text-2xl font-bold text-rapid-accent">{data.stats.totalTasks}</div>
          <div className="text-xs text-rapid-muted">Total Tasks</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-2xl font-bold text-blue-400">{data.stats.nodeCount}</div>
          <div className="text-xs text-rapid-muted">With Dependencies</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-2xl font-bold text-purple-400">{data.stats.edgeCount}</div>
          <div className="text-xs text-rapid-muted">Dependencies</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-2xl font-bold text-green-400">
            {data.nodes.filter((n) => n.status === 'completed').length}
          </div>
          <div className="text-xs text-rapid-muted">Completed</div>
        </div>
      </div>

      {/* Graph */}
      <div className="card overflow-hidden">
        <svg
          width="100%"
          height={400}
          viewBox={`${minX - padding} ${minY - padding} ${width} ${height_val}`}
          className="bg-rapid-surface"
        >
          {/* Edges (dependencies) */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#64748b" opacity="0.5" />
            </marker>
          </defs>

          {data.edges.map((edge, idx) => {
            const sourcePos = positions[data.nodes.findIndex((n) => n.id === edge.source)];
            const targetPos = positions[data.nodes.findIndex((n) => n.id === edge.target)];

            if (!sourcePos || !targetPos) return null;

            return (
              <line
                key={`edge-${idx}`}
                x1={sourcePos.x}
                y1={sourcePos.y}
                x2={targetPos.x}
                y2={targetPos.y}
                stroke="#64748b"
                strokeWidth="1.5"
                opacity="0.4"
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          {/* Nodes (tasks) */}
          {data.nodes.map((node, idx) => {
            const pos = positions[idx];
            const isSelected = selectedNode === node.id;
            const nodeRadius = 20;
            const statusColor = statusColors[node.status] || '#64748b';

            return (
              <g
                key={node.id}
                onClick={() => setSelectedNode(isSelected ? null : node.id)}
                className="cursor-pointer"
              >
                {/* Node circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={nodeRadius}
                  fill={statusColor}
                  opacity={isSelected ? 1 : 0.7}
                  className="transition-opacity hover:opacity-100"
                />

                {/* Label (if selected or short title) */}
                {isSelected && (
                  <text
                    x={pos.x}
                    y={pos.y + nodeRadius + 20}
                    textAnchor="middle"
                    className="text-xs fill-rapid-text"
                  >
                    {node.label.substring(0, 15)}
                    {node.label.length > 15 ? '...' : ''}
                  </text>
                )}

                {/* Tooltip on hover */}
                <title>{node.label}</title>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-500" />
          <span className="text-rapid-muted">Pending</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <span className="text-rapid-muted">In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <span className="text-rapid-muted">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <span className="text-rapid-muted">Blocked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-400" />
          <span className="text-rapid-muted">Cancelled</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Simple force-directed layout algorithm
 * Spreads nodes out based on edges to avoid overlaps
 */
function calculateLayout(
  nodes: Node[],
  edges: Edge[]
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = nodes.map(() => ({
    x: Math.random() * 200,
    y: Math.random() * 200,
  }));

  // Run simulation for 50 iterations
  for (let i = 0; i < 50; i++) {
    // Apply repulsive forces (nodes push away from each other)
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const dx = positions[b].x - positions[a].x;
        const dy = positions[b].y - positions[a].y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const repulsion = 100 / (distance * distance);

        positions[a].x -= (dx / distance) * repulsion;
        positions[a].y -= (dy / distance) * repulsion;
        positions[b].x += (dx / distance) * repulsion;
        positions[b].y += (dy / distance) * repulsion;
      }
    }

    // Apply attractive forces (connected nodes pull together)
    for (const edge of edges) {
      const aIdx = nodes.findIndex((n) => n.id === edge.source);
      const bIdx = nodes.findIndex((n) => n.id === edge.target);

      if (aIdx < 0 || bIdx < 0) continue;

      const dx = positions[bIdx].x - positions[aIdx].x;
      const dy = positions[bIdx].y - positions[aIdx].y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const attraction = (distance * distance) / 50;

      positions[aIdx].x += (dx / distance) * attraction;
      positions[aIdx].y += (dy / distance) * attraction;
      positions[bIdx].x -= (dx / distance) * attraction;
      positions[bIdx].y -= (dy / distance) * attraction;
    }

    // Apply damping to stabilize
    for (const pos of positions) {
      pos.x *= 0.95;
      pos.y *= 0.95;
    }
  }

  return positions;
}
