/**
 * RAPID Chart Components
 *
 * A collection of pre-styled Recharts components matching the RAPID design system.
 * These components provide consistent styling, responsive behavior, and easy-to-use APIs.
 *
 * @example
 * ```tsx
 * import { RapidLineChart, RapidBarChart, ChartCard } from './components/charts';
 *
 * // Basic line chart
 * <RapidLineChart
 *   title="Tasks Over Time"
 *   data={taskData}
 *   xAxisKey="date"
 *   series={[{ dataKey: 'count', name: 'Tasks', color: 'accent' }]}
 * />
 *
 * // Bar chart in a card wrapper
 * <ChartCard title="Agent Performance" height={400}>
 *   <RapidBarChart
 *     data={agentData}
 *     xAxisKey="name"
 *     series={[{ dataKey: 'tasksCompleted', color: 'success' }]}
 *   />
 * </ChartCard>
 * ```
 */

// Container components
export { ChartContainer, ChartCard, type ChartContainerProps } from './ChartContainer';

// Chart components
export { RapidAreaChart, type RapidAreaChartProps, type AreaChartSeries } from './RapidAreaChart';
export { RapidBarChart, type RapidBarChartProps, type BarChartSeries } from './RapidBarChart';
export { RapidLineChart, type RapidLineChartProps, type LineChartSeries } from './RapidLineChart';
export {
  RapidPieChart,
  RapidDonutChart,
  type RapidPieChartProps,
  type RapidDonutChartProps,
  type PieChartDataItem,
} from './RapidPieChart';

// Theme exports (for custom chart implementations)
export {
  chartColors,
  chartStyles,
  chartGradients,
  getSeriesColor,
  getSeriesColorWithOpacity,
  type ChartColorKey,
  type ChartGradientKey,
} from '../../lib/chartTheme';
