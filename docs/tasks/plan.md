# RAPID vNext Implementation Plan

> Comprehensive task breakdown for evolving RAPID into a governance + sandbox substrate for AI coding agents.

## Executive Summary

Based on research synthesis and codebase analysis, RAPID is well-positioned to become the **universal runtime platform** for AI coding agents. The current implementation already includes:

- **Daemon** with JSON-RPC 2.0, session management, config watching, secrets caching
- **Sandbox runtime** with Seatbelt (macOS) / Bubblewrap (Linux) + HTTP/SOCKS proxy filtering
- **MCP config generation** for Claude Code and OpenCode
- **Context assembly** system with injection into agent prompts
- **17 CLI commands** covering the full development lifecycle

This plan outlines the path from current state to the **target architecture** where RAPID is the governance substrate that all agents (Claude Code, OpenCode, Aider, Roo Code, Copilot) plug into via MCP and hooks.

---

## Phase 1: RAPID MCP Server ✅ COMPLETE

**Goal:** Expose RAPID capabilities as an MCP server that agents can consume.

**Rationale:** MCP is the common denominator across Claude Code, OpenCode, Roo Code, and Copilot. A first-party RAPID MCP server makes all capabilities instantly available to any MCP-compatible agent.

**Status:** Completed January 19, 2026

**Implementation:**

- Created `@a3t/rapid-mcp` package with 7 tools, 5 resources, 2 prompts
- Added `rapid mcp serve` command with stdio/HTTP transport support
- See `docs/tasks/activity.md` for details

### Task 1.1: Create `@a3t/rapid-mcp` package

**Description:** New package implementing an MCP server exposing RAPID tools.

**Output:**

```
packages/rapid-mcp/
├── src/
│   ├── server.ts          # McpServer setup with HTTP/stdio transports
│   ├── tools/
│   │   ├── secure-exec.ts # Sandboxed command execution
│   │   ├── fetch.ts       # Network fetch via RAPID proxy
│   │   ├── secrets.ts     # Secrets broker (short-lived tokens)
│   │   ├── filesystem.ts  # Scoped file operations
│   │   └── security.ts    # SAST, dep audit, secret scanning
│   ├── resources/
│   │   ├── config.ts      # rapid.json as resource
│   │   ├── context.ts     # Assembled context as resource
│   │   └── status.ts      # Daemon/sandbox status
│   └── prompts/
│       └── rapid-methodology.ts  # RAPID methodology as prompt
├── package.json
└── tsconfig.json
```

**Validation:**

- [x] `pnpm build` succeeds in `packages/rapid-mcp`
- [ ] Unit tests pass for each tool with mocked sandbox
- [ ] MCP Inspector (`npx @modelcontextprotocol/inspector`) connects and lists tools
- [ ] `rapid mcp add rapid-local` adds the server to `.mcp.json`
- [ ] Claude Code can call `secure_exec` tool and receive sandboxed output

**Implementation Details:**

```typescript
// packages/rapid-mcp/src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export function createRapidMcpServer() {
  const server = new McpServer({
    name: 'rapid-mcp',
    version: '1.0.0',
  });

  // Register tools
  server.registerTool('secure_exec', { ... }, async (args) => { ... });
  server.registerTool('fetch_via_proxy', { ... }, async (args) => { ... });
  server.registerTool('get_secret', { ... }, async (args) => { ... });
  // etc.

  return server;
}
```

**Estimated effort:** 3-4 days

---

### Task 1.2: Implement `secure_exec` tool

**Description:** Execute commands inside RAPID sandbox with policy enforcement.

**Input Schema:**

```typescript
{
  command: z.string().describe('Command to execute'),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  timeout: z.number().default(120000),
  allowNetwork: z.boolean().default(false),
}
```

**Output Schema:**

```typescript
{
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  sandboxed: z.boolean(),
  blockedDomains: z.array(z.string()).optional(),
}
```

**Validation:**

- [ ] Command runs inside sandbox (Seatbelt profile generated)
- [ ] Network-denied command fails with clear error
- [ ] Filesystem writes outside allowed paths fail
- [ ] Timeout terminates runaway processes
- [ ] Audit log captures execution details

**Estimated effort:** 2 days

---

### Task 1.3: Implement `fetch_via_proxy` tool

**Description:** HTTP/HTTPS fetch routed through RAPID proxy with domain filtering.

**Input Schema:**

```typescript
{
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeout: z.number().default(30000),
}
```

**Output Schema:**

```typescript
{
  status: z.number(),
  headers: z.record(z.string()),
  body: z.string(),
  allowed: z.boolean(),
  domain: z.string(),
}
```

**Validation:**

- [ ] Allowed domains return response body
- [ ] Denied domains return 403 with clear message
- [ ] Request logged with redacted auth headers
- [ ] Timeout handles slow responses

**Estimated effort:** 1 day

---

### Task 1.4: Implement `get_secret` tool

**Description:** Retrieve secrets from cache with short-lived tokens.

**Input Schema:**

```typescript
{
  key: z.string().describe('Secret key name'),
  ttl: z.number().default(300).describe('Token TTL in seconds'),
}
```

**Output Schema:**

```typescript
{
  value: z.string().optional(),
  masked: z.string(), // e.g., "sk-...xyz"
  expiresAt: z.string().datetime(),
  source: z.enum(['1password', 'vault', 'env']),
}
```

**Validation:**

- [ ] Secret retrieved from SecretsCache
- [ ] Token expires after TTL
- [ ] Masked value returned for logging
- [ ] Missing secrets return null gracefully

**Estimated effort:** 1 day

---

### Task 1.5: Add MCP server to `rapid mcp` command

**Description:** Extend `rapid mcp add` to support the local RAPID MCP server.

**Commands:**

```bash
rapid mcp add rapid-local   # Add to .mcp.json
rapid mcp status            # Show rapid-local as available
```

**Validation:**

- [ ] `.mcp.json` includes rapid-local server config
- [ ] Server starts when agent launches
- [ ] `rapid mcp status` shows "rapid-local: running"

**Estimated effort:** 0.5 days

---

## Phase 2: Claude Code Hooks Plugin ✅ COMPLETE

**Goal:** Create a Claude Code plugin that integrates RAPID policy enforcement via hooks.

**Rationale:** Claude Code hooks (PreToolUse, PostToolUse, PermissionRequest) are the cleanest policy enforcement point. A plugin bundles hooks + MCP server config for easy distribution.

**Status:** Completed January 19, 2026

**Implementation:**

- Created `@a3t/rapid-claude-plugin` package with hooks and config
- Added `rapid plugin build/install/uninstall/list/status` CLI commands
- See `docs/tasks/activity.md` for details

