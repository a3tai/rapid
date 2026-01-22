<<<<<<< HEAD
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
=======
import { clsx } from 'clsx';
import { StatCard, type StatCardFormat } from './StatCard';
import { useTokenMetrics } from '../hooks/useTokenMetrics';
import { Skeleton } from './Skeleton';

export interface TokenUsageStatsProps {
  /** Custom class name for the container */
  className?: string;
  /** Polling interval in milliseconds (default: 10000) */
  pollingInterval?: number;
  /** Layout: 'grid' for 5 columns, 'compact' for 2x2+1 */
  layout?: 'grid' | 'compact';
  /** Show refresh button */
  showRefresh?: boolean;
}

/**
 * Format large token counts with K, M suffixes
 */
function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

/**
 * Token usage icon component
 */
function TokenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('w-4 h-4', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
      />
    </svg>
  );
}

/**
 * Refresh button component
 */
function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={clsx(
        'p-1.5 rounded-md transition-colors',
        'hover:bg-rapid-surface text-rapid-muted hover:text-rapid-text',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
      title="Refresh metrics"
      aria-label="Refresh token metrics"
    >
      <svg
        className={clsx('w-4 h-4', loading && 'animate-spin')}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    </button>
>>>>>>> 20a78b8 (feat(desktop): add AgentFleetStatus, tests, and UI improvements)
  );
}

/**
 * Loading skeleton for the stats panel
 */
<<<<<<< HEAD
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
=======
function TokenUsageStatsSkeleton({ layout = 'grid' }: { layout?: 'grid' | 'compact' }) {
  const gridClasses =
    layout === 'grid'
      ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4'
      : 'grid grid-cols-2 gap-4';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton height={20} width={120} />
        <Skeleton height={24} width={24} />
      </div>
      <div className={gridClasses}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card p-4">
            <div className="space-y-3">
              <Skeleton height={12} width="40%" />
              <Skeleton height={28} width="60%" />
            </div>
>>>>>>> 20a78b8 (feat(desktop): add AgentFleetStatus, tests, and UI improvements)
          </div>
        ))}
      </div>
    </div>
  );
}

/**
<<<<<<< HEAD
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
=======
 * Error state component
 */
function TokenUsageStatsError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="card p-4 border-rapid-error/30 bg-rapid-error/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-rapid-error">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm font-medium">Failed to load token metrics</span>
        </div>
        <button
          onClick={onRetry}
          className="text-xs text-rapid-accent hover:underline"
        >
          Retry
        </button>
      </div>
      <p className="mt-2 text-xs text-rapid-muted">{error}</p>
    </div>
  );
}

/**
 * TokenUsageStats - Display token usage statistics panel
 *
 * Shows 5 key metrics:
 * - Total input tokens
 * - Total output tokens
 * - Total tokens
 * - Average tokens per task
 * - Token efficiency ratio (output/input)
 *
 * Data is fetched from the MCP get_cost_summary endpoint via useTokenMetrics hook.
 *
 * @example
 * ```tsx
 * <TokenUsageStats layout="grid" showRefresh />
 * ```
 */
export function TokenUsageStats({
  className,
  pollingInterval = 10000,
  layout = 'grid',
  showRefresh = true,
}: TokenUsageStatsProps) {
  const { metrics, loading, error, refresh } = useTokenMetrics(pollingInterval);

  if (loading) {
    return <TokenUsageStatsSkeleton layout={layout} />;
  }

  if (error && metrics.totalTokens === 0) {
    return <TokenUsageStatsError error={error} onRetry={refresh} />;
  }

  const gridClasses =
    layout === 'grid'
      ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4'
      : 'grid grid-cols-2 gap-4';

  return (
    <div className={clsx('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TokenIcon className="text-rapid-muted" />
          <h3 className="text-sm font-medium text-rapid-text">Token Usage (24h)</h3>
          {metrics.taskCount > 0 && (
            <span className="text-xs text-rapid-muted">
              ({metrics.taskCount} task{metrics.taskCount !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        {showRefresh && <RefreshButton onClick={refresh} loading={loading} />}
      </div>

      {/* Stats Grid */}
      <div className={gridClasses}>
        {/* Total Input Tokens */}
        <StatCard
          value={metrics.inputTokens}
          label="Input Tokens"
          format="number"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
              />
            </svg>
          }
        />

        {/* Total Output Tokens */}
        <StatCard
          value={metrics.outputTokens}
          label="Output Tokens"
          format="number"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          }
        />

        {/* Total Tokens */}
        <StatCard
          value={metrics.totalTokens}
          label="Total Tokens"
          format="number"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          }
        />

        {/* Avg Tokens Per Task */}
        <StatCard
          value={metrics.avgTokensPerTask}
          label="Avg per Task"
          format="number"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          }
        />

        {/* Efficiency Ratio */}
        <StatCard
          value={metrics.efficiencyRatio * 100}
          label="Efficiency"
          format="percentage"
          trend={
            metrics.efficiencyRatio > 1
              ? (metrics.efficiencyRatio - 1) * 100
              : metrics.efficiencyRatio < 1
                ? (1 - metrics.efficiencyRatio) * -100
                : 0
          }
          trendDirection={
            metrics.efficiencyRatio > 1
              ? 'up'
              : metrics.efficiencyRatio < 1
                ? 'down'
                : 'neutral'
          }
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          }
        />
      </div>

      {/* Cache info (if available) */}
      {(metrics.cacheReadTokens > 0 || metrics.cacheWriteTokens > 0) && (
        <div className="flex items-center gap-4 text-xs text-rapid-muted mt-2">
          {metrics.cacheReadTokens > 0 && (
            <span>Cache Read: {formatTokenCount(metrics.cacheReadTokens)}</span>
          )}
          {metrics.cacheWriteTokens > 0 && (
            <span>Cache Write: {formatTokenCount(metrics.cacheWriteTokens)}</span>
          )}
>>>>>>> 20a78b8 (feat(desktop): add AgentFleetStatus, tests, and UI improvements)
        </div>
      )}
    </div>
  );
}

export default TokenUsageStats;
