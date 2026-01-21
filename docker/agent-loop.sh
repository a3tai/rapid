#!/bin/bash
# RAPID Agent Loop (Ralph-style)
# A continuous agent loop that keeps restarting Claude Code
# State persists in the event bus / task list - agents coordinate through orchestrator
#
# Usage: agent-loop.sh "AGENT_NAME" "WORKTREE" "INITIAL_TASK" [MODEL] [--yolo]
#
# Models:
#   opus    - Smart model (Opus 4.5) for orchestrators
#   haiku   - Fast model (Haiku 4.5) for workers
#   sonnet  - Thinking model (Sonnet 4.5) for planning/reasoning

set -e

AGENT_NAME="${1:-worker}"
WORKTREE="${2:-default}"
INITIAL_TASK="${3:-Check the event bus for tasks}"
MODEL="${4:-}"
YOLO_MODE="${5:-}"
ITERATION=0

# Set up logging - redirect all output to a log file while still showing on stdout
LOG_DIR="/workspace/.rapid/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/agent-$AGENT_NAME.log"
# Clear previous log and start fresh
> "$LOG_FILE"
# Use exec to redirect all subsequent output to tee (writes to both file and stdout)
exec > >(tee -a "$LOG_FILE") 2>&1
echo "📝 Logging to $LOG_FILE"

# Handle case where model is --yolo (positional args shifted)
if [[ "$MODEL" == "--yolo" ]]; then
  YOLO_MODE="--yolo"
  MODEL=""
fi

# Use pre-assigned session ID if available, otherwise generate one
AGENT_ID="${RAPID_PRE_SESSION_ID:-${RAPID_AGENT_ID:-agent-$(date +%s)-$$}}"

# MCP endpoint - use container network name or fall back to host
MCP_URL="${MCP_URL:-http://rapid-mcp:3100/mcp}"

# Confirm registration with event bus on startup
# This transitions the agent from "starting" to "running" status
confirm_registration() {
  echo "📡 Confirming registration with event bus..."
  curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": $(date +%s),
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"bus_register\",
        \"arguments\": {
          \"agentId\": \"$AGENT_ID\",
          \"agentName\": \"$AGENT_NAME\",
          \"session\": \"$WORKTREE\",
          \"role\": \"$AGENT_NAME\",
          \"capabilities\": [\"code\", \"test\", \"review\"]
        }
      }
    }" > /dev/null 2>&1 || echo "⚠️  Registration confirmation failed (MCP may not be ready)"
}

# Confirm registration immediately on startup
confirm_registration

# Send a single heartbeat - returns 0 on success, 1 on failure
send_heartbeat() {
  local response
  response=$(curl -s -w "\n%{http_code}" -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": $(date +%s),
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"bus_heartbeat\",
        \"arguments\": {
          \"agentId\": \"$AGENT_ID\"
        }
      }
    }" 2>/dev/null)

  local http_code
  http_code=$(echo "$response" | tail -n 1)

  if [[ "$http_code" == "200" ]]; then
    return 0
  else
    return 1
  fi
}

# Background heartbeat loop - keeps agent active in the registry
# Now with failure tracking and logging
heartbeat_loop() {
  local failures=0
  local max_failures=10

  while true; do
    if send_heartbeat; then
      failures=0
    else
      failures=$((failures + 1))
      echo "⚠️  Heartbeat failed (attempt $failures/$max_failures)" >> "$LOG_FILE"

      if [[ $failures -ge $max_failures ]]; then
        echo "❌ Heartbeat loop: $max_failures consecutive failures, will keep trying..." >> "$LOG_FILE"
        # Don't exit, just reset and keep trying - the agent should stay alive
        failures=0
        sleep 5
      fi
    fi
    sleep 10
  done
}

# Start heartbeat in background
heartbeat_loop &
HEARTBEAT_PID=$!

echo "💓 Started heartbeat loop (PID: $HEARTBEAT_PID)"

# Graceful shutdown handling
SHUTDOWN=false

