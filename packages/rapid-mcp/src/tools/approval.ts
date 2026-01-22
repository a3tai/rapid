/**
 * Approval Tools
 *
 * MCP tools for Human-in-the-Loop (HITL) approval workflow.
 * Allows orchestrators and the desktop UI to manage approval requests.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../server.js';
import {
  getPendingApprovals,
  respondToApproval,
  requestApproval,
  getAuditLog,
  type SecurityContext,
} from '../middleware/security.js';

/**
 * Risk level based on tool sensitivity
 */
const TOOL_RISK_LEVELS: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  // Critical - system-level operations
  secure_exec: 'critical',
  persona_spawn: 'high',
  persona_stop: 'high',
  file_delete: 'high',

  // High - write operations
  file_write: 'high',
  file_edit: 'medium',
  secret_set: 'high',

  // Medium - read-sensitive
  secret_get: 'medium',
  file_read: 'low',

  // Low - informational
  task_create: 'low',
  bus_send: 'low',
};

/**
 * Determine risk level for a tool
 */
function getRiskLevel(toolName: string): 'low' | 'medium' | 'high' | 'critical' {
  return TOOL_RISK_LEVELS[toolName] || 'medium';
}

/**
 * Enhanced pending approval with full details for UI
 */
interface EnhancedApproval {
  id: string;
  toolName: string;
  agentId: string;
  agentName: string;
  action: string;
  args: Record<string, unknown>;
  reason?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

// Store for resolved approvals (keep history for UI)
const resolvedApprovals: EnhancedApproval[] = [];
const MAX_RESOLVED_HISTORY = 100;

// Store additional context for pending approvals
const approvalContext = new Map<
  string,
  {
    agentName: string;
    args: Record<string, unknown>;
    reason?: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  }
>();

/**
 * Register approval tools with the MCP server
 */
export function registerApprovalTools(server: McpServer, context: ServerContext): void {
  /**
   * List approval requests
   */
  server.registerTool(
    'approval_list',
    {
      title: 'List Approval Requests',
      description:
        'List pending and resolved approval requests. ' +
        'Use this to see what actions are waiting for human approval.',
      inputSchema: {
        status: z
          .enum(['pending', 'approved', 'rejected', 'all'])
          .default('pending')
          .describe('Filter by approval status'),
        limit: z.number().min(1).max(100).default(50).describe('Maximum number of results'),
        agentId: z.string().optional().describe('Filter by agent ID'),
      },
      outputSchema: {
        approvals: z.array(
          z.object({
            id: z.string(),
            toolName: z.string(),
            agentId: z.string(),
            agentName: z.string(),
            action: z.string(),
            args: z.record(z.unknown()),
            reason: z.string().optional(),
            riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
            createdAt: z.string(),
            expiresAt: z.string().optional(),
            status: z.enum(['pending', 'approved', 'rejected', 'expired']),
          })
        ),
        pendingCount: z.number(),
        totalCount: z.number(),
      },
    },
    async (args) => {
      const { status, limit, agentId } = args as {
        status: 'pending' | 'approved' | 'rejected' | 'all';
        limit: number;
        agentId?: string;
      };

      // Get pending approvals from security middleware
      const pending = getPendingApprovals();
      const pendingEnhanced: EnhancedApproval[] = pending.map((p) => {
        const ctx = approvalContext.get(p.id);
        const base = {
          id: p.id,
          toolName: p.toolName,
          agentId: p.agentId,
          agentName: ctx?.agentName || p.agentId,
          action: `Execute ${p.toolName}`,
          args: ctx?.args || {},
          riskLevel: ctx?.riskLevel || getRiskLevel(p.toolName),
          createdAt: p.requestedAt,
          expiresAt: p.expiresAt,
          status: 'pending' as const,
        };
        // Only include reason if defined (exactOptionalPropertyTypes)
        if (ctx?.reason !== undefined) {
          return { ...base, reason: ctx.reason };
        }
        return base;
      });

      // Combine with resolved approvals
      let allApprovals: EnhancedApproval[] = [...pendingEnhanced, ...resolvedApprovals];

      // Apply filters
      if (status !== 'all') {
        allApprovals = allApprovals.filter((a) => a.status === status);
      }

      if (agentId) {
        allApprovals = allApprovals.filter((a) => a.agentId === agentId);
      }

      // Sort by createdAt descending (most recent first)
      allApprovals.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Apply limit
      const limited = allApprovals.slice(0, limit);

      const output = {
        approvals: limited,
        pendingCount: pending.length,
        totalCount: allApprovals.length,
      };

      if (context.verbose) {
        console.error(
          `[approval_list] Returning ${limited.length} approvals (${pending.length} pending)`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  /**
   * Respond to an approval request
   */
  server.registerTool(
    'approval_respond',
    {
      title: 'Respond to Approval',
      description:
        'Approve or reject a pending approval request. ' +
        'This is the HITL control for sensitive agent operations.',
      inputSchema: {
        id: z.string().describe('The approval request ID'),
        decision: z.enum(['approved', 'rejected']).describe('The decision'),
        reason: z.string().optional().describe('Reason for the decision'),
      },
      outputSchema: {
        success: z.boolean(),
        id: z.string(),
        decision: z.enum(['approved', 'rejected']),
        message: z.string(),
      },
    },
    async (args) => {
      const { id, decision, reason } = args as {
        id: string;
        decision: 'approved' | 'rejected';
        reason?: string;
      };

      // Get approval context before responding (it will be deleted)
      const pending = getPendingApprovals().find((p) => p.id === id);
      const ctx = approvalContext.get(id);

      // Respond to the approval
      const approved = decision === 'approved';
      const success = respondToApproval(id, approved, reason || 'desktop-ui');

      if (success) {
        // Store in resolved history for UI
        if (pending) {
          const resolvedBase = {
            id: pending.id,
            toolName: pending.toolName,
            agentId: pending.agentId,
            agentName: ctx?.agentName || pending.agentId,
            action: `Execute ${pending.toolName}`,
            args: ctx?.args || {},
            riskLevel: ctx?.riskLevel || getRiskLevel(pending.toolName),
            createdAt: pending.requestedAt,
            expiresAt: pending.expiresAt,
            status: decision,
          };
          // Only include reason if defined (exactOptionalPropertyTypes)
          const resolved: EnhancedApproval = ctx?.reason !== undefined
            ? { ...resolvedBase, reason: ctx.reason }
            : resolvedBase;
          resolvedApprovals.unshift(resolved);

          // Trim history
          if (resolvedApprovals.length > MAX_RESOLVED_HISTORY) {
            resolvedApprovals.pop();
          }
        }

        // Clean up context
        approvalContext.delete(id);

        if (context.verbose) {
          console.error(`[approval_respond] ${decision} approval ${id}`);
        }
      }

      const output = {
        success,
        id,
        decision,
        message: success
          ? `Approval ${id} ${decision}`
          : `Approval ${id} not found or already resolved`,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );

  /**
   * Request approval for an operation (used by agents)
   */
  server.registerTool(
    'approval_request',
    {
      title: 'Request Approval',
      description:
        'Request human approval for a sensitive operation. ' +
        'This blocks until the approval is granted, rejected, or times out.',
      inputSchema: {
        toolName: z.string().describe('The tool being executed'),
        args: z.record(z.unknown()).default({}).describe('Arguments to the tool'),
        agentId: z.string().describe('The requesting agent ID'),
        agentName: z.string().describe('The requesting agent name'),
        reason: z.string().optional().describe('Why this operation is needed'),
        timeoutMs: z
          .number()
          .min(1000)
          .max(600000)
          .default(300000)
          .describe('Timeout in milliseconds'),
      },
      outputSchema: {
        approved: z.boolean(),
        approvalId: z.string(),
        message: z.string(),
      },
    },
    async (args) => {
      const { toolName, args: toolArgs, agentId, agentName, reason, timeoutMs } = args as {
        toolName: string;
        args: Record<string, unknown>;
        agentId: string;
        agentName: string;
        reason?: string;
        timeoutMs: number;
      };

      const securityContext: SecurityContext = {
        agentId,
        agentName,
        agentRole: 'worker', // Default role
      };

      // Store context for the approval
      const approvalId = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const ctxBase = {
        agentName,
        args: toolArgs,
        riskLevel: getRiskLevel(toolName),
      };
      // Only include reason if defined (exactOptionalPropertyTypes)
      approvalContext.set(
        approvalId,
        reason !== undefined ? { ...ctxBase, reason } : ctxBase
      );

      if (context.verbose) {
        console.error(`[approval_request] Agent ${agentName} requesting approval for ${toolName}`);
      }

      // Request approval (this blocks until response or timeout)
      const approved = await requestApproval(
        toolName,
        toolArgs,
        securityContext,
        { humanApproval: { timeout: timeoutMs, timeoutBehavior: 'deny' } }
      );

      const output = {
        approved,
        approvalId,
        message: approved
          ? `Operation ${toolName} approved`
          : `Operation ${toolName} denied or timed out`,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );

  /**
   * Get approval audit log
   */
  server.registerTool(
    'approval_audit',
    {
      title: 'Approval Audit Log',
      description: 'Get the audit log of approval events for compliance and debugging.',
      inputSchema: {
        limit: z.number().min(1).max(500).default(100).describe('Maximum number of events'),
        agentId: z.string().optional().describe('Filter by agent ID'),
        since: z.string().optional().describe('Only events after this ISO timestamp'),
      },
      outputSchema: {
        events: z.array(
          z.object({
            timestamp: z.string(),
            eventType: z.string(),
            toolName: z.string(),
            agentId: z.string(),
            agentRole: z.string(),
            allowed: z.boolean(),
            reason: z.string().optional(),
          })
        ),
        totalCount: z.number(),
      },
    },
    async (args) => {
      const { limit, agentId, since } = args as {
        limit: number;
        agentId?: string;
        since?: string;
      };

      // Get audit events related to approvals
      // Build options conditionally for exactOptionalPropertyTypes
      const auditOptions: Parameters<typeof getAuditLog>[0] = { limit };
      if (agentId !== undefined) auditOptions.agentId = agentId;
      if (since !== undefined) auditOptions.since = since;

      const events = getAuditLog(auditOptions).filter(
        (e) => e.eventType === 'approval_request' || e.eventType === 'approval_response'
      );

      const output = {
        events: events.map((e) => ({
          timestamp: e.timestamp,
          eventType: e.eventType,
          toolName: e.toolName,
          agentId: e.agentId,
          agentRole: e.agentRole,
          allowed: e.allowed,
          reason: e.reason,
        })),
        totalCount: events.length,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
