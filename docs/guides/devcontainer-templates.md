# Dev Container Templates

RAPID provides pre-configured dev container templates optimized for AI-assisted development. Each template includes the tools, extensions, and configuration needed for a productive RAPID workflow.

## Available Templates

| Template | Languages/Tools | Use Case |
|----------|-----------------|----------|
| [typescript](#typescript) | TypeScript, JavaScript, Node.js | Web apps, APIs, CLI tools |
| [python](#python) | Python 3.11+ | AI/ML, APIs, scripting |
| [go](#go) | Go 1.22+ | Cloud native, CLI, systems |
| [rust](#rust) | Rust | Systems programming, CLI, WebAssembly |
| [infrastructure](#infrastructure) | Terraform, Kubernetes, Helm | IaC, DevOps, platform engineering |
| [universal](#universal) | Multiple | Polyglot projects, experimentation |

## Quick Start

```bash
# Initialize with a specific template
rapid init --template typescript

# Or copy template manually
cp -r templates/typescript/.devcontainer .devcontainer
```

## Template Features

All RAPID templates include:

- **AI Tool Support** - Pre-installed Node.js/Python for AI CLI tools
- **direnv Integration** - Automatic secret loading
- **Git Configuration** - Proper line endings, credentials
- **Shell Enhancements** - Starship prompt, useful aliases
- **RAPID Lifecycle Hooks** - Integration with `rapid start`

---

## typescript

Full-stack TypeScript/JavaScript development with Node.js.

### Included

- Node.js 20 LTS
- pnpm, yarn, npm
- TypeScript, ts-node
- ESLint, Prettier
- Common VS Code extensions

### Usage

```bash
rapid init --template typescript
```

### devcontainer.json

```json
{
  "name": "RAPID TypeScript",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers/features/git:1": {},
    "ghcr.io/devcontainers-contrib/features/direnv:1": {},
    "ghcr.io/devcontainers-contrib/features/starship:1": {}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss"
      ]
    }
  },
  "postCreateCommand": "npm install -g @anthropic-ai/claude-code opencode",
  "postStartCommand": "direnv allow 2>/dev/null || true"
}
```

---

## python

Python development for AI/ML, APIs, and scripting.

### Included

- Python 3.11
- pip, pipx, poetry, uv
- pylint, black, ruff
- Jupyter support
- Common VS Code extensions

### Usage

```bash
rapid init --template python
```

### devcontainer.json

```json
{
  "name": "RAPID Python",
  "image": "mcr.microsoft.com/devcontainers/python:3.11",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers/features/git:1": {},
    "ghcr.io/devcontainers-contrib/features/direnv:1": {},
    "ghcr.io/devcontainers-contrib/features/poetry:2": {},
    "ghcr.io/devcontainers-contrib/features/starship:1": {}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-python.python",
        "ms-python.vscode-pylance",
        "charliermarsh.ruff",
        "ms-toolsai.jupyter"
      ]
    }
  },
  "postCreateCommand": "npm install -g @anthropic-ai/claude-code opencode && pip install aider-chat",
  "postStartCommand": "direnv allow 2>/dev/null || true"
}
```

---

## go

Go development for cloud-native applications, CLIs, and systems.

### Included

- Go 1.21
- gopls, golangci-lint
- Air (hot reload)
- Common VS Code extensions

### Usage

```bash
rapid init --template go
```

### devcontainer.json

```json
{
  "name": "RAPID Go",
  "image": "mcr.microsoft.com/devcontainers/go:1.21",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers/features/git:1": {},
    "ghcr.io/devcontainers-contrib/features/direnv:1": {},
    "ghcr.io/devcontainers-contrib/features/starship:1": {}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "golang.go",
        "zxh404.vscode-proto3"
      ]
    }
  },
  "postCreateCommand": "npm install -g @anthropic-ai/claude-code opencode && go install github.com/cosmtrek/air@latest",
  "postStartCommand": "direnv allow 2>/dev/null || true"
}
```

---

## infrastructure

Infrastructure-as-Code development with Terraform, Kubernetes, and cloud providers.

### Included

- Terraform, tflint, terragrunt
- kubectl, Helm
- AWS CLI, Azure CLI
- Docker-in-Docker
- checkov (security scanning)
- Common VS Code extensions

### Usage

```bash
rapid init --template infrastructure
```

### devcontainer.json

```json
{
  "name": "RAPID Infrastructure",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers/features/terraform:1": {
      "version": "latest",
      "tflint": "latest",
      "terragrunt": "latest"
    },
    "ghcr.io/devcontainers/features/kubectl-helm-minikube:1": {
      "version": "latest",
      "helm": "latest"
    },
    "ghcr.io/devcontainers/features/aws-cli:1": {},
    "ghcr.io/devcontainers/features/azure-cli:1": {},
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers-contrib/features/direnv:1": {},
    "ghcr.io/devcontainers-contrib/features/starship:1": {}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "hashicorp.terraform",
        "ms-kubernetes-tools.vscode-kubernetes-tools",
        "redhat.vscode-yaml",
        "tim-koehler.helm-intellisense"
      ]
    }
  },
  "mounts": [
    "source=${localEnv:HOME}/.kube,target=/home/vscode/.kube,type=bind",
    "source=${localEnv:HOME}/.aws,target=/home/vscode/.aws,type=bind"
  ],
  "postCreateCommand": "npm install -g @anthropic-ai/claude-code opencode && pip install checkov pre-commit",
  "postStartCommand": "direnv allow 2>/dev/null || true"
}
```

### Cloud Credentials

The infrastructure template mounts your local cloud credentials:

- `~/.kube/config` - Kubernetes configuration
- `~/.aws/credentials` - AWS credentials

For secure credential management, use `.envrc` with 1Password:

```bash
# .envrc
export AWS_ACCESS_KEY_ID=$(op read "op://Development/AWS/access-key-id")
export AWS_SECRET_ACCESS_KEY=$(op read "op://Development/AWS/secret-access-key")
```

---

## rust

Rust development for systems programming, CLI tools, and WebAssembly.

### Included

- Rust (stable)
- cargo, rustfmt, clippy
- rust-analyzer
- WASM toolchain (optional)

### Usage

```bash
rapid init --template rust
```

### devcontainer.json

```json
{
  "name": "RAPID Rust",
  "image": "mcr.microsoft.com/devcontainers/rust:latest",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers/features/git:1": {},
    "ghcr.io/devcontainers-contrib/features/direnv:1": {},
    "ghcr.io/devcontainers-contrib/features/starship:1": {}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "rust-lang.rust-analyzer",
        "tamasfe.even-better-toml",
        "serayuzgur.crates"
      ]
    }
  },
  "postCreateCommand": "npm install -g @anthropic-ai/claude-code opencode",
  "postStartCommand": "direnv allow 2>/dev/null || true"
}
```

---

## universal

Multi-language template for polyglot projects or experimentation.

### Included

- Node.js 20
- Python 3.11
- Go 1.21
- Rust
- Common tools for all languages

### Usage

```bash
rapid init --template universal
```

### devcontainer.json

```json
{
  "name": "RAPID Universal",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers/features/python:1": { "version": "3.11" },
    "ghcr.io/devcontainers/features/go:1": { "version": "1.21" },
    "ghcr.io/devcontainers/features/rust:1": {},
    "ghcr.io/devcontainers/features/git:1": {},
    "ghcr.io/devcontainers-contrib/features/direnv:1": {},
    "ghcr.io/devcontainers-contrib/features/starship:1": {}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "ms-python.python",
        "golang.go",
        "rust-lang.rust-analyzer"
      ]
    }
  },
  "postCreateCommand": "npm install -g @anthropic-ai/claude-code opencode && pip install aider-chat",
  "postStartCommand": "direnv allow 2>/dev/null || true"
}
```

---

## Common Features

All templates include these dev container features:

| Feature | Purpose |
|---------|---------|
| `node:1` | Required for AI CLI tools (Claude, OpenCode) |
| `git:1` | Git with credential helpers |
| `direnv:1` | Automatic `.envrc` loading |
| `starship:1` | Modern shell prompt |

## Customizing Templates

### Adding Features

Add more features to your `devcontainer.json`:

```json
{
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/kubectl-helm-minikube:1": {},
    "ghcr.io/devcontainers/features/aws-cli:1": {}
  }
}
```

### Adding Extensions

Add VS Code extensions:

```json
{
  "customizations": {
    "vscode": {
      "extensions": [
        "github.copilot",
        "eamodio.gitlens"
      ]
    }
  }
}
```

### RAPID Lifecycle Integration

Templates use lifecycle hooks for RAPID integration:

```json
{
  "initializeCommand": "rapid hooks initialize 2>/dev/null || true",
  "postCreateCommand": "rapid hooks postCreate 2>/dev/null || npm install -g @anthropic-ai/claude-code opencode",
  "postStartCommand": "rapid hooks postStart 2>/dev/null || direnv allow"
}
```

---

## Creating Custom Templates

1. Start from an existing template
2. Modify `devcontainer.json` as needed
3. Add a `Dockerfile` if you need custom base image
4. Test with `rapid start --rebuild`

### Template Structure

```
templates/my-template/
├── .devcontainer/
│   ├── devcontainer.json
│   └── Dockerfile (optional)
├── rapid.json (template defaults)
├── AGENTS.md (template)
└── README.md
```

---

## Troubleshooting

### Container build fails

```bash
# Rebuild without cache
rapid start --rebuild --no-cache
```

### Features not installing

Check feature availability at [containers.dev/features](https://containers.dev/features).

### Extensions not loading

Ensure extension IDs are correct (check VS Code marketplace).

### AI tools not found

```bash
# Reinstall AI tools
rapid start --reinstall-tools
```
