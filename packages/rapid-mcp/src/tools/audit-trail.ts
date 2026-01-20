/**
 * Audit Trail Tool
 *
 * Manages comprehensive audit logging for security events.
 * Persists audit logs to JSONL format for compliance and analysis.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { ServerContext } from '../server.js';
import type { AuditEventType } from '@a3t/rapid-schema';

export interface AuditLogEntry {
  timestamp: string;
  eventType: AuditEventType;
  agentId?: string;
  agentRole?: string;
  toolName?: string;
  action?: string;
  allowed: boolean;
  reason?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  durationMs?: number;
  cost?: number;
  userId?: string;
  source?: 'agent' | 'user' | 'system';
  metadata?: Record<string, unknown>;
}

// In-memory buffer for audit events (flushed to disk periodically)
const auditBuffer: AuditLogEntry[] = [];
let auditLogPath: string;
let flushInterval: NodeJS.Timer | null = null;

/**
 * Initialize audit trail system
 */
async function initAuditTrail(projectDir: string): Promise<void> {
  auditLogPath = join(projectDir, '.rapid', 'audit.jsonl');

  // Ensure directory exists
  const rapidDir = join(projectDir, '.rapid');
  if (!existsSync(rapidDir)) {
    await mkdir(rapidDir, { recursive: true });
  }

  // Start periodic flush (every 5 seconds)
  if (!flushInterval) {
    flushInterval = setInterval(() => {
      flushAuditBuffer().catch((err) => {
        console.error('Failed to flush audit buffer:', err);
      });
    }, 5000);
  }
}

/**
 * Flush in-memory audit buffer to disk
 */
async function flushAuditBuffer(): Promise<void> {
  if (auditBuffer.length === 0) {
    return;
  }

  const entries = auditBuffer.splice(0, auditBuffer.length);

  try {
    const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await appendFile(auditLogPath, lines);
  } catch (error) {
    // Put entries back in buffer if flush fails
    auditBuffer.unshift(...entries);
    throw error;
  }
}

/**
 * Log an audit event
 */
function logAuditEvent(event: AuditLogEntry): void {
  const entry: AuditLogEntry = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  };

  auditBuffer.push(entry);
}

/**
 * Register audit trail tools with the MCP server
 */