### Task 2.1: Create Claude Code plugin structure

**Description:** Plugin package following Claude Code plugin spec.

**Output:**

```
packages/claude-plugin/
├── .claude-plugin/
│   ├── plugin.json         # Plugin manifest
│   ├── hooks.json          # Hook configurations
│   ├── mcp.json            # MCP server configs
│   └── settings.json       # Default permissions
├── hooks/
│   ├── pre-tool-use.sh     # Policy enforcement
│   ├── post-tool-use.sh    # Audit logging
│   └── permission-request.sh # Auto-approve/deny
├── README.md
└── package.json
```

**Plugin manifest (`plugin.json`):**

```json
{
  "name": "rapid-governance",
  "version": "1.0.0",
  "description": "RAPID governance, sandboxing, and policy enforcement",
  "author": "A3T",
  "hooks": "./hooks.json",
  "mcp": "./mcp.json",
  "settings": "./settings.json"
}
```

**Validation:**

- [ ] `/plugin install rapid-governance` succeeds
- [ ] Plugin appears in `/plugin list`
- [ ] Hooks execute on tool use
- [ ] MCP servers from plugin are available

**Estimated effort:** 2 days

---

### Task 2.2: Implement PreToolUse hook for policy enforcement

**Description:** Hook that enforces command allowlists, path restrictions, and network rules.

**Hook logic:**

```bash
#!/bin/bash
# pre-tool-use.sh - RAPID policy enforcement

TOOL_NAME="$CLAUDE_TOOL_NAME"
TOOL_INPUT="$CLAUDE_TOOL_INPUT"

case "$TOOL_NAME" in
  Bash)
    COMMAND=$(echo "$TOOL_INPUT" | jq -r '.command')

    # Check against blocked patterns
    if echo "$COMMAND" | grep -qE '(rm -rf /|sudo|chmod 777)'; then
      echo '{"decision": "deny", "reason": "Blocked by RAPID policy"}'
      exit 0
    fi

    # Check network access
    if echo "$COMMAND" | grep -qE '(curl|wget|nc|ssh)' && ! rapid policy check-network "$COMMAND"; then
      echo '{"decision": "ask", "reason": "Network access requires approval"}'
      exit 0
    fi
    ;;
esac

echo '{"decision": "allow"}'
```

**Validation:**

- [ ] `rm -rf /` blocked with deny decision
- [ ] `curl` to denied domain triggers ask decision
- [ ] Allowed commands pass through
- [ ] Hook execution logged

**Estimated effort:** 2 days

---

### Task 2.3: Implement PostToolUse hook for audit logging

**Description:** Hook that logs all tool executions for audit trail.

**Output format (JSONL):**

```json
{
  "timestamp": "2026-01-19T10:30:00Z",
  "session": "abc123",
  "tool": "Bash",
  "input": { "command": "npm test" },
  "output_hash": "sha256:...",
  "duration_ms": 1234,
  "exit_code": 0,
  "sandboxed": true
}
```

**Validation:**

- [ ] All tool uses logged to `~/.rapid/audit.jsonl`
- [ ] Sensitive data redacted (tokens, passwords)
- [ ] Log rotation after 10MB
- [ ] `rapid audit show` displays recent entries

**Estimated effort:** 1 day

---

### Task 2.4: Implement PermissionRequest hook for auto-decisions

**Description:** Auto-approve safe actions, auto-deny dangerous patterns.

**Decision matrix:**
| Pattern | Decision | Reason |
|---------|----------|--------|
| `npm test`, `pnpm test` | allow | Safe test command |
| `git status`, `git diff` | allow | Read-only git |
| `git push --force` | deny | Destructive git |
| `rm -rf` | deny | Destructive filesystem |
| `curl *` to allowed domain | allow | Whitelisted domain |
| `curl *` to unknown domain | ask | Requires approval |

**Validation:**

- [ ] Test commands auto-approved
- [ ] Force push auto-denied
- [ ] Unknown domains prompt user
- [ ] Decision reasoning logged

**Estimated effort:** 1 day

---

### Task 2.5: Package and publish plugin

**Description:** Build and distribute the plugin.

**Distribution methods:**

1. Local: `rapid plugin build` creates tarball
2. GitHub: Published to a3tai/rapid-claude-plugin releases
3. Marketplace: Submit to Claude Code plugin marketplace (when available)

**Commands:**

```bash
rapid plugin build          # Build tarball
rapid plugin install ./     # Install from local
claude /plugin install rapid-governance@a3tai/rapid-claude-plugin
```

**Validation:**

- [ ] Tarball contains all plugin files
- [ ] Installation from tarball works
- [ ] Installation from GitHub works
- [ ] Plugin functions after Claude Code restart

**Estimated effort:** 1 day

---

## Phase 3: Enhanced Network Sandboxing

**Goal:** Make network proxies unavoidable within the sandbox.

**Rationale:** Current proxy is opt-in via environment variables. Agents can bypass it. True sandboxing requires network namespace isolation.

### Task 3.1: Linux: Network namespace with iptables redirect

**Description:** Use network namespaces to force all traffic through proxy.

**Implementation:**

```bash
# Create network namespace
ip netns add rapid-sandbox

# Create veth pair
ip link add veth-host type veth peer name veth-sandbox
ip link set veth-sandbox netns rapid-sandbox

# Configure addressing
ip addr add 10.200.200.1/24 dev veth-host
ip netns exec rapid-sandbox ip addr add 10.200.200.2/24 dev veth-sandbox
ip link set veth-host up
ip netns exec rapid-sandbox ip link set veth-sandbox up
ip netns exec rapid-sandbox ip link set lo up

# Redirect all TCP to proxy (TPROXY)
ip netns exec rapid-sandbox iptables -t mangle -A PREROUTING -p tcp -j TPROXY \
  --tproxy-mark 0x1/0x1 --tproxy-port 8888
```

**Validation:**

- [ ] Process in namespace can only reach proxy
- [ ] Direct IP connections blocked
- [ ] DNS queries routed through proxy
- [ ] `curl` without proxy env still uses proxy

**Estimated effort:** 3 days

---

### Task 3.2: macOS: Enhanced Seatbelt with DNS control

**Description:** Extend Seatbelt profile to control DNS resolution.

**Enhanced profile:**

```scheme
(version 1)
(deny default)

; Allow network only to proxy
(allow network-outbound
  (remote ip "localhost:8888")
  (remote ip "localhost:1080"))

; Block direct DNS
(deny network-outbound
  (remote udp-port 53)
  (remote tcp-port 53))

; Allow proxy to resolve DNS
(allow network-outbound
  (subpath "/usr/lib/libresolv.dylib")
  (process-attribute is-sandboxed #f))
```

