/**
 * @a3t/rapid-schema - Zod Schemas
 *
 * Zod validation schemas that match the TypeScript interfaces in index.ts.
 * These provide runtime validation across all RAPID packages.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

// ============================================================================
// TASK SCHEMAS (from rapid-mcp/tools/tasks.ts)
// ============================================================================

/**
 * Task status values
 */
export const TaskStatusSchema = z.enum([
  'pending',
  'pending_approval',
  'in_progress',
  'completed',
  'blocked',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Task priority levels
 */
export const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

/**
 * Full task schema with Phase 1 Task Assignment Protocol fields
 */
export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
  assignedTo: z.string().optional(),
  parentId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  // Phase 1: Task Assignment Protocol fields
  deadline: z.string().optional(),
  claimedAt: z.string().optional(),
  claimDeadline: z.string().optional(),
  lastProgressAt: z.string().optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  estimatedDuration: z.number().optional(),
  dependencies: z.array(z.string()).optional(),
  result: z.record(z.unknown()).optional(),
  errorCode: z.string().optional(),
  canRetry: z.boolean().optional(),
  attemptNumber: z.number().optional(),
  // Human-in-the-Loop Approval fields
  requiresApproval: z.boolean().optional(),
  approvalType: z.enum(['before_claim', 'before_commit', 'before_deploy']).optional(),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
  approvalReason: z.string().optional(),
});
export type Task = z.infer<typeof TaskSchema>;

// ============================================================================
// EVENT BUS MESSAGE SCHEMAS
// ============================================================================

/**
 * Message types for the event bus
 */
export const MessageTypeSchema = z.enum([
  'discovery',
  'error',
  'completion',
  'question',
  'learning',
  'coordination',
  'heartbeat',
  'approval_request',
  'approval_response',
  'system_command',
  'suggestion',
  'vote',
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

/**
 * Message priority levels
 */
export const MessagePrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type MessagePriority = z.infer<typeof MessagePrioritySchema>;

/**
 * Message context for additional metadata
 */
export const MessageContextSchema = z.object({
  file: z.string().optional(),
  line: z.number().optional(),
  function: z.string().optional(),
  code: z.string().optional(),
  error: z.string().optional(),
});
export type MessageContext = z.infer<typeof MessageContextSchema>;

/**
 * Event bus message schema
 */
export const BusMessageSchema = z.object({
  id: z.string(),
  type: MessageTypeSchema,
  agentId: z.string(),
  agentName: z.string(),
  worktree: z.string().optional(),
  title: z.string(),
  content: z.string(),
  priority: MessagePrioritySchema.optional(),
  actionable: z.boolean().optional(),
  toAgents: z.array(z.string()).optional(),
  context: MessageContextSchema.optional(),
  timestamp: z.string(),
});
export type BusMessage = z.infer<typeof BusMessageSchema>;

/**
 * Agent registration schema
 */
export const AgentRegistrationSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  worktree: z.string().optional(),
  session: z.string().optional(),
  projectId: z.string().optional(),
  registeredAt: z.string(),
  lastHeartbeat: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});
export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;

// ============================================================================
// KNOWLEDGE BASE SCHEMAS (from core/knowledge-base-schema.ts)
// ============================================================================

/**
 * Knowledge category taxonomy
 */
export const KnowledgeCategorySchema = z.enum([
  'architecture',
  'pattern',
  'bug',
  'convention',
  'optimization',
  'security',
  'dependency',
  'workflow',
  'decision',
  'discovery',
]);
export type KnowledgeCategory = z.infer<typeof KnowledgeCategorySchema>;

/**
 * Source of knowledge
 */
export const KnowledgeSourceSchema = z.object({
  type: z.enum(['agent', 'user', 'system', 'analysis']),
  identifier: z.string(),
  timestamp: z.string(),
  context: z.string().optional(),
});
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;

/**
 * Fact schema for knowledge base
 */
export const FactSchema = z.object({
  id: z.string(),
  category: KnowledgeCategorySchema,
  title: z.string(),
  description: z.string(),
  details: z.unknown(),
  confidence: z.number().min(0).max(1),
  source: KnowledgeSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().optional(),
  decayRate: z.number().optional(),
  tags: z.array(z.string()),
  relatedIds: z.array(z.string()),
  evidenceLinks: z.array(z.string()),
});
export type Fact = z.infer<typeof FactSchema>;

/**
 * Decision option schema
 */
export const DecisionOptionSchema = z.object({
  option: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});
export type DecisionOption = z.infer<typeof DecisionOptionSchema>;

/**
 * Decision record schema
 */
export const DecisionRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  context: z.string(),
  options: z.array(DecisionOptionSchema),
  chosenOption: z.string(),
  reasoning: z.string(),
  source: KnowledgeSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()),
  relatedFactIds: z.array(z.string()),
  status: z.enum(['active', 'superseded', 'reconsidered']),
  parentDecisionId: z.string().optional(),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

/**
 * Discovery record schema
 */
export const DiscoveryRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  pattern: z.string(),
  frequency: z.number(),
  impact: z.enum(['high', 'medium', 'low']),
  source: KnowledgeSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()),
  recommendations: z.array(z.string()),
  evidenceLinks: z.array(z.string()),
});
export type DiscoveryRecord = z.infer<typeof DiscoveryRecordSchema>;

/**
 * Version history entry schema
 */
export const VersionHistoryEntrySchema = z.object({
  versionId: z.string(),
  factId: z.string(),
  previousState: FactSchema.nullable(),
  newState: FactSchema,
  changeType: z.enum(['created', 'updated', 'confidence_adjusted', 'expired']),
  changeReason: z.string(),
  changedBy: KnowledgeSourceSchema,
  changedAt: z.string(),
});
export type VersionHistoryEntry = z.infer<typeof VersionHistoryEntrySchema>;

