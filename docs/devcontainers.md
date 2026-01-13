Here is the content converted into a clean Markdown format, preserving the hierarchy, content, and formatting.

# Securely Using Dev Containers for Local Development

## Introduction

Dev containers are containerized development environments that package all the tools, dependencies, and settings needed for a project. By running your development inside an isolated container, you gain reproducibility and security benefits. Each project can define its environment as code (using a **devcontainer** spec or Docker Compose), ensuring consistency across machines and team members [1]. In this guide, we’ll explore best practices for using dev containers securely on macOS, Windows, and Linux. We’ll cover secure default configurations, environment variable management with `.envrc` files, secret storage via 1Password (and alternatives), controlling file sharing, integrating AI coding agents, multi-OS container runtimes (Docker/Podman), and more. The goal is a one-click, reliable dev environment that’s locked down by default yet flexible enough to integrate the tools you need.

## Secure Default Settings for Dev Containers

Security should be baked into your dev container setup from the start. Here are some **best practices** to harden the environment by default:

*   **Isolate the Container from the Host:** A dev container runs with its own filesystem, network, and process space. Nothing inside can see your host’s files or processes unless you explicitly share them [2][3]. This isolation means malicious scripts or compromised dependencies can’t exfiltrate credentials from your host (e.g. your `~/.ssh` keys or other sensitive files) if those files are **never mounted in the container** [3]. It also sandboxes untrusted code – for example, you can run `npm install` on Mac/Windows without risking a rogue package reading your home directory [3].

*   **Run as a Non-Root User:** Configure the container to use a normal user account (not `root`) for development. The VS Code Dev Containers spec does this by default (user UID/GID 1000, often named `vscode` or similar) [4]. Running as non-root limits the impact of any malicious code since it can’t gain elevated privileges on your host. As one guide notes, a secure devcontainer “runs as a non-root user without any privileged access” [5]. In practice, you can set `"remoteUser": "<username>"` in `devcontainer.json` (or use images that default to a non-root user, such as many of the Chainguard images which use a `nonroot` user [6][5]).

*   **Minimize Privileges and Capabilities:** Do not run the container in privileged mode, and avoid granting extra Linux capabilities or device access unless required. The default devcontainer setup is usually unprivileged, which is sufficient for most development tasks. All exposed ports should be explicitly defined (e.g. via `ports` in Docker Compose or `forwardPorts` in `devcontainer.json`) – this prevents unexpected network exposure [7].

*   **Keep the Base Image Updated and Slim:** Use well-maintained base images and update them regularly to pull in security patches. Remove unnecessary packages and binaries to reduce the attack surface. Consider minimal images (like Alpine or Distroless, or security-focused images like Chainguard) for language runtimes. For instance, a custom Ruby devcontainer built on Chainguard had 0 known CVEs, whereas a stock distro image had hundreds [8]. Regularly scan your images for vulnerabilities and rebuild when patches are available.

*   **No Automatic Host Mounts Except Project Code:** By default, *only mount the project’s working folder* (and necessary subfolders) into the container. Avoid blanket sharing of your home directory or other host paths. If using VS Code’s Dev Containers, the extension by default mounts the workspace folder. You can also adjust the default mount point (e.g. changing it from `/workspaces` if needed) [9]. The key is to **share only what’s required** for the project. This limits what container processes can access, significantly reducing risk [2][3]. For example, you might mount just the project source code and a specific data directory, rather than your entire home. We’ll discuss volume specifics in the next section.

*   **Predefine Network Ports and Dependencies:** If your dev setup needs databases or services, define them in your Docker Compose or devcontainer config (as additional containers) rather than using host services. Predefine any ports those need to expose. This ensures no unexpected ports are opened. Keeping services in the dev environment (or within an isolated network) prevents them from accessing host resources unless allowed.

By following these defaults, your devcontainers will *“address security concerns without sacrificing developer experience”* [5]. You get a safe, sandboxed workspace that still has all the tools you need.

## Volume Sharing: Only Project Folders and Docs

A critical part of container security is controlling which host folders are mounted in the container. The principle is simple: **mount only what you need**. In practice, this means your Docker Compose or devcontainer configuration should include only the project’s directory (and perhaps specific subdirectories) as volumes:

*   **Project Source Code:** Mount the project’s source code directory (e.g. the repository root) into the container. This allows you to edit code on the host (if you prefer using a local editor) and have changes reflected in the container, or vice versa, without exposing other files. Example (docker-compose snippet):

    ```yaml
    services:
      dev:
        image: your-dev-image:latest
        volumes:
          - ./:/workspace:rw
    ```

    This mounts the current project directory into `/workspace` in the container. In a devcontainer, this is often handled automatically as the workspace folder.

*   **Exclude Everything Else:** Do not mount your home directory, `/` drive, or any broad paths. The container should not see your SSH keys, global configs, or other project’s files. As the Node.js security guide emphasized, *anything not explicitly shared is hidden from the container* [2].

*   **Include Project Documentation for AI Agents:** If you are using AI coding agents inside the container, you may want them to have access to certain documentation files by default. In particular, you mentioned always sharing `AGENTS.md`, `CLAUDE.md`, `README.md`, and the `docs/` folder. If these files are part of your project repository, they’ll be included automatically when you mount the project folder. If they reside elsewhere, consider copying them into the project or adding a specific mount for them. Providing these files ensures that any AI agents (which might read from the filesystem for context or instructions) have the guidance they need. For example, you might document coding conventions or agent usage instructions in `AGENTS.md` that the agent can refer to.

*   **Use Docker Compose for Complex Setups:** If your development involves multiple containers (say a database, or a frontend and backend), use Docker Compose to orchestrate them. In the compose file, carefully specify volumes for each service, limiting them to the necessary paths for that service. For instance, only the web app container needs the source code volume; the database container might only have a volume for its data files (which could be a subfolder of your project or an ephemeral volume).