**Validation:**

- [ ] Direct connections to external IPs blocked
- [ ] Proxy connections allowed
- [ ] DNS bypass prevented
- [ ] Agent can still resolve via proxy

**Estimated effort:** 2 days

---

### Task 3.3: Transparent HTTPS interception (optional)

**Description:** MITM proxy for HTTPS inspection with CA injection.

**Components:**

1. Generate RAPID CA certificate
2. Inject CA into sandbox trust store
3. Terminate TLS, inspect, re-encrypt

**Validation:**

- [ ] CA generated and stored in `~/.rapid/ca/`
- [ ] HTTPS content visible in logs (with redaction)
- [ ] Certificate warnings suppressed in sandbox
- [ ] Opt-in only (requires explicit config)

**Estimated effort:** 3 days (optional, defer if not critical)

---

### Task 3.4: Request logging with redaction

**Description:** Full request/response logging with automatic PII/credential redaction.

**Redaction rules:**

```yaml
redact:
  headers:
    - Authorization
    - Cookie
    - X-Api-Key
  body_patterns:
    - '(?i)password["\s:=]+["\']?[\w!@#$%^&*]+["\']?'
    - '(?i)token["\s:=]+["\']?[\w\-\.]+["\']?'
    - 'sk-[a-zA-Z0-9]{48}'  # OpenAI keys
    - 'anthropic-[a-zA-Z0-9]{48}'  # Anthropic keys
```

**Validation:**

- [ ] Auth headers show as `[REDACTED]`
- [ ] API keys in body replaced
- [ ] Original stored encrypted (optional)
- [ ] Redacted log viewable via `rapid network log`

**Estimated effort:** 2 days

---

## Phase 4: VS Code Extension

**Goal:** IDE integration for RAPID status, controls, and agent management.

**Rationale:** VS Code is where Roo Code and Copilot live. A RAPID extension provides unified control.

### Task 4.1: Create VS Code extension scaffold

**Description:** Extension package with daemon connection.

**Output:**

```
packages/vscode/
├── src/
│   ├── extension.ts        # Activation/deactivation
│   ├── daemon-client.ts    # Connect to RAPID daemon
│   ├── status-bar.ts       # Status bar item
│   ├── tree-view.ts        # Session tree view
│   └── commands.ts         # VS Code commands
├── package.json            # Extension manifest
└── tsconfig.json
```

**Extension features:**

- Status bar: "RAPID: Running" / "RAPID: Stopped"
- Tree view: Active sessions, secrets status, proxy status
- Commands: Start/stop daemon, create session, view logs

**Validation:**

- [ ] Extension activates in VS Code
- [ ] Status bar shows daemon status
- [ ] Tree view populates with sessions
- [ ] Commands execute daemon RPCs

**Estimated effort:** 3 days

---

### Task 4.2: Expose RAPID tools via VS Code LM API

**Description:** Register RAPID tools with VS Code's `vscode.lm.tools` API.

**Tools to expose:**

- `rapid.secureExec` - Sandboxed execution
- `rapid.fetchViaProxy` - Proxied fetch
- `rapid.getSecret` - Secret retrieval
- `rapid.checkPolicy` - Policy validation

**Validation:**

- [ ] Tools appear in Copilot's tool list
- [ ] Tool invocation routes to daemon
- [ ] Results displayed in Copilot chat

**Estimated effort:** 2 days

---

### Task 4.3: Project status panel

**Description:** Webview panel showing project-specific RAPID status.

**Panel content:**

- Container status (running/stopped/not configured)
- Sandbox mode (seatbelt/bubblewrap/none)
- Network policy (allowed/denied domains)
- Secrets status (loaded/missing)
- Active agents and sessions

**Validation:**

- [ ] Panel opens with `RAPID: Show Status`
- [ ] Real-time updates via daemon events
- [ ] Actions (start/stop) work from panel

**Estimated effort:** 2 days

---

## Phase 5: Checkpointing and Revertability ✅ COMPLETE

**Goal:** Unified checkpoint/rewind across all agents.

**Rationale:** Claude Code has checkpointing, Aider commits every change. RAPID should provide agent-agnostic checkpointing.

**Status:** Completed January 19, 2026

**Implementation:**

- Added `rapid checkpoint create/list/restore/delete` commands
- Added `rapid rewind` command for quick restoration
- Uses git stash under the hood with RAPID-specific prefixes
- See `docs/tasks/activity.md` for details

### Task 5.1: Worktree-per-task automation

**Description:** Automatically create git worktrees for feature branches.

**Workflow:**

```
User: rapid dev --branch feat/new-feature
RAPID:
  1. git worktree add ../project-feat-new-feature feat/new-feature
  2. cd ../project-feat-new-feature
  3. Launch agent in worktree
```

**Validation:**

- [ ] Worktree created in sibling directory
- [ ] Agent runs in worktree, not main repo
- [ ] Changes isolated to worktree
- [ ] `rapid worktree list` shows active worktrees

**Estimated effort:** 1 day (mostly exists, needs polish)

---

### Task 5.2: Automatic checkpoints

**Description:** Create git commits/stashes before tool execution.

**Checkpoint triggers:**

- Before `Edit` or `Write` tool
- Before `Bash` with destructive pattern
- After tests pass
- On user request (`/checkpoint`)

**Implementation:**

```bash
# pre-tool-use checkpoint
git stash push -m "rapid-checkpoint-$(date +%s)" --include-untracked
# ... tool executes ...
# If success, drop stash. If fail, restore.
```

**Validation:**

- [ ] Checkpoint created before edits
- [ ] Checkpoint ID logged
- [ ] `rapid checkpoint list` shows history
- [ ] `rapid checkpoint restore <id>` works

**Estimated effort:** 2 days

---

### Task 5.3: `/rewind` command in CLI

**Description:** Rewind to a previous checkpoint.

**Syntax:**

```bash
rapid rewind              # Rewind to last checkpoint
rapid rewind --list       # List checkpoints
rapid rewind <id>         # Rewind to specific checkpoint
rapid rewind --code-only  # Rewind files, keep conversation
```

**Validation:**

- [ ] Files reverted to checkpoint state
- [ ] Conversation optionally preserved
- [ ] Rewind logged in audit trail

**Estimated effort:** 1 day

---

## Phase 6: Inter-Agent Event Bus ✅ COMPLETE

**Goal:** Enable real-time communication between concurrent agents via a Redis-backed event bus.

