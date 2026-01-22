import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TokenUsageStats } from '../../components/TokenUsageStats';
import type { TokenMetrics } from '../../hooks/useTokenMetrics';

// Mock data
const mockMetrics: TokenMetrics = {
  inputTokens: 50000,
  outputTokens: 25000,
  totalTokens: 75000,
  cacheReadTokens: 5000,
  cacheWriteTokens: 2000,
  avgTokensPerTask: 7500,
  efficiencyRatio: 0.5,
  taskCount: 10,
};

const emptyMetrics: TokenMetrics = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  avgTokensPerTask: 0,
  efficiencyRatio: 0,
  taskCount: 0,
};

// Mock the useTokenMetrics hook
let mockLoading = false;
let mockError: string | null = null;
let mockMetricsData = mockMetrics;
const mockRefresh = vi.fn();

vi.mock('../../hooks/useTokenMetrics', () => ({
  useTokenMetrics: () => ({
    metrics: mockMetricsData,
    loading: mockLoading,
    error: mockError,
    refresh: mockRefresh,
  }),
}));

describe('TokenUsageStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoading = false;
    mockError = null;
    mockMetricsData = mockMetrics;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic rendering', () => {
    it('should render the component with title', () => {
      render(<TokenUsageStats />);
      expect(screen.getByText('Token Usage (24h)')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      const { container } = render(<TokenUsageStats className="custom-class" />);
      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should show task count in header', () => {
      render(<TokenUsageStats />);
      expect(screen.getByText('(10 tasks)')).toBeInTheDocument();
    });

    it('should show singular task when count is 1', () => {
      mockMetricsData = { ...mockMetrics, taskCount: 1 };
      render(<TokenUsageStats />);
      expect(screen.getByText('(1 task)')).toBeInTheDocument();
    });

    it('should not show task count when 0', () => {
      mockMetricsData = { ...mockMetrics, taskCount: 0 };
      render(<TokenUsageStats />);
      expect(screen.queryByText(/task/)).not.toBeInTheDocument();
    });
  });

  describe('metric cards', () => {
    it('should render input tokens card', () => {
      render(<TokenUsageStats />);
      expect(screen.getByText('Input Tokens')).toBeInTheDocument();
      // Value should be formatted (50.0K)
      expect(screen.getByText('50.0K')).toBeInTheDocument();
    });

    it('should render output tokens card', () => {
      render(<TokenUsageStats />);
      expect(screen.getByText('Output Tokens')).toBeInTheDocument();
      // Value should be formatted (25.0K)
      expect(screen.getByText('25.0K')).toBeInTheDocument();
    });

    it('should render total tokens card', () => {
      render(<TokenUsageStats />);
      expect(screen.getByText('Total Tokens')).toBeInTheDocument();
      // Value should be formatted (75.0K)
      expect(screen.getByText('75.0K')).toBeInTheDocument();
    });

    it('should render average tokens per task card', () => {
      render(<TokenUsageStats />);
      expect(screen.getByText('Avg per Task')).toBeInTheDocument();
      // Value should be formatted (7.5K)
      expect(screen.getByText('7.5K')).toBeInTheDocument();
    });

    it('should render efficiency ratio card', () => {
      render(<TokenUsageStats />);
      expect(screen.getByText('Efficiency')).toBeInTheDocument();
      // 0.5 ratio * 100 = 50%
      expect(screen.getByText('50.0%')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading skeleton when loading', () => {
      mockLoading = true;
      const { container } = render(<TokenUsageStats />);

      // Should have skeleton elements with animate-pulse class
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not show metrics when loading', () => {
      mockLoading = true;
      render(<TokenUsageStats />);

      expect(screen.queryByText('Input Tokens')).not.toBeInTheDocument();
      expect(screen.queryByText('Output Tokens')).not.toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when error and no data', () => {
      mockError = 'Failed to connect to MCP server';
      mockMetricsData = emptyMetrics;
      render(<TokenUsageStats />);

      expect(screen.getByText('Failed to load token metrics')).toBeInTheDocument();
      expect(screen.getByText('Failed to connect to MCP server')).toBeInTheDocument();
    });

    it('should show retry button on error', () => {
      mockError = 'Connection failed';
      mockMetricsData = emptyMetrics;
      render(<TokenUsageStats />);

      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('should call refresh on retry click', () => {
      mockError = 'Connection failed';
      mockMetricsData = emptyMetrics;
      render(<TokenUsageStats />);

      fireEvent.click(screen.getByText('Retry'));
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('should show data even with error if data exists', () => {
      mockError = 'Refresh failed';
      mockMetricsData = mockMetrics;
      render(<TokenUsageStats />);

      // Should show data, not error
      expect(screen.getByText('Input Tokens')).toBeInTheDocument();
      expect(screen.queryByText('Failed to load token metrics')).not.toBeInTheDocument();
    });
  });

  describe('refresh button', () => {
    it('should show refresh button by default', () => {
      render(<TokenUsageStats />);
      expect(screen.getByRole('button', { name: 'Refresh token metrics' })).toBeInTheDocument();
    });

    it('should hide refresh button when showRefresh is false', () => {
      render(<TokenUsageStats showRefresh={false} />);
      expect(screen.queryByRole('button', { name: 'Refresh token metrics' })).not.toBeInTheDocument();
    });

    it('should call refresh when button clicked', () => {
      render(<TokenUsageStats />);

      fireEvent.click(screen.getByRole('button', { name: 'Refresh token metrics' }));
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache information', () => {
    it('should show cache read info when available', () => {
      const { container } = render(<TokenUsageStats />);
      // Check for cache read section - text may be split across elements
      const cacheInfo = container.querySelector('.flex.items-center.gap-4');
      expect(cacheInfo).toBeInTheDocument();
      expect(cacheInfo?.textContent).toContain('Cache Read:');
      expect(cacheInfo?.textContent).toContain('5.0K');
    });

    it('should show cache write info when available', () => {
      const { container } = render(<TokenUsageStats />);
      const cacheInfo = container.querySelector('.flex.items-center.gap-4');
      expect(cacheInfo?.textContent).toContain('Cache Write:');
      expect(cacheInfo?.textContent).toContain('2.0K');
    });

    it('should not show cache info when values are 0', () => {
      mockMetricsData = { ...mockMetrics, cacheReadTokens: 0, cacheWriteTokens: 0 };
      render(<TokenUsageStats />);

      expect(screen.queryByText(/Cache Read:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Cache Write:/)).not.toBeInTheDocument();
    });
  });

  describe('layout variants', () => {
    it('should use grid layout by default', () => {
      const { container } = render(<TokenUsageStats />);
      const grid = container.querySelector('.lg\\:grid-cols-5');
      expect(grid).toBeInTheDocument();
    });

    it('should use compact layout when specified', () => {
      const { container } = render(<TokenUsageStats layout="compact" />);
      const grid = container.querySelector('.grid-cols-2');
      expect(grid).toBeInTheDocument();
    });
  });

  describe('efficiency ratio display', () => {
    it('should show up trend for efficiency > 1', () => {
      mockMetricsData = { ...mockMetrics, efficiencyRatio: 1.5 };
      render(<TokenUsageStats />);

      // Efficiency > 1 means more output than input, shown as up trend
      expect(screen.getByText('150.0%')).toBeInTheDocument();
    });

    it('should show down trend for efficiency < 1', () => {
      mockMetricsData = { ...mockMetrics, efficiencyRatio: 0.5 };
      render(<TokenUsageStats />);

      // Efficiency < 1 means less output than input
      expect(screen.getByText('50.0%')).toBeInTheDocument();
    });

    it('should show neutral for efficiency = 1', () => {
      mockMetricsData = { ...mockMetrics, efficiencyRatio: 1 };
      render(<TokenUsageStats />);

      expect(screen.getByText('100.0%')).toBeInTheDocument();
    });
  });

  describe('large numbers formatting', () => {
    it('should format millions with M suffix', () => {
      mockMetricsData = { ...mockMetrics, inputTokens: 1500000, totalTokens: 2500000 };
      render(<TokenUsageStats />);

      expect(screen.getByText('1.5M')).toBeInTheDocument();
      expect(screen.getByText('2.5M')).toBeInTheDocument();
    });

    it('should format numbers less than 1000 without suffix', () => {
      mockMetricsData = { ...mockMetrics, inputTokens: 500 };
      render(<TokenUsageStats />);

      expect(screen.getByText('500')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have accessible refresh button', () => {
      render(<TokenUsageStats />);
      const button = screen.getByRole('button', { name: 'Refresh token metrics' });
      expect(button).toHaveAttribute('title', 'Refresh metrics');
    });

    it('should hide decorative icons from screen readers', () => {
      const { container } = render(<TokenUsageStats />);
      const icons = container.querySelectorAll('svg[aria-hidden="true"]');
      expect(icons.length).toBeGreaterThan(0);
    });
  });
});