*   **Mount Secrets as Read-Only or Use Environment (Better: inject at runtime):** Avoid placing secret files on shared volumes. We’ll cover secrets management in the next section, but if you must mount a secret (like a TLS cert for local HTTPS), mount it read-only and limit the scope (e.g. a specific file, not a whole directory).

In summary, treat the container’s view of the filesystem as a **least privilege** situation. Share only project specific files. This way, even if an agent or process inside the container goes looking for sensitive info, it simply won’t find anything beyond the project. This practice was highlighted as preventing “dev-time tooling from trivially reading your host’s secrets if those never enter the container” [3].

## Managing Environment Variables and Secrets

Secure handling of secrets in a dev environment is paramount. Instead of storing secrets in plaintext `.env` files on disk, you should leverage environment management tools and secret managers to load sensitive values **on the fly**:

*(Figure: Isolated dev container retrieving secrets via 1Password Connect – the dev container fetches secrets over a secure API, rather than storing them on the host file system [3][10].)*

*   **Use `.envrc` and `direnv` for Project Env Vars:** Adopting **direnv** with an `.envrc` file per project is a convenient and secure way to manage environment variables. Direnv automatically loads and unloads environment variables when you enter or leave a directory. By enabling loading of `.env` files in direnv’s global config and using an `.envrc`, you can set up a workflow where each project’s environment is isolated. For example, one approach is: enable `load_dotenv` in `~/.config/direnv/direnv.toml`, define a helper in a global `direnvrc` to inject secrets via 1Password, then in each project’s `.envrc` call that helper [11]. In practice:
    *   *Global config:* turn on automatic `.env` loading.
    *   *Root workspace `.envrc`:* define a function that uses `op inject` or `op run` to replace any `op://` secret references with actual secrets from 1Password [11].
    *   *Project `.envrc`:* load the local `.env` (if present), then source the global secrets function [11].
    *   *Project `.env`:* contains non-sensitive config and placeholders or references for secrets (e.g. `API_KEY="op://Vault/Item/field"` instead of the real key) [12].

    This setup means whenever you `cd` into the project, direnv will automatically pull the latest secrets from 1Password and export them to your environment, without ever saving them to disk in plain form. If you revoke or rotate a secret in 1Password, the next reload picks up the change. And if someone else gets the repo, they see only the `op://` references, not the real secrets.

*   **1Password CLI and Secret References:** 1Password provides a CLI (`op`) which can fetch secrets on-demand. Rather than writing secrets into `.env` files, you can use **secret references (`op://...`)** in your configs and have them resolved at runtime [10]. The 1Password CLI supports multiple resolution modes [10]:
    *   `op read`: output a single secret to the console (useful in scripts).
    *   `op run`: inject secrets as environment variables to execute a subprocess (it will replace any `OP_SECRET_*` placeholders with actual secrets when launching the process).
    *   `op inject`: replace placeholders in a file or input and output the result (good for templating config files before the container starts).

*   **1Password Connect:** For development containers, an excellent approach is to use a **1Password Connect** server with a service account token. 1Password Connect is a small self-hosted service (runs via Docker) that syncs with your 1Password vault [13]. Your dev container can query it over HTTP (on `host.docker.internal`) to retrieve secrets, using a token for auth. This way, secrets are never stored on disk or in your source; they’re fetched just-in-time from a secure vault. In fact, the Node.js security guide explicitly *“do[es] not recommend secrets in dotenv files”* and instead demonstrates using 1Password Connect with a devcontainer [14][13]. By supplying `OP_CONNECT_HOST` and `OP_CONNECT_TOKEN` to the container (the token can be a long-lived service account token), the devcontainer can pull needed secrets programmatically during initialization [15][16].

*   **Automatic Secret Injection in Dev Container Lifecycle:** If using VS Code devcontainers, you can automate secret injection with lifecycle commands. For example, in `devcontainer.json` you might set an `"initializeCommand"` on the host to fetch a secret and write it to an `.env` file **before** the container builds [17]. Or use `"postCreateCommand"` inside the container to run `op` CLI and export environment variables. VS Code also supports features – one popular community **feature** is a 1Password CLI integration that will install `op` in the container automatically [18]. Combining that with an injected token can fully automate secret provisioning each time the container starts.

*   **Remote Secret Storage Alternatives:** If not using 1Password, there are open-source or cloud alternatives to achieve similar secure workflows. HashiCorp Vault, for instance, could be run locally or accessed via API to load secrets at startup (though integration is more manual). Some teams use cloud secret managers (AWS Secrets Manager, Azure Key Vault, etc.) with CLI tools or SDKs to fetch secrets in dev. The key is to avoid committing secrets or leaving them lingering on disk. Even environment variables should only be populated in-memory for the processes that need them. Docker Compose has a `secrets` feature as well, but it’s more geared to production (it mounts files, which in dev might still risk exposure). Using dynamic injection via CLI tools is often simpler for local dev.

*   **Secure .env Handling:** If you do use `.env` files for convenience, keep them out of version control (in `.gitignore`) and consider using tools like `git-secret` or GPG to encrypt them when sharing with teammates. However, the trend is moving away from static `.env` files. The 1Password CLI and others allow you to share *just the references* or the vault items, rather than actual secret values. This means you don’t have to trust everyone with the raw credentials — they only get loaded if the person has access to the vault and the CLI at runtime.

In summary, **never hardcode secrets** in your dev container config or code. Use `.envrc` + secret managers for automatic, secure loading. As the Node.js security article put it, inject secrets “just-in-time to processes that need them and [do] not store [them] in repo” [3]. This practice, combined with the container isolation, ensures even if malicious code runs, it’s much harder for it to grab any valuable keys.

## Consistent and Reliable Containerized Environments

One of the major benefits of dev containers is consistency. To achieve that, you should define your container images and configuration in a way that anyone can spin up the same environment, on any OS, and get the same results. Here’s how to ensure reliable, repeatable dev containers:

