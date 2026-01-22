# RAPID Development Container
# Includes all AI coding agents: Claude Code, OpenCode, Aider
FROM mcr.microsoft.com/devcontainers/javascript-node:24

# Install system dependencies and Python for Aider
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install 1Password CLI
RUN curl -sS https://downloads.1password.com/linux/keys/1password.asc | gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/$(dpkg --print-architecture) stable main" | tee /etc/apt/sources.list.d/1password.list \
    && apt-get update && apt-get install -y 1password-cli \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm@10

# Note: Aider requires Python 3.12 or earlier due to setuptools compatibility
# For now, skip aider installation - Claude Code and OpenCode are available

# Install Claude Code and Codex CLIs globally
RUN npm install -g @anthropic-ai/claude-code @openai/codex

# Install coding agents for the node user
USER node

# Install OpenCode
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/home/node/.opencode/bin:${PATH}"

# Switch back to root for any additional setup
USER root

# Set working directory
WORKDIR /workspaces/rapid

# Environment variables for agent configuration
ENV RAPID_CONTAINER=true
