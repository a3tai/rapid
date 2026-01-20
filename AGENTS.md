# Agent Instructions

## Project: rapid

This file contains instructions for AI coding agents working on this project.

## Overview

RAPID is a multi-agent development orchestration system that manages AI coding assistants (Claude Code, OpenCode, Aider) within containerized environments. It handles secret management, MCP server configuration, and provides an event bus for inter-agent communication.

## Technology Stack

- **Language**: typescript
- **Package Manager**: pnpm

## RAPID Methodology

Follow the RAPID framework for effective AI-assisted development. This methodology ensures thorough, high-quality work by enforcing a structured approach to every task.

<research>
### Research (Before engaging)

Before making ANY changes, you MUST understand the existing codebase:

1. Read existing code, documentation, and project structure before making changes
2. Understand patterns, conventions, and architectural decisions already in place
3. Review related implementations and tests to maintain consistency
4. Use search tools to find relevant code rather than assuming locations
5. When reading files, ensure you have COMPLETE context - if you see indicators of more content, read those sections too

CRITICAL: Do NOT assume file locations or code structure. Always verify by reading the actual files first.
</research>

<augment>
### Augment (Enhance context)

Enhance your understanding with external knowledge sources:

1. Use MCP servers to access external knowledge:
   - context7: For library/framework documentation (resolve ID first, then fetch docs)
   - tavily: For current information and web research
2. Reference official API documentation before implementing integrations
3. Apply relevant design patterns and best practices for the technology stack
4. Consult package.json, tsconfig.json, or equivalent for project configuration
5. When using external APIs, check for the latest version compatible with existing dependencies

IMPORTANT: If an external API requires an API key, point this out. NEVER hardcode API keys.
</augment>

<plan>
### Plan (Before execution)

Think HOLISTICALLY and COMPREHENSIVELY before writing code:

1. Break complex tasks into discrete, testable steps
2. Define clear acceptance criteria before implementation
3. Identify dependencies and determine the correct order of operations
4. Use todo lists to track progress on multi-step tasks
5. Consider edge cases and error handling upfront
6. Consider ALL relevant files and potential impacts on other parts of the system
7. Anticipate what could go wrong and plan mitigations

NEVER start coding without a clear plan for multi-step tasks.
</plan>

<integrate>
### Integrate (Verify environment)

Before making changes, verify the environment is ready:

1. Ensure existing tests pass before making changes
2. Verify dependencies are installed and up to date
3. Confirm required services and tools are available
4. Check that linting and type checking pass
5. If you introduce errors, fix them if clear how to - do NOT loop more than 3 times on the same issue

IMPORTANT: If tests or linting fail before you start, note this and decide whether to fix first or proceed.
</integrate>

<develop>
### Develop (Execute with assistance)

When implementing changes:

1. Generate code that follows existing project patterns and conventions
2. Add all necessary imports, dependencies, and type definitions
3. Run tests after each significant change to catch regressions early
4. Iterate based on test failures and linting errors
5. Keep code clean, readable, and maintainable
6. Split functionality into smaller modules instead of large monolithic files
7. Write clear, descriptive commit messages that explain the "why"

NEVER generate extremely long hashes, binary content, or non-textual code.
NEVER use placeholders like "// rest of code here" - always provide complete implementations.
</develop>

## MCP Server Usage

<mcp_servers>
When external knowledge is needed, use MCP servers appropriately:

1. **context7** - ALWAYS use for library/framework documentation
   - First resolve the library ID, then fetch docs with a topic filter
   - Example: For React hooks, resolve "react" then get docs for "hooks"
   - Prefer this over guessing API signatures

2. **tavily** - Use for current information and web research
   - Search for recent updates, blog posts, and community solutions
   - Verify information is current and from reliable sources
   - Good for "how do I" questions about recent features

3. **Other MCP servers** - Check rapid.json for available servers
   - Use appropriate servers for specific integrations (Linear, Notion, etc.)
   - Each server has specific capabilities - use the right tool for the job

IMPORTANT: Do NOT guess at library APIs. Always verify with documentation first.
</mcp_servers>

## Git Guidelines

<git_workflow>
Follow these rules for all git operations:

1. **Identity**: NEVER commit with AI identity
   - No "Claude", "Assistant", "AI", or similar in author name
   - Verify git config before committing

2. **Commit messages**: Explain the "why" not just the "what"
   - Include ticket/issue references when applicable
   - Keep commits focused and atomic
   - Use conventional commit format when project uses it

3. **Before committing**:
   - Run tests to verify nothing is broken
   - Check for accidentally staged secrets or credentials
   - Review the diff to ensure only intended changes are included

4. **Branch workflow**:
   - Create feature branches for significant changes
   - Keep main/master branch clean
   - Use descriptive branch names

NEVER force push to main/master unless explicitly requested.
NEVER commit files containing secrets (.env, credentials, API keys).
</git_workflow>

## Project Structure

```
.
├── rapid.json          # RAPID configuration
├── CLAUDE.md           # Claude-specific instructions
├── AGENTS.md           # Generic agent instructions
└── ...
```

## Multi-Agent Coordination

<coordination>
RAPID supports multiple AI agents working together via an event bus:

### Event Bus Communication

1. **Register on startup**: Use `bus_register` to join the event bus
   ```
   bus_register(agentName: "worker", worktree: "main")
   ```

2. **Send messages**: Communicate with other agents via `bus_send`
   - Types: `discovery`, `error`, `completion`, `question`, `coordination`, `heartbeat`
   - Include actionable content for coordination messages

3. **Poll for messages**: Use `bus_poll` to receive messages from other agents
   - Poll regularly to stay responsive
   - React to coordination messages from orchestrator

### Task Claiming Workflow

1. **Check available tasks**: Use `task_list` with status filter
   ```
   task_list(status: "pending")
   ```

2. **Claim a task**: Use `task_claim` with your agent ID
   ```
   task_claim(id: "task-id", agentId: "worker-123")
   ```
   - First come, first served - tasks can only be claimed once
   - Check capabilities match before claiming

3. **Report progress**: Send progress updates via event bus
   ```
   bus_send(type: "coordination", title: "Progress update", ...)
   ```

4. **Complete task**: Use `task_complete` when done
   ```
   task_complete(id: "task-id", summary: "What was accomplished")
   ```

### Agent Roles

- **Orchestrator**: Creates tasks, coordinates workers, monitors progress
- **Worker**: Claims and executes tasks, reports completion
- **Designer**: Handles research, architecture, documentation tasks

### Best Practices

1. Always register on the event bus when starting
2. Poll regularly for new messages and tasks
3. Claim only tasks matching your capabilities
4. Report task completion promptly
5. Send heartbeats to indicate you're still active
</coordination>

## Getting Started

1. Review the project structure
2. Check `rapid.json` for configuration
3. Follow the RAPID methodology above when making changes
4. Register on the event bus if working in multi-agent mode
5. Check for pending tasks and claim work
