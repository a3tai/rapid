# Phase 1: Task Assignment Protocol - Implementation Guide

## Overview

Phase 1 implements the core Task Assignment Protocol as designed, providing formal task lifecycle management with capability matching, deadline tracking, and timeout handling.

**Status**: ✅ Core Implementation Complete
**Tests**: All 173 tests passing
**Build**: All packages building successfully

---

## What's Implemented

### 1. Enhanced Task Schema (packages/rapid-mcp/src/tools/tasks.ts)

Extended task data model with Phase 1 fields:

```typescript
{
  // Existing fields
  id, title, description, status, priority, createdAt, updatedAt,
  createdBy, assignedTo, parentId, tags, metadata,

  // Phase 1 fields
  deadline: ISO8601,              // When task must complete
  claimedAt: ISO8601,             // When agent claimed task
  claimDeadline: ISO8601,         // 5-min timeout from claim
  lastProgressAt: ISO8601,        // When last progress was sent
  requiredCapabilities: string[], // Required agent capabilities
  estimatedDuration: number,      // Seconds to complete
  dependencies: string[],         // Task IDs blocking this
  result: Record,                 // Completion result data
  errorCode: string,              // Error on failure
  canRetry: boolean,              // Whether task can retry
  attemptNumber: number,          // Current attempt
}
```

### 2. Enhanced task_create Tool

**Input**:
- Standard: title, description, priority, assignedTo, parentId, tags, createdBy
- **New**: deadline, requiredCapabilities, estimatedDuration, dependencies

**Behavior**:
- Creates task with Phase 1 metadata
- Stores deadline for enforcement
- Tracks required capabilities for matching
- Initializes attemptNumber to 1

**Example**:
```json
{
  "title": "Implement authentication module",
  "description": "Add JWT-based auth to API",
  "priority": "high",
  "createdBy": "orchestrator-1",
  "deadline": "2026-01-22T10:00:00Z",
  "requiredCapabilities": ["read", "write", "bash"],
  "estimatedDuration": 3600
}
```

### 3. Enhanced task_claim Tool (Capability Matching)

**Input**:
- id, agentId
- **New**: agentName, agentCapabilities

**Validation**:
1. **Status check**: Task must be pending
2. **Capability match**: Agent must have ALL required capabilities
   - Returns error with missing capabilities if mismatch
   - Skips check if task has no capability requirements

**Behavior on Success**:
- Atomically transitions task to in_progress
- Sets claimedAt timestamp
- Calculates claimDeadline (5 minutes from now)
- Sets lastProgressAt to now
- Returns complete task object

**Timeout Fields Set**:
- `claimDeadline`: now + 5 minutes
- `lastProgressAt`: now
- Both used for timeout detection

**Example**:
```json
{
  "id": "task-123",
  "agentId": "claude-agent-1",
  "agentName": "Claude Developer",
  "agentCapabilities": ["read", "write", "bash", "test"]
}
```

**Response on Capability Mismatch**:
```json
{
  "claimed": false,
  "error": "Agent missing required capabilities: bash, docker"
}
```

### 4. New task_progress Tool

**Purpose**: Track ongoing work on claimed tasks

**Input**:
- id, progress (0.0-1.0), message, agentId

**Behavior**:
- Updates lastProgressAt to now
- Stores progress percentage in metadata
- Stores optional progress message
- Only works on in_progress tasks

**Effect on Timeouts**:
- Resets progress timeout clock
- Claim timeout still active (5-min window from claim)

**Example**:
```json
{
  "id": "task-123",
  "progress": 0.45,
  "message": "Completed auth module, now working on tests",
  "agentId": "claude-agent-1"
}
```

### 5. New task_complete Tool

**Purpose**: Mark task successfully completed

**Input**:
- id, summary, result, agentId

**Behavior**:
- Sets status to completed
- Stores optional result data
- Records completion summary in metadata
- Task can now be used to unblock dependencies

**Example**:
```json
{
  "id": "task-123",
  "summary": "Authentication module implemented and tested",
  "result": {
    "filesChanged": 5,
    "testsAdded": 12,
    "testsPassed": 12
  },
  "agentId": "claude-agent-1"
}
```

### 6. New task_fail Tool

**Purpose**: Mark task as failed with retry capability

**Input**:
- id, error, errorCode, canRetry, agentId

**Behavior**:
- Sets status back to pending (for retry)
- Clears assignedTo and claim fields
- Increments attemptNumber
- Stores error in metadata
- Sets canRetry flag for orchestrator

