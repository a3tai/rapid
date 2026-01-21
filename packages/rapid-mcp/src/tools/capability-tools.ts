/**
 * Capability Matching MCP Tools
 *
 * Exposes capability matching functionality as MCP tools for agents to use.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';
import {
  CAPABILITY_REGISTRY,
  scoreCapabilityMatch,
  findBestMatchingAgents,
  getCapabilitiesForPersona,
  inferCapabilitiesFromTask,
  validateAgentCapabilities,
  type AgentCapabilityProfile,
  type CapabilityMatchResult,
} from './capability-matching.js';

const logger = createLogger('capability-tools');

/**
 * Register capability matching tools with the MCP server
 */
export function registerCapabilityTools(server: McpServer, context: ServerContext): void {
  // Tool: List all capabilities
  server.registerTool(
    'capability_list',
    {
      title: 'List Available Capabilities',
      description:
        'List all capabilities in the RAPID capability registry. ' +
        'Capabilities are organized by category (tool, language, domain, process).',
      inputSchema: {
        category: z
          .enum(['tool', 'language', 'domain', 'process', 'all'])
          .default('all')
          .describe('Filter by capability category'),
        includeDetails: z
          .boolean()
          .default(true)
          .describe('Include detailed capability definitions'),
      },
      outputSchema: {
        capabilities: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            category: z.string(),
            description: z.string(),
            defaultPersonas: z.array(z.string()).optional(),
            relatedCapabilities: z.array(z.string()).optional(),
          }),
        ),
        count: z.number(),
        categories: z.record(z.number()),
      },
    },
    async (args) => {
      const { category, includeDetails } = args as {
        category?: string;
        includeDetails?: boolean;
      };

      const filtered =
        category === 'all' || !category
          ? Object.values(CAPABILITY_REGISTRY)
          : Object.values(CAPABILITY_REGISTRY).filter((c) => c.category === category);

      const categoryCount: Record<string, number> = {};
      filtered.forEach((cap) => {
        categoryCount[cap.category] = (categoryCount[cap.category] || 0) + 1;
      });

      const output = {
        capabilities: filtered
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((cap) => ({
            id: cap.id,
            name: cap.name,
            category: cap.category,
            description: cap.description,
            ...(includeDetails && cap.defaultPersonas
              ? { defaultPersonas: cap.defaultPersonas }
              : {}),
            ...(includeDetails && cap.relatedCapabilities
              ? { relatedCapabilities: cap.relatedCapabilities }
              : {}),
          })),
        count: filtered.length,
        categories: categoryCount,
      };

      logger.info('Listed capabilities', { count: output.count });

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    },
  );

  // Tool: Get persona capabilities
  server.registerTool(
    'capability_get_persona_capabilities',
    {
      title: 'Get Persona Capabilities',
      description:
        'Get all default capabilities associated with a specific persona type. ' +
        'Returns the full capability definitions for the persona.',
      inputSchema: {
        persona: z.string().describe('Persona name (e.g., "worker", "implementer", "architect")'),
      },
      outputSchema: {
        persona: z.string(),
        capabilities: z.array(z.string()),
        details: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            category: z.string(),
            description: z.string(),
          }),
        ),
        count: z.number(),
      },
    },
    async (args) => {
      const { persona } = args as { persona: string };
      const capabilities = getCapabilitiesForPersona(persona);

      const details = capabilities
        .map((capId) => CAPABILITY_REGISTRY[capId])
        .filter((cap) => cap !== undefined)
        .map((cap) => ({
          id: cap.id,
          name: cap.name,
          category: cap.category,
          description: cap.description,
        }));

      const output = {
        persona,
        capabilities,
        details,
        count: capabilities.length,
      };

      logger.info('Retrieved persona capabilities', { persona, count: capabilities.length });

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    },
  );

  // Tool: Infer task capabilities
  server.registerTool(
    'capability_infer_from_task',
    {
      title: 'Infer Task Capabilities',
      description:
        'Analyze a task description and infer required and preferred capabilities. ' +
        'Uses keyword matching and task tags to determine necessary capabilities.',
      inputSchema: {
        taskDescription: z.string().describe('Description of the task'),
        taskTags: z
          .array(z.string())
          .optional()
          .describe('Tags associated with the task'),
      },
      outputSchema: {
        taskDescription: z.string(),
        inferred: z.object({
          required: z.array(z.string()),
          preferred: z.array(z.string()),
        }),
        details: z.object({
          requiredDetails: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              category: z.string(),
            }),
          ),
          preferredDetails: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              category: z.string(),
            }),
          ),
        }),
      },
    },
    async (args) => {
      const { taskDescription, taskTags } = args as {
        taskDescription: string;
        taskTags?: string[];
      };

      const inferred = inferCapabilitiesFromTask(taskDescription, taskTags);

      const requiredDetails = inferred.required
        .map((id) => CAPABILITY_REGISTRY[id])
        .filter((cap) => cap !== undefined)
        .map((cap) => ({
          id: cap.id,
          name: cap.name,
          category: cap.category,
        }));

      const preferredDetails = inferred.preferred
        .map((id) => CAPABILITY_REGISTRY[id])
        .filter((cap) => cap !== undefined)
        .map((cap) => ({
          id: cap.id,
          name: cap.name,
          category: cap.category,
        }));

      const output = {
        taskDescription,
        inferred,
        details: {
          requiredDetails,
          preferredDetails,
        },
      };

      logger.info('Inferred task capabilities', {
        required: inferred.required.length,
        preferred: inferred.preferred.length,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    },
  );

  // Tool: Validate agent capabilities
  server.registerTool(
    'capability_validate_agent',
    {
      title: 'Validate Agent Capabilities',
      description:
        'Check if an agent has all required capabilities for a task. ' +
        'Returns validation result with any missing capabilities.',
      inputSchema: {
        agentCapabilities: z
          .array(z.string())
          .describe('List of capabilities the agent has'),
        requiredCapabilities: z
          .array(z.string())
          .describe('List of capabilities required for the task'),
      },
      outputSchema: {
        valid: z.boolean(),
        missing: z.array(z.string()),
        missingDetails: z.array(z.object({ id: z.string(), name: z.string() })),
      },
    },
    async (args) => {
      const { agentCapabilities, requiredCapabilities } = args as {
        agentCapabilities: string[];
        requiredCapabilities: string[];
      };

      const missing = requiredCapabilities.filter((cap) => !agentCapabilities.includes(cap));

      const missingDetails = missing
        .map((id) => CAPABILITY_REGISTRY[id])
        .filter((cap) => cap !== undefined)
        .map((cap) => ({
          id: cap.id,
          name: cap.name,
        }));

      const output = {
        valid: missing.length === 0,
        missing,
        missingDetails,
      };

      logger.info('Validated agent capabilities', {
        valid: output.valid,
        missing: missing.length,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    },
  );

  // Tool: Score capability match
  server.registerTool(
    'capability_score_match',
    {
      title: 'Score Capability Match',
      description:
        'Score how well an agent matches a task based on capability requirements. ' +
        'Returns detailed scoring breakdown and recommendation.',
      inputSchema: {
        agentId: z.string().describe('Agent ID or name'),
        persona: z.string().describe('Agent persona type'),
        agentCapabilities: z.array(z.string()).describe('Capabilities the agent has'),
        taskCapabilities: z.object({
          required: z.array(z.string()).describe('Required capabilities'),
          preferred: z
            .array(z.string())
            .optional()
            .describe('Preferred but not required capabilities'),
        }),
        agentStats: z
          .object({
            totalTasksCompleted: z.number().optional(),
            avgCompletionTimeMs: z.number().optional(),
            successRate: z.number().optional(),
          })
          .optional(),
      },
      outputSchema: {
        agentId: z.string(),
        overallScore: z.number(),
        recommendation: z.enum(['excellent', 'good', 'fair', 'poor', 'ineligible']),
        analysis: z.object({
          requiredMatch: z.object({
            hasAll: z.boolean(),
            missing: z.array(z.string()),
          }),
          scoreBreakdown: z.object({
            requiredMatch: z.number(),
            preferredMatch: z.number(),
            performanceBonus: z.number(),
            experienceBonus: z.number(),
          }),
        }),
      },
    },
    async (args) => {
      const { agentId, persona, agentCapabilities, taskCapabilities, agentStats } = args as {
        agentId: string;
        persona: string;
        agentCapabilities: string[];
        taskCapabilities: { required: string[]; preferred?: string[] };
        agentStats?: {
          totalTasksCompleted?: number;
          avgCompletionTimeMs?: number;
          successRate?: number;
        };
      };

      // Create a synthetic agent profile from the input
      const agentProfile: AgentCapabilityProfile = {
        agentId,
        persona,
        capabilities: agentCapabilities,
        performanceByCapability: {},
        overallStats: {
          totalTasksCompleted: agentStats?.totalTasksCompleted || 0,
          avgCompletionTimeMs: agentStats?.avgCompletionTimeMs || 0,
          successRate: agentStats?.successRate || 0.5,
          lastUpdated: new Date().toISOString(),
        },
      };

      // Score the match
      const result = scoreCapabilityMatch(
        agentProfile,
        taskCapabilities.required,
        taskCapabilities.preferred,
      );

      const output = {
        agentId: result.agentId,
        overallScore: Math.round(result.overallScore * 10) / 10, // Round to 1 decimal
        recommendation: result.recommendation,
        analysis: {
          requiredMatch: {
            hasAll: result.requiredVsAvailable.hasAll,
            missing: result.requiredVsAvailable.missing,
          },
          scoreBreakdown: {
            requiredMatch: Math.round(result.scoreBreakdown.requiredMatch * 10) / 10,
            preferredMatch: Math.round(result.scoreBreakdown.preferredMatch * 10) / 10,
            performanceBonus: Math.round(result.scoreBreakdown.performanceBonus * 10) / 10,
            experienceBonus: Math.round(result.scoreBreakdown.experienceBonus * 10) / 10,
          },
        },
      };

      logger.info('Scored capability match', {
        agentId,
        score: output.overallScore,
        recommendation: output.recommendation,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    },
  );

  logger.info('Registered capability matching tools', { toolCount: 5 });
}
