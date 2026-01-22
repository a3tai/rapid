import { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { clsx } from 'clsx';

export interface ChartContainerProps {
  /** Chart title displayed above the chart */
  title?: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Height of the chart container in pixels or percentage */
  height?: number | string;
  /** Minimum height for responsive behavior */
  minHeight?: number;
  /** Whether to show a loading state */
  loading?: boolean;
  /** Whether to show an empty state */
  empty?: boolean;
  /** Custom empty state message */
  emptyMessage?: string;
  /** Additional CSS classes */
  className?: string;
  /** Child elements (the actual chart) */
  children: ReactNode;
  /** Optional action buttons in the header */
  actions?: ReactNode;
}

/**
 * ChartContainer provides a responsive wrapper for Recharts components
 * with consistent styling matching the RAPID design system.
 *
 * @example
 * ```tsx
 * <ChartContainer title="Task Completion" height={300}>
 *   <LineChart data={data}>
 *     <Line dataKey="value" />
 *   </LineChart>
 * </ChartContainer>
 * ```
 */
export function ChartContainer({
  title,
  subtitle,
  height = 300,
  minHeight = 200,
  loading = false,
  empty = false,
  emptyMessage = 'No data available',
  className,
  children,
  actions,
}: ChartContainerProps) {
  const containerHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div className={clsx('flex flex-col', className)}>
      {/* Header */}
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && <h3 className="font-medium text-rapid-text">{title}</h3>}
            {subtitle && <p className="text-xs text-rapid-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Chart area */}
      <div
        className="relative w-full"
        style={{ height: containerHeight, minHeight: `${minHeight}px` }}
      >
        {loading ? (
          <ChartLoadingSkeleton />
        ) : empty ? (
          <ChartEmptyState message={emptyMessage} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/**
 * Loading skeleton for charts
 */
function ChartLoadingSkeleton() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-full h-full flex flex-col gap-4 p-4">
        {/* Simulated bars/lines */}
        <div className="flex-1 flex items-end gap-2">
          {[40, 65, 45, 80, 55, 70, 50, 90, 60, 75].map((height, i) => (
            <div
              key={i}
              className="flex-1 bg-rapid-elevated rounded animate-pulse"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        {/* X-axis labels */}
        <div className="flex justify-between">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-3 w-8 bg-rapid-elevated rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state for charts
 */
function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <svg
          className="w-12 h-12 mx-auto text-rapid-muted/50 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <p className="text-sm text-rapid-muted">{message}</p>
      </div>
    </div>
  );
}

/**
 * Card wrapper for charts that adds the standard RAPID card styling
 */
export function ChartCard({
  children,
  className,
  ...props
}: ChartContainerProps & { className?: string }) {
  return (
    <div className={clsx('card p-4', className)}>
      <ChartContainer {...props}>{children}</ChartContainer>
    </div>
  );
}
