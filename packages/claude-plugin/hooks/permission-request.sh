#!/bin/bash
# permission-request.sh - RAPID auto-approval for Claude Code
#
# This hook is called when Claude Code requests permission for an action.
# It can auto-approve safe actions and auto-deny dangerous patterns.
#
# Input: Permission request details via environment variables
# Output: JSON decision object to stdout

set -euo pipefail

# Read permission request from environment
PERMISSION_TYPE="${CLAUDE_PERMISSION_TYPE:-}"
PERMISSION_DETAILS="${CLAUDE_PERMISSION_DETAILS:-{}}"
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"

# Load policy settings
SETTINGS_DIR="$(dirname "$0")/../.claude-plugin"
SETTINGS_FILE="${SETTINGS_DIR}/settings.json"

# Decision functions
allow_decision() {
  echo '{"decision": "allow"}'
  exit 0
}

deny_decision() {
  local reason="${1:-Blocked by RAPID policy}"
  echo "{\"decision\": \"deny\", \"reason\": \"${reason}\"}"
  exit 0
}

# Let user decide
pass_through() {
  echo '{"decision": "ask"}'
  exit 0
}

# Check if jq is available
if ! command -v jq &> /dev/null; then
  pass_through
fi

# Parse settings
if [[ ! -f "$SETTINGS_FILE" ]]; then
  pass_through
fi

# Extract command if available
COMMAND=""
if [[ -n "$PERMISSION_DETAILS" ]]; then
  COMMAND=$(echo "$PERMISSION_DETAILS" | jq -r '.command // empty' 2>/dev/null || echo "")
fi

# Decision matrix based on permission type
case "$PERMISSION_TYPE" in
  "execute_command"|"bash")
    # Check against blocked patterns (always deny)
    BLOCKED_PATTERNS=$(jq -r '.policy.blockedPatterns[]?' "$SETTINGS_FILE" 2>/dev/null || echo "")
    while IFS= read -r pattern; do
      if [[ -n "$pattern" ]] && echo "$COMMAND" | grep -qE "$pattern"; then
        deny_decision "Command matches blocked pattern"
      fi
    done <<< "$BLOCKED_PATTERNS"

    # Auto-approve safe test/build commands
    if echo "$COMMAND" | grep -qE '^(npm|pnpm|yarn)\s+(test|run\s+test|ci)'; then
      allow_decision
    fi

    # Auto-approve read-only git commands
    if echo "$COMMAND" | grep -qE '^git\s+(status|diff|log|branch|show|blame)'; then
      allow_decision
    fi

    # Auto-approve ls, cat, echo (read-only)
    if echo "$COMMAND" | grep -qE '^(ls|cat|head|tail|echo|pwd|which|type)\s'; then
      allow_decision
    fi

    # Deny force push
    if echo "$COMMAND" | grep -qE 'git\s+(push\s+--force|push\s+-f|reset\s+--hard)'; then
      deny_decision "Destructive git operation blocked"
    fi

    # Everything else: let user decide
    pass_through
    ;;

  "file_write"|"edit")
    FILE_PATH=$(echo "$PERMISSION_DETAILS" | jq -r '.path // .file_path // empty' 2>/dev/null || echo "")

    # Deny writes to system paths
    if [[ "$FILE_PATH" =~ ^/(etc|usr|bin|sbin|lib|var)/ ]]; then
      deny_decision "Cannot write to system directories"
    fi

    # Deny writes to home directory sensitive files
    if [[ "$FILE_PATH" =~ ^~?/\.(ssh|gnupg|aws|config)/ ]]; then
      deny_decision "Cannot write to sensitive config directories"
    fi

    # Auto-approve writes within project (current working directory)
    PROJECT_DIR="${RAPID_PROJECT_DIR:-$(pwd)}"
    if [[ "$FILE_PATH" == "$PROJECT_DIR"* ]] || [[ "$FILE_PATH" == "./"* ]]; then
      allow_decision
    fi

    # Let user decide for other paths
    pass_through
    ;;

  "network"|"fetch")
    URL=$(echo "$PERMISSION_DETAILS" | jq -r '.url // empty' 2>/dev/null || echo "")

    # Auto-approve common development domains
    if echo "$URL" | grep -qE '^https://(github\.com|gitlab\.com|npmjs\.com|registry\.npmjs\.org|pypi\.org)'; then
      allow_decision
    fi

    # Auto-approve localhost
    if echo "$URL" | grep -qE '^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)'; then
      allow_decision
    fi

    # Let user decide for other domains
    pass_through
    ;;

  "mcp_tool")
    # RAPID MCP tools are trusted
    if [[ "$TOOL_NAME" =~ ^(secure_exec|fetch_via_proxy|get_secret|read_file|write_file|list_files|check_security)$ ]]; then
      allow_decision
    fi
    pass_through
    ;;

  *)
    # Unknown permission type: let user decide
    pass_through
    ;;
esac
