# Current Task: Agent Integration & Sandboxing Research

> Architecture-focused research synthesis for RAPID's next iteration, focusing on sandboxing HTTP/SOCKS and deep IDE integration.

---

## 1) Common "agentic coding" architecture (the shared backbone)

Across modern coding agents, you repeatedly see the same separable layers:

1. **Interaction surface**
   CLI/TUI, IDE extension, web UI, or GitHub PR comment bots.

2. **Agent runtime (the loop)**
   Prompt → plan → tool calls → apply edits → run checks → iterate.

3. **Tooling substrate**
   File read/write, search/grep, command execution, git operations, web fetch/search, plus extensibility via a tool protocol.

4. **Context subsystem**
   Repo map / index, LSP diagnostics, focused file sets, memory/checkpoints.

5. **Safety & governance**
   Permission prompts, policy hooks, sandboxing, audit logs, rollback.

RAPID already orchestrates multiple agents inside a containerized environment and explicitly supports MCP servers. ([GitHub][1])
The "next step" is to make RAPID the _governance + sandbox substrate_ that IDEs and agents plug into, rather than only a launcher.

---

## 2) OpenCode (and why it's integration-friendly)

### Core architectural traits

**Client/server split by design.** When you run `opencode`, it starts both a TUI client and a server; the server exposes an **OpenAPI 3.1** endpoint (and an SDK is generated from it). ([OpenCode][2])
This is the cleanest "remote-control" story among the tools you listed.

**Multiple protocol surfaces:**

- **OpenAPI server** for programmatic control. ([OpenCode][2])
- **ACP (Agent Client Protocol)** server that communicates over stdin/stdout using nd-JSON. ([OpenCode][3])
- **MCP support** for adding external tools (local and remote MCP servers). ([OpenCode][4])

**Config injection hook:** `OPENCODE_CONFIG_DIR` lets you point OpenCode at a custom config directory that includes agents/commands/modes/plugins. ([OpenCode][5])

### What this implies for RAPID

OpenCode is structurally prepared for RAPID to become its "secure runtime":

- Run **OpenCode server inside the container**, expose it via a localhost-only port forward (or a RAPID-controlled socket), and drive it from IDEs/clients via OpenAPI. ([OpenCode][2])
- Treat **ACP** as a lightweight bridge for environments where stdin/stdout transport is simplest (e.g., editor extension spawning a subprocess). ([OpenCode][3])
- Inject RAPID-managed agents/rules/MCP servers via `OPENCODE_CONFIG_DIR` so projects get consistent guardrails automatically. ([OpenCode][5])

---

## 3) Claude Code (best-in-class governance hooks + sandboxing ideas)

### Extensibility and policy control

Claude Code exposes a first-class **hooks system** that can _allow/deny/ask_ before tool execution (and can even rewrite tool inputs and add context). ([Claude Code][6])
This is the cleanest "policy enforcement" integration point among the tools.

Claude Code plugins can bundle **MCP servers** and **LSP servers** (so the agent has code intelligence and external tools). ([Claude Code][7])

Claude Code also has **checkpointing**: each prompt creates a checkpoint; checkpoints persist across sessions and can rewind code and/or conversation (with noted limitations around bash-modified files). ([Claude Code][8])

### Sandboxing and network control