**Effect**:
- Task becomes available for another agent to claim
- Orchestrator can enforce max retries

**Example**:
```json
{
  "id": "task-123",
  "error": "Database connection failed during testing",
  "errorCode": "DB_CONN_TIMEOUT",
  "canRetry": true,
  "agentId": "claude-agent-1"
}
```

### 7. New task_detect_timeouts Tool

**Purpose**: Detect and release timed-out tasks

**Input**:
- progressTimeoutSeconds (default: 60)
- claimTimeoutSeconds (default: 300)

**Timeouts Detected**:

1. **Claim Timeout** (5 minutes):
   - Task was claimed but agent never sent progress
   - Indicates agent may be hung after claiming
   - Action: Release task back to pending

2. **Progress Timeout** (60 seconds):
   - Task has no progress update for N seconds
   - Indicates agent may be stalled
   - Action: Release task back to pending

**Behavior**:
- Scans all in_progress tasks
- Releases timed-out tasks to pending
- Clears agent assignment
- Stores timeout reason in metadata
- Returns list of released tasks

**Example Response**:
```json
{
  "timedOut": [
    {
      "taskId": "task-123",
      "reason": "claim_timeout",
      "wasAssignedTo": "claude-agent-1"
    },
    {
      "taskId": "task-456",
      "reason": "progress_timeout_90s",
      "wasAssignedTo": "opencode-agent-2"
    }
  ],
  "count": 2
}
```

---

## MCP Tools Summary

| Tool | Status | Phase 1 Feature |
|------|--------|-----------------|
| task_create | Enhanced | Deadline, capabilities, dependencies |
| task_claim | Enhanced | Capability matching, timeout tracking |
| task_progress | **NEW** | Progress updates, timeout reset |
| task_complete | Enhanced | Result storage, completion tracking |
| task_fail | **NEW** | Error tracking, retry support |
| task_detect_timeouts | **NEW** | Timeout detection and release |
| task_list | Unchanged | Filter by status, priority |
| task_update | Unchanged | Update task fields |
| task_get | Unchanged | Retrieve task details |
| task_delete | Unchanged | Remove task |

---

## Timeout Handling Strategy

### Timeline for Task Lifecycle

```
T+0:   Task created with optional deadline
T+1:   Agent discovers task and claims it
       → claimDeadline = T+1 + 5 minutes
       → lastProgressAt = T+1

T+2:   Agent sends progress update
       → lastProgressAt = T+2
       → Resets progress timeout

T+3:   (No updates from agent for 60+ seconds)
       → Orchestrator calls task_detect_timeouts
       → Finds progressTimeoutSeconds exceeded
       → Releases task back to pending

T+10:  Another agent claims task
       → Repeat cycle
```

### Timeout Configuration

**Default Values** (configurable):
- Claim timeout: 5 minutes
- Progress timeout: 60 seconds
- Check interval: Orchestrator determines poll frequency

**Rationale**:
- Claim timeout: Allows agent time to start processing after claiming
- Progress timeout: Ensures stalled agents don't block indefinitely
- Check interval: Trade-off between responsiveness and overhead

---

## Capability Matching Algorithm

### Matching Logic

```
FOR each task that's available (status = pending):
  IF task.requiredCapabilities is defined:
    IF agent.capabilities contains ALL items in task.requiredCapabilities:
      → Allow claim
    ELSE:
      → Reject claim with missing capabilities
  ELSE:
    → Allow claim (no capabilities required)
```

### Examples

**Task 1**: "Implement API endpoint"
- requiredCapabilities: ["read", "write", "bash"]
- Agent has ["read", "write", "bash", "test"] ✅ **Can claim**

**Task 2**: "Deploy to production"
- requiredCapabilities: ["kubernetes", "terraform"]
- Agent has ["read", "write", "bash"] ❌ **Cannot claim**
- Error: "Agent missing required capabilities: kubernetes, terraform"

---

## Integration Points

### Event Bus Integration

While Phase 1 core uses direct MCP tool calls, the architecture is designed for future event bus integration:

- task_claimed → Could broadcast "task_claimed" event
- task_progress → Could broadcast "task_progress" event
- task_detect_timeouts → Uses direct detection (Phase 2: event-driven)

### CLI Integration (Future)

Planned CLI commands for Phase 1:
```bash
rapid task create --title "..." --deadline "..." --capabilities "[read,write]"
rapid task claim <task-id>
rapid task progress <task-id> --progress 0.5 --message "..."
rapid task complete <task-id>
rapid task list --status in_progress
```