// ============================================================================
// PERSONA SCHEMAS (from schema/index.ts interfaces)
// ============================================================================

/**
 * Persona model options
 */
export const PersonaModelSchema = z.enum([
  'opus',
  'sonnet',
  'haiku',
  'gpt-4o',
  'gpt-4o-mini',
  'custom',
]);
export type PersonaModel = z.infer<typeof PersonaModelSchema>;

/**
 * Personality traits
 */
export const PersonalityTraitSchema = z.enum([
  'thorough',
  'concise',
  'cautious',
  'bold',
  'creative',
  'analytical',
  'friendly',
  'formal',
  'asks_clarifying_questions',
  'autonomous',
]);
export type PersonalityTrait = z.infer<typeof PersonalityTraitSchema>;

/**
 * Persona trigger events
 */
export const PersonaTriggerSchema = z.enum([
  'on_pr',
  'on_commit',
  'on_issue',
  'on_error',
  'on_request',
  'manual',
]);
export type PersonaTrigger = z.infer<typeof PersonaTriggerSchema>;

/**
 * Persona tools
 */
export const PersonaToolSchema = z.enum([
  'read',
  'write',
  'edit',
  'grep',
  'glob',
  'bash',
  'bus_send',
  'bus_messages',
  'bus_agents',
  'web_search',
  'web_fetch',
]);
export type PersonaTool = z.infer<typeof PersonaToolSchema>;

/**
 * Agent roles
 */
export const AgentRoleSchema = z.enum([
  'orchestrator',
  'worker',
  'designer',
  'reviewer',
  'devops',
  'admin',
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

/**
 * Audit event types
 */
export const AuditEventTypeSchema = z.enum([
  'tool_call',
  'approval_request',
  'approval_response',
  'secret_access',
  'sandbox_violation',
  'budget_alert',
  'agent_spawn',
  'agent_terminate',
]);
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

// ============================================================================
// CONTEXT ENGINE MEMORY TYPES
// ============================================================================

/**
 * Memory types for context engine
 */
export const MemoryTypeSchema = z.enum([
  'episodic',
  'semantic',
  'procedural',
  'decision_trace',
]);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

/**
 * Access scope for knowledge
 */
export const AccessScopeSchema = z.enum(['private', 'shared', 'public']);
export type AccessScope = z.infer<typeof AccessScopeSchema>;

/**
 * Context entry schema
 */
export const ContextEntrySchema = z.object({
  key: z.string(),
  value: z.unknown(),
  memoryType: MemoryTypeSchema,
  confidence: z.number().min(0).max(1),
  scope: AccessScopeSchema,
  agentId: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  relatedKeys: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  accessCount: z.number().optional(),
  sharedWith: z.array(z.string()).optional(),
});
export type ContextEntry = z.infer<typeof ContextEntrySchema>;

// ============================================================================
// METRICS SCHEMAS
// ============================================================================

/**
 * Metric event types
 */
export const MetricEventTypeSchema = z.enum([
  'task_created',
  'task_claimed',
  'task_claim_failed',
  'task_progress',
  'task_completed',
  'task_failed',
  'task_timeout',
]);
export type MetricEventType = z.infer<typeof MetricEventTypeSchema>;

/**
 * Metric event schema
 */
export const MetricEventSchema = z.object({
  type: MetricEventTypeSchema,
  taskId: z.string(),
  agentId: z.string().optional(),
  durationMs: z.number().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});
export type MetricEvent = z.infer<typeof MetricEventSchema>;

// ============================================================================
// SUGGESTION & VOTING SCHEMAS
// ============================================================================

/**
 * Suggestion categories
 */
export const SuggestionCategorySchema = z.enum([
  'feature',
  'fix',
  'improvement',
  'refactor',
  'docs',
]);
export type SuggestionCategory = z.infer<typeof SuggestionCategorySchema>;

/**
 * Suggestion status
 */
export const SuggestionStatusSchema = z.enum([
  'proposed',
  'voting',
  'approved',
  'rejected',
  'orchestrator_approved',
  'orchestrator_vetoed',
  'implemented',
]);
export type SuggestionStatus = z.infer<typeof SuggestionStatusSchema>;

/**
 * Vote types
 */
export const VoteTypeSchema = z.enum(['approve', 'reject', 'abstain']);
export type VoteType = z.infer<typeof VoteTypeSchema>;

/**
 * Vote schema
 */
export const VoteSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  vote: VoteTypeSchema,
  reason: z.string().optional(),
  timestamp: z.string(),
});
export type Vote = z.infer<typeof VoteSchema>;

/**
 * Suggestion schema
 */
export const SuggestionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: SuggestionCategorySchema,
  status: SuggestionStatusSchema,
  proposedBy: z.object({
    agentId: z.string(),
    agentName: z.string(),
  }),
  votes: z.array(VoteSchema),
  tags: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  decidedAt: z.string().optional(),
  orchestratorDecision: z.object({
    decision: z.enum(['approved', 'vetoed']),
    reason: z.string(),
  }).optional(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

// ============================================================================
// APPROVAL SCHEMAS
// ============================================================================

/**
 * Approval request status
 */
export const ApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'expired',
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/**
 * Approval request schema
 */
export const ApprovalRequestSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  toolName: z.string(),
  action: z.string(),
  parameters: z.record(z.unknown()).optional(),
  status: ApprovalStatusSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
  resolvedAt: z.string().optional(),
  resolvedBy: z.string().optional(),
  reason: z.string().optional(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
