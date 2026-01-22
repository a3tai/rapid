# Migration Guide: Using Consolidated Zod Schemas

This guide explains how to migrate from local Zod schema definitions to the centralized schemas in `@a3t/rapid-schema`.

## Overview

The `@a3t/rapid-schema` package now exports Zod validation schemas alongside TypeScript interfaces. This provides:

- **Single source of truth** for type definitions and runtime validation
- **Runtime validation** available across all RAPID packages
- **OpenAPI/JSON Schema generation** potential for documentation

## Available Schemas

### Task Management
```typescript
import {
  TaskSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
  type Task,
  type TaskStatus,
  type TaskPriority,
} from '@a3t/rapid-schema';
```

### Event Bus
```typescript
import {
  BusMessageSchema,
  MessageTypeSchema,
  MessagePrioritySchema,
  MessageContextSchema,
  AgentRegistrationSchema,
  type BusMessage,
  type MessageType,
} from '@a3t/rapid-schema';
```

### Knowledge Base
```typescript
import {
  FactSchema,
  DecisionRecordSchema,
  DiscoveryRecordSchema,
  KnowledgeCategorySchema,
  KnowledgeSourceSchema,
  VersionHistoryEntrySchema,
  type Fact,
  type DecisionRecord,
  type DiscoveryRecord,
} from '@a3t/rapid-schema';
```

### Context Engine
```typescript
import {
  ContextEntrySchema,
  MemoryTypeSchema,
  AccessScopeSchema,
  type ContextEntry,
  type MemoryType,
} from '@a3t/rapid-schema';
```

### Personas & Security
```typescript
import {
  PersonaModelSchema,
  PersonalityTraitSchema,
  PersonaTriggerSchema,
  PersonaToolSchema,
  AgentRoleSchema,
  AuditEventTypeSchema,
} from '@a3t/rapid-schema';
```

### Metrics
```typescript
import {
  MetricEventSchema,
  MetricEventTypeSchema,
  type MetricEvent,
} from '@a3t/rapid-schema';
```

### Suggestions & Voting
```typescript
import {
  SuggestionSchema,
  SuggestionCategorySchema,
  SuggestionStatusSchema,
  VoteSchema,
  VoteTypeSchema,
} from '@a3t/rapid-schema';
```

### Approvals
```typescript
import {
  ApprovalRequestSchema,
  ApprovalStatusSchema,
} from '@a3t/rapid-schema';
```

## Migration Steps

### Step 1: Add Dependency

Ensure your package has `@a3t/rapid-schema` as a dependency (it should already be there for most RAPID packages).

### Step 2: Replace Local Schemas

**Before (rapid-mcp/tools/tasks.ts):**
```typescript
import { z } from 'zod';

export const TaskStatusSchema = z.enum([...]);
export const TaskSchema = z.object({...});
```

**After:**
```typescript
import { TaskStatusSchema, TaskSchema, type Task } from '@a3t/rapid-schema';

// Use directly - no local definition needed
```

### Step 3: Update Imports in Consuming Code

**Before:**
```typescript
import { TaskSchema, type Task } from './tasks.js';
```

**After:**
```typescript
import { TaskSchema, type Task } from '@a3t/rapid-schema';
```

## Non-Breaking Migration

This is designed as a **non-breaking refactor**:

1. **Existing interfaces remain unchanged** - The TypeScript interfaces in `index.ts` are preserved
2. **Schemas are additive** - New Zod schemas are exported alongside existing types
3. **Gradual migration** - Packages can migrate one at a time

## Benefits After Migration

1. **Consistency** - All packages use identical validation logic
2. **Maintainability** - Schema changes happen in one place
3. **Type Safety** - `z.infer<typeof Schema>` provides accurate types
4. **Validation** - Runtime validation with detailed error messages
5. **Documentation** - Schemas can generate OpenAPI specs

## Example: Validating a Task

```typescript
import { TaskSchema, type Task } from '@a3t/rapid-schema';

function processTask(data: unknown): Task {
  // This throws ZodError if validation fails
  const task = TaskSchema.parse(data);
  return task;
}

// Or with safe parsing
function processTaskSafe(data: unknown): Task | null {
  const result = TaskSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.error('Validation failed:', result.error.issues);
  return null;
}
```