*   **Devcontainer Specifications:** Use the Development Containers open standard (`devcontainer.json` or `docker-compose.yml` in a `.devcontainer` folder) to define your environment [1]. This file can specify the base image or Dockerfile to build, necessary tools, extensions, and settings. For example, you might base it on an official template like *“Node.js & TypeScript”*, which pulls `mcr.microsoft.com/devcontainers/typescript-node` (a Microsoft maintained image) as the starting point [19]. From there, you can add your own customization (e.g. installing additional OS packages or language tools).

*   **Pre-built Language Images:** For each tech stack you use (TypeScript/JS, Go, Rust, Java, Python, etc.), consider maintaining a base image or choosing a community one that already includes common tools. This saves time on container startup and ensures developers have what they need. For instance: a Node.js image with Node LTS + npm/Yarn + perhaps common global packages; a Python image with a certain Python version + pip + venv/poetry; a Go image with Go toolchain + some helpful linters; Rust with rustup and cargo, etc. You can use Docker multi-stage builds or separate Dockerfiles for each. If you have multiple languages in one project (e.g. a Node frontend and Go backend), you might run two containers via Compose, or combine both toolchains in one image if needed (though separating concerns is cleaner).

*   **Include Developer Tools:** Beyond compilers and runtimes, your dev container can be loaded with useful tools: linters (ESLint, Flake8, etc.), code formatters (Prettier, Black, gofmt), testing frameworks, and debugging tools. Automating their installation in the container means every developer (or AI agent) has them available. It also aligns with **code style enforcement**, since you can include the **exact version** of a linter/formatter and config in the environment. For example, include a `.eslintrc` in the project and have ESLint installed in the container, so anyone running it gets the same results.

*   **Lock Down Versions for Reliability:** Use explicit version tags for images (avoid `latest` for base images in devcontainer configs, unless you update frequently). For package managers inside the container, consider using lockfiles and specific versions of tools. This prevents the “works on my machine” problem. If you need to update something (Node version, etc.), update it in the config and rebuild the container for all – consistency maintained.

*   **Persistence and Caching:** By default, containers are ephemeral (which is good for reset ability). But you might want to persist certain things between runs to speed up development, as long as it doesn’t compromise consistency. For example, you could mount a Docker volume for package caches (like `~/.npm` or `.m2` for Maven) to avoid re-downloading on each rebuild. This is optional and should be used carefully – ensure it doesn’t introduce weird inconsistencies for different users. Generally, it’s fine to let each rebuild start clean to guarantee a known state, unless builds are extremely slow.

*   **Lifecycle Hooks for Reliability:** Use devcontainer lifecycle commands to script initialization. For instance, set `"postCreateCommand": "yarn install"` or `"bundle install"` etc., to automatically install project dependencies in the container after it’s built [20]. This ensures that once the container is up, the project is ready to run without manual setup. You can also use `"postStartCommand"` to run migrations or seed data if needed each time you start the container (though for daily dev you might disable some to avoid overhead). These hooks improve the out-of-the-box experience.

In short, treat your dev environment configuration as **part of the project**. It travels with the code (committed to the repo), so anyone (or any automated agent) can spin it up and have an identical setup. This greatly increases reliability and confidence that “it works in the container, so it will work on my machine.” Teams often write a quick start in README like *“Install Docker/VS Code and run Dev Containers: Reopen in Container”* – which is essentially a one-click setup for new contributors.

## Integration with Code Editors (VS Code, Cursor, Zed)

Using dev containers should not lock you into a single editor – the idea is to enable a remote development environment accessible from your tools of choice. Here’s how to integrate with some popular editors:

*   **Visual Studio Code:** VS Code has first-class support for dev containers via the **Dev Containers extension**. On macOS or Windows, once Docker (or an alternative) is running, you can click “Reopen in Container” and VS Code will build/attach to the devcontainer for that project [20]. This provides a seamless experience: the VS Code UI runs on your host, but all terminals, debugging, and extensions run inside the container. VS Code even sets up things like X11 forwarding for GUIs (if needed) and port forwarding as specified. Make sure the Docker extension is pointing to the right backend (Docker by default; Podman if configured – see next section) [21]. VS Code is cross-platform, so this works on Mac, Windows (often through WSL2), and Linux. If using Windows, you might actually be developing through a WSL2 Ubuntu and Docker there, which the extension handles transparently. Also, you can customize VS Code inside the container by listing extensions in `devcontainer.json` (under `customizations.vscode.extensions`). For example, you might include the ESLint extension, Python extension, etc., so they auto-install in the container.

*   **Cursor:** Cursor is an AI-focused code editor that also supports dev containers to some degree. While not as mature as VS Code’s support, it is possible to use Cursor with a running devcontainer. One approach users have found is to **start or build the devcontainer in VS Code (or via CLI)**, then attach Cursor to the running container’s workspace [22]. Recent versions of Cursor have a command to open a project in a dev container, but some users report needing to retry or use workarounds due to bugs [23][24]. The Cursor team is actively improving this, since many of its AI features (like “Cursor Chat”) should ideally run with the container’s context. For now, if you encounter issues, the workaround is: launch the container with Docker or VS Code, then in Cursor use the “Open Workspace” pointing to the container (if supported) or use an SSH remote method if available. Keep an eye on Cursor’s documentation/forums for updates on devcontainer integration – it’s a requested feature and likely to improve.

*   **Zed:** Zed is a modern code editor known for performance and now remote development capabilities. As of v0.218+, Zed supports Dev Containers directly [25]. When a project contains a `.devcontainer/devcontainer.json`, Zed will prompt to open it in a dev container [26]. Under the hood, Zed uses the devcontainer CLI (the reference implementation of the spec) to create the container, and then launches a Zed remote server inside it [27]. The local Zed UI then communicates with that server, very much like VS Code’s approach [28]. This means you get a native-feeling experience (Zed’s UI at 120fps, etc.) while all language servers, terminals, and file operations are running in the container. On macOS, Zed will use your local Docker (or Colima/Podman if configured) to spin up the container; same on Windows (likely via Docker Desktop). Zed’s adoption of the **open devcontainer spec** is a great example of how open standards allow multiple tools to interoperate. So if you prefer Zed’s interface, you can still benefit from the dev container configuration in your project.

