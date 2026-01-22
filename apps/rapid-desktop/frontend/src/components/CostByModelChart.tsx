/**
 * Cost by Model Donut Chart Component
 *
 * Displays cost breakdown by model (Opus, Sonnet, Haiku) as a donut chart.
 * Features:
 * - Color coded segments (violet for Opus, blue for Sonnet, green for Haiku)
 * - Legend with percentages and dollar amounts
 * - Click to filter callback for other charts
 * - Total cost display in center
 */

import { useState, useCallback, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, Sector, type TooltipProps } from 'recharts';
import { clsx } from 'clsx';
import { ChartContainer } from './charts/ChartContainer';
import { chartColors, chartStyles } from '../lib/chartTheme';
import { useMcp } from '../hooks/useMcp';

// Model color configuration matching design spec
const MODEL_COLORS = {
  opus: 'hsl(245 85% 67%)', // Violet
  sonnet: 'hsl(217 91% 60%)', // Blue
  haiku: 'hsl(142 71% 45%)', // Green
  // Fallback for unknown models
  other: 'hsl(240 5% 55%)', // Muted gray
} as const;

const MODEL_LABELS = {
  opus: 'Claude Opus',
  sonnet: 'Claude Sonnet',
  haiku: 'Claude Haiku',
  other: 'Other',
} as const;

type ModelType = keyof typeof MODEL_COLORS;

interface CostByModelData {
  name: string;
  model: ModelType;
  value: number;
  percentage: number;
}

interface CostByModelChartProps {
  /** Chart title */
  title?: string;
  /** Chart height */
  height?: number;
  /** Loading state */
  loading?: boolean;
  /** Callback when a model segment is clicked */
  onModelSelect?: (model: string | null) => void;
  /** Currently selected model (for highlighting) */
  selectedModel?: string | null;
  /** Refresh interval in ms (0 to disable) */
  refreshInterval?: number;
  /** Additional CSS class */
  className?: string;
}

/**
 * Custom active segment renderer for highlighting on hover/click
 */
function renderActiveShape(props: {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  fill: string;
  payload: CostByModelData;
  percent: number;
  value: number;
}) {
  const {
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
    value,
  } = props;

  return (
    <g>
      {/* Main segment - slightly expanded */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke={chartColors.background.primary}
        strokeWidth={2}
      />
      {/* Outer glow ring */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 8}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.3}
      />
    </g>
  );
}

/**
 * Custom tooltip component
 */
function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as CostByModelData;
    return (
      <div
        className="rounded-lg p-3 shadow-lg"
        style={{
          backgroundColor: chartColors.background.elevated,
          border: `1px solid ${chartColors.grid.line}`,
        }}
      >
        <p className="text-sm font-medium mb-1" style={{ color: MODEL_COLORS[data.model] }}>
          {data.name}
        </p>
        <p className="text-lg font-bold" style={{ color: chartColors.text.primary }}>
          ${data.value.toFixed(2)}
        </p>
        <p className="text-xs" style={{ color: chartColors.text.muted }}>
          {data.percentage.toFixed(1)}% of total
        </p>
      </div>
    );
  }
  return null;
}

/**
 * Custom legend component with dollar amounts
 */
function CustomLegend({
  payload,
  data,
  onSelect,
  selectedModel,
}: {
  payload?: Array<{ value: string; color: string }>;
  data: CostByModelData[];
  onSelect?: (model: string | null) => void;
  selectedModel?: string | null;
}) {
  if (!payload) return null;

  return (
    <div className="flex flex-wrap justify-center gap-4 mt-4">
      {data.map((item, index) => (
        <button
          key={item.model}
          onClick={() => onSelect?.(selectedModel === item.model ? null : item.model)}
          className={clsx(
            'flex items-center gap-2 px-2 py-1 rounded transition-all',
            'hover:bg-rapid-elevated/50',
            selectedModel === item.model && 'bg-rapid-elevated ring-1 ring-rapid-accent'
          )}
        >
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: MODEL_COLORS[item.model] }}
          />
          <span className="text-xs font-medium" style={{ color: chartColors.text.primary }}>
            {item.name}
          </span>
          <span className="text-xs font-mono" style={{ color: chartColors.text.muted }}>
            ${item.value.toFixed(2)}
          </span>
          <span className="text-xs" style={{ color: chartColors.text.dimmed }}>
            ({item.percentage.toFixed(0)}%)
          </span>
        </button>
      ))}
    </div>
  );
}

