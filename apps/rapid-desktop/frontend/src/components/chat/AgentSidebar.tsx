/**
 * AgentSidebar - Left panel showing all agents
 *
 * Groups agents by status (online/away) with Slack-inspired layout.
 * Following RAPID design guidelines.
 */

import { useMemo } from 'react';
import { clsx } from 'clsx';
import { AgentItem, type AgentStatus } from './AgentItem';
import type { Agent } from '../../stores/app';

export interface AgentSidebarProps {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
}

/** Determine agent status - for now, all registered agents are "online" */
function getAgentStatus(_agent: Agent): AgentStatus {
  // In the future, this could check heartbeat status
  return 'online';
}

/** Check if agent is the orchestrator/leader */
function isLeader(agent: Agent): boolean {
  return agent.name.toLowerCase().includes('orchestrator');
}

export function AgentSidebar({ agents, selectedAgentId, onSelectAgent }: AgentSidebarProps) {
  // Group agents by status
  const { onlineAgents, awayAgents } = useMemo(() => {
    const online: Agent[] = [];
    const away: Agent[] = [];

    for (const agent of agents) {
      const status = getAgentStatus(agent);
      if (status === 'online') {
        online.push(agent);
      } else {
        away.push(agent);
      }
    }

    // Sort by name, but put leader first
    const sortFn = (a: Agent, b: Agent) => {
      if (isLeader(a) && !isLeader(b)) return -1;
      if (!isLeader(a) && isLeader(b)) return 1;
      return a.name.localeCompare(b.name);
    };

    return {
      onlineAgents: online.sort(sortFn),
      awayAgents: away.sort(sortFn),
    };
  }, [agents]);

  return (
    <div
      className={clsx(
        'w-[260px] flex-shrink-0 flex flex-col',
        'bg-rapid-surface border-r border-rapid-border/50',
        'overflow-hidden'
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-rapid-border/30">
        <h2 className="text-sm font-mono font-medium text-rapid-text">Agents</h2>
        <p className="text-[10px] text-rapid-muted mt-0.5">
          {agents.length} registered
        </p>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto py-2">
        {agents.length === 0 ? (
          <div className="px-4 py-8 text-center text-rapid-muted text-xs">
            No agents running
          </div>
        ) : (
          <>
            {/* Online section */}
            {onlineAgents.length > 0 && (
              <div className="mb-2">
                <div className="section-header px-4 py-2 text-[10px]">
                  ONLINE — {onlineAgents.length}
                </div>
                <div className="px-2">
                  {onlineAgents.map((agent) => (
                    <AgentItem
                      key={agent.id}
                      agent={agent}
                      status="online"
                      isLeader={isLeader(agent)}
                      selected={selectedAgentId === agent.id}
                      onClick={() =>
                        onSelectAgent(selectedAgentId === agent.id ? null : agent.id)
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Away section */}
            {awayAgents.length > 0 && (
              <div className="mb-2">
                <div className="section-header px-4 py-2 text-[10px]">
                  AWAY — {awayAgents.length}
                </div>
                <div className="px-2">
                  {awayAgents.map((agent) => (
                    <AgentItem
                      key={agent.id}
                      agent={agent}
                      status="away"
                      isLeader={isLeader(agent)}
                      selected={selectedAgentId === agent.id}
                      onClick={() =>
                        onSelectAgent(selectedAgentId === agent.id ? null : agent.id)
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer - quick stats or actions */}
      <div className="px-4 py-3 border-t border-rapid-border/30 text-[10px] text-rapid-muted">
        Click agent to view brain
      </div>
    </div>
  );
}

export default AgentSidebar;
