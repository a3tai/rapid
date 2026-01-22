/**
 * KPI Card Component
 *
 * Displays a key performance indicator with large stat value,
 * label, icon, and optional trend indicator.
 */

import { clsx } from 'clsx';

export type KPIColor = 'accent' | 'success' | 'warning' | 'error' | 'info';

export interface KPICardProps {
  /** Card label/title */
  label: string;
  /** Main value to display */
  value: string | number;
  /** Optional formatted value (e.g., "$12.34" for cost) */
  formattedValue?: string;
  /** Icon to display */
  icon: React.ReactNode;
  /** Color theme */
  color: KPIColor;
  /** Optional trend percentage (positive = up, negative = down) */
  trend?: number;
  /** Optional trend label (e.g., "vs yesterday") */
  trendLabel?: string;
  /** Whether the card is loading */
  isLoading?: boolean;
  /** Optional click handler */
  onClick?: () => void;
}

const colorClasses: Record<KPIColor, { bg: string; text: string; icon: string }> = {
  accent: {
    bg: 'bg-rapid-accent/10',
    text: 'text-rapid-accent',
    icon: 'bg-rapid-accent/10 text-rapid-accent',
  },
  success: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    icon: 'bg-green-500/10 text-green-400',
  },
  warning: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    icon: 'bg-yellow-500/10 text-yellow-400',
  },
  error: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    icon: 'bg-red-500/10 text-red-400',
  },
  info: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    icon: 'bg-cyan-500/10 text-cyan-400',
  },
};

/**
 * Trend indicator arrow component
 */
function TrendIndicator({
  trend,
  label,
  invertColors = false,
}: {
  trend: number;
  label?: string;
  /** If true, negative trend is good (green) and positive is bad (red) */
  invertColors?: boolean;
}) {
  const isPositive = trend > 0;
  const isNegative = trend < 0;
  const isNeutral = trend === 0;

  // Determine color based on trend direction and inversion
  let trendColor = 'text-rapid-muted';
  if (!isNeutral) {
    if (invertColors) {
      trendColor = isPositive ? 'text-red-400' : 'text-green-400';
    } else {
      trendColor = isPositive ? 'text-green-400' : 'text-red-400';
    }
  }

  const formattedTrend = Math.abs(trend).toFixed(1);

  return (
    <div className={clsx('flex items-center gap-1 text-xs', trendColor)}>
      {isPositive && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      )}
      {isNegative && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      )}
      {isNeutral && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
        </svg>
      )}
      <span>{formattedTrend}%</span>
      {label && <span className="text-rapid-muted ml-1">{label}</span>}
    </div>
  );
}

/**
 * Loading skeleton for KPI card
 */
function KPICardSkeleton() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-3 w-20 bg-rapid-elevated rounded" />
          <div className="h-7 w-16 bg-rapid-elevated rounded" />
          <div className="h-3 w-24 bg-rapid-elevated rounded" />
        </div>
        <div className="w-11 h-11 bg-rapid-elevated rounded-lg" />
      </div>
    </div>
  );
}

/**
 * KPI Card Component
 *
 * Displays a key metric with trend indicator
 */
export function KPICard({
  label,
  value,
  formattedValue,
  icon,
  color,
  trend,
  trendLabel,
  isLoading = false,
  onClick,
}: KPICardProps) {
  if (isLoading) {
    return <KPICardSkeleton />;
  }

  const colors = colorClasses[color];
  const displayValue = formattedValue ?? value;

  // Determine if cost trend should be inverted (lower cost is better)
  const invertTrendColors = label.toLowerCase().includes('cost');

  return (
    <div
      className={clsx(
        'card p-4 transition-all duration-200',
        onClick && 'cursor-pointer hover:border-rapid-accent/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="text-sm text-rapid-muted font-mono">{label}</div>
          <div className="text-2xl font-semibold tracking-tight">{displayValue}</div>
          {trend !== undefined && (
            <TrendIndicator
              trend={trend}
              label={trendLabel}
              invertColors={invertTrendColors}
            />
          )}
        </div>
        <div className={clsx('p-3 rounded-lg', colors.icon)}>{icon}</div>
      </div>
    </div>
  );
}

/**
 * Grid container for KPI cards
 */
export function KPICardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {children}
    </div>
  );
}

// Icon components for common KPIs
export const Icons = {
  Cost: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Agents: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  ),
  Tasks: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  ),
  Success: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Latency: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Queue: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  ),
};

export default KPICard;
