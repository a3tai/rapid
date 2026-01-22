/**
 * RAPID Chart Theme Configuration
 *
 * Defines colors, styles, and configuration for Recharts components
 * to match the RAPID design system.
 */

// HSL color values from the RAPID design system
export const chartColors = {
  // Primary palette - for data series
  primary: {
    accent: 'hsl(245 85% 67%)', // Primary violet-blue
    success: 'hsl(142 71% 45%)', // Green
    warning: 'hsl(45 93% 47%)', // Yellow/amber
    error: 'hsl(0 72% 51%)', // Red
    info: 'hsl(217 91% 60%)', // Blue
  },

  // Extended palette - for multi-series charts
  series: [
    'hsl(245 85% 67%)', // Accent (violet-blue)
    'hsl(217 91% 60%)', // Info (blue)
    'hsl(142 71% 45%)', // Success (green)
    'hsl(45 93% 47%)', // Warning (yellow)
    'hsl(0 72% 51%)', // Error (red)
    'hsl(280 70% 60%)', // Purple
    'hsl(180 65% 50%)', // Cyan
    'hsl(30 90% 55%)', // Orange
  ],

  // Background and text colors
  background: {
    primary: 'hsl(240 10% 4%)',
    surface: 'hsl(240 10% 6%)',
    elevated: 'hsl(240 6% 10%)',
  },

  // Border and grid colors
  grid: {
    line: 'hsl(240 4% 16%)',
    lineSubtle: 'hsl(240 4% 12%)',
  },

  // Text colors
  text: {
    primary: 'hsl(0 0% 98%)',
    muted: 'hsl(240 5% 55%)',
    dimmed: 'hsl(240 5% 40%)',
  },

  // Status colors with transparency for fills
  status: {
    success: {
      fill: 'hsla(142, 71%, 45%, 0.2)',
      stroke: 'hsl(142 71% 45%)',
    },
    warning: {
      fill: 'hsla(45, 93%, 47%, 0.2)',
      stroke: 'hsl(45 93% 47%)',
    },
    error: {
      fill: 'hsla(0, 72%, 51%, 0.2)',
      stroke: 'hsl(0 72% 51%)',
    },
    info: {
      fill: 'hsla(217, 91%, 60%, 0.2)',
      stroke: 'hsl(217 91% 60%)',
    },
    accent: {
      fill: 'hsla(245, 85%, 67%, 0.2)',
      stroke: 'hsl(245 85% 67%)',
    },
  },
} as const;

// Default chart style props
export const chartStyles = {
  // Grid styling
  grid: {
    strokeDasharray: '3 3',
    stroke: chartColors.grid.line,
    opacity: 0.5,
  },

  // Axis styling
  axis: {
    stroke: chartColors.grid.line,
    tickLine: false,
    axisLine: false,
    tick: {
      fill: chartColors.text.muted,
      fontSize: 11,
      fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
    },
  },

  // Tooltip styling
  tooltip: {
    contentStyle: {
      backgroundColor: chartColors.background.elevated,
      border: `1px solid ${chartColors.grid.line}`,
      borderRadius: '8px',
      padding: '12px',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    },
    itemStyle: {
      color: chartColors.text.primary,
      fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
      fontSize: '12px',
    },
    labelStyle: {
      color: chartColors.text.muted,
      fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
      fontSize: '11px',
      marginBottom: '4px',
    },
    cursor: {
      fill: chartColors.grid.line,
      opacity: 0.1,
    },
  },

  // Legend styling
  legend: {
    wrapperStyle: {
      paddingTop: '16px',
    },
    iconSize: 8,
    iconType: 'circle' as const,
  },

  // Area/Line chart specific styles
  area: {
    fillOpacity: 0.2,
    strokeWidth: 2,
  },

  // Bar chart specific styles
  bar: {
    radius: [4, 4, 0, 0] as [number, number, number, number],
    maxBarSize: 40,
  },

  // Animation settings
  animation: {
    duration: 500,
    easing: 'ease-out',
  },
} as const;

// Helper to get a series color by index
export function getSeriesColor(index: number): string {
  return chartColors.series[index % chartColors.series.length];
}

// Helper to get series colors with opacity
export function getSeriesColorWithOpacity(index: number, opacity: number): string {
  const color = chartColors.series[index % chartColors.series.length];
  // Convert HSL to HSLA
  return color.replace('hsl(', 'hsla(').replace(')', `, ${opacity})`);
}

// Preset gradient definitions for area charts
export const chartGradients = {
  accent: {
    id: 'gradient-accent',
    colors: [
      { offset: '0%', color: 'hsl(245 85% 67%)', opacity: 0.4 },
      { offset: '100%', color: 'hsl(245 85% 67%)', opacity: 0 },
    ],
  },
  success: {
    id: 'gradient-success',
    colors: [
      { offset: '0%', color: 'hsl(142 71% 45%)', opacity: 0.4 },
      { offset: '100%', color: 'hsl(142 71% 45%)', opacity: 0 },
    ],
  },
  warning: {
    id: 'gradient-warning',
    colors: [
      { offset: '0%', color: 'hsl(45 93% 47%)', opacity: 0.4 },
      { offset: '100%', color: 'hsl(45 93% 47%)', opacity: 0 },
    ],
  },
  error: {
    id: 'gradient-error',
    colors: [
      { offset: '0%', color: 'hsl(0 72% 51%)', opacity: 0.4 },
      { offset: '100%', color: 'hsl(0 72% 51%)', opacity: 0 },
    ],
  },
  info: {
    id: 'gradient-info',
    colors: [
      { offset: '0%', color: 'hsl(217 91% 60%)', opacity: 0.4 },
      { offset: '100%', color: 'hsl(217 91% 60%)', opacity: 0 },
    ],
  },
} as const;

export type ChartColorKey = keyof typeof chartColors.primary;
export type ChartGradientKey = keyof typeof chartGradients;
