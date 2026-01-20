# Error Handling Patterns for RAPID Agents

Comprehensive guide for handling errors, failures, and edge cases in multi-agent workflows.

## Overview

In a multi-agent system, errors can occur at any layer: network communication, task execution, resource conflicts, or agent failures. This guide provides patterns and best practices for building resilient agents that handle errors gracefully and recover automatically when possible.

## Core Principles

1. **Fail Fast, Report Early** - Detect errors immediately and communicate via event bus
2. **Graceful Degradation** - Continue operating with reduced functionality when possible
3. **Automatic Recovery** - Retry transient errors with exponential backoff
4. **Human Escalation** - Involve humans for critical decisions or persistent failures
5. **Observable Failures** - Log all errors with context for debugging
6. **Idempotent Operations** - Design operations to be safely retried

## Error Categories

### 1. Transient Errors (Retry Automatically)

- Network timeouts
- Redis connection drops
- Rate limiting (429 errors)
- Temporary file locks

### 2. Permanent Errors (Fail and Report)

- Invalid configuration
- Missing required files
- Permission denied
- Syntax errors in code

### 3. Resource Errors (Wait and Retry)

- Out of memory
- Disk full
- CPU throttling
- Git merge conflicts

### 4. Coordination Errors (Escalate)

- Task assignment conflicts
- Capability mismatches
- Circular dependencies
- Deadlocks

---

## Pattern 1: Error Detection and Reporting

### Basic Error Reporting

```typescript
try {
  await performRiskyOperation();
} catch (error) {
  // Report error to event bus immediately
  await bus_send({
    type: 'error',
    agentId: myAgentId,
    agentName: 'claude-worker',
    title: 'Operation failed: performRiskyOperation',
    content: `Error: ${error.message}\n\nStack trace:\n${error.stack}`,
    priority: 'high',
    actionable: true,
    context: {
      operation: 'performRiskyOperation',
      errorType: error.constructor.name,
      recoverable: isRecoverable(error),
      attemptNumber: 1,
    },
  });

  // Decide: retry, escalate, or abort
  if (isTransient(error)) {
    await retryWithBackoff();
  } else {
    throw error; // Let orchestrator handle
  }
}
```

### Error Classification Helper

```typescript
function classifyError(error: Error): ErrorCategory {
  // Network errors - transient
  if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
    return { type: 'transient', retryable: true };
  }

  // Permission errors - permanent
  if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
    return { type: 'permanent', retryable: false };
  }

  // Resource errors - wait and retry
  if (error.message.includes('EMFILE') || error.message.includes('out of memory')) {
    return { type: 'resource', retryable: true, waitTime: 30000 };
  }

  // Unknown - treat as permanent
  return { type: 'unknown', retryable: false };
}
```

---

## Pattern 2: Retry with Exponential Backoff

### Standard Retry Pattern

```typescript
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    onRetry?: (attempt: number, error: Error) => void;
  }
): Promise<T> {
  const { maxRetries, initialDelay, maxDelay, onRetry } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error; // Final attempt failed
      }

      // Calculate exponential backoff: 1s, 2s, 4s, 8s, ...
      const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);

      // Notify about retry
      if (onRetry) {
        onRetry(attempt, error as Error);
      }

      await sleep(delay);
    }
  }

  throw new Error('Retry logic error'); // Should never reach
}

// Usage
const result = await retryWithBackoff(() => fetchFromAPI('/endpoint'), {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  onRetry: (attempt, error) => {
    console.log(`Retry attempt ${attempt} after error: ${error.message}`);
  },
});
```

### Task-Level Retry Pattern

```typescript
async function executeTaskWithRetry(task: Task) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Mark task as in_progress
      await task_update(task.id, { status: 'in_progress' });

      // Execute task
      const result = await executeTask(task);

      // Mark as completed
      await task_complete(task.id, result);

      // Report success
      await bus_send({
        type: 'completion',
        title: `Task ${task.id} completed`,
        content: `Successfully completed after ${attempt} attempt(s)`,
      });

      return result;
    } catch (error) {
      console.error(`Task attempt ${attempt}/${maxAttempts} failed:`, error);

      if (attempt < maxAttempts) {
        // Report retry
        await bus_send({
          type: 'error',
          title: `Task ${task.id} failed, retrying`,
          content: `Attempt ${attempt} failed: ${error.message}. Retrying...`,
          priority: 'normal',
        });

        await sleep(2000 * attempt); // Increasing delay
      } else {
        // Final failure - escalate
        await bus_send({
          type: 'error',
          title: `Task ${task.id} failed permanently`,
          content: `All ${maxAttempts} attempts failed. Last error: ${error.message}`,
          priority: 'high',
          actionable: true,
        });

        await task_update(task.id, { status: 'failed' });
        throw error;
      }
    }
  }
}
```