*   **Other Editors and IDEs:** JetBrains IDEs (like IntelliJ, PyCharm) support remote development as well via their Gateway tool, which can attach to a container or SSH environment. There is ongoing work (and third-party plugins) to support devcontainer JSON in JetBrains. Similarly, **Neovim/Vim** users can develop inside containers by simply running an editor inside the container’s terminal, or using SSH + tmux. For a lightweight approach, you might just SSH into the running dev container (since it’s a Linux environment) from any editor that supports SSH remote (for example, both Zed and VS Code can also attach via SSH to a container if you prefer that route, or even old-school Vim over SSH).

The key point is that dev containers are not tied to VS Code alone. Thanks to the spec and broad tooling support, you can use whichever editor you are comfortable with – the container simply becomes the “remote machine” where your code lives. This decoupling is powerful: on one day you might use VS Code, and the next day try an AI-first editor like Cursor, and both can work with the same containerized dev environment.

## Open Source Tools and Open Standards

Where possible, favor open source and standard solutions in your development workflow. This ensures better flexibility and avoids lock-in. We’ve already touched on some of these, but let’s summarize and add a few points:

*   **Container Engine (Docker vs Podman):** Docker Desktop is commonly used on Mac/Windows, but it’s proprietary. **Podman** is a drop-in open source alternative that can run Docker containers without a daemon (and in rootless mode by default). On Linux, Podman can easily replace Docker. On macOS and Windows, Podman now offers Podman Desktop, which uses a lightweight VM similar to Docker’s approach. VS Code’s devcontainer extension can work with Podman – you just need to point it to the Podman CLI instead of Docker. For example, set the VS Code setting `"dev.containers.dockerPath": "podman"` on your system [21]. Podman’s Docker CLI compatibility is quite high (especially version 5+), so most devcontainer features (including Docker Compose via `podman compose` or an installed Docker Compose plugin) will work [21][29]. Using Podman rootless on Linux can increase security (no root daemon running). Another alternative on Mac is **Colima**, an open source container runtime that uses Lima VM under the hood [30]. It provides a Docker-compatible CLI as well. The good news is the devcontainer ecosystem is mostly CLI-agnostic – if your tool obeys Docker APIs/commands, it will work [31].

*   **Open Dev Container Specification:** The dev container config spec (now hosted at containers.dev) is open and evolving as a community effort [32]. By adhering to it, you make your setup compatible with any tool that supports the spec (VS Code, Zed, etc., and emerging ones). Even if one particular editor is discontinued, your environment definition remains usable. This contrasts with proprietary environment configs that only one IDE understands. So, use the standard JSON or Docker Compose format as provided by the spec.

*   **Secret Management:** 1Password is a commercial product, but it provides the convenience we discussed. If you prefer open source, consider solutions like **Bitwarden (with CLI)** for personal use or Vault for team scenarios. They may not integrate as slickly as 1Password Connect but can be used similarly (e.g., Bitwarden CLI to fetch secrets in a script). **Doppler** and **GitHub Secrets** are other services (not open source, but alternatives) that some developers use for centralizing dev secrets. Always weigh the security of any third-party cloud service vs self-hosted. The combination of an open source vault (Vault, etc.) with your devcontainer could be made to work, albeit with more setup. The important part is that the **principle of not storing plaintext secrets** locally remains the same.

*   **AI/LLM Integrations:** When integrating AI coding assistants, prefer using **unified APIs or frameworks** that don’t lock you in. For instance, **OpenRouter** is a community-driven service that routes requests to multiple AI models (OpenAI, Anthropic, etc.) through a single API key. It had some security incidents when running over the internet [33], but the concept is interesting. **LiteLLM** is an open source project you can self-host that similarly acts as a gateway to many LLMs [34]. Using these, you can swap the backend model (GPT-4, Claude, Codey/Gemini, etc.) without changing your client code much. They also add features like logging, guardrails, and cost control [34]. By using an open integration layer (like an SDK or proxy server you control), you aren’t tied to a single provider’s tool or paying for multiple IDE plugins. You can also incorporate open source LLMs (if you have ones running locally, like Code Llama or others) through the same interface.

*   **Open Source Agents/Tools:** There are emerging open source **AI agent frameworks** like LangChain, AutoGen, and others that let you orchestrate multiple agents. One notable one in the coding domain is **Cline**, which bills itself as an “open coding agent” integrated with VS Code, JetBrains, etc., and supporting multiple models (Claude, open source models, etc.) with a plan/act paradigm. Cline has a large open-source user base and even an **MCP (Multi-Client Prompt) marketplace** [35][36]. Exploring such tools can give you multi-agent capabilities without relying on closed-source software. Since you specifically want multiple agents running, an open orchestration framework might be ideal – you could run an AI pair programmer that uses say GPT-4 for code generation and another agent with a different model for code review or testing, all within your container.

In summary, evaluate each part of your dev workflow for open alternatives: container engine (Podman/Colima), editors (VS Code open-source fork like VSCodium, or fully open ones like Neovim/Zed), secret stores (Vault/Bitwarden), and AI integration (LiteLLM/OpenRouter or open agents). Often these open solutions can be a bit more hands-on to set up, but they give you transparency and control, aligning with the philosophy of infrastructure-as-code for your dev environment.

## Integrating AI Agents into the Dev Environment

You mentioned a variety of AI tools – *Claude Code, Gemini, Codex, “opencode”* – and a desire to use multiple agents concurrently. This is an exciting frontier in development: having AI assistants or agents embedded in your environment to help with coding, debugging, and more. Here’s how to securely integrate them:

*   **AI Agents vs Code Assistants:** First, clarify the distinction: a “code assistant” (like GitHub Copilot, or Cursor’s built-in model) typically provides suggestions or completes code as you type. An “AI agent,” on the other hand, might be more autonomous – it could take high-level instructions, perform actions (like editing files, running tests), and possibly involve multiple sub-agents or tools. The mention of `AGENTS.md` and `CLAUDE.md` implies you might be guiding these AIs with specific instructions or context in those files. It’s a great practice to maintain documentation for how you want the AI to operate (for instance, coding style guidelines, project architecture notes, or specific commands they can use).

