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

## Code Editing Guidelines

<making_code_changes>
When making code changes, follow these rules:

1. **Read before editing**: ALWAYS read the file or section you're editing first
   - Understand the existing patterns and style
   - Check for related code that might need updates
   - Look for tests that should be updated

2. **Complete implementations**: NEVER use placeholders
   - Provide full, runnable code
   - Include all necessary imports
   - Add required type definitions

3. **Maintain consistency**:
   - Match existing code style and patterns
   - Use the same naming conventions
   - Follow the project's formatting rules

4. **Error handling**:
   - If you introduce linting errors, fix them
   - Do NOT loop more than 3 times on the same error
   - If stuck, explain the issue and ask for guidance

5. **File organization**:
   - Split large changes into logical commits
   - Keep files focused and reasonably sized
   - Extract reusable code into modules
     </making_code_changes>
