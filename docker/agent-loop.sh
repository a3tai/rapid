#!/bin/bash
# RAPID Agent Loop (Ralph-style) - FIXED VERSION
# A continuous agent loop that keeps restarting Claude Code
# State persists in the event bus / task list - agents coordinate through orchestrator
#
# FIX: Added logic to stop looping when no more tasks are available
#
# Usage: agent-loop.sh "AGENT_NAME" "WORKTREE" "INITIAL_TASK" [MODEL] [--yolo]
#
# Models:
#   smart   - Strong general model
#   fast    - Lower-cost, quick model
#   thinking - Slower, deeper reasoning model
#   opus/haiku/sonnet - Legacy aliases mapped to smart/fast/thinking

set -e

AGENT_NAME="${1:-worker}"
WORKTREE="${2:-default}"
INITIAL_TASK="${3:-Check the event bus for tasks}"
MODEL="${4:-}"
# Default to yolo mode since spawned agents can't interact with permission prompts
YOLO_MODE="${5:---yolo}"
ITERATION=0

# Handle case where model is --yolo (positional args shifted)
if [[ "$MODEL" == "--yolo" ]]; then
  YOLO_MODE="--yolo"
  MODEL=""
fi

# Use pre-assigned session ID if available, otherwise generate one
# IMPORTANT: Must be defined before LOG_FILE uses it
AGENT_ID="${RAPID_PRE_SESSION_ID:-${RAPID_AGENT_ID:-agent-$(date +%s)-$$}}"

# Set up logging - redirect all output to a log file while still showing on stdout
LOG_DIR="/workspace/.rapid/logs"
mkdir -p "$LOG_DIR"

# Simple, consistent log file name - one agent per worktree
LOG_FILE="$LOG_DIR/agent.log"

# Clear previous log and start fresh
> "$LOG_FILE"
# Use exec to redirect all subsequent output to tee (writes to both file and stdout)
exec > >(tee -a "$LOG_FILE") 2>&1
echo "📝 Logging to $LOG_FILE"

# MCP endpoint - RAPID_MCP_HOST is set by daemon, defaults to host.docker.internal
# for cross-network access (agent containers may be on different Docker network)
RAPID_MCP_HOST="${RAPID_MCP_HOST:-host.docker.internal}"
MCP_URL="${MCP_URL:-http://${RAPID_MCP_HOST}:3100/mcp}"
# Session ID for MCP requests (required by Streamable HTTP transport)
MCP_SESSION_ID="${MCP_SESSION_ID:-agent-session-$AGENT_ID}"
RUNTIME="${RAPID_AGENT_RUNTIME:-claude}"