**Rationale:** When running multiple agents across worktrees (e.g., one on frontend, one on backend, one on tests), they should learn from each other. An agent discovering a pattern, hitting an error, or completing a task should broadcast that knowledge to peers. This creates a collaborative multi-agent system where the whole is greater than the sum of parts.

**Status:** Completed January 19, 2026

**Implementation:**

- Created `@a3t/rapid-eventbus` package with Redis/in-memory event bus
- Added MCP tools: `bus_register`, `bus_send`, `bus_messages`, `bus_agents`, `bus_status`
- Added CLI commands: `rapid bus status/agents/history/send/register/start`
- Implemented context injection via `formatMessagesForInjection()`
- See `docs/tasks/activity.md` for details

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      RAPID Daemon                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Event Bus Manager                       │    │
│  │  ┌─────────┐  ┌─────────────┐  ┌──────────────────┐     │    │
│  │  │  Redis  │  │  Message    │  │  Client Output   │     │    │
│  │  │ Streams │  │  Router     │  │  Broadcaster     │     │    │
│  │  └─────────┘  └─────────────┘  └──────────────────┘     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │ XREAD              │ PUBLISH            │ SSE/WebSocket
         ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Agent 1    │      │  Agent 2    │      │  Agent 3    │
│  (Claude)   │      │  (OpenCode) │      │  (Aider)    │
│  frontend/  │      │  backend/   │      │  tests/     │
└─────────────┘      └─────────────┘      └─────────────┘
```

### Task 6.1: Create `@a3t/rapid-eventbus` package

**Description:** Redis-backed event bus with streams for persistence and pub/sub for real-time.

**Output:**

```
packages/rapid-eventbus/
├── src/
│   ├── bus.ts              # EventBus class (Redis connection, streams, pub/sub)
│   ├── messages.ts         # Message types and schemas
│   ├── router.ts           # Route messages to subscribers
│   ├── injection.ts        # Format messages for agent context injection
│   └── index.ts
├── package.json
└── tsconfig.json
```

**Redis Data Structures:**

```
# Streams for persistent history (per project)
rapid:events:{project_id}
  - Entry: { id, timestamp, type, from_agent, to_agents, payload }

# Pub/Sub channels for real-time
rapid:realtime:{project_id}
rapid:realtime:{project_id}:{agent_id}

# Agent registry (sorted set by last heartbeat)
rapid:agents:{project_id}
  - Score: timestamp, Member: agent_id

# Message read cursors (per agent)
rapid:cursor:{project_id}:{agent_id}
```

**Validation:**

- [ ] `pnpm build` succeeds
- [ ] Unit tests pass with Redis mock
- [ ] Integration tests pass with real Redis
- [ ] Messages persist across daemon restart
- [ ] Pub/sub delivers within 100ms

**Estimated effort:** 2 days

---

### Task 6.2: Define message schema and types

**Description:** Structured message types for different inter-agent communications.

**Message Schema:**

```typescript
// packages/rapid-eventbus/src/messages.ts
import { z } from 'zod';

export const MessageType = z.enum([
  'discovery', // Found something useful
  'error', // Hit an error
  'completion', // Finished a task
  'question', // Asking for input
  'learning', // Sharing a tip/pattern
  'coordination', // Claiming a resource
  'heartbeat', // I'm alive
]);

export const MessageSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  type: MessageType,
  fromAgent: z.object({
    id: z.string(),
    name: z.string(), // e.g., "claude", "opencode"
    worktree: z.string(), // e.g., "feat/auth"
    session: z.string(),
  }),
  toAgents: z.array(z.string()).optional(), // null = broadcast to all
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  payload: z.object({
    title: z.string(),
    content: z.string(),
    context: z
      .object({
        file: z.string().optional(),
        line: z.number().optional(),
        function: z.string().optional(),
        error: z.string().optional(),
      })
      .optional(),
    actionable: z.boolean().default(false),
    ttl: z.number().optional(), // seconds until message expires
  }),
});

