import { clsx } from 'clsx'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
}

export function Skeleton({ className, variant = 'rectangular', width, height }: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-rapid-border'

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  }

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  }

  return (
    <div
      className={clsx(baseClasses, variantClasses[variant], className)}
      style={style}
    />
  )
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
  )
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
  )
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
  )
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
  )
}
