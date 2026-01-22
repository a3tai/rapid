import { clsx } from 'clsx';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  /** Animation delay for staggered loading effects */
  delay?: number;
}

export function Skeleton({ className, variant = 'rectangular', width, height, delay }: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-rapid-border';

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    animationDelay: delay ? `${delay}ms` : undefined,
  };

  return <div className={clsx(baseClasses, variantClasses[variant], className)} style={style} />;
}

// Pre-built skeleton patterns for common use cases
export function SkeletonCard() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton height={16} width="60%" />
          <Skeleton height={12} width="40%" />
        </div>
      </div>
      <Skeleton height={12} width="100%" />
      <Skeleton height={12} width="80%" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-rapid-border">
        <div className="flex gap-4">
          <Skeleton height={16} width="20%" />
          <Skeleton height={16} width="15%" />
          <Skeleton height={16} width="15%" />
          <Skeleton height={16} width="25%" />
          <Skeleton height={16} width="15%" />
        </div>
      </div>
      <div className="divide-y divide-rapid-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex gap-4">
            <Skeleton height={14} width="20%" />
            <Skeleton height={14} width="15%" />
            <Skeleton height={14} width="15%" />
            <Skeleton height={14} width="25%" />
            <Skeleton height={14} width="15%" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="card p-4 flex items-center gap-4">
          <Skeleton variant="circular" width={32} height={32} />
          <div className="flex-1 space-y-2">
            <Skeleton height={14} width={`${60 + Math.random() * 30}%`} />
            <Skeleton height={10} width={`${40 + Math.random() * 20}%`} />
          </div>
          <Skeleton height={24} width={60} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <Skeleton height={12} width="50%" className="mb-2" />
          <Skeleton height={28} width="40%" />
        </div>
      ))}
    </div>
  );
}

// Dashboard-specific skeleton components

/**
 * KPI Card loading skeleton - matches KPICard layout
 */
export function SkeletonKPICard() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton height={14} width={80} />
          <Skeleton height={28} width={60} />
          <Skeleton height={12} width={100} />
        </div>
        <Skeleton width={44} height={44} className="rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Grid of KPI card skeletons
 */
export function SkeletonKPIGrid({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonKPICard key={i} />
      ))}
    </div>
  );
}

/**
 * Agent card loading skeleton - matches AgentCard layout
 */
export function SkeletonAgentCard() {
  return (
    <div className="rounded-xl bg-rapid-surface/40 border border-rapid-border/40 p-4 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Skeleton variant="rectangular" width={48} height={48} className="rounded-xl" />
          <div className="space-y-2">
            <Skeleton height={16} width={80} />
            <Skeleton height={12} width={120} />
          </div>
        </div>
        <Skeleton height={20} width={50} className="rounded-full" />
      </div>
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2">
          <Skeleton variant="circular" width={14} height={14} />
          <Skeleton height={12} width="60%" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton variant="circular" width={14} height={14} />
          <Skeleton height={12} width="40%" />
        </div>
      </div>
      <div className="flex gap-2 pt-3 border-t border-rapid-border/30">
        <Skeleton height={32} className="flex-1 rounded-lg" />
        <Skeleton height={32} width={60} className="rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Grid of agent card skeletons
 */
export function SkeletonAgentGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonAgentCard key={i} />
      ))}
    </div>
  );
}

/**
 * Task row loading skeleton - matches TaskRow layout
 */
export function SkeletonTaskRow() {
  return (
    <div className="p-3 bg-rapid-elevated rounded-lg animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton height={14} width="70%" />
          <Skeleton height={10} width="40%" />
        </div>
        <Skeleton height={20} width={80} className="rounded-full" />
      </div>
    </div>
  );
}

/**
 * Task list loading skeleton
 */
export function SkeletonTaskList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonTaskRow key={i} />
      ))}
    </div>
  );
}

/**
 * Activity feed item skeleton
 */
export function SkeletonActivityItem() {
  return (
    <div className="flex gap-3 p-3 animate-pulse">
      <Skeleton variant="circular" width={32} height={32} />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton height={12} width={80} />
          <Skeleton height={12} width={60} />
        </div>
        <Skeleton height={14} width="90%" />
        <Skeleton height={10} width={100} />
      </div>
    </div>
  );
}

