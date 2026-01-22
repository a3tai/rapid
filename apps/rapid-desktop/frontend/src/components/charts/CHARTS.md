# RAPID Chart Components

Pre-styled Recharts components matching the RAPID design system. These components provide consistent styling, responsive behavior, and easy-to-use APIs for dashboard visualizations.

## Installation

The chart components require `recharts` as a peer dependency (already installed):

```bash
pnpm add recharts
```

## Quick Start

```tsx
import { RapidLineChart, RapidBarChart, ChartCard } from './components/charts';

// Basic line chart
<RapidLineChart
  title="Tasks Over Time"
  data={taskData}
  xAxisKey="date"
  series={[{ dataKey: 'count', name: 'Tasks', color: 'accent' }]}
/>
```

## Available Components

### ChartContainer

Responsive wrapper for charts with loading/empty states.

```tsx
import { ChartContainer } from './components/charts';

<ChartContainer
  title="My Chart"
  subtitle="Optional description"
  height={300}
  loading={isLoading}
  empty={data.length === 0}
  emptyMessage="No data to display"
>
  {/* Your Recharts component */}
</ChartContainer>
```

**Props:**
- `title?: string` - Chart title
- `subtitle?: string` - Optional description
- `height?: number | string` - Container height (default: 300)
- `minHeight?: number` - Minimum height (default: 200)
- `loading?: boolean` - Show loading skeleton
- `empty?: boolean` - Show empty state
- `emptyMessage?: string` - Custom empty message
- `actions?: ReactNode` - Action buttons in header

### ChartCard

ChartContainer wrapped in the standard RAPID card styling.

```tsx
import { ChartCard } from './components/charts';

<ChartCard title="Agent Performance" height={400}>
  {/* Chart content */}
</ChartCard>
```

### RapidLineChart

Line chart for time-series and trend data.

```tsx
import { RapidLineChart } from './components/charts';

const data = [
  { date: '2024-01', active: 5, idle: 2 },
  { date: '2024-02', active: 8, idle: 1 },
  { date: '2024-03', active: 12, idle: 3 },
];

<RapidLineChart
  title="Agent Activity"
  data={data}
  xAxisKey="date"
  series={[
    { dataKey: 'active', name: 'Active', color: 'success' },
    { dataKey: 'idle', name: 'Idle', color: 'warning', strokeDasharray: '5 5' },
  ]}
/>
```

**Series Options:**
- `dataKey: string` - Data key in data array
- `name?: string` - Display name
- `color?: 'accent' | 'success' | 'warning' | 'error' | 'info' | string`
- `type?: 'monotone' | 'linear' | 'step'`
- `dot?: boolean` - Show dots on line
- `strokeDasharray?: string` - For dashed lines

### RapidAreaChart

Area chart with gradient fills.

```tsx
import { RapidAreaChart } from './components/charts';

<RapidAreaChart
  title="Task Completion"
  data={taskData}
  xAxisKey="date"
  series={[
    { dataKey: 'completed', name: 'Completed', color: 'success' },
    { dataKey: 'pending', name: 'Pending', color: 'warning', stackId: 'tasks' },
  ]}
/>
```

**Series Options:**
- `stackId?: string` - Stack series with same ID

### RapidBarChart

Bar chart for categorical comparisons.

```tsx
import { RapidBarChart } from './components/charts';

const data = [
  { status: 'Pending', count: 15 },
  { status: 'In Progress', count: 8 },
  { status: 'Completed', count: 42 },
];

<RapidBarChart
  title="Tasks by Status"
  data={data}
  xAxisKey="status"
  series={[{ dataKey: 'count', name: 'Tasks', color: 'accent' }]}
/>

// Horizontal bars
<RapidBarChart
  layout="vertical"
  data={data}
  xAxisKey="status"
  series={[{ dataKey: 'count' }]}
/>

// Per-item colors
<RapidBarChart
  data={data}
  xAxisKey="status"
  series={[{ dataKey: 'count' }]}
  itemColors={['warning', 'info', 'success']}
/>
```

**Props:**
- `layout?: 'vertical' | 'horizontal'` - Bar direction
- `itemColors?: (string | ChartColorKey)[]` - Per-bar colors

