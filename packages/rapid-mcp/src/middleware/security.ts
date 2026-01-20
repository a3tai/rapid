/**
 * Security Middleware
 *
 * Wraps MCP tool calls with security checks:
 * - Policy enforcement (tool ACLs)
 * - Human approval for sensitive operations
 * - Audit logging
 * - Cost attribution
 */

import type { SecurityConfig, AgentRole } from '@a3t/rapid-schema';

export interface SecurityContext {
  agentId: string;
  agentName: string;
  agentRole: AgentRole;
  sessionId?: string;
  worktree?: string;
}

export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
  approvalId?: string;
}

export interface AuditEvent {
  timestamp: string;
  eventType: 'tool_call' | 'approval_request' | 'approval_response' | 'violation' | 'cost_event';
  toolName: string;
  agentId: string;
  agentRole: AgentRole;
  allowed: boolean;
  reason?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  durationMs?: number;
  cost?: number;
}

// In-memory audit log (will be persisted to file/Redis)
const auditLog: AuditEvent[] = [];

// Pending approvals
const pendingApprovals = new Map<
  string,
  {
    toolName: string;
    args: Record<string, unknown>;
    context: SecurityContext;
    requestedAt: Date;
    timeoutMs: number;
    resolve: (approved: boolean) => void;
  }
>();

/**
 * Check if a tool call is allowed based on security config
 */
