import { clsx } from 'clsx';
import { Skeleton } from './Skeleton';

export type StatCardFormat = 'number' | 'currency' | 'percentage';
export type TrendDirection = 'up' | 'down' | 'neutral';

export interface StatCardProps {
  /** The numeric value to display */
  value: number;
  /** Label text describing the metric */
  label: string;
  /** Trend percentage change (e.g., 12.5 for +12.5%) */
  trend?: number;
  /** Direction of the trend (defaults to neutral if trend is 0) */
  trendDirection?: TrendDirection;
  /** Format for displaying the value */
  format?: StatCardFormat;
  /** Show loading skeleton state */
  loading?: boolean;
  /** Optional sparkline data points (array of numbers for mini chart) */
  sparklineData?: number[];
  /** Optional custom class name */
  className?: string;
  /** Optional icon to display */
  icon?: React.ReactNode;
}

/**
 * Format a number based on the specified format type
 */
function formatValue(value: number, format: StatCardFormat): string {
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case 'percentage':
      return `${value.toFixed(1)}%`;
    case 'number':
    default:
      // Format large numbers with K, M, B suffixes
      if (value >= 1_000_000_000) {
        return `${(value / 1_000_000_000).toFixed(1)}B`;
      }
      if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M`;
      }
      if (value >= 1_000) {
        return `${(value / 1_000).toFixed(1)}K`;
      }
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }).format(value);
  }
}

/**
 * Determine trend direction from trend value if not explicitly provided
 */
function getTrendDirection(trend: number, explicit?: TrendDirection): TrendDirection {
  if (explicit) return explicit;
  if (trend > 0) return 'up';
  if (trend < 0) return 'down';
  return 'neutral';
}

/**
 * Simple SVG sparkline component
 */
function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (!data || data.length < 2) return null;

  const height = 24;
  const width = 64;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((value - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  // Determine if trend is positive (last value > first value)
  const isPositive = data[data.length - 1] >= data[0];

  return (
    <svg
      width={width}
      height={height}
      className={clsx('flex-shrink-0', className)}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={isPositive ? 'hsl(142 71% 45%)' : 'hsl(0 72% 51%)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
    </svg>
  );
}

/**
 * Trend indicator arrow component
 */
function TrendIndicator({
  trend,
  direction,
}: {
  trend: number;
  direction: TrendDirection;
}) {
  const absoluteTrend = Math.abs(trend);

  if (direction === 'neutral' || absoluteTrend === 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-rapid-muted">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" aria-hidden="true">
          <path
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            d="M2 6h8"
          />
        </svg>
        <span>{absoluteTrend.toFixed(1)}%</span>
      </span>
    );
  }

  const isUp = direction === 'up';

  return (
    <span
      className={clsx(
        'flex items-center gap-1 text-xs font-medium',
        isUp ? 'text-rapid-success' : 'text-rapid-error'
      )}
    >
      <svg
        className={clsx('w-3 h-3', !isUp && 'rotate-180')}
        fill="none"
        viewBox="0 0 12 12"
        aria-hidden="true"
      >
        <path
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 10V2m0 0L2 6m4-4l4 4"
        />
      </svg>
      <span>
        {isUp ? '+' : '-'}
        {absoluteTrend.toFixed(1)}%
      </span>
    </span>
  );
}

/**
 * Loading skeleton for StatCard
 */
function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('card p-4', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <Skeleton height={12} width="40%" />
          <Skeleton height={32} width="60%" />
          <Skeleton height={12} width="30%" />
        </div>
        <Skeleton height={24} width={64} />
      </div>
    </div>
  );
}

/**
 * StatCard - A reusable card component for displaying KPI metrics
 *
 * Features:
 * - Large numeric value with automatic formatting (number, currency, percentage)
 * - Label text describing the metric
 * - Trend indicator showing change direction and percentage
 * - Optional sparkline mini chart
 * - Loading skeleton state
 * - Consistent styling following RAPID design system
 *
 * @example
 * ```tsx
 * <StatCard
 *   value={12500}
 *   label="Total Revenue"
 *   format="currency"
 *   trend={15.3}
 *   trendDirection="up"
 *   sparklineData={[10, 12, 8, 15, 18, 22, 20]}
 * />
 * ```
 */
export function StatCard({
  value,
  label,
  trend,
  trendDirection,
  format = 'number',
  loading = false,
  sparklineData,
  className,
  icon,
}: StatCardProps) {
  if (loading) {
    return <StatCardSkeleton className={className} />;
  }

  const formattedValue = formatValue(value, format);
  const direction = trend !== undefined ? getTrendDirection(trend, trendDirection) : undefined;

  return (
    <div
      className={clsx(
        'card p-4 transition-all duration-200',
        'hover:border-rapid-border hover:bg-rapid-surface/80',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Label */}
          <div className="flex items-center gap-2 mb-2">
            {icon && (
              <span className="text-rapid-muted flex-shrink-0">{icon}</span>
            )}
            <span className="text-xs font-mono uppercase tracking-wider text-rapid-muted truncate">
              {label}
            </span>
          </div>

          {/* Value */}
          <div className="text-2xl font-mono font-semibold text-rapid-text mb-2">
            {formattedValue}
          </div>

          {/* Trend indicator */}
          {trend !== undefined && direction && (
            <TrendIndicator trend={trend} direction={direction} />
          )}
        </div>

        {/* Sparkline */}
        {sparklineData && sparklineData.length > 1 && (
          <Sparkline data={sparklineData} className="mt-6" />
        )}
      </div>
    </div>
  );
}

export default StatCard;