# Confirm registration with event bus on startup
# This transitions the agent from "starting" to "running" status
confirm_registration() {
  echo "📡 Confirming registration with event bus..."
  curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $MCP_SESSION_ID" \
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
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $MCP_SESSION_ID" \
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
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $MCP_SESSION_ID" \
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
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $MCP_SESSION_ID" \
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

## IMPORTANT: MCP Tools

You have access to RAPID MCP tools via the "rapid" MCP server. These are NOT shell commands - they are MCP tools you call directly. The key tools are:

- **bus_register** - Register with event bus (agentId, agentName, session)
- **bus_messages** - Get messages from event bus
- **bus_send** - Send message to event bus (type, agentId, agentName, title, content)
- **task_list** - List tasks (optionally filter by status, assignedTo)
- **task_claim** - Claim a pending task (id, agentId)
- **task_complete** - Mark task complete (id, summary)
- **task_progress** - Report progress (id, progress 0-1, message)

## Your Mission
1. Check the event bus for messages and tasks assigned to you
2. Execute any pending work
3. Report progress and completion via bus_send
4. Exit when task is complete (the loop will restart you)

## First Actions
1. Use the bus_register MCP tool to announce your presence:
   - agentId: "${AGENT_NAME}-${WORKTREE}"
   - agentName: "${AGENT_NAME}"
   - session: "${WORKTREE}"

2. Use bus_messages MCP tool to check for:
   - Tasks assigned to you from the orchestrator
   - Coordination messages from other agents

3. Use task_list MCP tool to find pending tasks

4. If you find a task:
   - Use task_claim to claim it
   - Execute the work
   - Run tests if applicable
   - Commit your changes
   - Use task_complete to mark done

5. If no tasks found:
   - Send status via bus_send: "Awaiting tasks"
   - Exit (loop will restart you to check again)

## Initial Task
${INITIAL_TASK}

## State Management
- ALL state persists in the event bus / task list
- These are MCP tools, NOT shell commands
- Each iteration starts fresh - the bus is your source of truth
- The loop handles restarts - just exit cleanly when done
PROMPT_EOF

echo "═══════════════════════════════════════════════════════════════"
echo "🔄 RAPID Agent Loop Starting"
echo "   Agent: $AGENT_NAME"
echo "   Worktree: $WORKTREE"
echo "   Model: ${MODEL:-default}"
echo "   Runtime: ${RUNTIME}"
echo "   Initial task: $INITIAL_TASK"
echo "   Yolo mode: ${YOLO_MODE:-disabled}"
echo "═══════════════════════════════════════════════════════════════"

# Build base runtime args
CLAUDE_BASE_ARGS=()
CODEX_BASE_ARGS=("--json" "--skip-git-repo-check")

CLAUDE_MODEL_FAST="${RAPID_CLAUDE_FAST_MODEL:-claude-haiku-4-5-20251001}"
CLAUDE_MODEL_SMART="${RAPID_CLAUDE_SMART_MODEL:-claude-opus-4-5-20251101}"
CLAUDE_MODEL_THINKING="${RAPID_CLAUDE_THINKING_MODEL:-claude-sonnet-4-5-20250929}"

CODEX_MODEL_FAST="${RAPID_CODEX_FAST_MODEL:-gpt-4o-mini}"
CODEX_MODEL_SMART="${RAPID_CODEX_SMART_MODEL:-gpt-4o}"
CODEX_MODEL_THINKING="${RAPID_CODEX_THINKING_MODEL:-o3}"

resolve_model() {
  local runtime="$1"
  local model="$2"
  local alias="$model"

  case "$alias" in
    haiku)
      alias="fast"
      ;;
    opus)
      alias="smart"
      ;;
    sonnet)
      alias="thinking"
      ;;
  esac

  case "$alias" in
    fast)
      if [[ "$runtime" == "codex" ]]; then
        echo "$CODEX_MODEL_FAST"
      else
        echo "$CLAUDE_MODEL_FAST"
      fi
      ;;
    smart)
      if [[ "$runtime" == "codex" ]]; then
        echo "$CODEX_MODEL_SMART"
      else
        echo "$CLAUDE_MODEL_SMART"
      fi
      ;;
    thinking)
      if [[ "$runtime" == "codex" ]]; then
        echo "$CODEX_MODEL_THINKING"
      else
        echo "$CLAUDE_MODEL_THINKING"
      fi
      ;;
    *)
      echo "$alias"
      ;;
  esac
}

# Add model selection
if [[ -n "$MODEL" ]]; then
  RESOLVED_MODEL="$(resolve_model "$RUNTIME" "$MODEL")"
  if [[ "$RUNTIME" == "codex" ]]; then
    CODEX_BASE_ARGS+=("--model" "$RESOLVED_MODEL")
  else
    CLAUDE_BASE_ARGS+=("--model" "$RESOLVED_MODEL")
  fi
fi

if [[ "$YOLO_MODE" == "--yolo" ]]; then
  if [[ "$RUNTIME" == "codex" ]]; then
    CODEX_BASE_ARGS+=("--dangerously-bypass-approvals-and-sandbox")
  else
    CLAUDE_BASE_ARGS+=("--dangerously-skip-permissions")
  fi