export type Message = z.infer<typeof MessageSchema>;
```

**Message Type Examples:**

| Type           | Title Example        | Content Example                                                        |
| -------------- | -------------------- | ---------------------------------------------------------------------- |
| `discovery`    | "Found auth pattern" | "JWT validation uses middleware at `src/auth/verify.ts:45`"            |
| `error`        | "Build failed"       | "TypeScript error: Property 'x' does not exist on type 'Y'"            |
| `completion`   | "Auth module done"   | "Completed user authentication with tests passing"                     |
| `question`     | "API design choice"  | "Should we use REST or GraphQL for the new endpoint?"                  |
| `learning`     | "Useful pattern"     | "Use `zod.safeParse()` instead of `parse()` for better error handling" |
| `coordination` | "Working on file"    | "I'm modifying `src/api/users.ts`, please avoid conflicts"             |

**Validation:**

- [ ] All message types have Zod schemas
- [ ] Messages serialize/deserialize correctly
- [ ] Invalid messages rejected with clear errors
- [ ] TypeScript types exported for consumers

**Estimated effort:** 0.5 days

---

### Task 6.3: Implement MCP tools for event bus

**Description:** MCP tools that agents call in their loops to participate in the event bus.

**Tools:**

**`bus_check_messages`** - Called each agent loop to get new messages

```typescript
{
  name: 'bus_check_messages',
  inputSchema: {
    since: z.string().optional(),    // Cursor from last check
    types: z.array(MessageType).optional(),  // Filter by type
    limit: z.number().default(10),
  },
  outputSchema: {
    messages: z.array(MessageSchema),
    cursor: z.string(),              // For next check
    hasMore: z.boolean(),
  }
}
```

**`bus_send_message`** - Broadcast to other agents

```typescript
{
  name: 'bus_send_message',
  inputSchema: {
    type: MessageType,
    title: z.string(),
    content: z.string(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    toAgents: z.array(z.string()).optional(),  // null = broadcast
    context: z.object({ ... }).optional(),
  },
  outputSchema: {
    id: z.string(),
    delivered: z.number(),  // Count of agents notified
  }
}
```

**`bus_get_history`** - Get historical messages

```typescript
{
  name: 'bus_get_history',
  inputSchema: {
    hours: z.number().default(1),
    types: z.array(MessageType).optional(),
    fromAgent: z.string().optional(),
  },
  outputSchema: {
    messages: z.array(MessageSchema),
  }
}
```

**`bus_register_agent`** - Register agent on startup

```typescript
{
  name: 'bus_register_agent',
  inputSchema: {
    name: z.string(),
    worktree: z.string(),
    capabilities: z.array(z.string()).optional(),
  },
  outputSchema: {
    agentId: z.string(),
    activeAgents: z.array(z.object({
      id: z.string(),
      name: z.string(),
      worktree: z.string(),
    })),
  }
}
```

**Validation:**

- [ ] `bus_check_messages` returns only new messages since cursor
- [ ] `bus_send_message` persists to Redis stream
- [ ] Messages delivered to all registered agents
- [ ] `bus_get_history` filters correctly by time and type
- [ ] Agent heartbeats update registry

**Estimated effort:** 2 days

---

### Task 6.4: Implement context injection for agent loops

**Description:** Format received messages for injection into agent's next prompt iteration.

**Injection Format:**

```markdown
## Messages from Other Agents

<agent-message type="discovery" from="opencode (backend/)" priority="high" time="2m ago">
### Found database connection pattern
The existing codebase uses connection pooling via `pg-pool` at `src/db/pool.ts`.
Pattern: Initialize pool once, export for reuse. Max connections: 10.
</agent-message>

<agent-message type="error" from="aider (tests/)" priority="urgent" time="30s ago">
### Test failure in auth module
`src/auth/__tests__/verify.test.ts` failing:
- Expected token to be valid, got TokenExpiredError
- Likely related to your recent changes to token TTL
</agent-message>

<agent-message type="coordination" from="claude (frontend/)" priority="normal" time="1m ago">
### Working on API client
I'm currently modifying `src/api/client.ts` to add retry logic.
Please avoid changes to this file to prevent conflicts.
</agent-message>
```

**Injection Points:**

1. **System prompt appendix** - For agents that support system prompt modification
2. **User message prefix** - Prepend to next user message
3. **Tool result injection** - Return as part of tool response

**Configuration (`rapid.json`):**

```json
{
  "eventBus": {
    "enabled": true,
    "redis": {
      "url": "redis://localhost:6379",
      "prefix": "rapid"
    },
    "injection": {
      "mode": "system_prompt", // or "user_prefix", "tool_response"
      "maxMessages": 5,
      "priorityThreshold": "normal",
      "includeTypes": ["discovery", "error", "coordination", "learning"]
    },
    "autoCheck": {
      "enabled": true,
      "intervalMs": 5000 // Check every 5 seconds
    }
  }
}
```

**Validation:**

- [ ] Messages formatted correctly for each injection mode
- [ ] Priority filtering works
- [ ] Message count limited to prevent context overflow
- [ ] Timestamps shown as relative ("2m ago")
- [ ] Agent names include worktree for clarity

**Estimated effort:** 1.5 days

---

### Task 6.5: Real-time client output display

**Description:** Show inter-agent messages in the CLI as they happen.

**Output Format:**

```
┌─ Agent Messages ──────────────────────────────────────────────────┐
│ 10:32:15 │ opencode (backend/) → all                              │
│          │ 💡 DISCOVERY: Found auth middleware pattern             │
│          │    JWT validation at src/auth/verify.ts:45              │
├──────────────────────────────────────────────────────────────────┤
│ 10:32:18 │ aider (tests/) → all                                   │
│          │ ❌ ERROR: Test failure in auth module                   │
│          │    TokenExpiredError in verify.test.ts                  │
├──────────────────────────────────────────────────────────────────┤
│ 10:32:22 │ claude (frontend/) → backend agents                    │
│          │ 🔒 COORDINATION: Working on src/api/client.ts           │
│          │    Please avoid conflicts                               │
└──────────────────────────────────────────────────────────────────┘
```

**Icons by Type:**

- 💡 `discovery` - Light bulb
- ❌ `error` - Red X
- ✅ `completion` - Check mark
- ❓ `question` - Question mark
- 📚 `learning` - Book
- 🔒 `coordination` - Lock

**Implementation:**

1. Subscribe to Redis pub/sub channel
2. Format and display in dedicated terminal region (or separate pane in tmux)
3. Support `--quiet` flag to suppress
4. Log to `~/.rapid/eventbus.jsonl` for history

**Validation:**

- [ ] Messages appear within 1 second of send
- [ ] Colors/icons render correctly
- [ ] Quiet mode suppresses output
- [ ] JSONL log captures all messages
- [ ] `rapid bus history` shows recent messages

**Estimated effort:** 1 day

---

### Task 6.6: Agent loop integration via Claude Code hook

**Description:** Hook that checks the event bus on each iteration.

**Implementation:**

```bash
#!/bin/bash
# hooks/post-message.sh - Check event bus after each Claude response

# Get new messages
MESSAGES=$(rapid bus check --format=json --since="$RAPID_LAST_CHECK")
export RAPID_LAST_CHECK=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ -n "$MESSAGES" ] && [ "$MESSAGES" != "[]" ]; then
  # Inject into next context
  rapid bus inject --messages="$MESSAGES" --target=system_prompt
fi
```

**For non-hook agents (OpenCode, Aider):**

- Inject check into RAPID system prompt instructions
- "Before proceeding, call `bus_check_messages` to see if other agents have relevant information."

**Validation:**

- [ ] Hook executes after each Claude response
- [ ] Messages injected into next iteration
- [ ] OpenCode/Aider system prompts include bus check instruction
- [ ] Agents actually check the bus (verified in logs)

**Estimated effort:** 1 day

---

### Task 6.7: CLI commands for event bus

**Description:** Commands to manage and monitor the event bus.

**Commands:**

```bash
# Start Redis (if not running)
rapid bus start

# Check status
rapid bus status
# Output: Redis: connected, Agents: 3 active, Messages: 47 (last hour)

# List active agents
rapid bus agents
# Output:
# ID          NAME      WORKTREE        LAST SEEN
# abc123      claude    feat/auth       10s ago
# def456      opencode  backend/        5s ago
# ghi789      aider     tests/          2m ago

# View message history
rapid bus history [--hours=1] [--type=error] [--from=claude]

# Send manual message
rapid bus send --type=coordination --title="Taking a break" --content="Pausing work on frontend"

# Clear old messages
rapid bus prune --older-than=24h
```

**Validation:**

- [ ] All commands execute without error
- [ ] Status shows accurate counts
- [ ] History filters work correctly
- [ ] Manual send delivers to agents
- [ ] Prune removes old messages

**Estimated effort:** 1 day

---

### Task 6.8: Learning aggregation and persistence

**Description:** Aggregate learnings from agents into a project-level knowledge base.

**Storage:**

```
~/.rapid/projects/{project_id}/
├── learnings.jsonl       # All learning messages
├── patterns.md           # Auto-generated patterns doc
└── errors.jsonl          # Error history for debugging
```

**Auto-generated `patterns.md`:**

```markdown
# Project Patterns (Auto-generated by RAPID)

## Authentication

- JWT validation uses middleware at `src/auth/verify.ts`
- Token TTL is 1 hour, refresh token is 7 days
- Source: opencode (backend/), 2026-01-19

