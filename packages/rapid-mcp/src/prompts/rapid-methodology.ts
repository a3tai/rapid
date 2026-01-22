/**
 * RAPID Methodology Prompt
 *
 * Exposes the RAPID development methodology as an MCP prompt.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../server.js';

/**
 * RAPID Methodology content
 */
const RAPID_METHODOLOGY = `# RAPID Development Methodology

RAPID (Rapid AI-Powered Integrated Development) is a methodology for secure, governed AI-assisted development.

## Core Principles

### 1. Sandbox-First Execution
- All commands execute inside platform-native sandboxes (Seatbelt/Bubblewrap)
- Network access is denied by default and must be explicitly allowed
- Filesystem access is restricted to the project directory
- Use \`secure_exec\` for all command execution

### 2. Policy-Driven Governance
- Network requests are filtered through RAPID proxy
- Domain allowlists/denylists control external access
- Secrets are brokered with short-lived tokens
- All actions are logged for audit

### 3. Context Assembly
- Project instructions come from AGENTS.md and CLAUDE.md
- Configuration lives in rapid.json
- MCP servers provide external capabilities
- Context is injected into agent prompts automatically

### 4. Git-Native Workflow
- Work in isolated git worktrees for features
- Create checkpoints before destructive operations
- Commit frequently with descriptive messages
- Use branches for experimentation

### 5. Agent Completion Workflow
- Complete your work in the worktree with clear, descriptive commits
- Use the \`persona_complete\` tool to:
  * Validate changes (typecheck, lint, tests)
  * Create PR for review or auto-merge if tests pass
  * Clean up worktree after successful merge
- Report task completion via \`bus_send\` with work summary
- Let the orchestrator handle final integration to main

## Available Tools

When working with RAPID, prefer these tools:

### Command Execution
\`\`\`
secure_exec(command, args, sandbox="balanced")
\`\`\`
Executes commands in the sandbox. Use sandbox="strict" for untrusted operations.

### Network Requests
\`\`\`
fetch_via_proxy(url, method="GET")
\`\`\`
Makes HTTP requests through the RAPID proxy with domain filtering.

### Secrets
\`\`\`
get_secret(key)
\`\`\`
Retrieves secrets from 1Password, Vault, or environment variables.

### Agent Completion
\`\`\`
persona_complete(agentId, summary, targetBranch, createPR, runTests, cleanupWorktree)
\`\`\`
Finalizes agent work: validates changes, commits if needed, optionally creates PR or merges to target branch, cleans up worktree.

### File Operations
\`\`\`
read_file(path), write_file(path, content), list_files(path)
\`\`\`
Scoped file operations within the project directory.

### Security
\`\`\`
check_security(checks=["secrets", "dependencies"])
\`\`\`
Runs secret scanning, dependency audit, and SAST checks.

## Best Practices

1. **Use secure_exec instead of raw shell commands**
   - Ensures sandbox isolation
   - Logs all executions for audit
   - Prevents accidental system modification

2. **Check secrets, don't hardcode them**
   - Use \`get_secret\` to retrieve credentials
   - Never commit secrets to version control
   - Run \`check_security\` before committing

3. **Respect network boundaries**
   - Only fetch from necessary domains
   - Check domain allowlist in rapid.json
   - Log and justify external requests

4. **Work in worktrees for isolation**
   - Create feature branches for changes
   - Test in isolation before merging
   - Use git for checkpointing

5. **Read context files first**
   - Check AGENTS.md for project guidelines
   - Check CLAUDE.md for specific instructions
   - Check rapid.json for configuration

6. **Commit work regularly with clear messages**
   - Use conventional commit format: type(scope): description
   - Commit after completing logical units of work
   - Include context about why changes were made
   - Example: \`git commit -m "feat(api): add user authentication endpoint"\`

7. **Complete tasks using persona_complete**
   - Call \`persona_complete\` with your agent ID and work summary
   - It will validate your changes (typecheck, tests)
   - Creates PR for review or merges automatically if tests pass
   - Cleans up your worktree after successful merge
   - Report completion via \`bus_send\` with summary
`;

/**
 * Quick reference content
 */
const QUICK_REF = `# RAPID Quick Reference

## Tools
| Tool | Usage | Description |
|------|-------|-------------|
| \`secure_exec\` | \`secure_exec("npm", ["test"])\` | Sandboxed command execution |
| \`fetch_via_proxy\` | \`fetch_via_proxy("https://api.example.com")\` | Network fetch with filtering |
| \`get_secret\` | \`get_secret("GITHUB_TOKEN")\` | Retrieve secrets |
| \`read_file\` | \`read_file("src/index.ts")\` | Read project file |
| \`write_file\` | \`write_file("out.txt", "content")\` | Write project file |
| \`list_files\` | \`list_files("src")\` | List directory |
| \`persona_complete\` | \`persona_complete(agentId, summary, createPR=true)\` | Validate, commit, and merge agent work |
| \`check_security\` | \`check_security(["secrets"])\` | Security checks |

## Resources
| Resource | URI | Description |
|----------|-----|-------------|
| Config | \`rapid://config/current\` | Project configuration |
| Context | \`rapid://context/assembled\` | Combined instructions |
| Daemon | \`rapid://status/daemon\` | Daemon status |
| Sandbox | \`rapid://status/sandbox\` | Sandbox capabilities |

## Sandbox Modes
- \`strict\`: Maximum isolation, no network, minimal filesystem
- \`balanced\`: Standard isolation with project filesystem access (default)
- \`permissive\`: Relaxed isolation for trusted operations
- \`none\`: No sandboxing (use with caution)

## Key Files
- \`rapid.json\`: Project configuration
- \`AGENTS.md\`: Generic agent instructions
- \`CLAUDE.md\`: Claude-specific instructions
- \`.mcp.json\`: MCP server configuration
`;

/**
 * Register the methodology prompt with the MCP server
 */
export function registerMethodologyPrompt(server: McpServer, _context: ServerContext): void {
  server.registerPrompt(
    'rapid-methodology',
    {
      title: 'RAPID Development Methodology',
      description:
        'Guide for secure, governed AI-assisted development using RAPID tools and principles',
      argsSchema: {
        focus: z
          .enum(['security', 'sandbox', 'workflow', 'tools', 'all'])
          .default('all')
          .describe('Specific aspect to focus on'),
      },
    },
    async (args) => {
      const focus = (args as { focus?: string })?.focus || 'all';

      let content = RAPID_METHODOLOGY;

      if (focus !== 'all') {
        content = `# RAPID Methodology: ${focus.charAt(0).toUpperCase() + focus.slice(1)}\n\n`;
        content += `See full methodology with focus="all"\n\n`;
        content += RAPID_METHODOLOGY;
      }

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: content,
            },
          },
        ],
      };
    }
  );

  // Quick reference prompt
  server.registerPrompt(
    'rapid-quick-ref',
    {
      title: 'RAPID Quick Reference',
      description: 'Quick reference card for RAPID tools and commands',
    },
    async () => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: QUICK_REF,
            },
          },
        ],
      };
    }
  );
}
