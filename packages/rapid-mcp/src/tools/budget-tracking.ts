/**
 * Budget Tracking Tool
 *
 * Tracks and enforces LLM API spending budgets for agents and sessions.
 * Integrates with gateway cost tracking and security configuration.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GatewayManager } from '@a3t/rapid-core';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

// @ts-ignore - logger available for future debug logging
const logger = createLogger('budget-tracking');

export interface BudgetAlert {
  timestamp: string;
  type: 'warning' | 'exceeded' | 'limit_approaching';
  agentId?: string;
  sessionId?: string;
  current: number;
  limit: number;
  percentageUsed: number;
  message: string;
}

/**
 * Register budget tracking tools with the MCP server
 */
export function registerBudgetTrackingTools(server: McpServer, _context: ServerContext): void {
  const gatewayManager = new GatewayManager();

  /**
   * Get current cost summary
   */
  server.registerTool(
    'get_cost_summary',
    {
      title: 'Get Cost Summary',
      description:
        'Get a summary of LLM API costs for the current session or time period. ' +
        'Shows spending by model, agent, and session to track budget usage.',
      inputSchema: {
        hours: z.number().optional().describe('Hours to look back (default: 24)'),
        days: z.number().optional().describe('Days to look back (overrides hours)'),
      },
      outputSchema: {
        period: z.object({
          start: z.string(),
          end: z.string(),
        }),
        totalCost: z.number(),
        totalRequests: z.number(),
        totalInputTokens: z.number(),
        totalOutputTokens: z.number(),
        byModel: z.record(
          z.object({
            cost: z.number(),
            requests: z.number(),
            tokens: z.number(),
          })
        ),
        byAgent: z.record(
          z.object({
            cost: z.number(),
            requests: z.number(),
          })
        ),
        bySession: z.record(
          z.object({
            cost: z.number(),
            requests: z.number(),
          })
        ),
      },
    },
    async (args, _extra) => {
      const { hours, days } = args as {
        hours?: number;
        days?: number;
      };

      const params: Record<string, number> = { limit: 100 };
      if (hours !== undefined) params.hours = hours;
      if (days !== undefined) params.days = days;
      const summary = gatewayManager.getCostSummary(params as Record<string, number>);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(summary, null, 2),
          },
        ],
        structuredContent: summary as unknown as Record<string, unknown>,
      };
    }
  );

  /**
   * Check agent budget
   */
  server.registerTool(
    'check_agent_budget',
    {
      title: 'Check Agent Budget',
      description:
        'Check if an agent has exceeded its spending budget. Returns current spending, ' +
        'limit, and percentage used for budget management.',
      inputSchema: {
        agentId: z.string().describe('Agent ID to check budget for'),
      },
      outputSchema: {
        agentId: z.string(),
        budgetLimit: z.number(),
        currentSpent: z.number(),
        percentageUsed: z.number(),
        exceeded: z.boolean(),
        remaining: z.number(),
        recentCosts: z.array(
          z.object({
            timestamp: z.string(),
            model: z.string(),
            cost: z.number(),
          })
        ),
      },
    },
    async (args) => {
      const { agentId } = args as { agentId: string };

      const budgetLimit = 50;
      const records = gatewayManager.getCostRecords({ agent: agentId, limit: 20 });
      const totalCost = records.reduce((sum, r) => sum + r.cost, 0);
      const percentageUsed = (totalCost / budgetLimit) * 100;

      const output = {
        agentId,
        budgetLimit,
        currentSpent: parseFloat(totalCost.toFixed(4)),
        percentageUsed: parseFloat(percentageUsed.toFixed(2)),
        exceeded: totalCost > budgetLimit,
        remaining: parseFloat(Math.max(0, budgetLimit - totalCost).toFixed(4)),
        recentCosts: records.slice(-10).map((r) => ({
          timestamp: r.timestamp,
          model: r.model,
          cost: r.cost,
        })),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(output, null, 2),
          },
        ],
        structuredContent: output,
      };
    }
  );

  /**
   * Check session budget
   */
  server.registerTool(
    'check_session_budget',
    {
      title: 'Check Session Budget',
      description:
        'Check if a session has exceeded its spending budget. Useful for coordinating ' +
        'multi-agent sessions with shared budget limits.',
      inputSchema: {
        sessionId: z.string().describe('Session ID to check budget for'),
      },
      outputSchema: {
        sessionId: z.string(),
        budgetLimit: z.number(),
        currentSpent: z.number(),
        percentageUsed: z.number(),
        exceeded: z.boolean(),
        remaining: z.number(),
        agentBreakdown: z.array(
          z.object({
            agentId: z.string(),
            spent: z.number(),
            percentageOfSession: z.number(),
          })
        ),
      },
    },
    async (args) => {
      const { sessionId } = args as { sessionId: string };

      const budgetLimit = 500;
      const records = gatewayManager.getCostRecords({ session: sessionId });
      const totalCost = records.reduce((sum, r) => sum + r.cost, 0);
      const percentageUsed = (totalCost / budgetLimit) * 100;

      // Group by agent
      const byAgent: Record<string, number> = {};
      for (const record of records) {
        if (record.agentId) {
          byAgent[record.agentId] = (byAgent[record.agentId] ?? 0) + record.cost;
        }
      }

      const agentBreakdown = Object.entries(byAgent)
        .map(([agentId, spent]) => ({
          agentId,
          spent: parseFloat(spent.toFixed(4)),
          percentageOfSession: parseFloat(((spent / totalCost) * 100).toFixed(2)),
        }))
        .sort((a, b) => b.spent - a.spent);

      const output = {
        sessionId,
        budgetLimit,
        currentSpent: parseFloat(totalCost.toFixed(4)),
        percentageUsed: parseFloat(percentageUsed.toFixed(2)),
        exceeded: totalCost > budgetLimit,
        remaining: parseFloat(Math.max(0, budgetLimit - totalCost).toFixed(4)),
        agentBreakdown,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(output, null, 2),
          },
        ],
        structuredContent: output,
      };
    }
  );

  /**
   * Get cost records with filtering
   */
  server.registerTool(
    'get_cost_records',
    {
      title: 'Get Cost Records',
      description:
        'Retrieve detailed cost records with filtering by agent, session, model, or time range. ' +
        'Useful for auditing and detailed cost analysis.',
      inputSchema: {
        agentId: z.string().optional().describe('Filter by agent ID'),
        sessionId: z.string().optional().describe('Filter by session ID'),
        model: z.string().optional().describe('Filter by model name'),
        limit: z.number().optional().describe('Maximum records to return (default: 100)'),
      },
      outputSchema: {
        records: z.array(
          z.object({
            timestamp: z.string(),
            requestId: z.string(),
            model: z.string(),
            cost: z.number(),
            inputTokens: z.number(),
            outputTokens: z.number(),
            latencyMs: z.number(),
            agentId: z.string().optional(),
            sessionId: z.string().optional(),
          })
        ),
        count: z.number(),
        totalCost: z.number(),
      },
    },
    async (args) => {
      const { agentId, sessionId, model, limit } = args as {
        agentId?: string;
        sessionId?: string;
        model?: string;
        limit?: number;
      };

      const queryParams: Record<string, unknown> = { limit: limit ?? 100 };
      if (agentId !== undefined) queryParams.agent = agentId;
      if (sessionId !== undefined) queryParams.session = sessionId;
      if (model !== undefined) queryParams.model = model;
      const records = gatewayManager.getCostRecords(queryParams as Record<string, unknown>);

      const totalCost = records.reduce((sum, r) => sum + r.cost, 0);

      const output = {
        records: records.map((r) => ({
          timestamp: r.timestamp,
          requestId: r.requestId,
          model: r.model,
          cost: parseFloat(r.cost.toFixed(4)),
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          latencyMs: r.latencyMs,
          agentId: r.agentId,
          sessionId: r.sessionId,
        })),
        count: records.length,
        totalCost: parseFloat(totalCost.toFixed(4)),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(output, null, 2),
          },
        ],
        structuredContent: output,
      };
    }
  );
}
