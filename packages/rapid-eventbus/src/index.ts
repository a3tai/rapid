/**
 * RAPID Event Bus
 *
 * Inter-agent communication system for multi-agent development workflows.
 *
 * @packageDocumentation
 */

// Message types and schemas
export {
  MessageType,
  MessagePriority,
  MessageSchema,
  AgentInfoSchema,
  MessagePayloadSchema,
  MessageContextSchema,
  createMessage,
  getMessageIcon,
  formatMessageForDisplay,
  formatMessagesForInjection,
  MESSAGE_TYPE_ICONS,
  type Message,
  type AgentInfo,
  type MessagePayload,
  type MessageContext,
} from './messages.js';

// Event bus implementation
export {
  EventBus,
  InMemoryEventBus,
  createEventBus,
  type EventBusConfig,
  type MessageCursor,
} from './bus.js';

// Redis container management
export {
  hasDocker,
  getRedisStatus,
  startRedis,
  stopRedis,
  isRedisHealthy,
  getRedisUrl,
  type RedisContainerConfig,
  type RedisContainerStatus,
} from './redis-container.js';