export function CostByModelChart({
  title = 'Cost by Model',
  height = 300,
  loading: externalLoading,
  onModelSelect,
  selectedModel,
  refreshInterval = 60000,
  className,
}: CostByModelChartProps) {
  const [data, setData] = useState<CostByModelData[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { callTool } = useMcp();

  // Fetch cost data from MCP
  const fetchData = useCallback(async () => {
    try {
      const result = await callTool('get_cost_summary', { hours: 24 });
      const costData = result.structuredContent as {
        totalCost?: number;
        costByModel?: Record<string, number>;
      } | null;

      if (costData?.costByModel) {
        const total = costData.totalCost || 0;
        const modelData: CostByModelData[] = [];

        // Process each model
        for (const [modelKey, cost] of Object.entries(costData.costByModel)) {
          // Normalize model names to our known types
          let model: ModelType = 'other';
          const lowerKey = modelKey.toLowerCase();
          if (lowerKey.includes('opus')) model = 'opus';
          else if (lowerKey.includes('sonnet')) model = 'sonnet';
          else if (lowerKey.includes('haiku')) model = 'haiku';

          modelData.push({
            name: MODEL_LABELS[model],
            model,
            value: cost,
            percentage: total > 0 ? (cost / total) * 100 : 0,
          });
        }

        // Sort by value descending
        modelData.sort((a, b) => b.value - a.value);

        setData(modelData);
        setTotalCost(total);
      } else {
        // No data - show empty state
        setData([]);
        setTotalCost(0);
      }
    } catch (err) {
      console.error('Failed to fetch cost by model:', err);
    } finally {
      setIsLoading(false);
    }
  }, [callTool]);

  // Initial fetch and refresh interval
  useEffect(() => {
    fetchData();
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval]);

  // Handle segment hover
  const onPieEnter = useCallback((_: unknown, index: number) => {
    setActiveIndex(index);
  }, []);

  const onPieLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

  // Handle segment click
  const onPieClick = useCallback(
    (data: CostByModelData) => {
      onModelSelect?.(selectedModel === data.model ? null : data.model);
    },
    [onModelSelect, selectedModel]
  );

  const isLoadingState = externalLoading !== undefined ? externalLoading : isLoading;

  return (
    <ChartContainer
      title={title}
      height={height}
      loading={isLoadingState}
      empty={data.length === 0}
      emptyMessage="No cost data available"
      className={className}
    >
      <div className="relative">
        <PieChart width={300} height={height - 80} style={{ margin: '0 auto' }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            stroke={chartColors.background.primary}
            strokeWidth={2}
            animationDuration={chartStyles.animation.duration}
            activeIndex={activeIndex ?? undefined}
            activeShape={renderActiveShape}
            onMouseEnter={onPieEnter}
            onMouseLeave={onPieLeave}
            onClick={(_, index) => onPieClick(data[index])}
            style={{ cursor: 'pointer' }}
          >
            {data.map((entry) => (
              <Cell
                key={entry.model}
                fill={MODEL_COLORS[entry.model]}
                opacity={selectedModel && selectedModel !== entry.model ? 0.3 : 1}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>

        {/* Center content - total cost */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: '80px' }}>
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: chartColors.text.primary }}>
              ${totalCost.toFixed(2)}
            </div>
            <div className="text-xs" style={{ color: chartColors.text.muted }}>
              Total (24h)
            </div>
          </div>
        </div>
      </div>

      {/* Custom legend with amounts */}
      <CustomLegend
        data={data}
        onSelect={onModelSelect}
        selectedModel={selectedModel}
      />
    </ChartContainer>
  );
}

export default CostByModelChart;