shutdown_handler() {
  echo ""
  echo "🛑 Received shutdown signal, completing current iteration..."
  SHUTDOWN=true

  # Send completion message
  curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": $(date +%s),
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"bus_send\",
        \"arguments\": {
          \"type\": \"lifecycle\",
          \"agentId\": \"$AGENT_ID\",
          \"agentName\": \"$AGENT_NAME\",
          \"title\": \"Agent shutting down\",
          \"content\": \"Graceful shutdown initiated\"
        }
      }
    }" > /dev/null 2>&1 || true

  # Deregister from event bus
  curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": $(date +%s),
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"bus_deregister\",
        \"arguments\": {
          \"agentId\": \"$AGENT_ID\"
        }
      }
    }" > /dev/null 2>&1 || true
}

# Trap to clean up heartbeat on exit
cleanup_all() {
  echo "🛑 Stopping heartbeat loop..."
  kill $HEARTBEAT_PID 2>/dev/null || true
}
trap cleanup_all EXIT
trap shutdown_handler SIGTERM SIGINT

# Create prompt file that will be fed each iteration
PROMPT_FILE="/workspace/.rapid/agent-prompt.md"
mkdir -p /workspace/.rapid

# Write the agent prompt
cat > "$PROMPT_FILE" << 'PROMPT_EOF'
# RAPID Agent Loop - Iteration ${ITERATION}

You are agent "${AGENT_NAME}" working in worktree "${WORKTREE}".

## Your Mission
1. Check the event bus for messages and tasks assigned to you
2. Execute any pending work
3. Report progress and completion via bus_send
4. Exit when task is complete (the loop will restart you)

## First Actions
1. Call bus_register to announce your presence:
   - agentName: "${AGENT_NAME}"
   - session: "${WORKTREE}"
   - role: "${AGENT_NAME}"

2. Call bus_messages to check for:
   - Tasks assigned to you from the orchestrator
   - Coordination messages from other agents
   - Any pending work

3. If you find a task:
   - Execute it
   - Run tests if applicable
   - Commit your changes
   - Send completion message via bus_send

4. If no tasks found:
   - Send status message: "Awaiting tasks"
   - Exit (loop will restart you to check again)

## Initial Task
${INITIAL_TASK}

## State Management
- ALL state persists in the event bus / task list
- Coordinate exclusively through the orchestrator and task system
- Do NOT rely on local files for state - use bus_messages and task_list
- Each iteration starts fresh - the bus is your source of truth
- The loop handles restarts - just exit cleanly when done
PROMPT_EOF

echo "═══════════════════════════════════════════════════════════════"
echo "🔄 RAPID Agent Loop Starting"
echo "   Agent: $AGENT_NAME"
echo "   Worktree: $WORKTREE"
echo "   Model: ${MODEL:-default}"
echo "   Initial task: $INITIAL_TASK"
echo "   Yolo mode: ${YOLO_MODE:-disabled}"
echo "═══════════════════════════════════════════════════════════════"

# Build base claude args
CLAUDE_BASE_ARGS=()

# Add model selection
# opus = Opus 4.5 (smart, for orchestrators)
# haiku = Haiku 4.5 (fast, for workers)
# sonnet = Sonnet 4.5 (thinking, for planning)
if [[ -n "$MODEL" ]]; then
  case "$MODEL" in
    opus)
      CLAUDE_BASE_ARGS+=("--model" "claude-opus-4-5-20251101")
      ;;
    haiku)
      CLAUDE_BASE_ARGS+=("--model" "claude-haiku-4-5-20251001")
      ;;
    sonnet)
      CLAUDE_BASE_ARGS+=("--model" "claude-sonnet-4-5-20250929")
      ;;
    *)
      # Use as-is if it's a full model ID
      CLAUDE_BASE_ARGS+=("--model" "$MODEL")
      ;;
  esac
fi

if [[ "$YOLO_MODE" == "--yolo" ]]; then
  CLAUDE_BASE_ARGS+=("--dangerously-skip-permissions")