*   **Provide Context Files to Agents:** Ensure that any such documentation (`AGENTS.md`, etc.) is accessible to the AI agents. If the agent runs inside the container, and the files are in the mounted project, then they can simply read them. Some agent frameworks allow you to specify an initial prompt or system message drawn from a file. You could automate this: e.g., have a startup script for your AI agent that reads `AGENTS.md` and uses it as a system prompt to the model. By sharing these files by default (as mentioned earlier), you set a consistent baseline of instructions for all agents (like Claude or others) to follow.

*   **Multiple Agents Strategy:** Running multiple agents means you might have, say, one agent using Claude (Anthropic’s model), another using GPT-4 (OpenAI Codex successor), maybe another using a local model. You can orchestrate this in a few ways:
    *   **All-in-one Orchestration:** Use a multi-agent framework or tool that supports plugins for different models. For example, some open source agent frameworks allow you to define roles for agents and assign each a model (one could be Claude, one GPT-4, etc.). They can then communicate or collaborate on tasks. This is complex but powerful for certain use cases (like one agent writing code, another reviewing it).
    *   **On-Demand Switching:** Alternatively, you can have a single “assistant” interface but switch which model it calls based on a command or context. For instance, you might have a slash command like `/use Claude` vs `/use GPT-4` in your chat interface. Tools like OpenRouter (if you trust it) could route to different models by just changing a parameter. Or LiteLLM can let you specify model names (even vendor-specific ones) in a unified way [37].
    *   **Separate Interfaces:** You might run two separate CLI tools or apps: e.g. **Claude Code** (Anthropic’s CLI or desktop app for coding) and another for OpenAI. Running both concurrently is possible; each would have its own window or terminal. This is less integrated but sometimes simpler if the tools are provided by the vendors. Claude Code, for instance, runs in a terminal and you can ask it to perform tasks like reading/writing files in the project. If running multiple, be careful they don’t step on each other’s changes.

*   **Claude Code and MCP Servers:** Anthropic’s Claude has a mode called **Claude Code** which is an AI coding assistant. It can integrate with “MCP servers” – these are essentially third-party tool integrations (like the Figma plugin example from Composio). **MCP** stands for Multi-Client Package or something akin to plugin servers. A blog post on using Figma with Claude Code recommended keeping an `.mcp.json` config file in each project directory to separate project-specific tool configurations [38][39]. This is a good practice: if your agents rely on config (API keys, project-specific settings), store those configs per project rather than globally. For example, if you connect Claude to a Jira or a design tool via an MCP, do it separately for each project so one project’s integration doesn’t leak into another. The blog noted, *“This helps separate MCP servers per project, which is very helpful when adding multiple ones in the future”* [39].

*   **Gemini and Other Models:** Google’s **Gemini** (if available to you via an API or Google Cloud) could be integrated similarly by API calls. At the moment, OpenAI’s models (Codex, GPT-4) and Anthropic’s Claude are the most straightforward via API. If you use them, secure your API keys: store them as secrets (e.g. `OPENAI_API_KEY` loaded via 1Password as discussed). The agent running in the container can then pick up those env vars. For example, if you use a tool like `openai` Python library or `anthropic` SDK, they will read the keys from env.

*   **Chat Interface and VS Code Plugin:** You mentioned a “one click spin up and chat interface” and possibly a VS Code plugin. There are a few ways to achieve a chat interface:
    *   **Within VS Code:** You could use the VS Code extension for ChatGPT or Anthropic if available, or something like Cline’s VS Code plugin, which provides a chat view. This keeps everything in one place (code and chat side by side). For instance, Cline’s extension (open source) integrates a Claude-powered agent into VS Code’s sidebar [35].
    *   **Separate App or Web UI:** Alternatively, run a small web application that serves as a chat interface connected to your agents. Some developers use Streamlit or Gradio to create a quick local web UI that interacts with the codebase and AI models. The “one click” could be a script that launches Docker (if not up), starts the devcontainer, and also starts this web UI pointing to the container’s agent API.
    *   **Terminal-based CLI:** Tools like Claude Code or Cursor’s CLI allow chat via the terminal. You might simply open a terminal in VS Code that runs `claude` or `cursor chat` inside the container.

    The simplest path might be using the editor’s built-in capabilities (many editors are adding chat UIs). VS Code’s official GitHub Copilot Chat (if you have access) is one example – though that’s tied to a specific model (Copilot’s underlying OpenAI). There are community extensions that let you use OpenAI or others in a chat form in VS Code as well. If you prefer not to rely on the editor, a lightweight Node or Python app that provides a web chat connected to your container environment is an alternative.

*   **Observability of Agents:** Make sure you can see what the agents are doing. Log their actions if possible. If an agent is autonomous (can write files, run tests, etc.), having a log of those activities is useful for trust and debugging. Some frameworks will output a reasoning trace. If you integrate agents manually, you could add logging – e.g. wrap file write operations to log to console, which you can see via `docker compose logs` or in the editor terminal. This goes hand-in-hand with the earlier point of being able to **process logs easily**: your devcontainer setup should make it simple to view logs from all services, including any AI agent processes (perhaps run them under a supervisor that prints output).

Finally, keep security in mind with AI agents: they essentially act with your privileges within the container. The isolation helps (they can’t touch host files you didn’t mount, as mentioned), but they could still, say, delete or alter your project files. Only grant them the access they need (which is usually just the project folder). If you’re experimenting with truly autonomous agents, consider using source control to track changes or running them on a throwaway git branch, so you can easily revert if they go astray. Always have a human in the loop to review what multi-agent systems are proposing to do when it comes to critical code.

## Project-Specific Configuration and Style

To maximize productivity and consistency, bundle your project’s unique configurations into the dev container setup:

