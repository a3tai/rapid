/**
 * Suggestion and Voting System Tools
 *
 * MCP tools for managing agent suggestions and voting.
 * Enables agents to propose ideas, vote on them, and allows
 * orchestrator to make final decisions with authority.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ServerContext } from '../server.js';

// Suggestion category enum
const SuggestionCategorySchema = z.enum(['feature', 'fix', 'improvement', 'refactor', 'docs']);

// Suggestion status enum
const SuggestionStatusSchema = z.enum([
  'proposed', // Just created
  'voting', // Currently open for voting
  'approved', // Approved by majority
  'rejected', // Rejected by majority
  'orchestrator_approved', // Orchestrator force-approved
  'orchestrator_vetoed', // Orchestrator vetoed
  'implemented', // Turned into a task
]);

// Vote type enum
const VoteTypeSchema = z.enum(['approve', 'reject', 'abstain']);

// Vote schema
const VoteSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  vote: VoteTypeSchema,
  timestamp: z.string(), // ISO8601
  reason: z.string().optional(),
});

// Suggestion schema
const SuggestionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: SuggestionCategorySchema,
  proposedBy: z.string(), // Agent ID
  proposedByName: z.string(), // Agent name
  status: SuggestionStatusSchema,
  createdAt: z.string(), // ISO8601
  votingStartedAt: z.string().optional(), // When voting period began
  votingEndsAt: z.string().optional(), // When voting period ends (e.g., 5 minutes)
  votes: z.array(VoteSchema),
  orchestratorDecision: z
    .object({
      decision: z.enum(['approved', 'vetoed']),
      reason: z.string(),
      decidedAt: z.string(), // ISO8601
      decidedBy: z.string(), // Agent ID
    })
    .optional(),
  implementedAs: z.string().optional(), // Task ID if approved and implemented
  tags: z.array(z.string()).optional(),
});

type Suggestion = z.infer<typeof SuggestionSchema>;

// In-memory suggestion store
const suggestions = new Map<string, Suggestion>();

// File path for persistence
let suggestionsFilePath: string;

// Default voting period: 5 minutes
const VOTING_PERIOD_MS = 5 * 60 * 1000;

/**
 * Load suggestions from disk
 */
async function loadSuggestions(projectDir: string): Promise<void> {
  suggestionsFilePath = join(projectDir, '.rapid', 'suggestions.json');
  try {
    const content = await readFile(suggestionsFilePath, 'utf-8');
    const loaded = JSON.parse(content) as Suggestion[];
    for (const suggestion of loaded) {
      suggestions.set(suggestion.id, suggestion);
    }
  } catch {
    // File doesn't exist yet, that's ok
  }
}

/**
 * Save suggestions to disk
 */
async function saveSuggestions(): Promise<void> {
  const suggestionList = Array.from(suggestions.values());
  const dir = join(suggestionsFilePath, '..');
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // Directory may exist
  }
  await writeFile(suggestionsFilePath, JSON.stringify(suggestionList, null, 2), 'utf-8');
}

/**
 * Register suggestion tools with MCP server
 */