### Configuration Integration

rapid.json additions (Phase 2):
```json
{
  "task": {
    "defaultDeadline": 3600,
    "claimTimeout": 300,
    "progressCheckInterval": 60,
    "maxRetries": 3
  }
}
```

---

## Testing Phase 1

### Test Scenarios Implemented (Ready for QA)

**Happy Path**:
1. Create task with capabilities
2. Agent with matching capabilities claims task
3. Agent sends progress updates (resets timeout)
4. Agent completes task
5. New agent claims completed task's dependency

**Capability Mismatch**:
1. Create task requiring [bash, docker]
2. Agent with [read, write] tries to claim
3. Returns error with missing capabilities
4. Task remains available for other agents

**Timeout Detection**:
1. Create task with 60s progress timeout
2. Agent claims task
3. Wait 70 seconds without progress update
4. Run task_detect_timeouts
5. Task released back to pending
6. Another agent can claim

**Retry Scenario**:
1. Agent claims task
2. Agent fails with recoverable error
3. task_fail called with canRetry=true
4. Task status becomes pending
5. Another agent can claim and retry

---

## Known Limitations (Phase 1)

1. **No Event Bus Broadcasting**: Uses direct MCP tool calls
   - Improvement in Phase 2

2. **No Dependency Resolution**: Dependencies stored but not enforced
   - Improvement in Phase 4

3. **Timeout Check is Pull-Based**: Orchestrator must call task_detect_timeouts
   - Should be event-driven in Phase 2

4. **No Distributed Locking**: Relies on atomic task status updates
   - Sufficient for single Redis instance

5. **No Performance Metrics**: Core protocol doesn't collect metrics
   - Phase 3 will add metrics

---

## Performance Characteristics

**Task Creation**: O(1)
**Task Claim**: O(1) - Capability matching is linear in number of capabilities (typically 3-5)
**Task Progress**: O(1)
**Timeout Detection**: O(n) where n = number of in_progress tasks

**Scalability Notes**:
- Timeout detection scales linearly with number of in-progress tasks
- For 1000s of concurrent tasks, would benefit from index on status
- Future optimization: Move to event-driven timeout handling

---

## Success Metrics for Phase 1

### Implementation Complete ✅
- [x] Enhanced task schema with Phase 1 fields
- [x] Capability matching algorithm implemented
- [x] Timeout detection and release working
- [x] All MCP tools operational
- [x] All 173 tests passing

### Integration Ready ✅
- [x] Backward compatible (old tasks still work)
- [x] No breaking changes to existing tools
- [x] Data model extensible for Phase 2/3

### Ready for Testing
- [ ] QA validates capability matching
- [ ] QA validates timeout detection
- [ ] QA validates task retry logic
- [ ] Performance testing with 100+ concurrent tasks

---

## Next Steps

### Phase 2: Capability Matching Enhancements
- Add capability registry
- Implement matching algorithms
- Add capability declaration mechanism

### Phase 3: Agent Lifecycle Integration
- Health monitoring for agents
- Graceful shutdown
- Diagnostic capabilities

### Phase 4: Advanced Features
- Dependency graph resolution
- Parallel task execution
- Complex orchestration patterns

---

## Developer Guide

### Using Phase 1 in Your Orchestrator

**1. Create a task**:
```typescript
const task = await client.call('task_create', {
  title: 'Process data',
  requiredCapabilities: ['read', 'write'],
  deadline: new Date(Date.now() + 1 hour).toISOString(),
  createdBy: 'orchestrator-1'
});
```

**2. Agent claims task**:
```typescript
const claimed = await client.call('task_claim', {
  id: task.id,
  agentId: 'agent-1',
  agentCapabilities: ['read', 'write', 'bash']
});
```

**3. Agent sends progress**:
```typescript
await client.call('task_progress', {
  id: task.id,
  progress: 0.5,
  message: 'Half way done'
});
```

**4. Agent completes task**:
```typescript
await client.call('task_complete', {
  id: task.id,
  summary: 'Completed successfully',
  result: { itemsProcessed: 1000 }
});
```

**5. Orchestrator detects timeouts**:
```typescript
const timedOut = await client.call('task_detect_timeouts', {
  progressTimeoutSeconds: 60
});
// Release timed-out tasks back to pending
```

---

**Implementation Date**: 2026-01-20
**Status**: Core Phase 1 Complete, Ready for Integration Testing
