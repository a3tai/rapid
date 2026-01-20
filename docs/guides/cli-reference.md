# CLI Reference

Complete reference for RAPID CLI commands.

## Installation

```bash
npm install -g @rapid-dev/cli
```

## Global Options

These options work with all commands:

| Option            | Description        |
| ----------------- | ------------------ |
| `--help`, `-h`    | Show help          |
| `--version`, `-v` | Show version       |
| `--config <path>` | Path to rapid.json |
| `--verbose`       | Verbose output     |
| `--quiet`, `-q`   | Minimal output     |

---

## rapid init

Initialize RAPID in a project.

```bash
rapid init [options]
```

### Options

| Option              | Default   | Description                |
| ------------------- | --------- | -------------------------- |
| `--template <name>` | `default` | Template to use            |
| `--force`           | `false`   | Overwrite existing files   |
| `--no-devcontainer` | `false`   | Skip devcontainer creation |
| `--agent <name>`    | `claude`  | Default agent to configure |

### Examples

```bash
# Basic initialization
rapid init

# Use TypeScript template
rapid init --template typescript

# Initialize with OpenCode as default
rapid init --agent opencode

# Force overwrite existing config
rapid init --force
```

### Created Files

```
project/
├── rapid.json              # RAPID configuration
├── AGENTS.md               # Generic agent instructions
├── CLAUDE.md               # Claude-specific instructions
└── .devcontainer/          # (if not present)
    ├── devcontainer.json
    └── Dockerfile
```

---

## rapid start

Start the development environment.

```bash
rapid start [options]
```

### Options

| Option              | Default | Description                          |
| ------------------- | ------- | ------------------------------------ |
| `--rebuild`         | `false` | Force rebuild container              |
| `--no-cache`        | `false` | Build without Docker cache           |
| `--reinstall-tools` | `false` | Reinstall AI CLI tools               |
| `--skip-secrets`    | `false` | Skip secret loading                  |
| `--no-agents`       | `false` | Skip spawning team agents            |
| `--detach`, `-d`    | `false` | Run in background                    |

### Examples

```bash
# Normal start
rapid start

# Force full rebuild
rapid start --rebuild --no-cache

# Start without loading secrets
rapid start --skip-secrets

# Start services without spawning team agents
rapid start --no-agents

# Start in background
rapid start -d
```

### Exit Codes

| Code | Meaning               |
| ---- | --------------------- |
| 0    | Success               |
| 1    | Configuration error   |
| 2    | Docker not available  |
| 3    | Build failed          |
| 4    | Secret loading failed |

---

## rapid dev

Launch AI coding session.

```bash
rapid dev [options]
```

### Options

| Option            | Default     | Description                |
| ----------------- | ----------- | -------------------------- |
| `--agent <name>`  | From config | Agent to use               |
| `--multi`         | `false`     | Launch all agents in tmux  |
| `--attach`        | `false`     | Attach to existing session |
| `--layout <type>` | `tiled`     | Tmux layout (multi mode)   |

### Layout Types (--multi)

| Layout          | Description             |
| --------------- | ----------------------- |
| `tiled`         | Equal size panes        |
| `horizontal`    | Stacked horizontally    |
| `vertical`      | Stacked vertically      |
| `main-vertical` | One large, others small |

### Examples

```bash
# Launch default agent
rapid dev

# Launch specific agent
rapid dev --agent aider

# Launch all agents
rapid dev --multi

# Launch with specific layout
rapid dev --multi --layout main-vertical

# Attach to running session
rapid dev --attach
```

---

## rapid stop

Stop the development environment.

```bash
rapid stop [options]
```

### Options

| Option      | Default | Description                 |
| ----------- | ------- | --------------------------- |
| `--remove`  | `false` | Remove container after stop |
| `--volumes` | `false` | Also remove volumes         |
| `--force`   | `false` | Force stop (SIGKILL)        |

### Examples

```bash
# Normal stop
rapid stop

# Stop and remove container
rapid stop --remove

# Stop, remove container and volumes
rapid stop --remove --volumes

# Force stop
rapid stop --force
```

---

## rapid agent

Manage AI agents.

```bash
rapid agent <subcommand> [options]
```

### Subcommands

#### rapid agent list

List available agents.

```bash
rapid agent list
```

Output:

```
Available agents:
  * claude (default)
    opencode
    aider
```

#### rapid agent add

Add a new agent.

```bash
rapid agent add <name> [options]
```