export function registerAuditTrailTools(server: McpServer, context: ServerContext): void {
  // Initialize on first registration
  initAuditTrail(context.projectDir).catch((err) => {
    console.error('Failed to initialize audit trail:', err);
  });

  /**
   * Log a security event
   */
  server.registerTool(
    'log_security_event',
    {
      title: 'Log Security Event',
      description:
        'Log a security event to the audit trail. Used by the security middleware ' +
        'to record all security-relevant actions.',
      inputSchema: {
        eventType: z.enum([
          'tool_call',
          'approval_request',
          'approval_response',
          'secret_access',
          'sandbox_violation',
          'budget_alert',
          'agent_spawn',
          'agent_terminate',
        ] as const),
        allowed: z.boolean(),
        agentId: z.string().optional(),
        agentRole: z.string().optional(),
        toolName: z.string().optional(),
        action: z.string().optional(),
        reason: z.string().optional(),
        durationMs: z.number().optional(),
        cost: z.number().optional(),
        metadata: z.record(z.unknown()).optional(),
      },
      outputSchema: {
        logged: z.boolean(),
        eventId: z.string(),
      },
    },
    async (args) => {
      const {
        eventType,
        allowed,
        agentId,
        agentRole,
        toolName,
        action,
        reason,
        durationMs,
        cost,
        metadata,
      } = args as {
        eventType: AuditEventType;
        allowed: boolean;
        agentId?: string;
        agentRole?: string;
        toolName?: string;
        action?: string;
        reason?: string;
        durationMs?: number;
        cost?: number;
        metadata?: Record<string, unknown>;
      };

      const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const auditEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        eventType,
        allowed,
        source: 'agent',
      };

      if (agentId) auditEntry.agentId = agentId;
      if (agentRole) auditEntry.agentRole = agentRole;
      if (toolName) auditEntry.toolName = toolName;
      if (action) auditEntry.action = action;
      if (reason) auditEntry.reason = reason;
      if (durationMs) auditEntry.durationMs = durationMs;
      if (cost) auditEntry.cost = cost;
      if (metadata) auditEntry.metadata = metadata;

      logAuditEvent(auditEntry);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ logged: true, eventId }, null, 2),
          },
        ],
        structuredContent: { logged: true, eventId },
      };
    }
  );

  /**
   * Get audit log entries
   */
  server.registerTool(
    'get_audit_log',
    {
      title: 'Get Audit Log',
      description:
        'Retrieve audit log entries with optional filtering by agent, event type, ' +
        'time range, and other criteria. Useful for compliance and investigation.',
      inputSchema: {
        limit: z.number().optional().describe('Maximum entries to return (default: 100)'),
        agentId: z.string().optional().describe('Filter by agent ID'),
        eventType: z
          .enum([
            'tool_call',
            'approval_request',
            'approval_response',
            'secret_access',
            'sandbox_violation',
            'budget_alert',
            'agent_spawn',
            'agent_terminate',
          ] as const)
          .optional()
          .describe('Filter by event type'),
        since: z.string().optional().describe('ISO timestamp - only return events after this time'),
        until: z
          .string()
          .optional()
          .describe('ISO timestamp - only return events before this time'),
        allowedOnly: z.boolean().optional().describe('Only show allowed events'),
        deniedOnly: z.boolean().optional().describe('Only show denied events'),
      },
      outputSchema: {
        entries: z.array(
          z.object({
            timestamp: z.string(),
            eventType: z.string(),
            agentId: z.string().optional(),
            agentRole: z.string().optional(),
            toolName: z.string().optional(),
            allowed: z.boolean(),
            reason: z.string().optional(),
            durationMs: z.number().optional(),
            cost: z.number().optional(),
          })
        ),
        count: z.number(),
        nextCursor: z.string().optional(),
      },
    },
    async (args) => {
      const {
        limit = 100,
        agentId,
        eventType,
        since,
        until,
        allowedOnly,
        deniedOnly,
      } = args as {
        limit?: number;
        agentId?: string;
        eventType?: AuditEventType;
        since?: string;
        until?: string;
        allowedOnly?: boolean;
        deniedOnly?: boolean;
      };

      // Flush any pending events before reading
      await flushAuditBuffer();

      let entries: AuditLogEntry[] = [];

      // Read audit log file
      if (existsSync(auditLogPath)) {
        try {
          const content = await readFile(auditLogPath, 'utf-8');
          entries = content
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as AuditLogEntry);
        } catch (error) {
          console.error('Failed to read audit log:', error);
        }
      }

      // Apply filters
      let filtered = entries;

      if (agentId) {
        filtered = filtered.filter((e) => e.agentId === agentId);
      }
      if (eventType) {
        filtered = filtered.filter((e) => e.eventType === eventType);
      }
      if (since) {
        const sinceTime = new Date(since).getTime();
        filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= sinceTime);
      }
      if (until) {
        const untilTime = new Date(until).getTime();
        filtered = filtered.filter((e) => new Date(e.timestamp).getTime() <= untilTime);
      }
      if (allowedOnly) {
        filtered = filtered.filter((e) => e.allowed);
      }
      if (deniedOnly) {
        filtered = filtered.filter((e) => !e.allowed);
      }

      // Get last N entries
      const result = filtered.slice(-limit).map((e) => ({
        timestamp: e.timestamp,
        eventType: e.eventType,
        agentId: e.agentId,
        agentRole: e.agentRole,
        toolName: e.toolName,
        allowed: e.allowed,
        reason: e.reason,
        durationMs: e.durationMs,
        cost: e.cost,
      }));

      const output = {
        entries: result,
        count: result.length,
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
   * Get audit statistics
   */
  server.registerTool(
    'get_audit_stats',
    {
      title: 'Get Audit Statistics',
      description:
        'Get aggregate statistics from the audit log. Shows event counts, ' +
        'success/failure rates, top agents, and trends over time.',
      inputSchema: {
        since: z.string().optional().describe('ISO timestamp - analyze events after this time'),
        until: z.string().optional().describe('ISO timestamp - analyze events before this time'),
      },
      outputSchema: {
        period: z.object({
          start: z.string(),
          end: z.string(),
        }),
        totalEvents: z.number(),
        successRate: z.number(),
        failureRate: z.number(),
        eventsByType: z.record(z.number()),
        eventsByAgent: z.record(z.number()),
        violationCount: z.number(),
        topAgents: z.array(
          z.object({
            agentId: z.string(),
            eventCount: z.number(),
            successRate: z.number(),
          })
        ),
      },
    },
    async (args) => {
      const { since, until } = args as {
        since?: string;
        until?: string;
      };

      // Flush any pending events before reading
      await flushAuditBuffer();

      let entries: AuditLogEntry[] = [];

      // Read audit log file
      if (existsSync(auditLogPath)) {
        try {
          const content = await readFile(auditLogPath, 'utf-8');
          entries = content
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as AuditLogEntry);
        } catch (error) {
          console.error('Failed to read audit log:', error);
        }
      }

      // Apply time filters
      let filtered = entries;
      const now = new Date();
      let startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default: last 24 hours

      if (since) {
        startTime = new Date(since);
      }

      let endTime = now;
      if (until) {
        endTime = new Date(until);
      }

      filtered = filtered.filter(
        (e) =>
          new Date(e.timestamp).getTime() >= startTime.getTime() &&
          new Date(e.timestamp).getTime() <= endTime.getTime()
      );

      // Calculate stats
      const totalEvents = filtered.length;
      const allowedEvents = filtered.filter((e) => e.allowed).length;
      const deniedEvents = filtered.filter((e) => !e.allowed).length;

      // By event type
      const eventsByType: Record<string, number> = {};
      for (const event of filtered) {
        eventsByType[event.eventType] = (eventsByType[event.eventType] ?? 0) + 1;
      }

      // By agent
      const eventsByAgent: Record<string, { count: number; allowed: number }> = {};
      for (const event of filtered) {
        if (event.agentId) {
          eventsByAgent[event.agentId] ??= { count: 0, allowed: 0 };
          const agent = eventsByAgent[event.agentId];
          if (agent) {
            agent.count += 1;
            if (event.allowed) {
              agent.allowed += 1;
            }
          }
        }
      }

      // Violations
      const violationCount = filtered.filter(
        (e) => e.eventType === 'sandbox_violation' || (!e.allowed && e.eventType === 'tool_call')
      ).length;

      // Top agents
      const topAgents = Object.entries(eventsByAgent)
        .map(([agentId, stats]) => ({
          agentId,
          eventCount: stats.count,
          successRate: parseFloat(((stats.allowed / stats.count) * 100).toFixed(2)),
        }))
        .sort((a, b) => b.eventCount - a.eventCount)
        .slice(0, 5);

      const output = {
        period: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        },
        totalEvents,
        successRate: parseFloat(
          totalEvents > 0 ? ((allowedEvents / totalEvents) * 100).toFixed(2) : '0'
        ),
        failureRate: parseFloat(
          totalEvents > 0 ? ((deniedEvents / totalEvents) * 100).toFixed(2) : '0'
        ),
        eventsByType: eventsByType as Record<string, number>,
        eventsByAgent: Object.fromEntries(
          Object.entries(eventsByAgent).map(([id, stats]) => [id, stats.count])
        ),
        violationCount,
        topAgents,
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
   * Cleanup old audit logs based on retention policy
   */
  server.registerTool(
    'cleanup_audit_logs',
    {
      title: 'Cleanup Audit Logs',
      description:
        'Cleanup old audit log entries based on retention policy. ' +
        'Removes entries older than the configured retention period.',
      inputSchema: {
        retentionDays: z.number().optional().describe('Days to retain (default: 30)'),
        dryRun: z.boolean().optional().describe('Only show what would be deleted'),
      },
      outputSchema: {
        deleted: z.number(),
        remaining: z.number(),
        freed: z.string(),
      },
    },
    async (args) => {
      const { retentionDays = 30, dryRun = false } = args as {
        retentionDays?: number;
        dryRun?: boolean;
      };

      // Flush any pending events before processing
      await flushAuditBuffer();

      if (!existsSync(auditLogPath)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ deleted: 0, remaining: 0, freed: '0 bytes' }, null, 2),
            },
          ],
          structuredContent: { deleted: 0, remaining: 0, freed: '0 bytes' },
        };
      }

      try {
        const content = await readFile(auditLogPath, 'utf-8');
        const entries: AuditLogEntry[] = content
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as AuditLogEntry);

        const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
        const toDelete = entries.filter((e) => new Date(e.timestamp).getTime() < cutoffTime);
        const toKeep = entries.filter((e) => new Date(e.timestamp).getTime() >= cutoffTime);

        const oldSize = content.length;

        if (!dryRun && toDelete.length > 0) {
          const newContent = toKeep.map((e) => JSON.stringify(e)).join('\n') + '\n';
          await writeFile(auditLogPath, newContent);
        }

        const newContent = toKeep.map((e) => JSON.stringify(e)).join('\n') + '\n';
        const newSize = newContent.length;
        const freedBytes = oldSize - newSize;

        const output = {
          deleted: toDelete.length,
          remaining: toKeep.length,
          freed:
            freedBytes > 1024 * 1024
              ? `${(freedBytes / (1024 * 1024)).toFixed(2)} MB`
              : freedBytes > 1024
                ? `${(freedBytes / 1024).toFixed(2)} KB`
                : `${freedBytes} bytes`,
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
      } catch (error) {
        throw new Error(
          `Failed to cleanup audit logs: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