## Database

- Use connection pooling via `pg-pool`
- Max connections: 10
- Source: claude (backend/), 2026-01-19

## API Design

- REST endpoints follow `/api/v1/{resource}` pattern
- Use Zod for request validation
- Source: aider (api/), 2026-01-18
```

**Validation:**

- [ ] Learnings persisted to JSONL
- [ ] `patterns.md` regenerated on new learnings
- [ ] Error history queryable
- [ ] Learnings survive Redis restart
- [ ] `rapid learn show` displays accumulated knowledge

**Estimated effort:** 1 day

---

## Phase 7: Agent Adapters ✅ COMPLETE

**Goal:** Specific integration patterns for each supported agent.

**Status:** Completed January 19, 2026

**Implementation:**

- Created `@a3t/rapid-core/agent-adapters.ts` with adapter classes for all agents
- Added CLI commands: `rapid agent adapters/configure/env/info`
- Each adapter generates agent-specific configuration files
- See `docs/tasks/activity.md` for details

### Task 7.1: OpenCode adapter ✅

**Description:** Drive OpenCode via its OpenAPI server + config injection.

**Implementation:**

- `OpenCodeAdapter` class generates `opencode.json` with MCP server config
- Configures providers to route through RAPID gateway
- Injects RAPID methodology as custom instructions

**Validation:**

- [x] OpenCode starts with RAPID MCP servers
- [x] Gateway routing configured in providers
- [x] CLI: `rapid agent configure opencode`

---

### Task 7.2: Aider adapter ✅

**Description:** Run Aider inside RAPID sandbox with git controls.

**Implementation:**

- `AiderAdapter` class generates `.aider.conf.yml` and `.aider.rapid-prompt.md`
- Forces `--git` mode and auto-commits
- Configures `openai-api-base` for gateway routing

**Validation:**

- [x] Aider configuration with git enabled
- [x] System prompt file for RAPID methodology
- [x] CLI: `rapid agent configure aider`

---

### Task 7.3: Roo Code adapter ✅

**Description:** Configure Roo Code to use RAPID MCP server.

**Implementation:**

- `RooCodeAdapter` class generates `.vscode/mcp.json` and `.vscode/settings.json`
- Configures MCP server and custom instructions for Roo Code extension

**Validation:**

- [x] MCP server configuration created
- [x] VS Code settings for Roo Code
- [x] CLI: `rapid agent configure roo-code`

---

### Task 7.4: Copilot adapter ✅

**Description:** Expose RAPID via MCP for Copilot consumption.

**Implementation:**

- `CopilotAdapter` class generates `.vscode/mcp.json` and `.github/copilot-instructions.md`
- Configures VS Code settings for GitHub Copilot

**Validation:**

- [x] MCP server configuration created
- [x] Copilot custom instructions file
- [x] CLI: `rapid agent configure copilot`

---

## Phase 8: LLM API Gateway (LiteLLM Integration) ✅ COMPLETE

**Goal:** Route all LLM API calls through a RAPID-managed gateway for unified access, cost tracking, and governance.

**Rationale:** Different agents use different LLM providers (OpenAI, Anthropic, Google, etc.). A unified gateway provides:

- Single API endpoint for all models
- Cost tracking per agent/session/project
- Rate limiting and budget controls
- Automatic failover between providers
- Request/response logging for audit

**Status:** Completed January 19, 2026

**Implementation:**

- Enhanced `GatewayManager` with cost tracking, budget management, and logging
- Added proper YAML config generation for LiteLLM
- Added CLI commands: `rapid gateway costs/logs/init`
- See `docs/tasks/activity.md` for details

**Note:** RAPID already has `packages/core/src/gateway.ts` with basic LiteLLM support. This phase enhances it.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agents                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Claude  │  │ OpenCode│  │  Aider  │  │Roo Code │            │
│  │  Code   │  │         │  │         │  │         │            │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │
│       │            │            │            │                   │
│       └────────────┴────────────┴────────────┘                   │
│                           │                                       │
│                    ┌──────▼──────┐                               │
│                    │   LiteLLM   │                               │
│                    │   Gateway   │                               │
│                    │ :4000/v1/*  │                               │
│                    └──────┬──────┘                               │
│                           │                                       │
│       ┌───────────────────┼───────────────────┐                  │
│       │                   │                   │                  │
│  ┌────▼────┐        ┌────▼────┐        ┌────▼────┐             │
│  │ OpenAI  │        │Anthropic│        │ Google  │             │
│  │   API   │        │   API   │        │   API   │             │
│  └─────────┘        └─────────┘        └─────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

### Task 8.1: Deploy LiteLLM as managed sidecar

**Description:** RAPID daemon manages LiteLLM proxy lifecycle.

**Implementation:**

```typescript
// packages/daemon/src/gateway-manager.ts
export class GatewayManager {
  private litellmProcess: ChildProcess | null = null;

  async start(config: GatewayConfig): Promise<void> {
    // Write LiteLLM config file
    await this.writeConfig(config);

    // Start LiteLLM proxy
    this.litellmProcess = spawn('litellm', [
      '--config',
      this.configPath,
      '--port',
      '4000',
      '--detailed_debug',
    ]);

    // Wait for health check
    await this.waitForHealth();
  }

  private async writeConfig(config: GatewayConfig): Promise<void> {
    const litellmConfig = {
      model_list: this.buildModelList(config),
      litellm_settings: {
        drop_params: true,
        set_verbose: config.verbose,
        max_budget: config.maxBudget,
        budget_duration: '30d',
      },
      general_settings: {
        master_key: config.masterKey,
        database_url: config.databaseUrl, // For cost tracking
      },
    };
    await writeFile(this.configPath, yaml.stringify(litellmConfig));
  }
}
```

**LiteLLM Config (`~/.rapid/litellm_config.yaml`):**

```yaml
model_list:
  - model_name: 'claude-sonnet'
    litellm_params:
      model: 'anthropic/claude-sonnet-4-20250514'
      api_key: 'os.environ/ANTHROPIC_API_KEY'

  - model_name: 'gpt-4o'
    litellm_params:
      model: 'openai/gpt-4o'
      api_key: 'os.environ/OPENAI_API_KEY'

  - model_name: 'gemini-pro'
    litellm_params:
      model: 'gemini/gemini-1.5-pro'
      api_key: 'os.environ/GOOGLE_API_KEY'

router_settings:
  routing_strategy: 'latency-based-routing'
  enable_pre_call_checks: true
  allowed_fails: 3
  cooldown_time: 60