*   **Ship Configuration with the Project:** Every project repository should contain the config files that define its dev environment. This includes the `Dockerfile` or `docker-compose.yml` / `devcontainer.json`, plus any supporting scripts (like a `setup.sh` or tasks config). It also includes non-container configs like language-specific settings. For example, a Node.js project might include a `.nvmrc` (Node version) – your devcontainer could read that to pick the Node image version. A Python project might include `requirements.txt` or `pyproject.toml` – your Dockerfile can use those to pre-install deps. By storing these in git, any collaborator (or CI system, or AI agent) can use the same baseline.

*   **Editor Settings and Extensions:** If your team uses a particular code style (say 4-space indents, specific lint rules), include an `.editorconfig` file at the root of the repo. Most editors (and AI code tools) respect EditorConfig for basic things like indentation and line endings. Also include linter/formatter config files (like `.eslintrc.json`, `pyproject.toml` with Black config, etc.) in the repo. When the devcontainer installs these tools, they will automatically pick up the configs. In VS Code, you can even define recommended extensions in a `.vscode/extensions.json` file or via devcontainer settings so that anyone opening the project gets prompted to install them. In short, try to capture the development **conventions** of the project explicitly, so that both humans and AI assistants adhere to them. For example, if you have a style guide documented in `docs/style.md`, you could also feed that to the AI agent’s context so it knows (this ties back to providing those docs to the agents).

*   **MCP and API Keys Per Project:** As mentioned earlier, if your project uses external APIs or integrations (Figma, JIRA, etc.), keep any config or API keys scoped to the project. Use environment variables or config files that live in the project directory (but not in git if secret). Tools like the house-mcp-manager (from a GitHub link) or simply organizing your `.mcp.json` and similar files per project can help manage multiple integrations. This way, jumping between projects doesn’t carry over unintended credentials or context.

*   **Mode of Operation (Apple vs Docker):** Depending on the project requirements, you might sometimes not use a container at all. For example, iOS app development *requires* Xcode on macOS – you can’t build an iOS app in a Linux container easily. In such cases, your “dev container” might actually be a dev VM (for Mac) or just instructions for setting up the Mac host environment. If your workflow needs this, document it. Perhaps your devcontainer config can detect the OS and print a message or use an alternate setup. On macOS, for instance, you could choose to run certain tasks natively (Apple silicon is very fast for some builds, and some things might only run on Darwin). You could provide a script `mac-setup.sh` for those who choose not to use Docker on Mac for certain projects. On Windows, similarly, some may choose to use WSL2 directly. The idea is to allow flexibility: the container is default for consistency, but developers can opt out if needed (especially if doing something containers can’t do, like UI testing with macOS apps). In your documentation (perhaps in the README or AGENTS.md), note these modes. E.g. “On Mac, you can either use Docker (Linux container) or run natively. If running natively, ensure Homebrew installs X, Y, Z… If using Docker, use the provided devcontainer.”

*   **One-Click Startup Scripts:** To simplify starting the whole environment, consider adding a script or Makefile target. For example, a `make dev` command that does `docker compose up -d` (to start databases, etc.), then perhaps `code .` to open VS Code into the container, or launches whatever editor. Or a small shell script that detects the OS and opens the project accordingly. This can encapsulate the “one click spin-up” experience for those not using VS Code’s GUI. Another approach is to provide a VS Code “Remote Container” definition so that simply opening the project in VS Code triggers the question “Reopen in Container?” – which is essentially one click.

*   **Continuous Integration Alignment:** If possible, align your dev container with CI pipelines. For instance, if your CI uses a Docker image to run tests, you can use the same image or Dockerfile for dev. This ensures no dev/prod parity issues. Some teams even use devcontainers in GitHub Codespaces or similar – having it in the repo makes that trivial to set up as well.

By attending to project-specific details, you turn your dev container into an integral part of the project’s configuration. New contributors (or new AI agents) can quickly understand how to get everything running. And when switching between projects, each project feels self-contained: spin up its container, and you get the correct languages, versions, tools, and even AI settings for that project, without contaminating others.

## Cross-Platform Support (macOS, Windows, Linux)

Ensuring your dev container workflow runs smoothly on all three major OSes (with an emphasis on Mac first, as requested) requires some tuning:

*   **macOS (Apple Silicon and Intel):** Mac is a popular choice for devs, and with Apple Silicon (ARM64) chips, you need to consider multi-architecture images. Most official devcontainer images and popular bases are multi-arch (they have ARM64 variants), especially since Apple M1/M2 have been around for a while. When writing a Dockerfile, use base images that support arm64 or use platform-neutral references (e.g. using `node:18-bullseye` works on both). Docker Desktop on Mac will handle pulling the correct arch image. If you accidentally use an image that has only AMD64, Docker on M1 will resort to QEMU emulation which is slower (and you’d see a warning). So it’s usually fine, but better to pick multi-arch bases. Also, be mindful of any tooling – e.g. if you download a binary in Dockerfile via URL, ensure you pick the one for the right architecture (`$(dpkg --print-architecture)` can help in Debian-based images). For Apple-specific development (like iOS), as noted, you cannot use a Linux container to run Xcode. In those cases, you either restrict those tasks to macOS hosts or use an Apple-based VM (some companies use macOS VM in the cloud for CI, etc., but locally not straightforward due to licensing). Since the question suggests using Apple containers vs Docker, it might refer to Apple’s native containerization (which is mostly for iOS/tvOS apps sandboxing, not general dev use). More likely it means using Apple’s virtualization frameworks (like running a Linux VM via Apple Hypervisor). Tools like Colima use this under the hood. If someone doesn’t want Docker Desktop on Mac, they can use **Colima** which is open source and uses Apple’s hypervisor to spin a lightweight VM that runs Docker inside [30]. It’s a fairly smooth alternative and avoids Docker’s licensing requirements.

