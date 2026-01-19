#!/bin/bash
# post-tool-use.sh - RAPID audit logging for Claude Code
#
# This hook is called after each tool use completes.
# It logs the tool execution for audit trail.
#
# Input: Tool name, input, and output via environment variables
# Output: JSON acknowledgment to stdout

set -euo pipefail

# Read tool info from environment
TOOL_NAME="${CLAUDE_TOOL_NAME:-unknown}"
TOOL_INPUT="${CLAUDE_TOOL_INPUT:-{}}"
TOOL_OUTPUT="${CLAUDE_TOOL_OUTPUT:-}"
TOOL_ERROR="${CLAUDE_TOOL_ERROR:-}"
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"

# Audit log location
AUDIT_DIR="${HOME}/.rapid/audit"
AUDIT_FILE="${AUDIT_DIR}/claude-audit.jsonl"

# Ensure audit directory exists
mkdir -p "$AUDIT_DIR"

# Get timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Hash sensitive output (don't log full content)
hash_content() {
  local content="$1"
  if command -v sha256sum &> /dev/null; then
    echo "$content" | sha256sum | cut -d' ' -f1
  elif command -v shasum &> /dev/null; then
    echo "$content" | shasum -a 256 | cut -d' ' -f1
  else
    echo "hash_unavailable"
  fi
}

# Calculate output hash
OUTPUT_HASH=""
if [[ -n "$TOOL_OUTPUT" ]]; then
  OUTPUT_HASH=$(hash_content "$TOOL_OUTPUT")
fi

# Determine success/failure
STATUS="success"
if [[ -n "$TOOL_ERROR" ]]; then
  STATUS="error"
fi

# Extract command for Bash tools (for better logging)
COMMAND_SUMMARY=""
if [[ "$TOOL_NAME" == "Bash" ]]; then
  COMMAND_SUMMARY=$(echo "$TOOL_INPUT" | jq -r '.command // empty' 2>/dev/null | head -c 200 || echo "")
fi

# Redact sensitive data from input
redact_input() {
  local input="$1"
  # Redact common secret patterns
  echo "$input" | sed -E \
    -e 's/(password["\s:=]+["\x27]?)[^"\x27]+(["\x27]?)/\1[REDACTED]\2/gi' \
    -e 's/(secret["\s:=]+["\x27]?)[^"\x27]+(["\x27]?)/\1[REDACTED]\2/gi' \
    -e 's/(api_key["\s:=]+["\x27]?)[^"\x27]+(["\x27]?)/\1[REDACTED]\2/gi' \
    -e 's/(token["\s:=]+["\x27]?)[^"\x27]+(["\x27]?)/\1[REDACTED]\2/gi' \
    -e 's/sk-[a-zA-Z0-9]{48}/sk-[REDACTED]/g' \
    -e 's/anthropic-[a-zA-Z0-9_-]{40,}/anthropic-[REDACTED]/g' \
    -e 's/ghp_[a-zA-Z0-9]{36}/ghp_[REDACTED]/g'
}

REDACTED_INPUT=$(redact_input "$TOOL_INPUT")

# Build audit entry
AUDIT_ENTRY=$(jq -n \
  --arg timestamp "$TIMESTAMP" \
  --arg session "$SESSION_ID" \
  --arg tool "$TOOL_NAME" \
  --argjson input "$REDACTED_INPUT" \
  --arg output_hash "sha256:$OUTPUT_HASH" \
  --arg status "$STATUS" \
  --arg command "$COMMAND_SUMMARY" \
  '{
    timestamp: $timestamp,
    session: $session,
    tool: $tool,
    input: $input,
    output_hash: $output_hash,
    status: $status,
    command_summary: (if $command != "" then $command else null end)
  } | with_entries(select(.value != null))'
)

# Append to audit log
echo "$AUDIT_ENTRY" >> "$AUDIT_FILE"

# Log rotation: if file is > 10MB, rotate it
MAX_SIZE=$((10 * 1024 * 1024))
if [[ -f "$AUDIT_FILE" ]]; then
  FILE_SIZE=$(stat -f%z "$AUDIT_FILE" 2>/dev/null || stat -c%s "$AUDIT_FILE" 2>/dev/null || echo 0)
  if [[ "$FILE_SIZE" -gt "$MAX_SIZE" ]]; then
    ROTATE_NAME="${AUDIT_FILE}.$(date +%Y%m%d%H%M%S)"
    mv "$AUDIT_FILE" "$ROTATE_NAME"
    # Compress old log
    gzip "$ROTATE_NAME" 2>/dev/null || true
  fi
fi

# Return acknowledgment (hook doesn't modify behavior)
echo '{"logged": true}'