---

## Pattern 3: Event Bus Failures

### Handling Redis Connection Loss

```typescript
class ResilientEventBusClient {
  private bus: EventBus | InMemoryEventBus | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  async ensureConnected(): Promise<EventBus | InMemoryEventBus> {
    if (this.bus && (await this.bus.isHealthy())) {
      return this.bus;
    }

    // Connection lost or not established
    console.warn('[event-bus] Connection lost, attempting reconnect...');

    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      try {
        this.bus = await connectToEventBus();
        this.reconnectAttempts = 0;
        console.log('[event-bus] Reconnected successfully');
        return this.bus;
      } catch (error) {
        this.reconnectAttempts++;
        console.error(`[event-bus] Reconnect attempt ${this.reconnectAttempts} failed:`, error);

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('[event-bus] Max reconnect attempts reached, falling back to in-memory');
          this.bus = new InMemoryEventBus();
          return this.bus;
        }

        await sleep(5000 * this.reconnectAttempts);
      }
    }

    throw new Error('Failed to connect to event bus');
  }

  async send(message: Message): Promise<void> {
    const bus = await this.ensureConnected();
    return bus.send(message);
  }
}
```

### Message Send with Fallback

```typescript
async function sendMessageReliably(message: Message): Promise<boolean> {
  try {
    await bus_send(message);
    return true;
  } catch (error) {
    console.error('[bus] Failed to send message, saving to queue:', error);

    // Save to local queue for retry
    await saveToRetryQueue(message);

    // Try again after delay
    setTimeout(async () => {
      try {
        await bus_send(message);
        await removeFromRetryQueue(message.id);
      } catch (retryError) {
        console.error('[bus] Retry also failed:', retryError);
      }
    }, 10000);

    return false;
  }
}
```

---

## Pattern 4: Task Assignment Failures

### Handling Task Claim Conflicts

```typescript
async function claimTaskSafely(taskId: string, agentId: string): Promise<boolean> {
  try {
    const result = await task_claim(taskId, agentId);

    if (result.claimed) {
      return true;
    }

    // Task already claimed by another agent
    console.log(`Task ${taskId} already claimed by ${result.task.assignedTo}`);

    // Report to orchestrator
    await bus_send({
      type: 'coordination',
      title: 'Task claim conflict',
      content: `Agent ${agentId} attempted to claim task ${taskId} but it was already assigned to ${result.task.assignedTo}`,
      priority: 'low',
    });

    return false;
  } catch (error) {
    console.error(`Failed to claim task ${taskId}:`, error);

    // Check if task still exists
    const taskExists = await task_list({ id: taskId });

    if (taskExists.count === 0) {
      console.log(`Task ${taskId} no longer exists (may have been completed)`);
      return false;
    }

    // Retry once after brief delay
    await sleep(1000);

    try {
      const retryResult = await task_claim(taskId, agentId);
      return retryResult.claimed;
    } catch (retryError) {
      console.error('Task claim retry failed:', retryError);
      return false;
    }
  }
}
```

### Capability Mismatch Handling

```typescript
async function findSuitableTask(agentCapabilities: string[]): Promise<Task | null> {
  const pendingTasks = await task_list({ status: 'pending' });

  for (const task of pendingTasks.tasks) {
    // Check if agent has required capabilities
    const requiredCapabilities = task.tags || [];
    const hasCapabilities = requiredCapabilities.every((cap) => agentCapabilities.includes(cap));

    if (hasCapabilities) {
      const claimed = await claimTaskSafely(task.id, myAgentId);
      if (claimed) {
        return task;
      }
    } else {
      // Report capability gap once
      await bus_send({
        type: 'coordination',
        title: 'Capability mismatch',
        content: `Task ${task.id} requires ${requiredCapabilities.join(', ')} but agent only has ${agentCapabilities.join(', ')}`,
        priority: 'low',
        actionable: false,
      });
    }
  }

  return null;
}
```