/**
 * Activity feed loading skeleton
 */
export function SkeletonActivityFeed({ count = 5 }: { count?: number }) {
  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-rapid-border">
        <Skeleton height={18} width={100} />
        <Skeleton height={14} width={60} />
      </div>
      <div className="flex-1 divide-y divide-rapid-border/50">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonActivityItem key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Suggestion row skeleton
 */
export function SkeletonSuggestionRow() {
  return (
    <div className="p-3 bg-rapid-elevated rounded-lg animate-pulse">
      <div className="flex items-start gap-2">
        <Skeleton variant="circular" width={20} height={20} />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton height={14} width="60%" />
            <Skeleton height={16} width={60} className="rounded-full" />
          </div>
          <Skeleton height={10} width="40%" />
          <Skeleton height={10} width="50%" />
        </div>
      </div>
    </div>
  );
}

/**
 * Chart/graph loading skeleton
 */
export function SkeletonChart({ height = 200 }: { height?: number }) {
  return (
    <div className="card p-4 animate-pulse" style={{ height }}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton height={18} width={120} />
        <Skeleton height={14} width={80} />
      </div>
      <div className="relative h-[calc(100%-60px)]">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-between py-2">
          <Skeleton height={10} width={24} />
          <Skeleton height={10} width={20} />
          <Skeleton height={10} width={28} />
          <Skeleton height={10} width={24} />
        </div>
        {/* Chart area with bars */}
        <div className="ml-10 h-full flex items-end gap-2 pr-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-rapid-elevated rounded-t"
              style={{ height: `${20 + Math.random() * 60}%` }}
            />
          ))}
        </div>
        {/* X-axis labels */}
        <div className="absolute bottom-0 left-10 right-2 flex justify-between">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={10} width={30} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Token/stats card skeleton
 */
export function SkeletonTokenStats() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <Skeleton height={18} width={140} />
        <Skeleton height={14} width={80} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="text-center space-y-2">
            <Skeleton height={24} width="60%" className="mx-auto" />
            <Skeleton height={12} width="80%" className="mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Panel skeleton for cards with header and content
 */
export function SkeletonPanel({
  title = true,
  rows = 3,
  height,
}: {
  title?: boolean;
  rows?: number;
  height?: number;
}) {
  return (
    <div className="card animate-pulse" style={height ? { height } : undefined}>
      {title && (
        <div className="flex items-center justify-between p-4 border-b border-rapid-border">
          <Skeleton height={18} width={120} />
          <Skeleton height={20} width={40} className="rounded-full" />
        </div>
      )}
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton variant="circular" width={32} height={32} />
            <div className="flex-1 space-y-1.5">
              <Skeleton height={14} width={`${60 + Math.random() * 30}%`} />
              <Skeleton height={10} width={`${40 + Math.random() * 20}%`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Full dashboard loading skeleton
 */
export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <SkeletonKPIGrid count={5} />

      {/* Token Stats */}
      <SkeletonTokenStats />

      {/* Main content grid */}
      <div className="grid grid-cols-4 gap-6">
        {/* Left column */}
        <div className="col-span-2 space-y-6">
          <div className="card animate-pulse">
            <div className="flex items-center justify-between p-4 border-b border-rapid-border">
              <Skeleton height={18} width={120} />
              <Skeleton height={20} width={40} className="rounded-full" />
            </div>
            <div className="p-4">
              <SkeletonTaskList count={5} />
            </div>
          </div>
          <div className="card animate-pulse">
            <div className="flex items-center justify-between p-4 border-b border-rapid-border">
              <Skeleton height={18} width={100} />
              <Skeleton height={20} width={40} className="rounded-full" />
            </div>
            <div className="p-4">
              <SkeletonTaskList count={5} />
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-2 space-y-6">
          <SkeletonActivityFeed count={4} />
          <SkeletonPanel rows={3} />
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-3 gap-6">
        <SkeletonPanel rows={2} />
        <div className="col-span-2">
          <SkeletonChart height={200} />
        </div>
      </div>
    </div>
  );
}