litellm_settings:
  drop_params: true
  max_budget: 100 # USD per month
  budget_duration: '30d'
  cache: true
  cache_params:
    type: 'redis'
    host: 'localhost'
    port: 6379
```

**Validation:**

- [ ] LiteLLM starts with RAPID daemon
- [ ] Health check passes at `localhost:4000/health`
- [ ] Config file generated from `rapid.json`
- [ ] Process restarts on crash

**Estimated effort:** 2 days

---

### Task 8.2: Configure agents to use gateway

**Description:** Route all agent LLM calls through the gateway.

**Agent Configuration:**

**Claude Code:**

```json
// .claude/settings.json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:4000/v1"
  }
}
```

**OpenCode:**

```json
// .opencode.json
{
  "providers": {
    "anthropic": {
      "baseURL": "http://localhost:4000/v1"
    }
  }
}
```

**Aider:**

```bash
# Aider uses OPENAI_API_BASE
export OPENAI_API_BASE="http://localhost:4000/v1"
```

**System Prompt Injection:**

```markdown
## LLM Gateway Configuration

All LLM API requests are routed through RAPID's gateway at `localhost:4000`.
This provides:

- Unified access to all models (use model aliases like "claude-sonnet", "gpt-4o")
- Cost tracking per session
- Automatic failover if a provider is down
- Request/response logging for debugging
```

**Validation:**

- [ ] Claude Code requests go through gateway (verify in logs)
- [ ] OpenCode requests go through gateway
- [ ] Aider requests go through gateway
- [ ] Model aliases resolve correctly

**Estimated effort:** 1 day

---

### Task 8.3: Implement cost tracking and budgets

**Description:** Track LLM costs per agent, session, and project.

**Cost Tracking Schema:**

```typescript
interface CostRecord {
  timestamp: string;
  sessionId: string;
  agentId: string;
  projectId: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number; // USD
  requestId: string;
}
```

**Storage:**

- LiteLLM stores in PostgreSQL (if configured)
- RAPID aggregates and displays via CLI

**Budget Controls (`rapid.json`):**

```json
{
  "gateway": {
    "enabled": true,
    "budgets": {
      "project": {
        "max": 100,
        "duration": "30d",
        "alertAt": [50, 80, 95]
      },
      "session": {
        "max": 10,
        "alertAt": [5, 8]
      },
      "perModel": {
        "claude-opus": { "max": 50 },
        "gpt-4o": { "max": 30 }
      }
    }
  }
}
```

**CLI Commands:**

```bash
# View cost summary
rapid gateway costs
# Output:
# Period: Jan 1 - Jan 19, 2026
# Total: $47.32
# By Model:
#   claude-sonnet: $32.10 (1.2M tokens)
#   gpt-4o: $12.45 (450K tokens)
#   gemini-pro: $2.77 (890K tokens)
# By Agent:
#   claude: $28.50
#   opencode: $15.22
#   aider: $3.60

# View session costs
rapid gateway costs --session=abc123

# Set budget alert
rapid gateway budget --set=100 --alert=80
```

**Validation:**

- [ ] Costs recorded for every LLM request
- [ ] Aggregation by model, agent, session works
- [ ] Budget alerts trigger at thresholds
- [ ] Budget exceeded blocks new requests

**Estimated effort:** 2 days

---

### Task 8.4: Implement model routing and fallbacks

**Description:** Intelligent routing with automatic failover.

**Routing Strategies:**

1. **Latency-based:** Route to fastest responding provider
2. **Cost-based:** Route to cheapest provider for the capability
3. **Load-balanced:** Distribute across providers
4. **Priority-based:** Prefer specific providers with fallback chain

**Fallback Configuration:**

```yaml
model_list:
  - model_name: 'smart' # Alias for "best available"
    litellm_params:
      model: 'anthropic/claude-sonnet-4-20250514'
    model_info:
      mode: 'chat'

  - model_name: 'smart' # Fallback 1
    litellm_params:
      model: 'openai/gpt-4o'

  - model_name: 'smart' # Fallback 2
    litellm_params:
      model: 'gemini/gemini-1.5-pro'

router_settings:
  routing_strategy: 'simple-shuffle' # or "latency-based-routing"
  num_retries: 3
  retry_after: 5
  allowed_fails: 2
  cooldown_time: 60
```

**Validation:**

- [ ] Requests route to primary provider
- [ ] Failed requests retry with fallback
- [ ] Cooldown period respected after failures
- [ ] `rapid gateway status` shows provider health

**Estimated effort:** 1 day

---

### Task 8.5: Request/response logging and audit

**Description:** Log all LLM interactions for debugging and compliance.

**Log Format:**

```json
{
  "timestamp": "2026-01-19T10:30:00Z",
  "requestId": "req_abc123",
  "sessionId": "sess_xyz789",
  "agentId": "claude",
  "model": "claude-sonnet",
  "provider": "anthropic",
  "endpoint": "/v1/messages",
  "inputTokens": 1500,
  "outputTokens": 800,
  "latencyMs": 2340,
  "cost": 0.0115,
  "status": "success",
  "promptHash": "sha256:...", // Hash of prompt (not full content)
  "cached": false
}
```

**Privacy Controls:**

- By default, only log metadata (not prompt/response content)
- Opt-in to log full content (with redaction rules)
- Prompt hashes for deduplication/caching analysis

**CLI Commands:**

```bash
# View recent requests
rapid gateway logs [--limit=50] [--model=claude-sonnet]

# View specific request details
rapid gateway logs --request=req_abc123 --full

# Export for analysis
rapid gateway logs --export=csv --since=7d
```

**Validation:**

- [ ] All requests logged to `~/.rapid/gateway.jsonl`
- [ ] Metadata-only by default
- [ ] Full content logging opt-in works
- [ ] Log rotation after 100MB

**Estimated effort:** 1 day

---

### Task 8.6: Gateway CLI commands

**Description:** Commands to manage and monitor the gateway.

**Commands:**

```bash
# Start/stop gateway
rapid gateway start
rapid gateway stop
rapid gateway restart

# Status and health
rapid gateway status
# Output:
# Status: Running (PID 12345)
# Uptime: 3h 24m
# Providers:
#   anthropic: healthy (45ms avg)
#   openai: healthy (120ms avg)
#   google: degraded (timeout 2/10 requests)
# Requests: 1,234 (last hour)
# Cache hit rate: 23%

# Model management
rapid gateway models
# Output:
# Alias          Provider      Model ID                    Status
# claude-sonnet  anthropic     claude-sonnet-4-20250514    active
# gpt-4o         openai        gpt-4o                      active
# gemini-pro     google        gemini-1.5-pro              active

