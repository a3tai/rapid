import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useCostSummary,
  useCostRecords,
  useAgentBudget,
  useSessionBudget,
  formatCost,
  formatTokens,
  costPerToken,
} from '../useCostData';
import { useMcp } from '../useMcp';

// Mock useMcp hook
vi.mock('../useMcp', () => ({
  useMcp: vi.fn(),
}));

describe('useCostData hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useCostSummary', () => {
    it('fetches cost summary data on mount', async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        structuredContent: {
          totalCost: 10.5,
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadTokens: 100,
          cacheWriteTokens: 50,
          byModel: [
            {
              model: 'opus',
              cost: 8.0,
              inputTokens: 800,
              outputTokens: 400,
              percentOfTotal: 76.19,
            },
            {
              model: 'sonnet',
              cost: 2.5,
              inputTokens: 200,
              outputTokens: 100,
              percentOfTotal: 23.81,
            },
          ],
          byAgent: [
            {
              agentId: 'agent-1',
              agentName: 'worker-1',
              cost: 6.0,
              tasksCompleted: 10,
              costPerTask: 0.6,
            },
          ],
        },
      });

      (useMcp as any).mockReturnValue({ callTool: mockCallTool });

      const { result } = renderHook(() => useCostSummary(24, true, 60000));

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.totalCost).toBe(10.5);
      expect(result.current.data?.byModel).toHaveLength(2);
      expect(result.current.data?.byAgent).toHaveLength(1);
      expect(result.current.error).toBeNull();
    });

    it('handles errors gracefully', async () => {
      const mockCallTool = vi
        .fn()
        .mockRejectedValue(new Error('API Error'));

      (useMcp as any).mockReturnValue({ callTool: mockCallTool });

      const { result } = renderHook(() => useCostSummary(24, true, 60000));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.data).toBeNull();
    });

    it('respects enabled flag', async () => {
      const mockCallTool = vi.fn();
      (useMcp as any).mockReturnValue({ callTool: mockCallTool });

      const { result } = renderHook(() => useCostSummary(24, false));

      expect(result.current.loading).toBe(false);
      expect(mockCallTool).not.toHaveBeenCalled();
    });

    it('provides refetch function', async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        structuredContent: {
          totalCost: 5.0,
          inputTokens: 500,
          outputTokens: 250,
          byModel: [],
          byAgent: [],
        },
      });

      (useMcp as any).mockReturnValue({ callTool: mockCallTool });

      const { result } = renderHook(() => useCostSummary(24, true, 60000));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockCallTool.mockClear();
      await result.current.refetch();

      expect(mockCallTool).toHaveBeenCalled();
    });
  });

  describe('useCostRecords', () => {
    it('fetches cost records with filters', async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        structuredContent: {
          records: [
            {
              id: 'record-1',
              timestamp: '2026-01-22T10:00:00Z',
              agentId: 'agent-1',
              model: 'opus',
              inputTokens: 100,
              outputTokens: 50,
              cost: 0.15,
              taskId: 'task-1',
            },
            {
              id: 'record-2',
              timestamp: '2026-01-22T11:00:00Z',
              agentId: 'agent-2',
              model: 'sonnet',
              inputTokens: 50,
              outputTokens: 25,
              cost: 0.05,
              taskId: 'task-2',
            },
          ],
        },
      });

      (useMcp as any).mockReturnValue({ callTool: mockCallTool });

      const { result } = renderHook(() =>
        useCostRecords(
          {
            agentId: 'agent-1',
            model: 'opus',
          },
          true,
          120000
        )
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data[0].cost).toBe(0.15);
      expect(result.current.error).toBeNull();
    });

    it('handles empty records', async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        structuredContent: {
          records: [],
        },
      });

      (useMcp as any).mockReturnValue({ callTool: mockCallTool });

      const { result } = renderHook(() => useCostRecords({}, true, 120000));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(0);
    });
  });

  describe('useAgentBudget', () => {
    it('fetches agent budget data', async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        structuredContent: {
          agentId: 'agent-1',
          agentName: 'worker-1',
          spent: 5.0,
          limit: 10.0,
          percentUsed: 50,
          remainingBudget: 5.0,
        },
      });

      (useMcp as any).mockReturnValue({ callTool: mockCallTool });

      const { result } = renderHook(() => useAgentBudget('agent-1', true, 30000));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.spent).toBe(5.0);
      expect(result.current.data?.limit).toBe(10.0);
      expect(result.current.data?.status).toBe('ok');
    });

    it('sets warning status at 90% usage', async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        structuredContent: {
          agentId: 'agent-1',
          spent: 9.0,
          limit: 10.0,
          percentUsed: 90,
        },
      });

      (useMcp as any).mockReturnValue({ callTool: mockCallTool });

      const { result } = renderHook(() => useAgentBudget('agent-1', true, 30000));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.status).toBe('warning');
    });

    it('sets exceeded status at 100% usage', async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        structuredContent: {
          agentId: 'agent-1',
          spent: 10.0,
          limit: 10.0,
          percentUsed: 100,
        },
      });

      (useMcp as any).mockReturnValue({ callTool: mockCallTool });

      const { result } = renderHook(() => useAgentBudget('agent-1', true, 30000));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.status).toBe('exceeded');
    });

    it('clears data when disabled or agentId removed', async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        structuredContent: {
          agentId: 'agent-1',
          spent: 5.0,
          limit: 10.0,
          percentUsed: 50,
        },
      });

      (useMcp as any).mockReturnValue({ callTool: mockCallTool });

      const { result, rerender } = renderHook(
        ({ agentId, enabled }) => useAgentBudget(agentId, enabled, 30000),
        {
          initialProps: { agentId: 'agent-1', enabled: true },
        }
      );

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      // Disable the hook
      rerender({ agentId: 'agent-1', enabled: false });

      expect(result.current.data).toBeNull();
    });
  });

  describe('useSessionBudget', () => {
    it('fetches session budget data', async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        structuredContent: {
          sessionId: 'session-1',
          spent: 20.0,
          limit: 100.0,
          percentUsed: 20,
          remainingBudget: 80.0,
          agentCount: 5,
        },
      });

      (useMcp as any).mockReturnValue({ callTool: mockCallTool });

      const { result } = renderHook(() =>
        useSessionBudget('session-1', true, 60000)
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.spent).toBe(20.0);
      expect(result.current.data?.agentCount).toBe(5);
      expect(result.current.data?.avgCostPerAgent).toBe(4.0);
    });

    it('works without sessionId (current session)', async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        structuredContent: {
          spent: 15.0,
          limit: 50.0,
          percentUsed: 30,
          agentCount: 3,
        },
      });

      (useMcp as any).mockReturnValue({ callTool: mockCallTool });

      const { result } = renderHook(() => useSessionBudget(undefined, true, 60000));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.spent).toBe(15.0);
      expect(mockCallTool).toHaveBeenCalledWith(
        'check_session_budget',
        expect.not.objectContaining({ sessionId: expect.any(String) })
      );
    });
  });

  describe('Helper functions', () => {
    describe('formatCost', () => {
      it('formats very small costs with 4 decimals', () => {
        expect(formatCost(0.00001)).toBe('$0.0000');
        expect(formatCost(0.00456)).toBe('$0.0046');
      });

      it('formats small costs with 3 decimals', () => {
        expect(formatCost(0.1)).toBe('$0.100');
        expect(formatCost(0.999)).toBe('$0.999');
      });

      it('formats regular costs with 2 decimals', () => {
        expect(formatCost(1.0)).toBe('$1.00');
        expect(formatCost(10.5)).toBe('$10.50');
        expect(formatCost(1000.99)).toBe('$1000.99');
      });
    });

    describe('formatTokens', () => {
      it('formats small token counts as-is', () => {
        expect(formatTokens(0)).toBe('0');
        expect(formatTokens(500)).toBe('500');
        expect(formatTokens(999)).toBe('999');
      });

      it('formats thousands with K suffix', () => {
        expect(formatTokens(1000)).toBe('1.0K');
        expect(formatTokens(1500)).toBe('1.5K');
        expect(formatTokens(999999)).toBe('1000.0K');
      });

      it('formats millions with M suffix', () => {
        expect(formatTokens(1000000)).toBe('1.0M');
        expect(formatTokens(1500000)).toBe('1.5M');
        expect(formatTokens(10000000)).toBe('10.0M');
      });
    });

    describe('costPerToken', () => {
      it('calculates cost per token', () => {
        expect(costPerToken(0.01, 1000)).toBe('0.000010');
        expect(costPerToken(1.0, 10000)).toBe('0.000100');
      });

      it('handles zero tokens', () => {
        expect(costPerToken(0.1, 0)).toBe('0');
      });

      it('formats to 6 decimal places', () => {
        expect(costPerToken(0.00456, 1000)).toBe('0.000005');
      });
    });
  });
});