---

## Pattern 5: Timeout Detection and Recovery

### Operation-Level Timeout

```typescript
async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Operation timed out after ${timeoutMs}ms: ${operationName}`)),
      timeoutMs
    )
  );

  try {
    return await Promise.race([operation, timeoutPromise]);
  } catch (error) {
    // Report timeout
    await bus_send({
      type: 'error',
      title: `Timeout: ${operationName}`,
      content: `Operation exceeded ${timeoutMs}ms timeout`,
      priority: 'high',
    });

    throw error;
  }
}

// Usage
try {
  const result = await withTimeout(
    performLongRunningTask(),
    30000, // 30 seconds
    'performLongRunningTask'
  );
} catch (error) {
  console.error('Task timed out:', error);
}
```

### Agent Heartbeat Monitoring

```typescript
class AgentHealthMonitor {
  private lastHeartbeat: Map<string, number> = new Map();
  private heartbeatInterval = 30000; // 30 seconds
  private timeoutThreshold = 90000; // 90 seconds (3 missed heartbeats)

  recordHeartbeat(agentId: string) {
    this.lastHeartbeat.set(agentId, Date.now());
  }

  isAgentHealthy(agentId: string): boolean {
    const lastSeen = this.lastHeartbeat.get(agentId);
    if (!lastSeen) return false;

    const timeSinceLastHeartbeat = Date.now() - lastSeen;
    return timeSinceLastHeartbeat < this.timeoutThreshold;
  }

  async checkAllAgents() {
    const agents = await bus_agents();

    for (const agent of agents) {
      if (!this.isAgentHealthy(agent.id)) {
        // Agent appears unhealthy
        await bus_send({
          type: 'error',
          title: `Agent ${agent.name} appears unresponsive`,
          content: `No heartbeat received in ${this.timeoutThreshold}ms`,
          priority: 'high',
          actionable: true,
          context: {
            agentId: agent.id,
            agentName: agent.name,
            lastSeen: this.lastHeartbeat.get(agent.id),
          },
        });

        // Consider reassigning agent's tasks
        await this.reassignAgentTasks(agent.id);
      }
    }
  }

