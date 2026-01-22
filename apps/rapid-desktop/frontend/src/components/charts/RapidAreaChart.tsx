import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipProps,
} from 'recharts';
import { ChartContainer, type ChartContainerProps } from './ChartContainer';
import {
  chartColors,
  chartStyles,
  chartGradients,
  getSeriesColor,
  type ChartGradientKey,
} from '../../lib/chartTheme';

export interface AreaChartSeries {
  /** Data key in the data array */
  dataKey: string;
  /** Display name for legend/tooltip */
  name?: string;
  /** Color key from the theme or custom color */
  color?: ChartGradientKey | string;
  /** Whether to stack this series */
  stackId?: string;
}

export interface RapidAreaChartProps extends Omit<ChartContainerProps, 'children'> {
  /** Chart data array */
  data: Record<string, unknown>[];
  /** X-axis data key */
  xAxisKey: string;
  /** Series configuration */
  series: AreaChartSeries[];
  /** Whether to show grid lines */
  showGrid?: boolean;
  /** Whether to show legend */
  showLegend?: boolean;
  /** Whether to show tooltip */
  showTooltip?: boolean;
  /** X-axis tick formatter */
  xAxisFormatter?: (value: unknown) => string;
  /** Y-axis tick formatter */
  yAxisFormatter?: (value: unknown) => string;
  /** Tooltip value formatter */
  tooltipFormatter?: (value: unknown, name: string) => [string, string];
  /** Custom tooltip content */
  tooltipContent?: React.ComponentType<TooltipProps<number, string>>;
}

/**
 * Styled Area Chart component using RAPID design system.
 *
 * @example
 * ```tsx
 * <RapidAreaChart
 *   title="Task Completion Over Time"
 *   data={taskData}
 *   xAxisKey="date"
 *   series={[
 *     { dataKey: 'completed', name: 'Completed', color: 'success' },
 *     { dataKey: 'pending', name: 'Pending', color: 'warning' },
 *   ]}
 * />
 * ```
 */
export function RapidAreaChart({
  data,
  xAxisKey,
  series,
  showGrid = true,
  showLegend = true,
  showTooltip = true,
  xAxisFormatter,
  yAxisFormatter,
  tooltipFormatter,
  tooltipContent,
  ...containerProps
}: RapidAreaChartProps) {
  // Determine which gradients we need
  const gradientKeys = new Set<ChartGradientKey>();
  series.forEach((s) => {
    if (s.color && s.color in chartGradients) {
      gradientKeys.add(s.color as ChartGradientKey);
    }
  });

  return (
    <ChartContainer {...containerProps}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        {/* Gradient definitions */}
        <defs>
          {Array.from(gradientKeys).map((key) => {
            const gradient = chartGradients[key];
            return (
              <linearGradient key={gradient.id} id={gradient.id} x1="0" y1="0" x2="0" y2="1">
                {gradient.colors.map((stop, i) => (
                  <stop
                    key={i}
                    offset={stop.offset}
                    stopColor={stop.color}
                    stopOpacity={stop.opacity}
                  />
                ))}
              </linearGradient>
            );
          })}
        </defs>

        {showGrid && (
          <CartesianGrid
            strokeDasharray={chartStyles.grid.strokeDasharray}
            stroke={chartStyles.grid.stroke}
            strokeOpacity={chartStyles.grid.opacity}
            vertical={false}
          />
        )}

        <XAxis
          dataKey={xAxisKey}
          stroke={chartStyles.axis.stroke}
          tickLine={chartStyles.axis.tickLine}
          axisLine={chartStyles.axis.axisLine}
          tick={chartStyles.axis.tick}
          tickFormatter={xAxisFormatter}
        />

        <YAxis
          stroke={chartStyles.axis.stroke}
          tickLine={chartStyles.axis.tickLine}
          axisLine={chartStyles.axis.axisLine}
          tick={chartStyles.axis.tick}
          tickFormatter={yAxisFormatter}
        />

        {showTooltip && (
          <Tooltip
            content={tooltipContent}
            contentStyle={chartStyles.tooltip.contentStyle}
            itemStyle={chartStyles.tooltip.itemStyle}
            labelStyle={chartStyles.tooltip.labelStyle}
            cursor={chartStyles.tooltip.cursor}
            formatter={tooltipFormatter}
          />
        )}

        {showLegend && (
          <Legend
            wrapperStyle={chartStyles.legend.wrapperStyle}
            iconSize={chartStyles.legend.iconSize}
            iconType={chartStyles.legend.iconType}
          />
        )}

        {series.map((s, index) => {
          const gradientKey = s.color && s.color in chartGradients ? s.color as ChartGradientKey : null;
          const strokeColor = gradientKey
            ? chartGradients[gradientKey].colors[0].color
            : s.color || getSeriesColor(index);
          const fillColor = gradientKey
            ? `url(#${chartGradients[gradientKey].id})`
            : strokeColor;

          return (
            <Area
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name || s.dataKey}
              stackId={s.stackId}
              stroke={strokeColor}
              fill={fillColor}
              strokeWidth={chartStyles.area.strokeWidth}
              fillOpacity={gradientKey ? 1 : chartStyles.area.fillOpacity}
              animationDuration={chartStyles.animation.duration}
            />
          );
        })}
      </AreaChart>
    </ChartContainer>
  );
}