fi

# Function to update task status
update_task_status() {
  local task_id="$1"
  local status="$2"
  curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": $(date +%s),
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"task_update\",
        \"arguments\": {
          \"taskId\": \"$task_id\",
          \"status\": \"$status\"
        }
      }
    }" > /dev/null 2>&1 || true
}

# Function to claim a task from the work queue
claim_task() {
  TASK_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": $(date +%s),
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"task_claim\",
        \"arguments\": {
          \"agentId\": \"$AGENT_ID\",
          \"capabilities\": [\"code\", \"test\", \"review\"]
        }
      }
    }" 2>/dev/null || echo '{}')

  # Extract task ID from response using jq if available, otherwise grep
  if command -v jq &> /dev/null; then
    CLAIMED_TASK_ID=$(echo "$TASK_RESPONSE" | jq -r '.result.structuredContent.taskId // empty' 2>/dev/null)
    CLAIMED_TASK_TITLE=$(echo "$TASK_RESPONSE" | jq -r '.result.structuredContent.title // empty' 2>/dev/null)
  else
    CLAIMED_TASK_ID=""
    CLAIMED_TASK_TITLE=""
  fi

  # Mark task as in_progress if we claimed one
  if [[ -n "$CLAIMED_TASK_ID" ]]; then
    update_task_status "$CLAIMED_TASK_ID" "in_progress"
    echo "📝 Marked task $CLAIMED_TASK_ID as in_progress"
  fi
}

# The Ralph Loop - simple and elegant
# Exits gracefully when SHUTDOWN flag is set
while [ "$SHUTDOWN" = "false" ]; do
  ITERATION=$((ITERATION + 1))

  # Check for assigned tasks first
  claim_task
  TASK_PROMPT=""

  if [[ -n "$CLAIMED_TASK_ID" ]]; then
    echo "📋 Claimed task: $CLAIMED_TASK_ID - $CLAIMED_TASK_TITLE"
    TASK_PROMPT="## PRIORITY: Assigned Task
You have been assigned task '$CLAIMED_TASK_ID': $CLAIMED_TASK_TITLE

**IMPORTANT**: Use task_get to retrieve the full task details before starting work.
When complete, use task_complete to mark the task as done.

"
  fi

  # Update prompt with current iteration
  CURRENT_PROMPT=$(cat "$PROMPT_FILE" | \
    sed "s/\${ITERATION}/$ITERATION/g" | \
    sed "s/\${AGENT_NAME}/$AGENT_NAME/g" | \
    sed "s/\${WORKTREE}/$WORKTREE/g" | \
    sed "s/\${INITIAL_TASK}/$INITIAL_TASK/g")

  # Prepend task prompt if we claimed a task
  if [[ -n "$TASK_PROMPT" ]]; then
    CURRENT_PROMPT="$TASK_PROMPT$CURRENT_PROMPT"
  fi

  echo ""
  echo "───────────────────────────────────────────────────────────────"
  echo "🔄 Iteration $ITERATION - $(date '+%Y-%m-%d %H:%M:%S')"
  if [[ -n "$CLAIMED_TASK_ID" ]]; then
    echo "📋 Working on: $CLAIMED_TASK_TITLE"
  fi
  echo "───────────────────────────────────────────────────────────────"

  # Run claude with the prompt (fresh context each time)
  # Exit code doesn't matter - we always restart
  echo "$CURRENT_PROMPT" | claude "${CLAUDE_BASE_ARGS[@]}" -p - || true

  # Send heartbeat after each iteration to stay alive
  send_heartbeat || echo "⚠️  Post-iteration heartbeat failed" >> "$LOG_FILE"

  echo ""
  if [ "$SHUTDOWN" = "true" ]; then
    echo "👋 Shutdown requested. Exiting gracefully."
    break
  fi
  echo "⏳ Agent exited. Restarting in 3 seconds..."
  echo "   (Press Ctrl+C to stop the loop)"
  sleep 3
done

echo "🏁 Agent loop terminated."