### RapidPieChart / RapidDonutChart

Pie and donut charts for proportions.

```tsx
import { RapidPieChart, RapidDonutChart } from './components/charts';

const data = [
  { name: 'High', value: 10, color: 'error' },
  { name: 'Medium', value: 25, color: 'warning' },
  { name: 'Low', value: 15, color: 'success' },
];

// Pie chart
<RapidPieChart title="Tasks by Priority" data={data} />

// Donut chart
<RapidDonutChart
  title="Agent Status"
  data={data}
  centerContent={<span className="text-2xl font-bold">50</span>}
/>
```

**Props:**
- `innerRadius?: number | string` - For donut (default: 0)
- `outerRadius?: number | string` - Chart radius (default: '80%')
- `paddingAngle?: number` - Gap between segments
- `showLabels?: boolean` - Show segment labels
- `centerContent?: ReactNode` - Content in donut center

## Color Palette

Available color keys for the `color` prop:

| Key | Use Case |
|-----|----------|
| `accent` | Primary/featured data (violet-blue) |
| `success` | Positive outcomes (green) |
| `warning` | Caution/pending (yellow) |
| `error` | Errors/critical (red) |
| `info` | Informational (blue) |

You can also use custom CSS color values.

## Formatting

All chart components accept formatter props:

```tsx
<RapidLineChart
  xAxisFormatter={(value) => format(new Date(value), 'MMM d')}
  yAxisFormatter={(value) => `${value}%`}
  tooltipFormatter={(value, name) => [`${value} items`, name]}
  // ...
/>
```

## Responsive Behavior

All charts automatically resize to fill their container width. The `ChartContainer` component handles height constraints:

```tsx
// Fixed height
<ChartContainer height={300}>...</ChartContainer>

// Percentage of parent
<ChartContainer height="50%">...</ChartContainer>

// With minimum
<ChartContainer height={300} minHeight={200}>...</ChartContainer>
```

## Custom Charts

For advanced customization, use the theme directly:

```tsx
import {
  chartColors,
  chartStyles,
  chartGradients,
  getSeriesColor,
} from './components/charts';

// Access theme colors
chartColors.primary.accent // 'hsl(245 85% 67%)'
chartColors.text.muted     // 'hsl(240 5% 55%)'

// Get series color by index (cycles through palette)
getSeriesColor(0) // First color
getSeriesColor(8) // Wraps to second color

// Use gradient definitions
chartGradients.success.id // 'gradient-success'

// Apply chart styles
<CartesianGrid {...chartStyles.grid} />
<Tooltip {...chartStyles.tooltip} />
```

## Examples

### Dashboard Stats Chart

```tsx
<RapidLineChart
  title="Daily Task Throughput"
  subtitle="Tasks completed per day"
  height={250}
  data={dailyStats}
  xAxisKey="date"
  xAxisFormatter={(d) => format(new Date(d), 'MMM d')}
  series={[
    { dataKey: 'completed', name: 'Completed', color: 'success' },
    { dataKey: 'created', name: 'Created', color: 'accent' },
  ]}
  actions={
    <select className="input text-sm">
      <option>Last 7 days</option>
      <option>Last 30 days</option>
    </select>
  }
/>
```

### Agent Performance Comparison

```tsx
<ChartCard title="Agent Comparison" height={350}>
  <RapidBarChart
    data={agentStats}
    xAxisKey="name"
    series={[
      { dataKey: 'tasksCompleted', name: 'Completed', color: 'success', stackId: 'tasks' },
      { dataKey: 'tasksFailed', name: 'Failed', color: 'error', stackId: 'tasks' },
    ]}
    showLegend
  />
</ChartCard>
```

### Status Distribution

```tsx
<RapidDonutChart
  title="Task Status"
  data={[
    { name: 'Pending', value: stats.pending, color: 'warning' },
    { name: 'In Progress', value: stats.inProgress, color: 'info' },
    { name: 'Completed', value: stats.completed, color: 'success' },
  ]}
  centerContent={
    <div className="text-center">
      <div className="text-3xl font-bold">{stats.total}</div>
      <div className="text-xs text-rapid-muted">Total Tasks</div>
    </div>
  }
/>
```
