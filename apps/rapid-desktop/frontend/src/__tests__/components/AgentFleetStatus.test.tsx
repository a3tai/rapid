import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AgentFleetStatus,
  type AgentStatus,
} from '../../components/AgentFleetStatus';

// Mock the stores and hooks
const mockAgents: Array<{ id: string; name: string; worktree?: string; session?: string }> = [];
const mockTasks: Array<{
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}> = [];

vi.mock('../../stores/app', () => ({
  useAgents: () => mockAgents,
  useTasks: () => mockTasks,
  useAppStore: () => vi.fn(),
}));

const mockStopAgent = vi.fn();
const mockSpawnAgent = vi.fn();
const mockFetchAgents = vi.fn();

vi.mock('../../hooks/useMcp', () => ({
  useMcp: () => ({
    stopAgent: mockStopAgent,
    spawnAgent: mockSpawnAgent,
    fetchAgents: mockFetchAgents,
  }),
}));

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock('../../components/Toast', () => ({
  useToast: () => mockToast,
}));

describe('AgentFleetStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgents.length = 0;
    mockTasks.length = 0;
  });

  describe('basic rendering', () => {
    it('should render with default title', () => {
      render(<AgentFleetStatus />);
      expect(screen.getByText('Agent Fleet')).toBeInTheDocument();
    });

    it('should render with custom title', () => {
      render(<AgentFleetStatus title="Active Agents" />);
      expect(screen.getByText('Active Agents')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      const { container } = render(<AgentFleetStatus className="custom-class" />);
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('empty state', () => {
    it('should show empty state when no agents', () => {
      render(<AgentFleetStatus />);
      expect(screen.getByText('No agents running')).toBeInTheDocument();
    });

    it('should show spawn first agent link in empty state when spawn button enabled and onSpawnClick provided', () => {
      const onSpawnClick = vi.fn();
      render(<AgentFleetStatus showSpawnButton={true} onSpawnClick={onSpawnClick} />);
      expect(screen.getByText('+ Spawn first agent')).toBeInTheDocument();
    });

    it('should not show spawn first agent link in empty state when spawn button disabled', () => {
      render(<AgentFleetStatus showSpawnButton={false} />);
      expect(screen.queryByText('+ Spawn first agent')).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show skeleton when loading', () => {
      const { container } = render(<AgentFleetStatus loading={true} />);
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not show empty state when loading', () => {
      render(<AgentFleetStatus loading={true} />);
      expect(screen.queryByText('No agents running')).not.toBeInTheDocument();
    });
  });

  describe('spawn button', () => {
    it('should show spawn button by default', () => {
      render(<AgentFleetStatus />);
      expect(screen.getByText('Spawn New')).toBeInTheDocument();
    });

    it('should hide spawn button when showSpawnButton is false', () => {
      render(<AgentFleetStatus showSpawnButton={false} />);
      expect(screen.queryByText('Spawn New')).not.toBeInTheDocument();
    });

    it('should call onSpawnClick when spawn button is clicked', () => {
      const onSpawnClick = vi.fn();
      render(<AgentFleetStatus onSpawnClick={onSpawnClick} />);

      fireEvent.click(screen.getByText('Spawn New'));
      expect(onSpawnClick).toHaveBeenCalled();
    });
  });

  describe('agent list rendering', () => {
    beforeEach(() => {
      mockAgents.push(
        { id: 'agent-1', name: 'orchestrator', worktree: 'main', session: 'session-1' },
        { id: 'agent-2', name: 'worker', worktree: 'feature-branch', session: 'session-2' }
      );
    });

    it('should render agent names', () => {
      render(<AgentFleetStatus />);
      expect(screen.getByText('orchestrator')).toBeInTheDocument();
      expect(screen.getByText('worker')).toBeInTheDocument();
    });

    it('should show running count badge', () => {
      render(<AgentFleetStatus />);
      expect(screen.getByText('2 running')).toBeInTheDocument();
    });

    it('should limit displayed agents based on maxAgents prop', () => {
      mockAgents.push(
        { id: 'agent-3', name: 'architect', session: 'session-3' },
        { id: 'agent-4', name: 'researcher', session: 'session-4' }
      );

      render(<AgentFleetStatus maxAgents={2} />);

      expect(screen.getByText('orchestrator')).toBeInTheDocument();
      expect(screen.getByText('worker')).toBeInTheDocument();
      expect(screen.queryByText('architect')).not.toBeInTheDocument();
    });

    it('should show "View all" link when more agents than maxAgents', () => {
      mockAgents.push(
        { id: 'agent-3', name: 'architect', session: 'session-3' }
      );

      render(<AgentFleetStatus maxAgents={2} />);

      expect(screen.getByText(/View all 3 agents/)).toBeInTheDocument();
    });
  });

  describe('agent type detection', () => {
    it('should detect orchestrator type', () => {
      mockAgents.push({ id: 'agent-1', name: 'orchestrator', session: 'session-1' });
      const { container } = render(<AgentFleetStatus />);

      // Orchestrator should have the orchestrator icon
      expect(container.textContent).toContain('orchestrator');
    });

    it('should detect worker type', () => {
      mockAgents.push({ id: 'agent-1', name: 'worker', session: 'session-1' });
      const { container } = render(<AgentFleetStatus />);

      expect(container.textContent).toContain('worker');
    });

    it('should detect architect type', () => {
      mockAgents.push({ id: 'agent-1', name: 'architect', session: 'session-1' });
      const { container } = render(<AgentFleetStatus />);

      expect(container.textContent).toContain('architect');
    });

    it('should detect researcher type', () => {
      mockAgents.push({ id: 'agent-1', name: 'researcher', session: 'session-1' });
      const { container } = render(<AgentFleetStatus />);

      expect(container.textContent).toContain('researcher');
    });
  });

  describe('model badge', () => {
    it('should show Opus badge for orchestrator', () => {
      mockAgents.push({ id: 'agent-1', name: 'orchestrator', session: 'session-1' });
      render(<AgentFleetStatus />);

      expect(screen.getByText('Opus')).toBeInTheDocument();
    });

    it('should show Sonnet badge for architect', () => {
      mockAgents.push({ id: 'agent-1', name: 'architect', session: 'session-1' });
      render(<AgentFleetStatus />);

      expect(screen.getByText('Sonnet')).toBeInTheDocument();
    });

    it('should show Haiku badge for worker', () => {
      mockAgents.push({ id: 'agent-1', name: 'worker', session: 'session-1' });
      render(<AgentFleetStatus />);

      expect(screen.getByText('Haiku')).toBeInTheDocument();
    });
  });

  describe('status indicators', () => {
    it('should show running status for agent with session', () => {
      mockAgents.push({ id: 'agent-1', name: 'worker', session: 'session-1' });
      render(<AgentFleetStatus />);

      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    it('should show stopped status for agent without session', () => {
      mockAgents.push({ id: 'agent-1', name: 'worker' });
      render(<AgentFleetStatus />);

      expect(screen.getByText('Stopped')).toBeInTheDocument();
    });
  });

  describe('current task display', () => {
    it('should show current task when agent has in_progress task', () => {
      mockAgents.push({ id: 'agent-1', name: 'worker', session: 'session-1' });
      mockTasks.push({
        id: 'task-1',
        title: 'Fix authentication bug',
        status: 'in_progress',
        priority: 'high',
        assignedTo: 'agent-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(<AgentFleetStatus />);

      expect(screen.getByText(/Fix authentication bug/)).toBeInTheDocument();
    });

    it('should not show task when agent has no in_progress task', () => {
      mockAgents.push({ id: 'agent-1', name: 'worker', session: 'session-1' });
      mockTasks.push({
        id: 'task-1',
        title: 'Completed task',
        status: 'completed',
        priority: 'normal',
        assignedTo: 'agent-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(<AgentFleetStatus />);

      expect(screen.queryByText(/Completed task/)).not.toBeInTheDocument();
    });
  });

  describe('quick actions', () => {
    beforeEach(() => {
      mockAgents.push({ id: 'agent-1', name: 'worker', session: 'session-1' });
    });

    it('should have stop button for running agent', () => {
      render(<AgentFleetStatus />);

      const stopButton = screen.getByLabelText('Stop worker');
      expect(stopButton).toBeInTheDocument();
    });

    it('should have view logs button', () => {
      render(<AgentFleetStatus />);

      const logsButton = screen.getByLabelText('View logs for worker');
      expect(logsButton).toBeInTheDocument();
    });

    it('should call onViewLogs when view logs button is clicked', () => {
      const onViewLogs = vi.fn();
      render(<AgentFleetStatus onViewLogs={onViewLogs} />);

      const logsButton = screen.getByLabelText('View logs for worker');
      fireEvent.click(logsButton);

      expect(onViewLogs).toHaveBeenCalledWith('agent-1', 'worker');
    });

    it('should show restart button for stopped agent', () => {
      mockAgents.length = 0;
      mockAgents.push({ id: 'agent-1', name: 'worker' }); // No session = stopped

      render(<AgentFleetStatus />);

      const restartButton = screen.getByLabelText('Restart worker');
      expect(restartButton).toBeInTheDocument();
    });
  });

  describe('stop agent action', () => {
    beforeEach(() => {
      mockAgents.push({ id: 'agent-1', name: 'worker', session: 'session-1' });
    });

    it('should call stopAgent when stop button is clicked', async () => {
      mockStopAgent.mockResolvedValue(undefined);
      mockFetchAgents.mockResolvedValue(undefined);

      render(<AgentFleetStatus />);

      const stopButton = screen.getByLabelText('Stop worker');
      fireEvent.click(stopButton);

      expect(mockStopAgent).toHaveBeenCalledWith('agent-1');
    });

    it('should show success toast after stopping agent', async () => {
      mockStopAgent.mockResolvedValue(undefined);
      mockFetchAgents.mockResolvedValue(undefined);

      render(<AgentFleetStatus />);

      const stopButton = screen.getByLabelText('Stop worker');
      fireEvent.click(stopButton);

      // Wait for async operation
      await vi.waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Agent Stopped', 'worker has been terminated');
      });
    });

    it('should show error toast when stop fails', async () => {
      mockStopAgent.mockRejectedValue(new Error('Failed to stop'));

      render(<AgentFleetStatus />);

      const stopButton = screen.getByLabelText('Stop worker');
      fireEvent.click(stopButton);

      await vi.waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to Stop Agent', 'Failed to stop');
      });
    });
  });

  describe('restart agent action', () => {
    beforeEach(() => {
      mockAgents.push({ id: 'agent-1', name: 'worker' }); // No session = stopped
    });

    it('should call spawnAgent when restart button is clicked', async () => {
      mockSpawnAgent.mockResolvedValue(undefined);
      mockFetchAgents.mockResolvedValue(undefined);

      render(<AgentFleetStatus />);

      const restartButton = screen.getByLabelText('Restart worker');
      fireEvent.click(restartButton);

      expect(mockSpawnAgent).toHaveBeenCalledWith('worker', 'Resume previous work');
    });

    it('should show success toast after restarting agent', async () => {
      mockSpawnAgent.mockResolvedValue(undefined);
      mockFetchAgents.mockResolvedValue(undefined);

      render(<AgentFleetStatus />);

      const restartButton = screen.getByLabelText('Restart worker');
      fireEvent.click(restartButton);

      await vi.waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Agent Restarted', 'worker has been restarted');
      });
    });

    it('should show error toast when restart fails', async () => {
      mockSpawnAgent.mockRejectedValue(new Error('Failed to spawn'));

      render(<AgentFleetStatus />);

      const restartButton = screen.getByLabelText('Restart worker');
      fireEvent.click(restartButton);

      await vi.waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to Restart Agent', 'Failed to spawn');
      });
    });
  });

  describe('idle count display', () => {
    it('should not show idle count when no idle agents', () => {
      mockAgents.push({ id: 'agent-1', name: 'worker', session: 'session-1' });
      render(<AgentFleetStatus />);

      expect(screen.queryByText(/idle/)).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    beforeEach(() => {
      mockAgents.push({ id: 'agent-1', name: 'worker', session: 'session-1' });
    });

    it('should have accessible button labels', () => {
      render(<AgentFleetStatus />);

      expect(screen.getByLabelText('Stop worker')).toBeInTheDocument();
      expect(screen.getByLabelText('View logs for worker')).toBeInTheDocument();
    });

    it('should have title attribute on current task', () => {
      mockTasks.push({
        id: 'task-1',
        title: 'Very long task title that might be truncated',
        status: 'in_progress',
        priority: 'normal',
        assignedTo: 'agent-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(<AgentFleetStatus />);

      const taskElement = screen.getByText(/Very long task title/);
      expect(taskElement).toHaveAttribute('title', 'Very long task title that might be truncated');
    });
  });

  describe('edge cases', () => {
    it('should handle agent with undefined worktree', () => {
      mockAgents.push({ id: 'agent-1', name: 'worker', session: 'session-1' });
      render(<AgentFleetStatus />);

      expect(screen.getByText('worker')).toBeInTheDocument();
    });

    it('should handle empty agent name gracefully', () => {
      mockAgents.push({ id: 'agent-1', name: '', session: 'session-1' });
      const { container } = render(<AgentFleetStatus />);

      // Should still render without crashing
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle multiple agents with same name', () => {
      mockAgents.push(
        { id: 'agent-1', name: 'worker', session: 'session-1' },
        { id: 'agent-2', name: 'worker', session: 'session-2' }
      );

      render(<AgentFleetStatus />);

      const workers = screen.getAllByText('worker');
      expect(workers.length).toBe(2);
    });
  });
});