Anthropic's sandboxing writeup explains the security rationale and approach; the open-source **sandbox-runtime** is intended to isolate execution. ([Anthropic][9])
(You've already adapted concepts/code from Claude Code sandboxing—good direction.)

### What this implies for RAPID

Claude Code wants RAPID in two roles:

1. **"Policy brain" via hooks**
   Use `PreToolUse` / `PermissionRequest` to route decisions to RAPID (local daemon): block risky commands, enforce allowed network egress targets, require justification for privilege escalation, etc. ([Claude Code][6])

2. **"Tool substrate" via MCP**
   Ship a RAPID MCP server (or bundle as a Claude plugin MCP server) so Claude Code uses RAPID-approved tools (networked fetch through RAPID proxy, sandboxed exec, secrets broker). ([Claude Code][7])

---

## 4) Aider (git-native agent loop + repo-map context)

### Architectural traits

Aider is a CLI pair-programmer with:

- **Codebase mapping** (a "repo map") as a first-class mechanism for scaling context. ([GitHub][10])
- **Tight git integration**: it automatically commits changes with sensible messages. ([GitHub][10])
- **Optional lint/test loops** that run as it makes changes. ([GitHub][10])

Aider's extensibility story is less "protocol-driven" (vs MCP-first tools); it's more about running inside the right environment with the right git/workflow controls.

### What this implies for RAPID

RAPID should treat Aider as:

- A **high-quality diff/commit engine** that benefits from RAPID's container + secrets + network sandbox.
- An opportunity to standardize safety by **forcing git worktrees / branch isolation**, plus strict command allowlists and proxy-only egress.

---

## 5) GitHub Copilot (IDE-native + MCP convergence)

Copilot is increasingly organized around IDE integration primitives rather than a standalone "agent runtime" you can easily wrap. Two critical integration vectors:

1. **VS Code LM Tools API**
   VS Code exposes a model/tool calling interface (`vscode.lm.tools`) so extensions can contribute tools that models can call. ([Visual Studio Code][11])

2. **MCP in the Copilot ecosystem**
   GitHub documents adding tools via **MCP** so Copilot can call external capabilities. ([GitHub Docs][12])

### What this implies for RAPID

If RAPID becomes a robust **local MCP server**, Copilot becomes reachable without bespoke, fragile integrations:

- Implement **RAPID MCP Server** (policy + sandboxed exec + network broker + secrets broker).
- Publish a minimal "RAPID Tools" catalog tailored to secure development (e.g., `secure_exec`, `dependency_audit`, `policy_check`, `fetch_via_proxy`, `open_pr_in_worktree`), and let Copilot call them via MCP. ([GitHub Docs][12])

---

## 6) Roo Code (editor-resident autonomous agent with tool gating + MCP)

Roo Code is explicit about:

- A large set of internal tools such as `read_file`, `write_to_file`, `execute_command`. ([docs.roocode.com][13])
- MCP connectivity via tools like `use_mcp_tool` and `access_mcp_resource`. ([docs.roocode.com][13])

### What this implies for RAPID

Roo Code can consume RAPID capabilities in two ways:

1. **RAPID as an MCP server** (preferred)
   Let Roo call RAPID's secure tools via MCP (`use_mcp_tool`). ([docs.roocode.com][13])

2. **RAPID as an execution broker**
   Where Roo wants to run `execute_command`, provide a configuration pattern that forces command execution to occur _inside the RAPID container_ (not the host), and forces network through RAPID's proxy. ([docs.roocode.com][14])

---

## 7) Design recommendations for RAPID vNext (to make integration seamless)

### A. Make RAPID a "local agent runtime platform," not only a launcher

RAPID's README already positions it as an orchestrator inside dev containers and an MCP manager. ([GitHub][1])
To deeply integrate with IDEs and multiple agents, define a stable, always-on component:

**RAPID Daemon (host)**

- Owns policy, audit logs, identity, allowed destinations
- Owns **HTTP/SOCKS egress control** and cert trust
- Owns lifecycle of per-project sandboxes (containers/worktrees)
- Exposes:
  - **MCP server endpoint**
  - Optional **OpenAPI** (for richer orchestration)
  - Optional **"exec broker"** protocol (PTY streaming, artifact capture)

**RAPID Sandbox Runtime (container)**

- Executes tools and agents
- Enforces network "only via proxy" at OS level (iptables / eBPF / network namespace routing)
- Exposes a _single_ controlled channel back to RAPID daemon (for logs, approvals, and audited egress)

### B. Standardize on MCP as the universal "capability bus"

You are already supporting MCP servers in RAPID. ([GitHub][1])
MCP is also the common denominator across OpenCode, Claude Code plugins, Roo Code, and increasingly Copilot. ([OpenCode][4])

Concretely:

- Implement a **first-party `rapid-mcp`** that exposes:
  1. **Secure filesystem** operations (scoped to repo/worktree)
  2. **Secure command execution** (allowlist + policy + resource limits)
  3. **Network fetch** (only via RAPID proxy, with allowlists and logging)
  4. **Secrets broker** (short-lived credentials; never reveal raw secrets unless policy allows)
  5. **Security posture tools** (SAST, dep audit, SBOM generation, secret scanning)

- Provide profiles/modes: "strict", "balanced", "experimental" that map to tool availability.

### C. Treat OpenCode's client/server model as your IDE bridge template

Because OpenCode explicitly runs a server alongside the TUI and offers both OpenAPI and ACP, it's an ideal pattern for RAPID's own "agent host." ([OpenCode][2])

Recommendation:

- Implement **RAPID Session API** similar to OpenCode server semantics:
  - session create/list/resume
  - attach clients (IDE, CLI, web)
  - stream events (tool calls, approvals, diffs)

- Then:
  - For OpenCode: drive via its OpenAPI server.
  - For IDEs: provide a thin VS Code extension that attaches to RAPID and optionally proxies into OpenCode/Claude sessions.

### D. First-class policy integration with Claude Code via hooks

Claude's hooks can decide tool execution (`allow/deny/ask`) and can rewrite tool parameters and add context. ([Claude Code][6])
Design a **RAPID "policy hook pack"**:

- `PreToolUse`: enforce command allowlists, path restrictions, network destinations, data egress rules
- `PermissionRequest`: auto-approve safe actions, auto-deny known-bad patterns, escalate uncertain actions to user with rich rationale
- `PostToolUse`: log, diff, attach artifacts, run security checks
- Bundle as a Claude Code plugin that also bundles your MCP server config. ([Claude Code][7])

### E. Build "checkpointing" and "revertability" into RAPID itself

Claude Code's checkpointing is a strong UX primitive (rewind). ([Claude Code][8])
Aider's "commit every change" is a strong safety primitive. ([GitHub][10])

RAPID should unify both:

- **Worktree-per-task** (cheap branch isolation)
- **Automatic checkpoints** at:
  - before tool execution
  - after file edits
  - after tests/lints

- Provide `/rewind` equivalent at the RAPID layer so all agents/IDEs benefit, not only Claude Code.

### F. Network sandboxing: make proxies unavoidable, not optional

Since you're "going deeper on sandboxing http/socks," the key design goal is:

- Agents can _request_ network, but cannot _bypass_ RAPID network controls.

Practically, that means:

- In-container egress routes only to your proxy endpoint
- DNS control (either proxy-resolved or audited resolver)
- Destination allowlists (domain, CIDR, port)
- Full request logging + redaction rules (strip tokens, cookies)
- "Interactive approvals" for first-time destinations
- Deterministic "offline mode" for many tasks

### G. IDE integration strategy: focus on VS Code first, then bridge outward

You can get broad coverage by doing VS Code well, because:

- Roo Code already lives there and speaks MCP. ([docs.roocode.com][13])
- Copilot is there and is converging on tool APIs/MCP-based extension points. ([Visual Studio Code][11])

Deliverables:

1. **RAPID VS Code extension**
   - attaches to RAPID daemon
   - exposes "RAPID Tools" into VS Code tool ecosystem (and/or configures MCP)
   - provides per-project status (container running, proxy policy, secrets loaded)

2. **Agent adapters**
   - OpenCode: use server/OpenAPI + config dir injection ([OpenCode][2])
   - Claude Code: plugin + hooks + MCP server bundle ([Claude Code][7])
   - Roo Code: MCP integration + execution relocation into container ([docs.roocode.com][13])
   - Copilot: MCP tools exposure ([GitHub Docs][12])
   - Aider: run inside container with enforced git/worktree + proxies ([GitHub][10])

---

## 8) A concrete "target architecture" for RAPID vNext

**RAPID Daemon (host)**

- Policy engine + audit log
- Proxy gateway (HTTP CONNECT + SOCKS5) with allowlists
- Secrets broker (short-lived session tokens)
- Session manager (worktrees, containers)
- MCP server endpoint ("rapid://tools")

**RAPID Sandbox (container)**

- Runs agents and tool execution
- Network namespace forces proxy-only egress
- File system scoped to repo/worktree
- Streams events back to daemon

**Clients**

- VS Code extension (and later JetBrains)
- OpenCode TUI / web / IDE extension (driven via its OpenAPI server)
- Claude Code CLI (controlled via hooks + MCP)
- Roo Code (MCP)
- Copilot (MCP)

This structure matches where the ecosystem is heading: protocols (MCP/OpenAPI), editor-first tool calling, and enforceable runtime governance.

---

## Next Steps

If you want, I can follow up with a **compatibility matrix** (per tool: "best integration path," "must-have features," "what to avoid"), plus a **phased implementation plan** (Week 1–2: RAPID MCP + proxy enforcement; Week 3–4: Claude hooks plugin; Week 5–6: VS Code extension; etc.).

---

## References

[1]: https://github.com/a3tai/rapid 'GitHub - a3tai/rapid: Multi-agent development orchestration system with Claude, OpenCode, Aider and more'
[2]: https://opencode.ai/docs/server/?utm_source=chatgpt.com 'Server'
[3]: https://opencode.ai/docs/cli/?utm_source=chatgpt.com 'CLI'
[4]: https://opencode.ai/docs/mcp-servers/?utm_source=chatgpt.com 'MCP servers'
[5]: https://opencode.ai/docs/config/?utm_source=chatgpt.com 'Config'
[6]: https://code.claude.com/docs/en/hooks 'Hooks reference - Claude Code Docs'
[7]: https://code.claude.com/docs/en/plugins-reference 'Plugins reference - Claude Code Docs'
[8]: https://code.claude.com/docs/en/checkpointing 'Checkpointing - Claude Code Docs'
[9]: https://www.anthropic.com/engineering/claude-code-sandboxing 'Making Claude Code more secure and autonomous with sandboxing \\ Anthropic'
[10]: https://github.com/Aider-AI/aider 'GitHub - Aider-AI/aider: aider is AI pair programming in your terminal'
[11]: https://code.visualstudio.com/api/extension-guides/ai/tools?utm_source=chatgpt.com 'Language Model Tool API'
[12]: https://docs.github.com/copilot/customizing-copilot/using-model-context-protocol/extending-copilot-chat-with-mcp?utm_source=chatgpt.com 'Extending GitHub Copilot Chat with Model Context ...'
[13]: https://docs.roocode.com/advanced-usage/available-tools/tool-use-overview?utm_source=chatgpt.com 'Tool Use Overview | Roo Code Documentation'
[14]: https://docs.roocode.com/advanced-usage/available-tools/execute-command?utm_source=chatgpt.com 'execute_command | Roo Code Documentation'
