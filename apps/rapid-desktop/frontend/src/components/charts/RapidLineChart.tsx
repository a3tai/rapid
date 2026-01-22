import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipProps,
} from 'recharts';
import { ChartContainer, type ChartContainerProps } from './ChartContainer';
import { chartColors, chartStyles, getSeriesColor, type ChartColorKey } from '../../lib/chartTheme';

export interface LineChartSeries {
  /** Data key in the data array */
  dataKey: string;
  /** Display name for legend/tooltip */
  name?: string;
  /** Color key from the theme or custom color */
  color?: ChartColorKey | string;
  /** Line type */
  type?: 'monotone' | 'linear' | 'step' | 'stepBefore' | 'stepAfter';
  /** Whether to show dots on the line */
  dot?: boolean;
  /** Stroke dash array for dashed lines */
  strokeDasharray?: string;
}

export interface RapidLineChartProps extends Omit<ChartContainerProps, 'children'> {
  /** Chart data array */
  data: Record<string, unknown>[];
  /** X-axis data key */
  xAxisKey: string;
  /** Series configuration */
  series: LineChartSeries[];
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
 * Styled Line Chart component using RAPID design system.
 *
 * @example
 * ```tsx
 * <RapidLineChart
 *   title="Agent Activity"
 *   data={activityData}
 *   xAxisKey="time"
 *   series={[
 *     { dataKey: 'active', name: 'Active', color: 'success' },
 *     { dataKey: 'idle', name: 'Idle', color: 'warning', strokeDasharray: '5 5' },
 *   ]}
 * />
 * ```
 */
export function RapidLineChart({
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
}: RapidLineChartProps) {
  const getLineColor = (colorValue: ChartColorKey | string | undefined, index: number): string => {
    if (!colorValue) return getSeriesColor(index);
    if (colorValue in chartColors.primary) {
      return chartColors.primary[colorValue as ChartColorKey];
    }
    return colorValue;
  };

  return (
    <ChartContainer {...containerProps}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            iconType="line"
          />
        )}

        {series.map((s, index) => {
          const lineColor = getLineColor(s.color, index);

          return (
            <Line
              key={s.dataKey}
              type={s.type || 'monotone'}
              dataKey={s.dataKey}
              name={s.name || s.dataKey}
              stroke={lineColor}
              strokeWidth={2}
              strokeDasharray={s.strokeDasharray}
              dot={
                s.dot !== false
                  ? {
                      fill: chartColors.background.elevated,
                      stroke: lineColor,
                      strokeWidth: 2,
                      r: 3,
                    }
                  : false
              }
              activeDot={{
                fill: lineColor,
                stroke: chartColors.background.elevated,
                strokeWidth: 2,
                r: 5,
              }}
              animationDuration={chartStyles.animation.duration}
            />
          );
        })}
      </LineChart>
    </ChartContainer>
  );
}