| Option                      | Description           |
| --------------------------- | --------------------- |
| `--cli <command>`           | CLI command           |
| `--instruction-file <path>` | Instruction file path |
| `--install-cmd <command>`   | Installation command  |

```bash
# Add with prompts
rapid agent add my-agent

# Add with options
rapid agent add my-agent \
  --cli my-tool \
  --instruction-file MY_AGENT.md \
  --install-cmd "npm install -g my-tool"
```

#### rapid agent remove

Remove an agent.

```bash
rapid agent remove <name>
```

#### rapid agent default

Set default agent.

```bash
rapid agent default <name>
```

### Examples

```bash
# List agents
rapid agent list

# Set default to opencode
rapid agent default opencode

# Add custom agent
rapid agent add cursor --cli cursor --instruction-file CURSOR.md

# Remove agent
rapid agent remove aider
```

---

## rapid config

View and edit configuration.

```bash
rapid config [subcommand] [options]
```

### Subcommands

#### rapid config show

Display current configuration.

```bash
rapid config show [--json]
```

#### rapid config edit

Open config in editor.

```bash
rapid config edit
```

#### rapid config set

Set a configuration value.

```bash
rapid config set <key> <value>
```

#### rapid config get

Get a configuration value.

```bash
rapid config get <key>
```

### Examples

```bash
# Show config
rapid config show

# Show as JSON
rapid config show --json

# Edit in $EDITOR
rapid config edit

# Set default agent
rapid config set agents.default opencode

# Get secret provider
rapid config get secrets.provider
```

---

## rapid mcp

Manage MCP (Model Context Protocol) servers.

```bash
rapid mcp <subcommand> [options]
```

### Subcommands

#### rapid mcp list

List configured MCP servers.

```bash
rapid mcp list [--json] [--templates]
```

| Option        | Description                     |
| ------------- | ------------------------------- |
| `--json`      | Output as JSON                  |
| `--templates` | Show available server templates |

#### rapid mcp add

Add an MCP server.

```bash
rapid mcp add <name> [options]
```

| Option              | Description                      |
| ------------------- | -------------------------------- |
| `--type <type>`     | Server type: `remote` or `stdio` |
| `--url <url>`       | URL for remote servers           |
| `--command <cmd>`   | Command for stdio servers        |
| `--args <args>`     | Arguments (comma-separated)      |
| `--header <header>` | HTTP header (name=value)         |

#### rapid mcp remove

Remove an MCP server.

```bash
rapid mcp remove <name>
```

#### rapid mcp enable / disable

Enable or disable an MCP server.

```bash
rapid mcp enable <name>
rapid mcp disable <name>
```

#### rapid mcp status

Show MCP server status.

```bash
rapid mcp status [--json]
```

#### rapid mcp sync

Regenerate `.mcp.json` and `opencode.json` from `rapid.json`.

```bash
rapid mcp sync
```

#### rapid mcp serve

Start the RAPID MCP server for secure command execution and inter-agent communication.

```bash
rapid mcp serve [--http] [--port <port>] [--project <dir>] [--verbose]
```

| Option         | Default | Description                                    |
| -------------- | ------- | ---------------------------------------------- |
| `--http`       | `false` | Use HTTP transport instead of stdio            |
| `--port <port>` | `3100` | HTTP port (when using `--http`)               |
| `--project <dir>` | `.`   | Project directory for MCP context             |
| `--verbose`    | `false` | Enable verbose logging                        |

**Features:**
- Secure sandboxed command execution (`secure_exec`)
- File operations with path access controls
- Secrets retrieval from configured providers
- Event bus integration for agent coordination
- Task management (create, track, update)
- Persona spawning and agent management

### Examples

```bash
# List available templates
rapid mcp list --templates

# Add from template
rapid mcp add playwright

# Add custom server
rapid mcp add myapi --type remote --url https://api.example.com/mcp

# Start MCP server with HTTP transport
rapid mcp serve --http --port 3100

# Check status
rapid mcp status

# Disable a server
rapid mcp disable tavily

# Remove a server
rapid mcp remove playwright
```

---

## rapid secrets

Manage secrets.

```bash
rapid secrets <subcommand>
```

### Subcommands

#### rapid secrets list

List configured secrets (names only).

```bash
rapid secrets list
```

#### rapid secrets verify

Verify all secrets are accessible.

```bash
rapid secrets verify
```

#### rapid secrets refresh

Reload secrets into environment.

```bash
rapid secrets refresh
```

### Examples

