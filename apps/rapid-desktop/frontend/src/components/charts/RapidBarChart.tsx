import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  type TooltipProps,
} from 'recharts';
import { ChartContainer, type ChartContainerProps } from './ChartContainer';
import { chartColors, chartStyles, getSeriesColor, type ChartColorKey } from '../../lib/chartTheme';

export interface BarChartSeries {
  /** Data key in the data array */
  dataKey: string;
  /** Display name for legend/tooltip */
  name?: string;
  /** Color key from the theme or custom color */
  color?: ChartColorKey | string;
  /** Whether to stack this series */
  stackId?: string;
}

export interface RapidBarChartProps extends Omit<ChartContainerProps, 'children'> {
  /** Chart data array */
  data: Record<string, unknown>[];
  /** X-axis data key */
  xAxisKey: string;
  /** Series configuration */
  series: BarChartSeries[];
  /** Whether to show grid lines */
  showGrid?: boolean;
  /** Whether to show legend */
  showLegend?: boolean;
  /** Whether to show tooltip */
  showTooltip?: boolean;
  /** Horizontal layout (bars extend horizontally) */
  layout?: 'vertical' | 'horizontal';
  /** X-axis tick formatter */
  xAxisFormatter?: (value: unknown) => string;
  /** Y-axis tick formatter */
  yAxisFormatter?: (value: unknown) => string;
  /** Tooltip value formatter */
  tooltipFormatter?: (value: unknown, name: string) => [string, string];
  /** Custom tooltip content */
  tooltipContent?: React.ComponentType<TooltipProps<number, string>>;
  /** Custom colors per data item (for single-series with varying colors) */
  itemColors?: (string | ChartColorKey)[];
}

/**
 * Styled Bar Chart component using RAPID design system.
 *
 * @example
 * ```tsx
 * <RapidBarChart
 *   title="Tasks by Status"
 *   data={statusData}
 *   xAxisKey="status"
 *   series={[{ dataKey: 'count', name: 'Tasks', color: 'accent' }]}
 * />
 * ```
 */
export function RapidBarChart({
  data,
  xAxisKey,
  series,
  showGrid = true,
  showLegend = false,
  showTooltip = true,
  layout = 'horizontal',
  xAxisFormatter,
  yAxisFormatter,
  tooltipFormatter,
  tooltipContent,
  itemColors,
  ...containerProps
}: RapidBarChartProps) {
  const isVertical = layout === 'vertical';

  const getBarColor = (colorValue: ChartColorKey | string | undefined, index: number): string => {
    if (!colorValue) return getSeriesColor(index);
    if (colorValue in chartColors.primary) {
      return chartColors.primary[colorValue as ChartColorKey];
    }
    return colorValue;
  };

  return (
    <ChartContainer {...containerProps}>
      <BarChart
        data={data}
        layout={layout}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        {showGrid && (
          <CartesianGrid
            strokeDasharray={chartStyles.grid.strokeDasharray}
            stroke={chartStyles.grid.stroke}
            strokeOpacity={chartStyles.grid.opacity}
            horizontal={!isVertical}
            vertical={isVertical}
          />
        )}

        {isVertical ? (
          <>
            <XAxis
              type="number"
              stroke={chartStyles.axis.stroke}
              tickLine={chartStyles.axis.tickLine}
              axisLine={chartStyles.axis.axisLine}
              tick={chartStyles.axis.tick}
              tickFormatter={xAxisFormatter}
            />
            <YAxis
              type="category"
              dataKey={xAxisKey}
              stroke={chartStyles.axis.stroke}
              tickLine={chartStyles.axis.tickLine}
              axisLine={chartStyles.axis.axisLine}
              tick={chartStyles.axis.tick}
              tickFormatter={yAxisFormatter}
              width={80}
            />
          </>
        ) : (
          <>
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
          </>
        )}

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

        {series.map((s, seriesIndex) => {
          const barColor = getBarColor(s.color, seriesIndex);

          return (
            <Bar
              key={s.dataKey}
              dataKey={s.dataKey}
              name={s.name || s.dataKey}
              stackId={s.stackId}
              fill={barColor}
              radius={chartStyles.bar.radius}
              maxBarSize={chartStyles.bar.maxBarSize}
              animationDuration={chartStyles.animation.duration}
            >
              {/* Apply per-item colors if provided (single series only) */}
              {itemColors &&
                series.length === 1 &&
                data.map((_, itemIndex) => (
                  <Cell key={itemIndex} fill={getBarColor(itemColors[itemIndex], itemIndex)} />
                ))}
            </Bar>
          );
        })}
      </BarChart>
    </ChartContainer>
  );
}