*   **Windows:** On Windows 11 (and Windows 10 21H1+), the recommended path is to use WSL2. Docker Desktop leverages WSL2 internally to run Linux containers. You can also install Docker inside a WSL2 Ubuntu distro and use VS Code Remote-WSL plus Remote-Containers to achieve the same. The devcontainer approach hides a lot of complexity: you just need Docker available (via Desktop or Podman) and VS Code. One hiccup on Windows can be file paths and volume mounting with Compose. WSL makes your Windows filesystem accessible under `/mnt/c`, which usually works fine. If you see any path issues in Docker Compose (like `C:\path` vs `/path`), ensure you use relative paths or Linux-style paths in your config (when VS Code runs Docker from inside WSL, it expects Linux paths). Another consideration: if you want GUI applications from the container on Windows, that’s trickier (need X11 server or VcXsrv, etc.), but for most code dev it’s not needed. Windows containers (Windows-based images) are not relevant here since we stick to Linux containers for dev.

*   **Linux:** Linux is the most straightforward since containers are a native concept there. Just ensure the developer has Docker or Podman installed. If using Podman in rootless mode, you may need to tweak VS Code settings (as mentioned, set dockerPath to podman, possibly set `"dev.containers.containerUser"` if needed). Permissions on mounted files can be an issue: e.g. if your host user ID is 1000 and container user is also 1000 (common default), files created inside container will be owned by host user – which is good. If they mismatch, you might get root-owned files on host after container work. The solution is either align UIDs (the devcontainer spec does this by default for Docker Desktop; on pure Docker in Linux, you might need to explicitly set the user in Dockerfile to match your UID). Alternatively, you can live with it and `chown` if needed. This is one area to verify when sharing the project folder: create a test file from inside container and see ownership on host. Adjust `remoteUser` or Dockerfile `USER` as needed to avoid permission headaches.

*   **Supporting Both Docker and Podman:** If you want to be really flexible, you can provide instructions for both. For example, in your README you might say: “If using Docker Desktop or Docker Engine, use the included devcontainer setup. If using Podman, ensure to install Podman v5+, and set up Podman Docker API socket or VS Code settings accordingly.” In practice, Podman works with VS Code now fairly well. Podman’s `podman compose` supports most of docker-compose syntax. One caveat: volume mounts on Podman rootless use FUSE and can behave slightly differently with file permissions, but generally it’s fine for dev. Also note that certain Docker-specific features (like using the Docker daemon socket) won’t work on Podman by default since there’s no daemon – but that’s rarely needed in devcontainers except if you want to *build* images inside the devcontainer (Docker-in-Docker scenarios). If you do need that, you might rely on Podman’s socket or just run Docker in Docker.

*   **Performance Considerations:** On Mac and Windows, file system performance for mounted volumes can be slower than on Linux (due to virtualization overhead). Docker has ways to optimize (e.g. VirtioFS on Mac, caching options). If you find project builds are slow due to I/O, consider enabling cached mounts. For example, Docker Compose allows `:delegated` or `:cached` mount flags on Mac for better performance (with some consistency trade-offs). VS Code had an option to “mount Docker socket” or not; you generally don’t need that in our context, and not mounting it is slightly safer.

In essence, the dev container approach is cross-platform by design – you describe an environment and the heavy lifting is done by Docker/Podman which abstract the OS differences. Our job is just to note the special cases: Apple Silicon needs multi-arch images, Windows needs WSL2 and path care, Linux needs user permissions checked. Document any known quirks in your project docs so a developer isn’t left scratching their head if something is OS-specific.

## Conclusion

Using dev containers locally can drastically improve your development workflow by providing isolated, consistent environments across projects and machines. By applying secure defaults (non-root containers, minimal host exposure, up-to-date images), you mitigate many risks of local development – especially important as supply-chain attacks target dev machines [40][41]. With the integration of secret managers like 1Password, you keep sensitive data out of your code and configuration, loading it only when needed [3]. Volume management ensures you only share what’s necessary with the container, and nothing more.

We also discussed how to integrate advanced tools: whether it’s hooking up AI agents to assist with coding, or ensuring your preferred editor (be it VS Code, Cursor, Zed, or others) connects seamlessly to the container. The landscape of AI coding assistants is evolving quickly – by designing your environment with open standards and flexibility (using things like devcontainer spec, OpenRouter/LiteLLM, etc.), you are prepared to plug in whatever agent or model provides the best help, without compromising your project’s security or privacy.

In summary, a well-crafted dev container setup serves as a robust foundation for modern development. It encapsulates not just the runtime and dependencies for your app, but also your developer tools, configurations, and even AI helpers. All of this can be started with essentially one command or click, and torn down just as easily, leaving your host system clean. Embrace these practices and you’ll find your development becoming more portable, secure, and efficient – letting you focus on coding, while the environment “just works” around you.

**Sources:** The recommendations and strategies above were informed by multiple sources and community best practices, including Node.js security research on isolated devcontainers [3][14], guides on using 1Password Connect for secrets [15][16], as well as discussions on integrating AI agents in development environments [39][33]. These references and others have been cited in context throughout this document for further reading. Happy containerized coding!

[1] Run Your Project in a Dev Container, in Zed — Zed's Blog  
`https://zed.dev/blog/dev-containers`

[2] Mitigate Supply Chain Security with DevContainers and 1Password for Node.js Local Development  
`https://www.nodejs-security.com/blog/mitigate-supply-chain-security-with-devcontainers-and-1password-for-nodejs-local-development`

[3] Mitigate Supply Chain Security with DevContainers and 1Password for Node.js Local Development  
`https://www.nodejs-security.com/blog/mitigate-supply-chain-security-with-devcontainers-and-1password-for-nodejs-local-development`

[4] Add a non-root user to a container - Visual Studio Code  
`https://code.visualstudio.com/remote/advancedcontainers/add-nonroot-user`

[5] Securing Devcontainers (part 1) - a simple setup with Ruby and Jekyll | Some Natalie's corner of the internet  
`https://some-natalie.dev/blog/securing-devcontainers/`