  async reassignAgentTasks(unhealthyAgentId: string) {
    const tasks = await task_list({
      assignedTo: unhealthyAgentId,
      status: 'in_progress',
    });

    for (const task of tasks.tasks) {
      // Reset task to pending for reassignment
      await task_update(task.id, {
        status: 'pending',
        assignedTo: null,
      });

      await bus_send({
        type: 'coordination',
        title: 'Task reassigned due to agent failure',
        content: `Task ${task.id} was reassigned after agent ${unhealthyAgentId} became unresponsive`,
        priority: 'high',
      });
    }
  }
}
```

---

## Pattern 6: Resource Conflicts

### Git Merge Conflict Resolution

```typescript
async function handleMergeConflict(branch: string): Promise<void> {
  console.error(`Merge conflict detected on branch ${branch}`);

  // Report conflict to orchestrator
  await bus_send({
    type: 'error',
    title: 'Git merge conflict detected',
    content: `Merge conflict on branch ${branch}. Human intervention may be required.`,
    priority: 'high',
    actionable: true,
    context: {
      branch,
      conflictType: 'git-merge',
      worktree: process.cwd(),
    },
  });

  // Attempt automatic resolution for simple conflicts
  try {
    const conflictFiles = await getConflictFiles();

    if (conflictFiles.every((f) => isAutoResolvable(f))) {
      console.log('Attempting automatic conflict resolution...');
      await autoResolveConflicts(conflictFiles);

      await bus_send({
        type: 'completion',
        title: 'Merge conflict auto-resolved',
        content: `Successfully resolved conflicts in ${conflictFiles.join(', ')}`,
        priority: 'normal',
      });
    } else {
      // Escalate to human
      await requestHumanIntervention('merge-conflict', {
        branch,
        files: conflictFiles,
      });
    }
  } catch (error) {
    console.error('Auto-resolution failed:', error);
    await requestHumanIntervention('merge-conflict', {
      branch,
      error: error.message,
    });
  }
}
```

### File Lock Conflicts

```typescript
async function acquireFileLock(filePath: string, agentId: string): Promise<boolean> {
  try {
    // Send coordination message to claim file
    await bus_send({
      type: 'coordination',
      title: `Acquiring lock: ${filePath}`,
      content: `Agent ${agentId} is requesting exclusive access to ${filePath}`,
      priority: 'normal',
      actionable: false,
      context: {
        lockType: 'file',
        resource: filePath,
        agentId,
      },
    });

    // Check if another agent already has the lock
    const recentMessages = await bus_messages({
      types: ['coordination'],
      limit: 50,
    });

    const existingLock = recentMessages.find(
      (msg) =>
        msg.payload.context?.lockType === 'file' &&
        msg.payload.context?.resource === filePath &&
        msg.fromAgent.id !== agentId &&
        isLockStillActive(msg.timestamp)
    );

    if (existingLock) {
      console.log(`File ${filePath} is locked by ${existingLock.fromAgent.name}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to acquire file lock:', error);
    return false;
  }
}

function isLockStillActive(lockTimestamp: string): boolean {
  const lockAge = Date.now() - new Date(lockTimestamp).getTime();
  const lockTimeout = 300000; // 5 minutes
  return lockAge < lockTimeout;
}
```

---

## Pattern 7: Escalation to Humans

### Human Intervention Request

```typescript
async function requestHumanIntervention(
  issue: string,
  context: Record<string, unknown>
): Promise<void> {
  // Use approval_request for critical decisions
  await bus_send({
    type: 'approval_request',
    agentId: myAgentId,
    agentName: 'claude-worker',
    title: `Human intervention needed: ${issue}`,
    content: `Agent encountered an issue that requires human decision-making`,
    priority: 'urgent',
    actionable: true,
    payload: {
      request_id: `human-${Date.now()}`,
      action: issue,
      risk_level: 'high',
      context,
      timeout_seconds: 1800, // 30 minutes
    },
  });

  // Wait for human response
  const response = await waitForApprovalResponse(`human-${Date.now()}`);

  if (response.decision === 'approved') {
    // Proceed with suggested action
    console.log('Human approved action:', response.reason);
  } else {
    // Abort or take alternative action
    console.log('Human denied action:', response.reason);
    throw new Error(`Action denied by human: ${response.reason}`);
  }
}
```

### Escalation Levels

```typescript
enum EscalationLevel {
  INFO = 'info', // Informational, no action needed
  WARN = 'warn', // Warning, agent handling it
  ERROR = 'error', // Error, agent can't handle
  CRITICAL = 'critical', // Critical, immediate attention
}

async function escalate(level: EscalationLevel, title: string, details: string): Promise<void> {
  const priority = {
    [EscalationLevel.INFO]: 'low',
    [EscalationLevel.WARN]: 'normal',
    [EscalationLevel.ERROR]: 'high',
    [EscalationLevel.CRITICAL]: 'urgent',
  }[level];

  await bus_send({
    type: level === EscalationLevel.INFO ? 'discovery' : 'error',
    title,
    content: details,
    priority,
    actionable: level === EscalationLevel.ERROR || level === EscalationLevel.CRITICAL,
  });

  // For critical issues, also send notification
  if (level === EscalationLevel.CRITICAL) {
    // Trigger Slack/email/CLI alert
    await triggerNotification({
      channel: ['slack', 'email'],
      urgency: 'critical',
      message: `${title}: ${details}`,
    });
  }
}
```

---

## Pattern 8: Logging and Monitoring

### Structured Error Logging

```typescript
interface ErrorLog {
  timestamp: string;
  agentId: string;
  agentName: string;
  errorType: string;
  errorMessage: string;
  stackTrace: string;
  context: Record<string, unknown>;
  recovered: boolean;
}

async function logError(error: Error, context: Record<string, unknown> = {}): Promise<void> {
  const errorLog: ErrorLog = {
    timestamp: new Date().toISOString(),
    agentId: myAgentId,
    agentName: 'claude-worker',
    errorType: error.constructor.name,
    errorMessage: error.message,
    stackTrace: error.stack || '',
    context,
    recovered: false,
  };

  // Write to local log file
  await appendToFile('.rapid/logs/errors.jsonl', JSON.stringify(errorLog) + '\n');

  // Send to event bus for orchestrator visibility
  await bus_send({
    type: 'error',
    title: `${error.constructor.name}: ${error.message}`,
    content: `Error logged at ${errorLog.timestamp}\n\nContext: ${JSON.stringify(context, null, 2)}`,
    priority: 'normal',
  });
}
```

### Error Metrics Collection

```typescript
class ErrorMetrics {
  private errorCounts: Map<string, number> = new Map();
  private errorRates: Map<string, number[]> = new Map();

  recordError(errorType: string) {
    // Increment count
    const count = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, count + 1);

    // Track rate (errors per minute)
    const timestamps = this.errorRates.get(errorType) || [];
    timestamps.push(Date.now());

    // Keep only last hour
    const oneHourAgo = Date.now() - 3600000;
    const recentTimestamps = timestamps.filter((ts) => ts > oneHourAgo);
    this.errorRates.set(errorType, recentTimestamps);

    // Alert if error rate is high
    if (recentTimestamps.length > 10) {
      console.warn(
        `High error rate for ${errorType}: ${recentTimestamps.length} errors in last hour`
      );
    }
  }

  getErrorRate(errorType: string): number {
    const timestamps = this.errorRates.get(errorType) || [];
    const oneMinuteAgo = Date.now() - 60000;
    const recentErrors = timestamps.filter((ts) => ts > oneMinuteAgo);
    return recentErrors.length;
  }

  async reportMetrics() {
    const metrics = {
      totalErrors: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
      errorsByType: Object.fromEntries(this.errorCounts),
      highRateErrors: Array.from(this.errorCounts.keys()).filter(
        (type) => this.getErrorRate(type) > 5
      ),
    };

    await bus_send({
      type: 'discovery',
      title: 'Error metrics report',
      content: `Error statistics:\n${JSON.stringify(metrics, null, 2)}`,
      priority: 'low',
    });
  }
}
```

---

## Common Error Scenarios

### Scenario 1: Network Timeout During Task Execution

```typescript
async function executeTaskWithNetworkRetry(task: Task) {
  try {
    const result = await withTimeout(
      retryWithBackoff(() => performNetworkOperation(task), {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
      }),
      60000, // 1 minute overall timeout
      'executeTask'
    );

    await task_complete(task.id, result);
  } catch (error) {
    if (error.message.includes('timeout')) {
      // Network timeout - log and reassign
      await logError(error, { taskId: task.id, taskType: task.title });
      await task_update(task.id, { status: 'pending', assignedTo: null });
    } else {
      // Other error - escalate
      await escalate(EscalationLevel.ERROR, 'Task execution failed', error.message);
      await task_update(task.id, { status: 'failed' });
    }
  }
}
```

### Scenario 2: Out of Memory

```typescript
process.on('uncaughtException', async (error) => {
  if (error.message.includes('out of memory')) {
    console.error('CRITICAL: Out of memory error detected');

    // Report critical error
    await bus_send({
      type: 'error',
      title: 'Agent out of memory',
      content: `Agent ${myAgentId} encountered OOM error and is shutting down`,
      priority: 'urgent',
      actionable: true,
    });

    // Release resources
    await cleanup();

    // Exit gracefully
    process.exit(1);
  }
});
```

### Scenario 3: Circular Task Dependencies

```typescript
async function detectCircularDependency(
  taskId: string,
  visited: Set<string> = new Set()
): Promise<boolean> {
  if (visited.has(taskId)) {
    // Circular dependency detected!
    await bus_send({
      type: 'error',
      title: 'Circular task dependency detected',
      content: `Task ${taskId} has circular dependency: ${Array.from(visited).join(' -> ')} -> ${taskId}`,
      priority: 'high',
      actionable: true,
    });
    return true;
  }

  visited.add(taskId);

  const task = await task_get(taskId);
  const dependencies = task.dependencies || [];

  for (const depId of dependencies) {
    const hasCircular = await detectCircularDependency(depId, new Set(visited));
    if (hasCircular) {
      return true;
    }
  }

  return false;
}
```

---

## Best Practices Summary

### ✅ DO

1. **Report all errors to the event bus** - Even if handled, let orchestrator know
2. **Include context in error messages** - Task IDs, file paths, state information
3. **Retry transient errors** - Network issues, rate limits, temporary locks
4. **Use exponential backoff** - Don't hammer failing services
5. **Set reasonable timeouts** - Every operation should have a maximum duration
6. **Log errors to files** - Event bus is ephemeral, files are persistent
7. **Monitor error rates** - Detect systemic issues early
8. **Escalate critical errors** - Involve humans for irreversible actions
9. **Clean up resources** - Even when exiting due to error
10. **Test error paths** - Ensure recovery logic actually works

### ❌ DON'T

1. **Silent failures** - Never catch and ignore errors without logging
2. **Infinite retries** - Always have a maximum retry count
3. **Generic error messages** - "Something went wrong" is not helpful
4. **Ignoring error types** - Different errors need different handling
5. **Blocking on errors** - Don't wait indefinitely for recovery
6. **Exposing secrets in errors** - Sanitize error context before logging
7. **Panic on first error** - Try to recover before giving up
8. **Forgetting to cleanup** - Release locks, close connections
9. **Retrying permanent errors** - Don't retry permission errors, missing files
10. **Hiding errors from orchestrator** - Transparency enables better coordination

---

## Testing Error Handling

### Unit Test Example

```typescript
describe('retryWithBackoff', () => {
  it('should retry transient errors', async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('ECONNREFUSED');
      }
      return 'success';
    };

    const result = await retryWithBackoff(operation, {
      maxRetries: 3,
      initialDelay: 10,
      maxDelay: 100,
    });

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should fail after max retries', async () => {
    const operation = async () => {
      throw new Error('Always fails');
    };

    await expect(
      retryWithBackoff(operation, {
        maxRetries: 2,
        initialDelay: 10,
        maxDelay: 100,
      })
    ).rejects.toThrow('Always fails');
  });
});
```

### Integration Test Example

```typescript
describe('Task execution error handling', () => {
  it('should reassign task on agent failure', async () => {
    // Start agent
    const agent = await startAgent('test-worker');

    // Assign task
    const task = await task_create({
      title: 'Test task',
      assignedTo: agent.id,
    });

    // Simulate agent failure
    await agent.kill();

    // Wait for timeout detection
    await sleep(5000);

    // Verify task was reassigned
    const updatedTask = await task_get(task.id);
    expect(updatedTask.status).toBe('pending');
    expect(updatedTask.assignedTo).toBeNull();
  });
});
```

---

## Troubleshooting Guide

### Problem: Agent stops responding

**Symptoms:** No heartbeat messages, tasks stuck in_progress

**Diagnosis:**

1. Check agent logs: `.rapid/logs/agent-{id}.log`
2. Check event bus messages: `rapid bus status`
3. Check system resources: `top`, `free -h`

**Solutions:**

- Restart agent: `rapid agent restart {id}`
- Increase memory limit in rapid.json
- Check for deadlocks in agent code

### Problem: Tasks fail repeatedly

**Symptoms:** Multiple error messages, tasks never complete

**Diagnosis:**

1. Check error logs: `rapid logs approvals --filter error`
2. Review task dependencies: `rapid task show {id}`
3. Check for missing capabilities

**Solutions:**

- Fix underlying issue causing failures
- Reassign to different agent: `rapid task assign {id} {agent-id}`
- Split into smaller tasks if too complex

### Problem: Event bus connection issues

**Symptoms:** "ECONNREFUSED", "Redis timeout" errors

**Diagnosis:**

1. Check Redis status: `rapid status`
2. Test connection: `redis-cli ping`
3. Review network logs

**Solutions:**

- Restart Redis: `rapid restart`
- Check firewall rules
- Fall back to in-memory mode for local dev

---

## Additional Resources

- [Multi-Agent System Architecture](../architecture/multi-agent-system.md)
- [HITL Approval Workflow](../architecture/hitl-workflow.md)
- [Event Bus API Reference](../../packages/rapid-eventbus/README.md)
- [Task Management Guide](./concurrent-execution.md)
- [Secrets Management](./secrets-management.md)

---

## Conclusion

Effective error handling is critical for building resilient multi-agent systems. By following these patterns and best practices, agents can handle failures gracefully, recover automatically when possible, and escalate appropriately when human intervention is needed.

Remember: **Errors are inevitable in distributed systems. The goal is not to prevent all errors, but to handle them elegantly and maintain system reliability.**
