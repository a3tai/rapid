import { PieChart, Pie, Cell, Tooltip, Legend, type TooltipProps } from 'recharts';
import { ChartContainer, type ChartContainerProps } from './ChartContainer';
import { chartColors, chartStyles, getSeriesColor, type ChartColorKey } from '../../lib/chartTheme';

export interface PieChartDataItem {
  /** Name/label for the segment */
  name: string;
  /** Value for the segment */
  value: number;
  /** Optional color override */
  color?: ChartColorKey | string;
}

export interface RapidPieChartProps extends Omit<ChartContainerProps, 'children'> {
  /** Chart data array */
  data: PieChartDataItem[];
  /** Whether to show legend */
  showLegend?: boolean;
  /** Whether to show tooltip */
  showTooltip?: boolean;
  /** Inner radius for donut chart (0 for pie) */
  innerRadius?: number | string;
  /** Outer radius */
  outerRadius?: number | string;
  /** Padding angle between segments */
  paddingAngle?: number;
  /** Tooltip value formatter */
  tooltipFormatter?: (value: unknown, name: string) => [string, string];
  /** Custom tooltip content */
  tooltipContent?: React.ComponentType<TooltipProps<number, string>>;
  /** Show labels on segments */
  showLabels?: boolean;
  /** Label line configuration */
  labelLine?: boolean;
}

/**
 * Styled Pie/Donut Chart component using RAPID design system.
 *
 * @example
 * ```tsx
 * // Pie chart
 * <RapidPieChart
 *   title="Tasks by Priority"
 *   data={[
 *     { name: 'High', value: 10, color: 'error' },
 *     { name: 'Medium', value: 25, color: 'warning' },
 *     { name: 'Low', value: 15, color: 'success' },
 *   ]}
 * />
 *
 * // Donut chart
 * <RapidPieChart
 *   title="Agent Status"
 *   data={statusData}
 *   innerRadius="60%"
 *   outerRadius="80%"
 * />
 * ```
 */
export function RapidPieChart({
  data,
  showLegend = true,
  showTooltip = true,
  innerRadius = 0,
  outerRadius = '80%',
  paddingAngle = 2,
  tooltipFormatter,
  tooltipContent,
  showLabels = false,
  labelLine = false,
  ...containerProps
}: RapidPieChartProps) {
  const getSegmentColor = (
    colorValue: ChartColorKey | string | undefined,
    index: number
  ): string => {
    if (!colorValue) return getSeriesColor(index);
    if (colorValue in chartColors.primary) {
      return chartColors.primary[colorValue as ChartColorKey];
    }
    return colorValue;
  };

  const renderLabel = showLabels
    ? ({ name, percent }: { name: string; percent: number }) =>
        `${name} (${(percent * 100).toFixed(0)}%)`
    : undefined;

  return (
    <ChartContainer {...containerProps}>
      <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
        {showTooltip && (
          <Tooltip
            content={tooltipContent}
            contentStyle={chartStyles.tooltip.contentStyle}
            itemStyle={chartStyles.tooltip.itemStyle}
            labelStyle={chartStyles.tooltip.labelStyle}
            formatter={tooltipFormatter}
          />
        )}

        {showLegend && (
          <Legend
            wrapperStyle={chartStyles.legend.wrapperStyle}
            iconSize={chartStyles.legend.iconSize}
            iconType="circle"
            layout="horizontal"
            align="center"
            verticalAlign="bottom"
          />
        )}

        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={paddingAngle}
          stroke={chartColors.background.primary}
          strokeWidth={2}
          animationDuration={chartStyles.animation.duration}
          label={renderLabel}
          labelLine={labelLine}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getSegmentColor(entry.color, index)} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

/**
 * Preset donut chart with centered content support
 */
export interface RapidDonutChartProps extends RapidPieChartProps {
  /** Content to display in the center of the donut */
  centerContent?: React.ReactNode;
}

export function RapidDonutChart({
  centerContent,
  innerRadius = '55%',
  outerRadius = '80%',
  ...props
}: RapidDonutChartProps) {
  if (centerContent) {
    return (
      <div className="relative">
        <RapidPieChart innerRadius={innerRadius} outerRadius={outerRadius} {...props} />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">{centerContent}</div>
        </div>
      </div>
    );
  }

  return <RapidPieChart innerRadius={innerRadius} outerRadius={outerRadius} {...props} />;
}