export function checkToolAccess(
  toolName: string,
  args: Record<string, unknown>,
  context: SecurityContext,
  config?: SecurityConfig
): SecurityCheckResult {
  // No security config = allow all (development mode)
  if (!config) {
    return { allowed: true };
  }

  // Find matching ACL rule
  const acl = config.toolAcls?.find((a) => matchToolName(a.tool, toolName));

  if (!acl) {
    // No specific ACL = check strict mode
    if (config.strictMode) {
      return { allowed: false, reason: 'No ACL defined and strict mode enabled' };
    }
    return { allowed: true };
  }

  // Check role-based access
  if (acl.allowedRoles && !acl.allowedRoles.includes(context.agentRole)) {
    return {
      allowed: false,
      reason: `Role '${context.agentRole}' not allowed for tool '${toolName}'`,
    };
  }

  if (acl.deniedRoles && acl.deniedRoles.includes(context.agentRole)) {
    return {
      allowed: false,
      reason: `Role '${context.agentRole}' explicitly denied for tool '${toolName}'`,
    };
  }

  // Check if approval is required
  if (acl.alwaysRequireApproval) {
    return {
      allowed: true,
      requiresApproval: true,
      approvalId: generateApprovalId(),
    };
  }

  // Check pattern-based approval requirements
  if (acl.requireApprovalFor) {
    const requiresApproval = acl.requireApprovalFor.some((pattern) => {
      return matchesApprovalPattern(pattern, args);
    });

    if (requiresApproval) {
      return {
        allowed: true,
        requiresApproval: true,
        approvalId: generateApprovalId(),
      };
    }
  }

  // Check rate limiting
  if (acl.rateLimit) {
    const recentCalls = countRecentCalls(toolName, context.agentId, 60000);
    if (recentCalls >= acl.rateLimit) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${recentCalls}/${acl.rateLimit} calls per minute`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Request human approval for a sensitive operation
 */
export async function requestApproval(
  toolName: string,
  args: Record<string, unknown>,
  context: SecurityContext,
  config?: SecurityConfig
): Promise<boolean> {
  const timeoutMs = config?.humanApproval?.timeout ?? 300000; // 5 minutes default
  const approvalId = generateApprovalId();

  return new Promise((resolve) => {
    // Store pending approval
    pendingApprovals.set(approvalId, {
      toolName,
      args,
      context,
      requestedAt: new Date(),
      timeoutMs,
      resolve,
    });

    // Log approval request
    logAuditEvent({
      timestamp: new Date().toISOString(),
      eventType: 'approval_request',
      toolName,
      agentId: context.agentId,
      agentRole: context.agentRole,
      allowed: false,
      args,
      reason: `Approval required (ID: ${approvalId})`,
    });

    // Set timeout
    setTimeout(() => {
      const pending = pendingApprovals.get(approvalId);
      if (pending) {
        pendingApprovals.delete(approvalId);
        const timeoutBehavior = config?.humanApproval?.timeoutBehavior ?? 'deny';
        pending.resolve(timeoutBehavior === 'allow');

        logAuditEvent({
          timestamp: new Date().toISOString(),
          eventType: 'approval_response',
          toolName,
          agentId: context.agentId,
          agentRole: context.agentRole,
          allowed: timeoutBehavior === 'allow',
          reason: `Approval timed out (${timeoutBehavior})`,
        });
      }
    }, timeoutMs);
  });
}

/**
 * Respond to a pending approval
 */
export function respondToApproval(
  approvalId: string,
  approved: boolean,
  respondedBy?: string
): boolean {
  const pending = pendingApprovals.get(approvalId);
  if (!pending) {
    return false;
  }

  pendingApprovals.delete(approvalId);
  pending.resolve(approved);

  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    eventType: 'approval_response',
    toolName: pending.toolName,
    agentId: pending.context.agentId,
    agentRole: pending.context.agentRole,
    allowed: approved,
  };
  if (respondedBy) {
    event.reason = `${approved ? 'Approved' : 'Denied'} by ${respondedBy}`;
  }
  logAuditEvent(event);

  return true;
}

/**
 * Get all pending approvals
 */
export function getPendingApprovals(): Array<{
  id: string;
  toolName: string;
  agentId: string;
  requestedAt: string;
  expiresAt: string;
}> {
  return Array.from(pendingApprovals.entries()).map(([id, p]) => ({
    id,
    toolName: p.toolName,
    agentId: p.context.agentId,
    requestedAt: p.requestedAt.toISOString(),
    expiresAt: new Date(p.requestedAt.getTime() + p.timeoutMs).toISOString(),
  }));
}

/**
 * Log an audit event
 */
export function logAuditEvent(event: AuditEvent): void {
  auditLog.push(event);

  // Keep only last 10000 events in memory
  if (auditLog.length > 10000) {
    auditLog.shift();
  }
}

/**
 * Get recent audit events
 */
export function getAuditLog(options?: {
  limit?: number;
  toolName?: string;
  agentId?: string;
  eventType?: AuditEvent['eventType'];
  since?: string;
}): AuditEvent[] {
  let filtered = auditLog;

  if (options?.toolName) {
    filtered = filtered.filter((e) => e.toolName === options.toolName);
  }
  if (options?.agentId) {
    filtered = filtered.filter((e) => e.agentId === options.agentId);
  }
  if (options?.eventType) {
    filtered = filtered.filter((e) => e.eventType === options.eventType);
  }
  if (options?.since) {
    const sinceTime = new Date(options.since).getTime();
    filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= sinceTime);
  }

  const limit = options?.limit ?? 100;
  return filtered.slice(-limit);
}

/**
 * Create a wrapped tool handler with security checks
 */
export function withSecurity<T extends Record<string, unknown>, R>(
  toolName: string,
  handler: (args: T, context: SecurityContext) => Promise<R>,
  config?: SecurityConfig
): (args: T, context: SecurityContext) => Promise<R> {
  return async (args: T, context: SecurityContext): Promise<R> => {
    const startTime = Date.now();

    // Check access
    const check = checkToolAccess(toolName, args as Record<string, unknown>, context, config);

    if (!check.allowed) {
      const event: AuditEvent = {
        timestamp: new Date().toISOString(),
        eventType: 'violation',
        toolName,
        agentId: context.agentId,
        agentRole: context.agentRole,
        allowed: false,
        args: args as Record<string, unknown>,
      };
      if (check.reason) {
        event.reason = check.reason;
      }
      logAuditEvent(event);
      throw new Error(`Access denied: ${check.reason}`);
    }

    // Handle approval if required
    if (check.requiresApproval) {
      const approved = await requestApproval(
        toolName,
        args as Record<string, unknown>,
        context,
        config
      );
      if (!approved) {
        throw new Error('Operation not approved');
      }
    }

    // Execute handler
    try {
      const result = await handler(args, context);
      const durationMs = Date.now() - startTime;

      logAuditEvent({
        timestamp: new Date().toISOString(),
        eventType: 'tool_call',
        toolName,
        agentId: context.agentId,
        agentRole: context.agentRole,
        allowed: true,
        args: args as Record<string, unknown>,
        durationMs,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      logAuditEvent({
        timestamp: new Date().toISOString(),
        eventType: 'tool_call',
        toolName,
        agentId: context.agentId,
        agentRole: context.agentRole,
        allowed: true,
        args: args as Record<string, unknown>,
        durationMs,
        reason: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  };
}

// Helper functions

function matchToolName(pattern: string, toolName: string): boolean {
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(toolName);
  }
  return pattern === toolName;
}

function matchesApprovalPattern(pattern: string, args: Record<string, unknown>): boolean {
  // Pattern like "*.env" matches file arguments ending in .env
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Object.values(args).some((v) => typeof v === 'string' && regex.test(v));
  }
  return Object.values(args).some((v) => v === pattern);
}

function generateApprovalId(): string {
  return `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function countRecentCalls(toolName: string, agentId: string, windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return auditLog.filter(
    (e) =>
      e.toolName === toolName &&
      e.agentId === agentId &&
      e.eventType === 'tool_call' &&
      new Date(e.timestamp).getTime() >= cutoff
  ).length;
}