fi

# Build MCP configuration with available servers
# We use --strict-mcp-config to override any existing MCP configs
build_mcp_config() {
  local config='{"mcpServers":{"rapid":{"type":"http","url":"'${MCP_URL}'"}'

  # Add Context7 if API key available
  if [[ -n "${CONTEXT7_API_KEY:-}" ]]; then
    config+=',"context7":{"type":"http","url":"https://mcp.context7.com/mcp","headers":{"Context7-API-Key":"'${CONTEXT7_API_KEY}'"}}'
  fi

  # Add Tavily if API key available
  if [[ -n "${TAVILY_API_KEY:-}" ]]; then
    config+=',"tavily":{"type":"http","url":"https://mcp.tavily.com/mcp","headers":{"Authorization":"Bearer '${TAVILY_API_KEY}'"}}'
  fi

  config+='}}'
  echo "$config"
}

MCP_CONFIG=$(build_mcp_config)
echo "📡 MCP Config: $(echo "$MCP_CONFIG" | jq -c '.mcpServers | keys' 2>/dev/null || echo 'rapid only')"
if [[ "$RUNTIME" == "codex" ]]; then
  CODEX_CONFIG_DIR="/workspace/.codex"
  CODEX_CONFIG_FILE="${CODEX_CONFIG_DIR}/config.toml"
  mkdir -p "$CODEX_CONFIG_DIR"
  if [[ -f "/workspace/.mcp.json" ]]; then
    node <<'NODE' > "$CODEX_CONFIG_FILE"
const fs = require('node:fs');
const configPath = '/workspace/.mcp.json';
const raw = fs.readFileSync(configPath, 'utf8');
const json = JSON.parse(raw);
const servers = json.mcpServers ?? {};
const env = process.env;

const expandVars = (value) =>
  value.replace(/\$\{([^}:]+)(?::-(.+?))?\}/g, (_, key, fallback) => {
    const resolved = env[key];
    if (resolved === undefined || resolved === '') {
      return fallback ?? '';
    }
    return resolved;
  });

const encodeString = (value) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const encodeValue = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(encodeValue).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, val]) => `${encodeString(key)} = ${encodeValue(val)}`)
      .join(', ');
    return `{ ${entries} }`;
  }
  if (typeof value === 'string') {
    return encodeString(expandVars(value));
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return encodeString(String(value));
};

const lines = [
  '[projects."/workspace"]',
  'trust_level = "trusted"',
  '',
];

for (const [name, server] of Object.entries(servers)) {
  if (!server || typeof server !== 'object') continue;
  lines.push(`[mcp_servers.${name}]`);
  for (const [key, value] of Object.entries(server)) {
    if (key === 'type') continue;
    lines.push(`${key} = ${encodeValue(value)}`);
  }
  lines.push('');
}

process.stdout.write(lines.join('\n'));
NODE
  else
    {
      echo "[projects.\"/workspace\"]"
      echo "trust_level = \"trusted\""
      echo ""
      echo "[mcp_servers.rapid]"
      echo "url = \"${MCP_URL}\""
      if [[ -n "${CONTEXT7_API_KEY:-}" ]]; then
        echo ""
        echo "[mcp_servers.context7]"
        echo "url = \"https://mcp.context7.com/mcp\""
        echo "headers = { \"Context7-API-Key\" = \"${CONTEXT7_API_KEY}\" }"
      fi
      if [[ -n "${TAVILY_API_KEY:-}" ]]; then
        echo ""
        echo "[mcp_servers.tavily]"
        echo "url = \"https://mcp.tavily.com/mcp\""
        echo "bearer_token_env_var = \"TAVILY_API_KEY\""
      fi
    } > "$CODEX_CONFIG_FILE"
  fi
else
  CLAUDE_BASE_ARGS+=("--mcp-config" "$MCP_CONFIG" "--strict-mcp-config")
fi

