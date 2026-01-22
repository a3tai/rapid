/**
 * Token Usage Stats Component
 *
 * Displays token usage statistics in a card with metrics:
 * - Total input tokens
 * - Total output tokens
 * - Total tokens
 * - Average tokens per task
 * - Token efficiency ratio (output/input)
 */

import { clsx } from 'clsx';
import { useTokenUsageStats } from '../hooks/useMetrics';

/**
 * Format large numbers with K/M suffixes
 */
function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(2)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

/**
 * Individual stat item in the stats panel
 */
function StatItem({
  label,
  value,
  subValue,
  color = 'default',
}: {
  label: string;
  value: string | number;
  subValue?: string;
  color?: 'default' | 'accent' | 'success' | 'warning' | 'info';
}) {
  const colorClasses = {
    default: 'text-rapid-text',
    accent: 'text-rapid-accent',
    success: 'text-green-400',
    warning: 'text-yellow-400',
    info: 'text-cyan-400',
  };

  return (
    <div className="flex flex-col">
      <span className="text-xs text-rapid-muted font-mono uppercase tracking-wider">{label}</span>
      <span className={clsx('text-xl font-semibold tabular-nums', colorClasses[color])}>
        {value}
      </span>
      {subValue && <span className="text-xs text-rapid-muted">{subValue}</span>}
    </div>
  );
}

/**
 * Loading skeleton for the stats panel
 */
function TokenStatsSkeleton() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-5 h-5 bg-rapid-elevated rounded" />
        <div className="h-4 w-32 bg-rapid-elevated rounded" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 bg-rapid-elevated rounded" />
            <div className="h-6 w-16 bg-rapid-elevated rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Token icon component
 */
function TokenIcon() {
  return (
    <svg
      className="w-5 h-5 text-rapid-accent"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
      />
    </svg>
  );
}

export interface TokenUsageStatsProps {
  /** Optional title for the card */
  title?: string;
  /** Whether to show as compact single-row layout */
  compact?: boolean;
  /** Optional CSS class name */
  className?: string;
}

/**
 * Token Usage Stats Panel
 *
 * Displays key token metrics from the cost summary endpoint
 */
export function TokenUsageStats({
  title = 'Token Usage (24h)',
  compact = false,
  className,
}: TokenUsageStatsProps) {
  const { stats, refresh } = useTokenUsageStats();

  if (stats.isLoading) {
    return <TokenStatsSkeleton />;
  }

  if (stats.error && stats.inputTokens === 0) {
    return (
      <div className={clsx('card p-4', className)}>
        <div className="flex items-center gap-2 mb-2">
          <TokenIcon />
          <h3 className="font-semibold">{title}</h3>
        </div>
        <div className="text-center py-4 text-rapid-muted">
          <p className="text-sm">Unable to load token statistics</p>
          <button
            onClick={refresh}
            className="mt-2 text-xs text-rapid-accent hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const efficiencyLabel = stats.efficiencyRatio < 0.5
    ? 'Low'
    : stats.efficiencyRatio < 1
      ? 'Balanced'
      : stats.efficiencyRatio < 2
        ? 'High output'
        : 'Very high output';

  const efficiencyColor = stats.efficiencyRatio < 0.3
    ? 'warning'
    : stats.efficiencyRatio > 2
      ? 'info'
      : 'success';

  return (
    <div className={clsx('card p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TokenIcon />
          <h3 className="font-semibold">{title}</h3>
        </div>
        {stats.totalTokens > 0 && (
          <span className="badge badge-neutral text-xs">
            {formatTokenCount(stats.totalTokens)} total
          </span>
        )}
      </div>

      <div
        className={clsx(
          'gap-4',
          compact
            ? 'flex flex-wrap items-center justify-between'
            : 'grid grid-cols-2 md:grid-cols-5'
        )}
      >
        <StatItem
          label="Input Tokens"
          value={formatTokenCount(stats.inputTokens)}
          color="info"
        />
        <StatItem
          label="Output Tokens"
          value={formatTokenCount(stats.outputTokens)}
          color="accent"
        />
        <StatItem
          label="Total Tokens"
          value={formatTokenCount(stats.totalTokens)}
        />
        <StatItem
          label="Avg/Task"
          value={formatTokenCount(Math.round(stats.avgTokensPerTask))}
          subValue={stats.avgTokensPerTask > 0 ? 'per completed task' : 'no tasks yet'}
        />
        <StatItem
          label="Efficiency"
          value={stats.efficiencyRatio.toFixed(2)}
          subValue={efficiencyLabel}
          color={efficiencyColor}
        />
      </div>

      {/* Visual token distribution bar */}
      {stats.totalTokens > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 text-xs text-rapid-muted mb-1">
            <span>Token Distribution</span>
            <span className="ml-auto">
              {((stats.inputTokens / stats.totalTokens) * 100).toFixed(0)}% input
            </span>
            <span>
              {((stats.outputTokens / stats.totalTokens) * 100).toFixed(0)}% output
            </span>
          </div>
          <div className="h-2 bg-rapid-elevated rounded-full overflow-hidden flex">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{
                width: `${(stats.inputTokens / stats.totalTokens) * 100}%`,
              }}
            />
            <div
              className="h-full bg-rapid-accent transition-all duration-300"
              style={{
                width: `${(stats.outputTokens / stats.totalTokens) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default TokenUsageStats;