[6] Securing Devcontainers (part 1) - a simple setup with Ruby and Jekyll | Some Natalie's corner of the internet  
`https://some-natalie.dev/blog/securing-devcontainers/`

[7] Securing Devcontainers (part 1) - a simple setup with Ruby and Jekyll | Some Natalie's corner of the internet  
`https://some-natalie.dev/blog/securing-devcontainers/`

[8] Securing Devcontainers (part 1) - a simple setup with Ruby and Jekyll | Some Natalie's corner of the internet  
`https://some-natalie.dev/blog/securing-devcontainers/`

[9] Alternate ways to install Docker  
`https://code.visualstudio.com/remote/advancedcontainers/docker-options`

[10] Load secrets automatically with 1password and direnv - DEV Community  
`https://dev.to/agonza05/load-secrets-automatically-with-1password-and-direnv-pn0`

[11] Load secrets automatically with 1password and direnv - DEV Community  
`https://dev.to/agonza05/load-secrets-automatically-with-1password-and-direnv-pn0`

[12] Load secrets automatically with 1password and direnv - DEV Community  
`https://dev.to/agonza05/load-secrets-automatically-with-1password-and-direnv-pn0`

[13] Mitigate Supply Chain Security with DevContainers and 1Password for Node.js Local Development  
`https://www.nodejs-security.com/blog/mitigate-supply-chain-security-with-devcontainers-and-1password-for-nodejs-local-development`

[14] Mitigate Supply Chain Security with DevContainers and 1Password for Node.js Local Development  
`https://www.nodejs-security.com/blog/mitigate-supply-chain-security-with-devcontainers-and-1password-for-nodejs-local-development`

[15] Mitigate Supply Chain Security with DevContainers and 1Password for Node.js Local Development  
`https://www.nodejs-security.com/blog/mitigate-supply-chain-security-with-devcontainers-and-1password-for-nodejs-local-development`

[16] Mitigate Supply Chain Security with DevContainers and 1Password for Node.js Local Development  
`https://www.nodejs-security.com/blog/mitigate-supply-chain-security-with-devcontainers-and-1password-for-nodejs-local-development`

[17] Mitigate Supply Chain Security with DevContainers and 1Password for Node.js Local Development  
`https://www.nodejs-security.com/blog/mitigate-supply-chain-security-with-devcontainers-and-1password-for-nodejs-local-development`

[18] Mitigate Supply Chain Security with DevContainers and 1Password for Node.js Local Development  
`https://www.nodejs-security.com/blog/mitigate-supply-chain-security-with-devcontainers-and-1password-for-nodejs-local-development`

[19] Mitigate Supply Chain Security with DevContainers and 1Password for Node.js Local Development  
`https://www.nodejs-security.com/blog/mitigate-supply-chain-security-with-devcontainers-and-1password-for-nodejs-local-development`

[20] Mitigate Supply Chain Security with DevContainers and 1Password for Node.js Local Development  
`https://www.nodejs-security.com/blog/mitigate-supply-chain-security-with-devcontainers-and-1password-for-nodejs-local-development`

[21] Alternate ways to install Docker  
`https://code.visualstudio.com/remote/advancedcontainers/docker-options`

[22] Dev containers support - Feature Requests - Cursor  
`https://forum.cursor.com/t/dev-containers-support/1510`

[23] Make cursor work with dev containers · Issue #2395 - GitHub  
`https://github.com/cursor/cursor/issues/2395`

[24] Devcontainers don't work yet again - Bug Reports - Cursor  
`https://forum.cursor.com/t/devcontainers-dont-work-yet-again/146727`

[25] Run Your Project in a Dev Container, in Zed — Zed's Blog  
`https://zed.dev/blog/dev-containers`

[26] Run Your Project in a Dev Container, in Zed — Zed's Blog  
`https://zed.dev/blog/dev-containers`

[27] Run Your Project in a Dev Container, in Zed — Zed's Blog  
`https://zed.dev/blog/dev-containers`

[28] Run Your Project in a Dev Container, in Zed — Zed's Blog  
`https://zed.dev/blog/dev-containers`

[29] Alternate ways to install Docker  
`https://code.visualstudio.com/remote/advancedcontainers/docker-options`

[30] Alternate ways to install Docker  
`https://code.visualstudio.com/remote/advancedcontainers/docker-options`

[31] Alternate ways to install Docker  
`https://code.visualstudio.com/remote/advancedcontainers/docker-options`

[32] Run Your Project in a Dev Container, in Zed — Zed's Blog  
`https://zed.dev/blog/dev-containers`

[33] Question on LiteLLM Gateway and OpenRouter : r/LLMDevs - Reddit  
`https://www.reddit.com/r/LLMDevs/comments/1jsf6j3/question_on_litellm_gateway_and_openrouter/`

[34] LiteLLM - Getting Started | liteLLM  
`https://docs.litellm.ai/`

[35] Cline - AI Coding, Open Source and Uncompromised  
`https://cline.bot/`

[36] Cline - AI Coding, Open Source and Uncompromised  
`https://cline.bot/`

[37] OpenRouter - LiteLLM  
`https://docs.litellm.ai/docs/providers/openrouter`

[38] How to use Figma MCP with Claude Code to build pixel perfect designs - Composio  
`https://composio.dev/blog/how-to-use-figma-mcp-with-claude-code-to-build-pixel-perfect-designs`

[39] How to use Figma MCP with Claude Code to build pixel perfect designs - Composio  
`https://composio.dev/blog/how-to-use-figma-mcp-with-claude-code-to-build-pixel-perfect-designs`

[40] Mitigate Supply Chain Security with DevContainers and 1Password for Node.js Local Development  
`https://www.nodejs-security.com/blog/mitigate-supply-chain-security-with-devcontainers-and-1password-for-nodejs-local-development`

[41] Mitigate Supply Chain Security with DevContainers and 1Password for Node.js Local Development  
`https://www.nodejs-security.com/blog/mitigate-supply-chain-security-with-devcontainers-and-1password-for-nodejs-local-development`