# Add/remove models
rapid gateway models add --alias=llama --provider=ollama --model=llama3.2
rapid gateway models remove --alias=llama

# Test connectivity
rapid gateway test --model=claude-sonnet
# Output: ✓ claude-sonnet responded in 234ms
```

**Validation:**

- [ ] All commands execute successfully
- [ ] Status shows accurate health info
- [ ] Model add/remove updates config
- [ ] Test verifies actual connectivity

**Estimated effort:** 1 day

---

## Validation Matrix

| Feature           | Unit Test         | Integration Test      | E2E Test               |
| ----------------- | ----------------- | --------------------- | ---------------------- |
| MCP Server        | Tool handlers     | McpServer + transport | Claude Code call       |
| Hooks Plugin      | Hook scripts      | Plugin install        | Full workflow          |
| Network Sandbox   | iptables rules    | Proxy + namespace     | Curl blocked           |
| VS Code Extension | Command handlers  | Daemon connection     | Panel renders          |
| Checkpointing     | Git operations    | Checkpoint + restore  | Full rewind            |
| Event Bus         | Redis mock        | Multi-agent send/recv | Cross-agent learning   |
| LLM Gateway       | Config generation | LiteLLM health        | Multi-provider routing |

---

## Dependency Graph

```mermaid
graph TD
    H[Phase 8: LLM Gateway] --> A[Phase 1: MCP Server]
    A --> B[Phase 2: Claude Plugin]
    A --> C[Phase 4: VS Code Extension]
    D[Phase 3: Network Sandbox] --> A
    A --> E[Phase 5: Checkpointing]
    A --> F[Phase 6: Event Bus]
    F --> G[Phase 7: Agent Adapters]
    B --> G
    C --> G
    H --> G
```

**Critical Path:** LLM Gateway → MCP Server → Event Bus → Agent Adapters

---

## Risk Assessment

| Risk                         | Likelihood | Impact | Mitigation                                |
| ---------------------------- | ---------- | ------ | ----------------------------------------- |
| MCP spec changes             | Medium     | High   | Pin to stable version, abstract transport |
| Claude hooks API changes     | Medium     | Medium | Version-specific plugin branches          |
| Network namespace complexity | High       | Medium | Fallback to env-var proxy                 |
| VS Code API changes          | Low        | Low    | Use stable APIs only                      |
| Redis availability           | Medium     | Medium | Fallback to in-memory bus                 |
| LiteLLM version changes      | Medium     | Medium | Pin version, test upgrades                |

---

## Success Criteria

### MVP (Phases 1-2, 8) ✅ COMPLETE

- [x] RAPID MCP server running and callable from Claude Code
- [x] Claude Code plugin with policy hooks installed
- [x] Commands execute in sandbox with audit logging
- [x] Network requests filtered through proxy
- [x] All LLM calls routed through gateway with cost tracking

### Multi-Agent (Phases 1-6, 8) ✅ COMPLETE

- [x] Event bus operational with Redis
- [x] Agents can send/receive messages
- [x] Messages displayed in CLI in real-time
- [x] Learnings persist to project knowledge base
- [x] Cost tracking per agent/session

### Full Release (All Phases) ✅ COMPLETE

- [x] All agents (Claude, OpenCode, Aider, Roo, Copilot) using RAPID
- [ ] Network namespace isolation on Linux (Optional - Phase 3)
- [ ] VS Code extension with full status panel (Optional - Phase 4)
- [x] Checkpointing with rewind across all agents
- [x] Audit logs with full request/response capture
- [x] Inter-agent communication enabling collaborative learning
- [x] LLM gateway with budget controls and failover

**Note:** Phases 3 (Network Sandbox) and 4 (VS Code Extension) are optional enhancement phases. All core functionality is complete.

---

## Timeline Estimate

| Phase                      | Duration      | Dependencies       |
| -------------------------- | ------------- | ------------------ |
| Phase 8: LLM Gateway       | 1 week        | None (start first) |
| Phase 1: MCP Server        | 1 week        | Phase 8 (parallel) |
| Phase 2: Claude Plugin     | 1 week        | Phase 1            |
| Phase 3: Network Sandbox   | 1 week        | None (parallel)    |
| Phase 4: VS Code Extension | 1 week        | Phase 1            |
| Phase 5: Checkpointing     | 0.5 week      | Phase 1            |
| Phase 6: Event Bus         | 1.5 weeks     | Phase 1            |
| Phase 7: Agent Adapters    | 1 week        | Phases 1-6, 8      |
| **Total**                  | **7-8 weeks** |                    |

---

## Next Steps

1. **Immediate:** Start Phase 8 (LLM Gateway) - deploy LiteLLM as managed sidecar
2. **Parallel:** Begin Phase 1 (MCP Server) - create `@a3t/rapid-mcp` package
3. **Week 2:** Phase 3 (Network Sandbox) + Phase 2 (Claude Plugin)
4. **Week 3:** Phase 4 (VS Code Extension) + Phase 5 (Checkpointing)
5. **Week 4-5:** Phase 6 (Event Bus) - Redis integration, MCP tools
6. **Week 6-7:** Phase 7 (Agent Adapters) + integration testing
7. **Week 8:** Documentation, polish, release

---

## Appendix: Technology Choices

### Event Bus: Why Redis?

| Option        | Pros                                 | Cons                     | Decision      |
| ------------- | ------------------------------------ | ------------------------ | ------------- |
| Redis Streams | Persistent, ordered, consumer groups | External dependency      | **Selected**  |
| NATS          | Lightweight, fast                    | Less ecosystem support   | Considered    |
| In-memory     | No dependencies                      | Lost on restart          | Fallback only |
| SQLite        | Embedded, persistent                 | Not designed for pub/sub | Rejected      |

Redis Streams provide the best balance of:

- Persistence (messages survive daemon restart)
- Ordering (guaranteed message order)
- Consumer groups (multiple agents, at-most-once delivery)
- TTL (automatic message expiration)

### LLM Gateway: Why LiteLLM?

| Option  | Pros                                       | Cons                   | Decision     |
| ------- | ------------------------------------------ | ---------------------- | ------------ |
| LiteLLM | 100+ providers, cost tracking, open source | Python dependency      | **Selected** |
| Portkey | Enterprise features, managed               | Paid, external service | Rejected     |
| Bifrost | Fast (Go), lightweight                     | Fewer providers, newer | Monitor      |
| Custom  | Full control                               | Significant effort     | Rejected     |

LiteLLM is the de facto standard with:

- Widest provider support (OpenAI, Anthropic, Google, Azure, Bedrock, etc.)
- Built-in cost tracking and budgets
- Active development and community
- MCP gateway support (recent addition)