```bash
# List secret names
rapid secrets list

# Verify access
rapid secrets verify

# Refresh after rotation
rapid secrets refresh
```

---

## rapid status

Show environment status.

```bash
rapid status [options]
```

### Options

| Option   | Description    |
| -------- | -------------- |
| `--json` | Output as JSON |

### Output

```
RAPID Status
────────────
Container:  running (rapid-my-project)
Uptime:     2h 34m
Agent:      claude (active)
Secrets:    loaded (3 items)
MCP:        2 servers connected
```

---

## rapid bus

Interact with the event bus for inter-agent communication.

```bash
rapid bus <subcommand> [options]
```

### Subcommands

#### rapid bus register

Register the current agent on the event bus.

```bash
rapid bus register [--agent <name>] [--session <id>]
```

#### rapid bus send

Send a message to all agents on the event bus.

```bash
rapid bus send <type> <title> [--content <msg>] [--to <agent>] [--priority <level>]
```

Message types: `coordination`, `discovery`, `completion`, `error`, `learning`, `question`

#### rapid bus messages

Retrieve messages from the event bus with optional filtering.

```bash
rapid bus messages [--type <type>] [--from <agent>] [--limit <n>] [--json]
```

#### rapid bus agents

List active agents on the event bus.

```bash
rapid bus agents [--json]
```

#### rapid bus status

Show event bus health and statistics.

```bash
rapid bus status [--json]
```

### Examples

```bash
# Register agent
rapid bus register --agent claude

# Send coordination message
rapid bus send coordination "Task assigned" --content "Please review PR #42"

# List recent messages
rapid bus messages --limit 10

# Show all active agents
rapid bus agents

# Check bus health
rapid bus status
```

---

## rapid checkpoint

Save project state snapshots.

```bash
rapid checkpoint [--message <msg>]
rapid checkpoint list [--json]
rapid checkpoint show <id> [--diff]
```

| Option           | Description                |
| ---------------- | -------------------------- |
| `--message <msg>` | Checkpoint description    |
| `--json`         | Output as JSON            |
| `--diff`         | Show changes from previous |

---

## rapid rewind

Restore project to a previous checkpoint.

```bash
rapid rewind <checkpoint-id> [--force]
```

| Option    | Description              |
| --------- | ------------------------ |
| `--force` | Skip confirmation prompt |

### Examples

```bash
# Create checkpoint
rapid checkpoint --message "Before refactoring"

# List checkpoints
rapid checkpoint list

# Show checkpoint details
rapid checkpoint show abc123 --diff

# Restore to checkpoint
rapid rewind abc123
```

---

## rapid plugin

Manage Claude Code plugins and integrations.

```bash
rapid plugin <subcommand> [options]
```

### Subcommands

#### rapid plugin list

List installed plugins.

```bash
rapid plugin list [--available] [--json]
```

#### rapid plugin install

Install a plugin.

```bash
rapid plugin install <plugin> [--version <ver>]
```

#### rapid plugin remove

Remove a plugin.

```bash
rapid plugin remove <plugin>
```

#### rapid plugin config

Configure a plugin.

```bash
rapid plugin config <plugin> [options]
```

### Examples

```bash
# List installed plugins
rapid plugin list

# Show available plugins
rapid plugin list --available

# Install a plugin
rapid plugin install code-runner

# Remove plugin
rapid plugin remove code-runner

# Configure plugin
rapid plugin config formatter --option "style=prettier"
```

---

## rapid logs

View logs.

```bash
rapid logs [options]
```

### Options

| Option           | Default | Description         |
| ---------------- | ------- | ------------------- |
| `--follow`, `-f` | `false` | Follow log output   |
| `--tail <n>`     | `100`   | Number of lines     |
| `--container`    | `false` | Show container logs |

### Examples

```bash
# View RAPID logs
rapid logs

# Follow logs
rapid logs -f

# View container logs
rapid logs --container

# Last 50 lines
rapid logs --tail 50
```

---

## Environment Variables

RAPID respects these environment variables:

| Variable          | Description                              |
| ----------------- | ---------------------------------------- |
| `RAPID_CONFIG`    | Path to rapid.json                       |
| `RAPID_LOG_LEVEL` | Log verbosity (debug, info, warn, error) |
| `RAPID_NO_COLOR`  | Disable colored output                   |
| `DOCKER_HOST`     | Docker daemon socket                     |

---

## Configuration File

See [rapid.json Specification](../reference/rapid.json-spec.md) for complete configuration reference.