# Function to update task status
update_task_status() {
  local task_id="$1"
  local status="$2"
  curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $MCP_SESSION_ID" \
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
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $MCP_SESSION_ID" \
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

# Function to check if there are pending tasks in the queue
check_pending_tasks() {
  local response
  response=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $MCP_SESSION_ID" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": $(date +%s),
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"task_list\",
        \"arguments\": {
          \"status\": \"pending\"
        }
      }
    }" 2>/dev/null || echo '{}')

  # Check if there are any pending tasks
  if command -v jq &> /dev/null; then
    local task_count
    task_count=$(echo "$response" | jq -r '.result.structuredContent.tasks | length' 2>/dev/null || echo "0")
    [[ "$task_count" -gt 0 ]]
  else
    # Fallback: check if response contains task data
    echo "$response" | grep -q '"tasks":\s*\[.\+\]'
  fi
}

# The Ralph Loop - simple and elegant
# Exits gracefully when SHUTDOWN flag is set OR when no more work is available
MAX_IDLE_ITERATIONS=3
IDLE_COUNT=0

while [ "$SHUTDOWN" = "false" ]; do
  ITERATION=$((ITERATION + 1))

  # Check for assigned tasks first
  claim_task
  TASK_PROMPT=""

  if [[ -n "$CLAIMED_TASK_ID" ]]; then
    echo "📋 Claimed task: $CLAIMED_TASK_ID - $CLAIMED_TASK_TITLE"
    IDLE_COUNT=0  # Reset idle counter when we have work
    TASK_PROMPT="## PRIORITY: Assigned Task
You have been assigned task '$CLAIMED_TASK_ID': $CLAIMED_TASK_TITLE

**IMPORTANT**: Use task_get to retrieve the full task details before starting work.
When complete, use task_complete to mark the task as done.

"
  else
    # No task claimed - check if there are any pending tasks at all
    IDLE_COUNT=$((IDLE_COUNT + 1))
    echo "ℹ️  No tasks claimed (idle iteration $IDLE_COUNT/$MAX_IDLE_ITERATIONS)"

    if [[ $IDLE_COUNT -ge $MAX_IDLE_ITERATIONS ]]; then
      if check_pending_tasks; then
        echo "📋 Pending tasks still exist in queue, continuing..."
        IDLE_COUNT=0  # Reset counter, tasks exist but weren't claimed
      else
        echo "✅ No pending tasks found after $MAX_IDLE_ITERATIONS idle iterations."
        echo "🏁 Agent loop completing - no more work to do."
        SHUTDOWN=true
        break
      fi
    fi
  fi

  # Update prompt with current iteration
  # Use envsubst for safe variable substitution (handles special chars in INITIAL_TASK)
  export ITERATION AGENT_NAME WORKTREE INITIAL_TASK
  CURRENT_PROMPT=$(envsubst < "$PROMPT_FILE")

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

  # Run agent with the prompt (fresh context each time)
  # Exit code doesn't matter - we always restart
  if [[ "$RUNTIME" == "codex" ]]; then
    echo "$CURRENT_PROMPT" | codex exec "${CODEX_BASE_ARGS[@]}" -C /workspace - || true
  else
    # Use stream-json format to capture thinking blocks and structured events
    echo "$CURRENT_PROMPT" | claude "${CLAUDE_BASE_ARGS[@]}" -p - --output-format stream-json --verbose || true
  fi

  # Send heartbeat after each iteration to stay alive
  send_heartbeat || echo "⚠️  Post-iteration heartbeat failed" >> "$LOG_FILE"

  echo ""
  if [ "$SHUTDOWN" = "true" ]; then
    echo "👋 Shutdown requested. Exiting gracefully."
    break
  fi
  echo "⏳ Agent iteration complete. Restarting in 30 seconds..."
  echo "   (Press Ctrl+C to stop the loop)"
  sleep 30
done

echo "🏁 Agent loop terminated."
