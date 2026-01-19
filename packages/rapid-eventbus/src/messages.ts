/**
 * Message Types and Schemas for Inter-Agent Communication
 *
 * Defines the structure of messages exchanged between agents via the event bus.
 */

import { z } from 'zod';

/**
 * Message types for different kinds of inter-agent communication
 */
export const MessageType = z.enum([
  'discovery', // Found something useful (patterns, files, APIs)
  'error', // Hit an error that others should know about
  'completion', // Finished a task
  'question', // Asking for input/decision
  'learning', // Sharing a tip/pattern learned
  'coordination', // Claiming a resource/file to avoid conflicts
  'heartbeat', // I'm alive signal
]);

export type MessageType = z.infer<typeof MessageType>;

/**
 * Priority levels for messages
 */
export const MessagePriority = z.enum(['low', 'normal', 'high', 'urgent']);

export type MessagePriority = z.infer<typeof MessagePriority>;

/**
 * Agent identity information
 */
export const AgentInfoSchema = z.object({
  id: z.string().describe('Unique agent identifier'),
  name: z.string().describe('Agent name (e.g., "claude", "opencode", "aider")'),
  worktree: z.string().optional().describe('Git worktree or branch the agent is working in'),
  session: z.string().optional().describe('Session identifier'),
});

export type AgentInfo = z.infer<typeof AgentInfoSchema>;

/**
 * Context information for a message
 */
export const MessageContextSchema = z.object({
  file: z.string().optional().describe('File path related to the message'),
  line: z.number().optional().describe('Line number in the file'),
  function: z.string().optional().describe('Function or method name'),
  error: z.string().optional().describe('Error message if applicable'),
  code: z.string().optional().describe('Code snippet'),
});

export type MessageContext = z.infer<typeof MessageContextSchema>;

/**
 * Message payload
 */
export const MessagePayloadSchema = z.object({
  title: z.string().describe('Short summary of the message'),
  content: z.string().describe('Detailed message content'),
  context: MessageContextSchema.optional().describe('Additional context'),
  actionable: z.boolean().default(false).describe('Whether this message requires action'),
  ttl: z.number().optional().describe('Time to live in seconds'),
});

export type MessagePayload = z.infer<typeof MessagePayloadSchema>;

/**
 * Complete message schema
 */
export const MessageSchema = z.object({
  id: z.string().uuid().describe('Unique message identifier'),
  timestamp: z.string().datetime().describe('ISO 8601 timestamp'),
  type: MessageType,
  fromAgent: AgentInfoSchema,
  toAgents: z.array(z.string()).optional().describe('Target agent IDs (null = broadcast)'),
  priority: MessagePriority.default('normal'),
  payload: MessagePayloadSchema,
});

export type Message = z.infer<typeof MessageSchema>;

/**
 * Create a new message
 */
export function createMessage(
  type: MessageType,
  fromAgent: AgentInfo,
  payload: Omit<MessagePayload, 'actionable'> & { actionable?: boolean },
  options?: {
    toAgents?: string[];
    priority?: MessagePriority;
  }
): Message {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    fromAgent,
    toAgents: options?.toAgents,
    priority: options?.priority ?? 'normal',
    payload: {
      ...payload,
      actionable: payload.actionable ?? false,
    },
  };
}

/**
 * Message type icons for display
 */
export const MESSAGE_TYPE_ICONS: Record<MessageType, string> = {
  discovery: '💡',
  error: '❌',
  completion: '✅',
  question: '❓',
  learning: '📚',
  coordination: '🔒',
  heartbeat: '💓',
};

/**
 * Get icon for a message type
 */
export function getMessageIcon(type: MessageType): string {
  return MESSAGE_TYPE_ICONS[type] || '📨';
}

/**
 * Format a message for display
 */
export function formatMessageForDisplay(message: Message): string {
  const icon = getMessageIcon(message.type);
  const timeAgo = getRelativeTime(new Date(message.timestamp));
  const from = message.fromAgent.worktree
    ? `${message.fromAgent.name} (${message.fromAgent.worktree})`
    : message.fromAgent.name;

  return `${icon} ${message.type.toUpperCase()}: ${message.payload.title}
   From: ${from} | ${timeAgo}
   ${message.payload.content}`;
}

/**
 * Get relative time string
 */
function getRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Format messages for injection into agent context
 */
export function formatMessagesForInjection(messages: Message[]): string {
  if (messages.length === 0) {
    return '';
  }

  let content = '## Messages from Other Agents\n\n';

  for (const msg of messages) {
    const icon = getMessageIcon(msg.type);
    const from = msg.fromAgent.worktree
      ? `${msg.fromAgent.name} (${msg.fromAgent.worktree})`
      : msg.fromAgent.name;
    const timeAgo = getRelativeTime(new Date(msg.timestamp));

    content += `<agent-message type="${msg.type}" from="${from}" priority="${msg.priority}" time="${timeAgo}">\n`;
    content += `### ${icon} ${msg.payload.title}\n`;
    content += `${msg.payload.content}\n`;

    if (msg.payload.context) {
      if (msg.payload.context.file) {
        content += `\nFile: \`${msg.payload.context.file}\``;
        if (msg.payload.context.line) {
          content += `:${msg.payload.context.line}`;
        }
        content += '\n';
      }
      if (msg.payload.context.error) {
        content += `\nError: ${msg.payload.context.error}\n`;
      }
    }

    content += `</agent-message>\n\n`;
  }

  return content;
}
