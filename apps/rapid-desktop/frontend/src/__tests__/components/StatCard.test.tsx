import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from '../../components/StatCard';

describe('StatCard', () => {
  describe('basic rendering', () => {
    it('should render label and value', () => {
      render(<StatCard value={1234} label="Total Users" />);

      expect(screen.getByText('Total Users')).toBeInTheDocument();
      expect(screen.getByText('1.2K')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      const { container } = render(
        <StatCard value={100} label="Test" className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should render icon when provided', () => {
      render(
        <StatCard
          value={100}
          label="With Icon"
          icon={<span data-testid="test-icon">📊</span>}
        />
      );

      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });
  });

  describe('number formatting', () => {
    it('should format numbers less than 1000 without suffix', () => {
      render(<StatCard value={999} label="Test" format="number" />);
      expect(screen.getByText('999')).toBeInTheDocument();
    });

    it('should format thousands with K suffix', () => {
      render(<StatCard value={5500} label="Test" format="number" />);
      expect(screen.getByText('5.5K')).toBeInTheDocument();
    });

    it('should format millions with M suffix', () => {
      render(<StatCard value={2500000} label="Test" format="number" />);
      expect(screen.getByText('2.5M')).toBeInTheDocument();
    });

    it('should format billions with B suffix', () => {
      render(<StatCard value={1500000000} label="Test" format="number" />);
      expect(screen.getByText('1.5B')).toBeInTheDocument();
    });
  });

  describe('currency formatting', () => {
    it('should format currency values with dollar sign', () => {
      render(<StatCard value={1500} label="Revenue" format="currency" />);
      expect(screen.getByText('$1,500')).toBeInTheDocument();
    });

    it('should format large currency values', () => {
      render(<StatCard value={12500} label="Revenue" format="currency" />);
      expect(screen.getByText('$12,500')).toBeInTheDocument();
    });
  });

  describe('percentage formatting', () => {
    it('should format percentage values with % suffix', () => {
      render(<StatCard value={75.5} label="Completion" format="percentage" />);
      expect(screen.getByText('75.5%')).toBeInTheDocument();
    });

    it('should format percentage with one decimal place', () => {
      render(<StatCard value={33.333} label="Rate" format="percentage" />);
      expect(screen.getByText('33.3%')).toBeInTheDocument();
    });
  });

  describe('trend indicator', () => {
    it('should show positive trend with up arrow', () => {
      render(
        <StatCard value={100} label="Test" trend={12.5} trendDirection="up" />
      );

      expect(screen.getByText('+12.5%')).toBeInTheDocument();
    });

    it('should show negative trend with down arrow', () => {
      render(
        <StatCard value={100} label="Test" trend={-8.3} trendDirection="down" />
      );

      expect(screen.getByText('-8.3%')).toBeInTheDocument();
    });

    it('should show neutral trend', () => {
      render(
        <StatCard value={100} label="Test" trend={0} trendDirection="neutral" />
      );

      expect(screen.getByText('0.0%')).toBeInTheDocument();
    });

    it('should infer positive direction from positive trend value', () => {
      render(<StatCard value={100} label="Test" trend={5.5} />);

      expect(screen.getByText('+5.5%')).toBeInTheDocument();
    });

    it('should infer negative direction from negative trend value', () => {
      render(<StatCard value={100} label="Test" trend={-3.2} />);

      expect(screen.getByText('-3.2%')).toBeInTheDocument();
    });

    it('should not show trend when not provided', () => {
      render(<StatCard value={100} label="Test" />);

      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    });
  });

  describe('sparkline', () => {
    it('should render sparkline when data is provided', () => {
      const { container } = render(
        <StatCard
          value={100}
          label="Test"
          sparklineData={[10, 20, 15, 25, 30]}
        />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should not render sparkline with insufficient data', () => {
      const { container } = render(
        <StatCard value={100} label="Test" sparklineData={[10]} />
      );

      const svg = container.querySelector('svg polyline');
      expect(svg).not.toBeInTheDocument();
    });

    it('should not render sparkline when data is undefined', () => {
      const { container } = render(<StatCard value={100} label="Test" />);

      const polyline = container.querySelector('svg polyline');
      expect(polyline).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should render skeleton when loading', () => {
      const { container } = render(
        <StatCard value={100} label="Test" loading={true} />
      );

      // Skeleton uses animate-pulse class
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not render value when loading', () => {
      render(<StatCard value={100} label="Test" loading={true} />);

      expect(screen.queryByText('100')).not.toBeInTheDocument();
      expect(screen.queryByText('Test')).not.toBeInTheDocument();
    });

    it('should render content when not loading', () => {
      render(<StatCard value={100} label="Test" loading={false} />);

      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have accessible label text', () => {
      render(<StatCard value={500} label="Active Users" />);

      expect(screen.getByText('Active Users')).toBeInTheDocument();
    });

    it('should hide decorative sparkline from screen readers', () => {
      const { container } = render(
        <StatCard value={100} label="Test" sparklineData={[1, 2, 3, 4, 5]} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('edge cases', () => {
    it('should handle zero value', () => {
      render(<StatCard value={0} label="Empty" />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should handle negative values', () => {
      render(<StatCard value={-500} label="Loss" format="currency" />);
      expect(screen.getByText('-$500')).toBeInTheDocument();
    });

    it('should handle decimal values', () => {
      render(<StatCard value={99.99} label="Score" />);
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should handle empty sparkline array', () => {
      const { container } = render(
        <StatCard value={100} label="Test" sparklineData={[]} />
      );

      const polyline = container.querySelector('svg polyline');
      expect(polyline).not.toBeInTheDocument();
    });
  });
});
