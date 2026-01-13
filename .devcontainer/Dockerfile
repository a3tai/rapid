# RAPID Development Container
FROM mcr.microsoft.com/devcontainers/javascript-node:22

# Install pnpm globally
RUN npm install -g pnpm@9

# Install opencode for the node user
USER node
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/home/node/.opencode/bin:${PATH}"

# Switch back to root for any additional setup
USER root

# Set working directory
WORKDIR /workspaces/rapid
