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

| Option              | Default | Description                |
| ------------------- | ------- | -------------------------- |
| `--rebuild`         | `false` | Force rebuild container    |
| `--no-cache`        | `false` | Build without Docker cache |
| `--reinstall-tools` | `false` | Reinstall AI CLI tools     |
| `--skip-secrets`    | `false` | Skip secret loading        |
| `--detach`, `-d`    | `false` | Run in background          |

### Examples

```bash
# Normal start
rapid start

# Force full rebuild
rapid start --rebuild --no-cache

# Start without loading secrets
rapid start --skip-secrets

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

### Examples

```bash
# List available templates
rapid mcp list --templates

# Add from template
rapid mcp add playwright

# Add custom server
rapid mcp add myapi --type remote --url https://api.example.com/mcp

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