export async function registerSuggestionTools(server: McpServer, context: ServerContext): Promise<void> {
  // Load suggestions on startup
  await loadSuggestions(context.projectDir);

  /**
   * Propose a new suggestion
   */
  server.registerTool(
    'suggestion_propose',
    {
      title: 'Propose a Suggestion',
      description:
        'Propose a new idea or improvement for the group to vote on. Orchestrator will be notified immediately.',
      inputSchema: z.object({
        title: z.string().describe('Short title of the suggestion'),
        description: z.string().describe('Detailed description of what is being suggested'),
        category: SuggestionCategorySchema.describe('Category: feature, fix, improvement, refactor, or docs'),
        agentId: z.string().describe('ID of agent making the suggestion'),
        agentName: z.string().describe('Name of agent making the suggestion'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
      }),
      outputSchema: z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        votingEndsAt: z.string(),
      }),
    },
    async (args) => {
      const suggestion: Suggestion = {
        id: randomUUID(),
        title: args.title,
        description: args.description,
        category: args.category,
        proposedBy: args.agentId,
        proposedByName: args.agentName,
        status: 'proposed',
        createdAt: new Date().toISOString(),
        votingStartedAt: new Date().toISOString(),
        votingEndsAt: new Date(Date.now() + VOTING_PERIOD_MS).toISOString(),
        votes: [],
        tags: args.tags,
      };

      suggestions.set(suggestion.id, suggestion);
      await saveSuggestions();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: suggestion.id,
              title: suggestion.title,
              status: 'proposed',
              votingEndsAt: suggestion.votingEndsAt,
            }),
          },
        ],
        structuredContent: {
          id: suggestion.id,
          title: suggestion.title,
          status: 'proposed',
          votingEndsAt: suggestion.votingEndsAt,
        },
      };
    }
  );

  /**
   * Cast a vote on a suggestion
   */
  server.registerTool(
    'suggestion_vote',
    {
      title: 'Vote on a Suggestion',
      description: 'Vote (approve, reject, or abstain) on an active suggestion',
      inputSchema: z.object({
        suggestionId: z.string().describe('ID of the suggestion to vote on'),
        vote: VoteTypeSchema.describe('Your vote: approve, reject, or abstain'),
        agentId: z.string().describe('ID of voting agent'),
        agentName: z.string().describe('Name of voting agent'),
        reason: z.string().optional().describe('Optional reason for your vote'),
      }),
      outputSchema: z.object({
        voteCount: z.number(),
        currentStatus: z.string(),
      }),
    },
    async (args) => {
      const suggestion = suggestions.get(args.suggestionId);
      if (!suggestion) {
        throw new Error(`Suggestion ${args.suggestionId} not found`);
      }

      // Check if voting period has ended
      const votingEndsAt = new Date(suggestion.votingEndsAt || new Date()).getTime();
      if (Date.now() > votingEndsAt && suggestion.status === 'proposed') {
        suggestion.status = 'voting';
      }

      // Check if voting is still open
      if (suggestion.status !== 'proposed' && suggestion.status !== 'voting') {
        throw new Error(`Cannot vote on suggestion with status: ${suggestion.status}`);
      }

      // Remove existing vote from this agent if any
      suggestion.votes = suggestion.votes.filter((v) => v.agentId !== args.agentId);

      // Add new vote
      suggestion.votes.push({
        agentId: args.agentId,
        agentName: args.agentName,
        vote: args.vote,
        timestamp: new Date().toISOString(),
        reason: args.reason,
      });

      // Check if voting period has ended
      const now = Date.now();
      const votingEnd = new Date(suggestion.votingEndsAt || Date.now()).getTime();

      if (now > votingEnd) {
        const approveCount = suggestion.votes.filter((v) => v.vote === 'approve').length;
        const rejectCount = suggestion.votes.filter((v) => v.vote === 'reject').length;

        if (approveCount > rejectCount) {
          suggestion.status = 'approved';
        } else if (rejectCount >= approveCount) {
          suggestion.status = 'rejected';
        }
      }

      await saveSuggestions();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              voteCount: suggestion.votes.length,
              currentStatus: suggestion.status,
            }),
          },
        ],
        structuredContent: {
          voteCount: suggestion.votes.length,
          currentStatus: suggestion.status,
        },
      };
    }
  );

  /**
   * List suggestions with optional filtering
   */
  server.registerTool(
    'suggestion_list',
    {
      title: 'List Suggestions',
      description: 'List all suggestions with optional filtering by status or category',
      inputSchema: z.object({
        status: SuggestionStatusSchema.optional().describe('Filter by status'),
        category: SuggestionCategorySchema.optional().describe('Filter by category'),
        limit: z.number().optional().describe('Maximum number of suggestions to return (default: 20)'),
        proposedBy: z.string().optional().describe('Filter by proposing agent ID'),
      }),
      outputSchema: z.object({
        suggestions: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            category: z.string(),
            status: z.string(),
            proposedByName: z.string(),
            approveCount: z.number(),
            rejectCount: z.number(),
            abstainCount: z.number(),
            createdAt: z.string(),
          })
        ),
      }),
    },
    async (args) => {
      let filtered = Array.from(suggestions.values());

      if (args.status) {
        filtered = filtered.filter((s) => s.status === args.status);
      }

      if (args.category) {
        filtered = filtered.filter((s) => s.category === args.category);
      }

      if (args.proposedBy) {
        filtered = filtered.filter((s) => s.proposedBy === args.proposedBy);
      }

      const limit = args.limit || 20;
      const results = filtered.slice(0, limit).map((s) => ({
        id: s.id,
        title: s.title,
        category: s.category,
        status: s.status,
        proposedByName: s.proposedByName,
        approveCount: s.votes.filter((v) => v.vote === 'approve').length,
        rejectCount: s.votes.filter((v) => v.vote === 'reject').length,
        abstainCount: s.votes.filter((v) => v.vote === 'abstain').length,
        createdAt: s.createdAt,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ suggestions: results }),
          },
        ],
        structuredContent: { suggestions: results },
      };
    }
  );

  /**
   * Orchestrator decision tool - approve or veto suggestions
   */
  server.registerTool(
    'suggestion_decide',
    {
      title: 'Orchestrator Decision on Suggestion',
      description:
        'Orchestrator uses this to approve or veto a suggestion, overriding the voting outcome if needed.',
      inputSchema: z.object({
        suggestionId: z.string().describe('ID of the suggestion'),
        decision: z.enum(['approved', 'vetoed']).describe('Orchestrator decision'),
        reason: z.string().describe('Reason for this decision'),
      }),
      outputSchema: z.object({
        id: z.string(),
        status: z.string(),
        orchestratorDecision: z.object({
          decision: z.string(),
          reason: z.string(),
        }),
      }),
    },
    async (args) => {
      const suggestion = suggestions.get(args.suggestionId);
      if (!suggestion) {
        throw new Error(`Suggestion ${args.suggestionId} not found`);
      }

      const decision = args.decision === 'approved' ? 'orchestrator_approved' : 'orchestrator_vetoed';

      suggestion.status = decision;
      suggestion.orchestratorDecision = {
        decision: args.decision,
        reason: args.reason,
        decidedAt: new Date().toISOString(),
        decidedBy: 'orchestrator',
      };

      await saveSuggestions();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: suggestion.id,
              status: decision,
              orchestratorDecision: suggestion.orchestratorDecision,
            }),
          },
        ],
        structuredContent: {
          id: suggestion.id,
          status: decision,
          orchestratorDecision: suggestion.orchestratorDecision,
        },
      };
    }
  );

  /**
   * Get suggestion details
   */
  server.registerTool(
    'suggestion_get',
    {
      title: 'Get Suggestion Details',
      description: 'Get full details of a specific suggestion including all votes',
      inputSchema: z.object({
        suggestionId: z.string().describe('ID of the suggestion'),
      }),
      outputSchema: SuggestionSchema,
    },
    async (args) => {
      const suggestion = suggestions.get(args.suggestionId);
      if (!suggestion) {
        throw new Error(`Suggestion ${args.suggestionId} not found`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(suggestion),
          },
        ],
        structuredContent: suggestion,
      };
    }
  );
}
