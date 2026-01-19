#!/bin/bash
# pre-tool-use.sh - RAPID policy enforcement for Claude Code
#
# This hook is called before each tool use. It can:
# - allow: Proceed with the tool call
# - deny: Block the tool call with a reason
# - ask: Prompt the user for permission
#
# Input: Tool name and input are provided via environment variables
# Output: JSON decision object to stdout

set -euo pipefail

# Read tool info from environment
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_INPUT="${CLAUDE_TOOL_INPUT:-}"

# Load policy settings (if rapid CLI is available)
SETTINGS_DIR="$(dirname "$0")/../.claude-plugin"
SETTINGS_FILE="${SETTINGS_DIR}/settings.json"

# Default to allow if we can't parse
allow_decision() {
  echo '{"decision": "allow"}'
  exit 0
}

deny_decision() {
  local reason="${1:-Blocked by RAPID policy}"
  echo "{\"decision\": \"deny\", \"reason\": \"${reason}\"}"
  exit 0
}

ask_decision() {
  local reason="${1:-Requires user approval}"
  echo "{\"decision\": \"ask\", \"reason\": \"${reason}\"}"
  exit 0
}

# Check if jq is available
if ! command -v jq &> /dev/null; then
  # Can't parse JSON, allow by default
  allow_decision
fi

# Parse settings
if [[ ! -f "$SETTINGS_FILE" ]]; then
  allow_decision
fi

# Handle Bash tool specifically
if [[ "$TOOL_NAME" == "Bash" ]]; then
  COMMAND=$(echo "$TOOL_INPUT" | jq -r '.command // empty' 2>/dev/null || echo "")

  if [[ -z "$COMMAND" ]]; then
    allow_decision
  fi

  # Check blocked patterns
  BLOCKED_PATTERNS=$(jq -r '.policy.blockedPatterns[]?' "$SETTINGS_FILE" 2>/dev/null || echo "")
  while IFS= read -r pattern; do
    if [[ -n "$pattern" ]] && echo "$COMMAND" | grep -qE "$pattern"; then
      deny_decision "Command matches blocked pattern: $pattern"
    fi
  done <<< "$BLOCKED_PATTERNS"

  # Check require approval patterns
  APPROVAL_PATTERNS=$(jq -r '.policy.requireApprovalPatterns[]?' "$SETTINGS_FILE" 2>/dev/null || echo "")
  while IFS= read -r pattern; do
    if [[ -n "$pattern" ]] && echo "$COMMAND" | grep -qE "$pattern"; then
      ask_decision "Command requires approval: matches pattern $pattern"
    fi
  done <<< "$APPROVAL_PATTERNS"

  # Check if command is auto-approved
  AUTO_APPROVE=$(jq -r '.policy.autoApprovePatterns[]?' "$SETTINGS_FILE" 2>/dev/null || echo "")
  while IFS= read -r pattern; do
    if [[ -n "$pattern" ]] && echo "$COMMAND" | grep -qE "$pattern"; then
      allow_decision
    fi
  done <<< "$AUTO_APPROVE"
fi

# Handle Edit tool - check for sensitive file patterns
if [[ "$TOOL_NAME" == "Edit" || "$TOOL_NAME" == "Write" ]]; then
  FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path // .path // empty' 2>/dev/null || echo "")

  # Block edits to system files
  if [[ "$FILE_PATH" =~ ^/etc/ ]] || [[ "$FILE_PATH" =~ ^/usr/ ]] || [[ "$FILE_PATH" =~ ^/bin/ ]]; then
    deny_decision "Cannot edit system files outside project directory"
  fi

  # Warn about sensitive files
  if [[ "$FILE_PATH" =~ \.(env|pem|key|secret)$ ]]; then
    ask_decision "Editing sensitive file: $FILE_PATH"
  fi
fi

# Default: allow
allow_decision
