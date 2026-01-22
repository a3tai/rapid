/**
 * @a3t/rapid-schema
 *
 * JSON schema, TypeScript types, and Zod validation schemas for RAPID configuration.
 * An open source project by A3T.
 *
 * @packageDocumentation
 */

// Re-export the JSON schema
export { default as schema } from './rapid.schema.json';

// Re-export all Zod schemas and their inferred types
export * from './schemas.js';

/**
 * RAPID configuration file (rapid.json)
 */
export interface RapidConfig {
  /** JSON schema URL for validation and IntelliSense */
  $schema?: string;

  /** RAPID configuration specification version */
  version: '1.0';

  /** Project name (defaults to directory name) */
  name?: string;

  /** Container lifecycle configuration */
  container?: ContainerConfig;

  /** Secret management configuration */
  secrets?: SecretsConfig;

  /** AI agent configuration */
  agents: AgentsConfig;

  /** Context file generation and management */
  context?: ContextConfig;

  /** Model Context Protocol server configuration */
  mcp?: McpConfig;

  /** Lima VM configuration (macOS local mode) */
  lima?: LimaConfig;

  /** Sandbox runtime configuration */
  sandbox?: SandboxConfig;

  /** LLM Gateway configuration */
  gateway?: GatewayConfig;

  /** Inter-agent event bus configuration */
  eventBus?: EventBusConfig;

  /** Agent personas configuration */
  personas?: PersonasConfig;

  /** Skills/commands configuration */
  skills?: SkillsConfig;

  /** Unified security configuration */
  security?: SecurityConfig;
}

/**
 * Lima VM configuration
 */
export interface LimaConfig {
  /** Install GitHub CLI (gh) in the VM (default: true) */
  installGh?: boolean;
}

/**
 * Sandbox mode selection
 */
export type SandboxMode = 'auto' | 'sandbox' | 'lima' | 'none';

/**
 * Sandbox runtime configuration
 */
export interface SandboxConfig {
  /** Enable OS-level sandboxing (default: true) */
  enabled?: boolean;

  /** Sandbox mode: auto, sandbox (seatbelt/bubblewrap), lima, or none */
  mode?: SandboxMode;

  /** Sandbox backend: seatbelt (macOS) or bubblewrap (Linux) - deprecated, use mode */
  backend?: 'seatbelt' | 'bubblewrap' | 'auto';

  /** Network sandboxing configuration */
  network?: SandboxNetworkConfig;

  /** Filesystem sandboxing configuration */
  filesystem?: SandboxFilesystemConfig;
}

/**
 * Network sandbox configuration
 */
export interface SandboxNetworkConfig {
  /** Enable network filtering (default: true) */
  enabled?: boolean;

  /** Allowed domains (supports wildcards like *.github.com) */
  allowedDomains?: string[];

  /** Denied domains (overrides allowed) */
  deniedDomains?: string[];

  /** HTTP proxy port (default: 8888) */
  proxyPort?: number;

  /** SOCKS proxy port (default: 1080) */
  socksPort?: number;
}

/**
 * Filesystem sandbox configuration
 */
export interface SandboxFilesystemConfig {
  /** Paths allowed for read access */
  readPaths?: string[];

  /** Paths allowed for write access */
  writePaths?: string[];

  /** Paths allowed for write access (alias for writePaths) */
  allowWrite?: string[];

  /** Paths that are completely blocked */
  blockedPaths?: string[];

  /** Make entire filesystem read-only except allowed paths */
  readOnlyRoot?: boolean;
}

/**
 * LLM Gateway configuration (LiteLLM integration)
 */
export interface GatewayConfig {
  /** Enable LLM gateway (default: false) */
  enabled?: boolean;

  /** Gateway type: litellm, openrouter, custom */
  type?: 'litellm' | 'openrouter' | 'custom';

  /** Gateway mode: external (connect to existing) or managed (RAPID starts it) */
  mode?: 'external' | 'managed';

  /** Gateway connection config */
  config?: GatewayConnectionConfig;

  /** Fallback behavior when gateway is unavailable */
  fallback?: 'direct' | 'error';

  /** Model aliases and routing */
  models?: GatewayModelsConfig;

  /** Budget configuration */
  budgets?: GatewayBudgetConfig;

  /** Enable request/response logging */
  logging?: boolean;
}

/**
 * Gateway connection configuration
 */
export interface GatewayConnectionConfig {
  /** Base URL of the gateway */
  baseUrl?: string;

  /** API key for authentication */
  apiKey?: string;

  /** Path to LiteLLM config file */
  configFile?: string;

  /** Additional headers */
  headers?: Record<string, string>;
}

/**
 * Gateway models configuration
 */
export interface GatewayModelsConfig {
  /** Default model to use */
  default?: string;

  /** Model aliases (alias -> actual model name) */
  aliases?: Record<string, string>;

  /** Detailed model configurations for LiteLLM */
  list?: GatewayModelConfig[];
}

/**
 * Gateway model configuration (for LiteLLM model_list)
 */
export interface GatewayModelConfig {
  /** Model name/alias */
  modelName: string;

  /** Provider (openai, anthropic, google, etc.) */
  provider: string;

  /** Model ID at the provider */
  model: string;

  /** API key environment variable */
  apiKeyEnv?: string;

  /** Priority for routing (higher = preferred) */
  priority?: number;
}

/**
 * Gateway budget configuration
 */
export interface GatewayBudgetConfig {
  /** Project-level budget */
  project?: BudgetLimit;

  /** Per-session budget */
  session?: BudgetLimit;

  /** Per-model budgets */
  perModel?: Record<string, BudgetLimit>;
}

/**
 * Budget limit configuration
 */
export interface BudgetLimit {
  /** Maximum spend in USD */
  max: number;

  /** Budget duration (e.g., "30d", "24h") */
  duration?: string;

  /** Alert thresholds as percentages */
  alertAt?: number[];
}

/**
 * Inter-agent event bus configuration
 */
export interface EventBusConfig {
  /** Enable event bus (default: false) */
  enabled?: boolean;

  /** Redis configuration (if not set, uses in-memory) */
  redis?: EventBusRedisConfig;

  /** Context injection settings */
  injection?: EventBusInjectionConfig;

  /** Auto-check settings */
  autoCheck?: EventBusAutoCheckConfig;
}

/**
 * Event bus Redis configuration
 */
export interface EventBusRedisConfig {
  /** Redis connection URL */
  url?: string;

  /** Key prefix for RAPID data */
  prefix?: string;
}

/**
 * Event bus context injection configuration
 */
export interface EventBusInjectionConfig {
  /** Injection mode */
  mode?: 'system_prompt' | 'user_prefix' | 'tool_response';

  /** Maximum messages to inject */
  maxMessages?: number;

  /** Minimum priority to include */
  priorityThreshold?: 'low' | 'normal' | 'high' | 'urgent';

  /** Message types to include */
  includeTypes?: string[];
}

/**
 * Event bus auto-check configuration
 */
export interface EventBusAutoCheckConfig {
  /** Enable automatic message checking */
  enabled?: boolean;

  /** Check interval in milliseconds */
  intervalMs?: number;
}

/**
 * Container lifecycle configuration
 */
export interface ContainerConfig {
  /** Path to devcontainer.json (default: ".devcontainer/devcontainer.json") */
  devcontainer?: string;

  /** Docker Compose file (overrides devcontainer) */
  compose?: string;

  /** Start container automatically on rapid dev (default: true) */
  autoStart?: boolean;

  /** Additional Docker build arguments */
  buildArgs?: Record<string, string>;
}

/**
 * Secret management configuration
 */
export interface SecretsConfig {
  /** Secret provider to use (default: "1password") */
  provider?: '1password' | 'vault' | 'env';

  /** Vault name (1Password) or path (HashiCorp) */
  vault?: string;

  /** Vault server address (HashiCorp Vault only) */
  address?: string;

  /** Map of environment variable names to secret references */
  items?: Record<string, string>;

  /** .envrc generation settings */
  envrc?: EnvrcConfig;

  /** .env file integration (discouraged) */
  dotenv?: DotenvConfig;

  /** External auth detection configuration */
  externalAuth?: ExternalAuthConfig;
}

/**
 * External auth source types
 */
export type ExternalAuthSource = 'claude-code' | 'codex' | 'gemini-cli' | 'aider' | 'env';

/**
 * External auth configuration
 */
export interface ExternalAuthConfig {
  /** Enable external auth detection (default: true) */
  enabled?: boolean;

  /** Sources to check for credentials */
  sources?: ExternalAuthSource[];

  /** Preferred source when multiple are available */
  preferSource?: ExternalAuthSource;
}

/**
 * .envrc generation settings
 */
export interface EnvrcConfig {
  /** Auto-generate .envrc from items (default: true) */
  generate?: boolean;

  /** Path to .envrc file (default: ".envrc") */
  path?: string;

  /** Source .envrc.local if present (default: true) */
  includeLocal?: boolean;
}

/**
 * .env file integration (discouraged)
 */
export interface DotenvConfig {
  /** Enable .env file loading (default: false) */
  enabled?: boolean;

  /** .env files to load (default: [".env", ".env.local"]) */
  files?: string[];

  /** Show security warning when loading .env files (default: true) */
  warn?: boolean;
}

/**
 * AI agent configuration
 */
export interface AgentsConfig {
  /** Name of the default agent */
  default: string;

  /** Map of agent name to configuration */
  available: Record<string, AgentDefinition>;
}

/**
 * Configuration for a single AI agent
 */
export interface AgentDefinition {
  /** CLI command to execute */
  cli: string;

  /** Path to instruction file for this agent */
  instructionFile?: string;

  /** Required environment variables */
  envVars?: string[];

  /** Command to install the CLI tool */
  installCmd?: string;

  /** Additional CLI arguments */
  args?: string[];

  /**
   * CLI argument pattern for injecting system prompts at runtime.
   * Use {prompt} as placeholder for the prompt content.
   * Example: "--append-system-prompt {prompt}" for Claude
   */
  systemPromptArg?: string;

  /**
   * Whether this agent reads instruction files from the filesystem automatically.
   * If true, RAPID will ensure AGENTS.md exists with methodology.
   */
  readsInstructionFiles?: boolean;

  /**
   * YOLO mode: Skip all permission prompts when launching the agent.
   * For Claude, this adds the --dangerously-skip-permissions flag.
   * WARNING: Only use in trusted environments (dev containers, CI, etc.)
   */
  yolo?: boolean;
}

/**
 * Context file generation and management
 */
export interface ContextConfig {
  /** Files to include in agent context (default: ["README.md"]) */
  files?: string[];

  /** Directories to include (default: ["docs/"]) */
  dirs?: string[];

  /** Patterns to exclude */
  exclude?: string[];

  /** Auto-generate AGENTS.md, CLAUDE.md (default: true) */
  generateAgentFiles?: boolean;

  /** Custom templates for agent files */
  templateDir?: string;

  /** Files to preserve from auto-updates */
  preserve?: string[];
}

/**
 * Model Context Protocol server configuration
 */
export interface McpConfig {
  /** Path to MCP config file (default: ".mcp.json") */
  configFile?: string;

  /** MCP server configurations */
  servers?: Record<string, McpServerConfig>;
}

/**
 * MCP transport types following the MCP specification.
 * - 'stdio': Local subprocess communication (MCP spec standard)
 * - 'streamable-http': Remote HTTP communication (MCP spec standard)
 * - 'remote': Alias for 'streamable-http' (user-friendly, backwards compatible)
 */
export type McpTransportType = 'stdio' | 'streamable-http' | 'remote';

/**
 * Configuration for a single MCP server
 */
export interface McpServerConfig {
  /** Enable this MCP server (default: true) */
  enabled?: boolean;

  /**
   * Server transport type (MCP spec naming):
   * - 'stdio': Local subprocess (command + args)
   * - 'streamable-http': Remote HTTP server (url + headers)
   * - 'remote': Alias for 'streamable-http' (backwards compatible)
   */
  type?: McpTransportType;

  /** URL for remote/streamable-http servers */
  url?: string;

  /** HTTP headers for remote/streamable-http servers */
  headers?: Record<string, string>;

  /** Command for stdio servers */
  command?: string;

  /** Arguments for stdio command */
  args?: string[];

  /** Environment variables for stdio servers */
  env?: Record<string, string>;

  /** Additional server-specific configuration */
  [key: string]: unknown;
}

/**
 * Schema URL for use in rapid.json files
 */
export const SCHEMA_URL = 'https://getrapid.dev/schema/v1/rapid.json';

/**
 * Current schema version
 */
export const SCHEMA_VERSION = '1.0';

// ============================================================================
// PERSONA CONFIGURATION
// ============================================================================

/**
 * Supported AI models for personas
 */
export type PersonaModel =
  | 'fast'
  | 'smart'
  | 'thinking'
  | 'opus'
  | 'sonnet'
  | 'haiku'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'custom';

/**
 * Supported runtimes for personas
 */
export type PersonaRuntime = 'claude' | 'codex' | 'opencode' | 'aider' | 'custom';

/**
 * Personality traits that influence agent behavior
 */
export type PersonalityTrait =
  | 'thorough'
  | 'concise'
  | 'cautious'
  | 'bold'
  | 'creative'
  | 'analytical'
  | 'friendly'
  | 'formal'
  | 'asks_clarifying_questions'
  | 'autonomous';

/**
 * Event triggers that can spawn a persona
 */
export type PersonaTrigger =
  | 'on_pr'
  | 'on_commit'
  | 'on_issue'
  | 'on_error'
  | 'on_request'
  | 'manual';

/**
 * Tools available to personas
 */
export type PersonaTool =
  | 'read'
  | 'write'
  | 'edit'
  | 'grep'
  | 'glob'
  | 'bash'
  | 'bus_send'
  | 'bus_messages'
  | 'bus_agents'
  | 'web_search'
  | 'web_fetch';

/**
 * Configuration for an AI persona/agent with custom prompt and personality
 */
export interface PersonaConfig {
  /** Unique persona identifier */
  name: string;

  /** Human-readable description */
  description?: string;

  /** AI model to use (affects cost/capability) */
  model?: PersonaModel;

  /** Runtime/CLI to execute for this persona */
  runtime?: PersonaRuntime;

  /** Custom model ID when model is 'custom' */
  customModel?: string;

  /** System prompt that defines the persona's role and behavior */
  systemPrompt: string;

  /** Personality traits that influence behavior */
  personality?: PersonalityTrait[];

  /** MCP tools this persona can access */
  tools?: PersonaTool[];

  /** Events that can automatically spawn this persona */
  triggers?: PersonaTrigger[];

  /** Maximum conversation turns before auto-terminating */
  maxTurns?: number;

  /** Whether this persona can spawn other personas */
  canSpawn?: boolean;

  /** Parent persona to inherit settings from */
  extends?: string;

  /** Additional context files to include */
  contextFiles?: string[];

  /** Environment variables required by this persona */
  envVars?: string[];

  /** Custom metadata */
  metadata?: Record<string, unknown>;

  /**
   * Security configuration for HITL controls
   */
  security?: PersonaSecurityConfig;
}

/**
 * Per-persona security configuration for HITL controls
 */
export interface PersonaSecurityConfig {
  /**
   * Tool patterns that require human approval before execution.
   * Supports wildcards: "file_*", "secure_exec", "persona_spawn"
   */
  approvalRequired?: string[];

  /**
   * Trust level for this persona: 'low', 'medium', 'high'
   * - low: all sensitive operations require approval
   * - medium: only high-risk operations require approval
   * - high: operates autonomously (yolo mode)
   */
  trustLevel?: 'low' | 'medium' | 'high';

  /**
   * Maximum budget in USD for this persona's session.
   * Operations exceeding this will be blocked.
   */
  budgetLimit?: number;

  /**
   * Whether this persona can approve requests from other agents.
   * Only orchestrator-level personas should have this.
   */
  canApprove?: boolean;

  /**
   * Require approval for spawning other agents (default: true for low trust)
   */
  approveSpawn?: boolean;

  /**
   * Allowed file paths/patterns this persona can write to.
   * Empty means no restrictions. Supports globs.
   */
  allowedPaths?: string[];
}

/**
 * Collection of persona configurations
 */
export interface PersonasConfig {
  /** Directory containing persona definition files */
  directory?: string;

  /** Default model for all personas */
  defaultModel?: PersonaModel;

  /** Default tools for all personas */
  defaultTools?: PersonaTool[];

  /** Inline persona definitions */
  definitions?: Record<string, PersonaConfig>;

  /** Team configuration for multi-agent spawning */
  team?: string[];

  /** Automatically spawn team agents on rapid start (default: false) */
  autoSpawn?: boolean;

  /** Orchestrator persona name (coordinates the team) */
  orchestrator?: string;

  /**
   * Enable yolo mode: skip all permission prompts for spawned agents.
   * When false (default), HITL approval requests surface in the UI.
   * Use with caution - allows agents to execute without human approval.
   */
  yoloMode?: boolean;
}

/**
 * Skill configuration for Claude Code integration
 */
export interface SkillConfig {
  /** Skill name (used as /command) */
  name: string;

  /** Human-readable description */
  description: string;

  /** Skill implementation type */
  type: 'spawn' | 'script' | 'mcp';

  /** For spawn type: persona to spawn */
  persona?: string;

  /** For script type: command to execute */
  command?: string;

  /** Arguments passed to the skill */
  args?: string[];
}

/**
 * Skills configuration
 */
export interface SkillsConfig {
  /** Directory containing skill definition files */
  directory?: string;

  /** Inline skill definitions */
  definitions?: Record<string, SkillConfig>;
}

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

/**
 * Agent roles for access control
 */
export type AgentRole = 'orchestrator' | 'worker' | 'designer' | 'reviewer' | 'devops' | 'admin';

/**
 * Human approval action patterns
 */
export interface ApprovalAction {
  /** Action pattern (supports wildcards: *, ?) */
  pattern: string;

  /** Require human approval for this action */
  requireApproval: boolean;

  /** Roles that can perform this action without approval */
  exemptRoles?: AgentRole[];

  /** Description shown in approval request */
  description?: string;
}

/**
 * Human-in-the-loop approval configuration
 */
export interface HumanApprovalConfig {
  /** Enable human approval workflow (default: false) */
  enabled?: boolean;

  /** Actions requiring human approval (patterns support wildcards) */
  requiredActions?: string[];

  /** Detailed action configurations */
  actions?: ApprovalAction[];

  /** Approval request timeout in seconds (default: 300) */
  timeout?: number;

  /** What happens on timeout: 'deny' or 'allow' (default: 'deny') */
  timeoutBehavior?: 'deny' | 'allow';

  /** Notification channels for approval requests */
  notify?: ApprovalNotifyConfig;
}

/**
 * Approval notification configuration
 */
export interface ApprovalNotifyConfig {
  /** Send to event bus (default: true) */
  eventBus?: boolean;

  /** Send desktop notification via Wails (default: true) */
  desktop?: boolean;

  /** Webhook URL for external notifications */
  webhook?: string;
}

/**
 * Tool-level access control (TBAC - Task-Based Access Control)
 */
export interface ToolAclConfig {
  /** Tool name or pattern */
  tool: string;

  /** Roles allowed to use this tool */
  allowedRoles?: AgentRole[];

  /** Roles denied from using this tool */
  deniedRoles?: AgentRole[];

  /** Patterns requiring approval (e.g., ['*.env', '*.key'] for write_file) */
  requireApprovalFor?: string[];

  /** Always require approval for this tool */
  alwaysRequireApproval?: boolean;

  /** Maximum calls per minute (rate limiting) */
  rateLimit?: number;
}

/**
 * Audit trail configuration
 */
export interface AuditConfig {
  /** Enable audit logging (default: true) */
  enabled?: boolean;

  /** Events to log */
  events?: AuditEventType[];

  /** Log destination: file, eventBus, or both (default: 'both') */
  destination?: 'file' | 'eventBus' | 'both';

  /** Path to audit log file (default: '.rapid/audit.jsonl') */
  logFile?: string;

  /** Log retention in days (default: 30) */
  retentionDays?: number;
}

/**
 * Types of events to audit
 */
export type AuditEventType =
  | 'tool_call'
  | 'approval_request'
  | 'approval_response'
  | 'secret_access'
  | 'sandbox_violation'
  | 'budget_alert'
  | 'agent_spawn'
  | 'agent_terminate';

/**
 * Unified security configuration
 */
export interface SecurityConfig {
  /** Human-in-the-loop approval configuration */
  humanApproval?: HumanApprovalConfig;

  /** Tool-level access control list */
  toolAcls?: ToolAclConfig[];

  /** Audit trail configuration */
  audit?: AuditConfig;

  /** Override sandbox settings (inherits from top-level sandbox if not set) */
  sandbox?: SandboxConfig;

  /** Override gateway budgets (inherits from top-level gateway if not set) */
  budgets?: GatewayBudgetConfig;

  /** Per-agent budget limits in USD */
  perAgentBudget?: number;

  /** Per-session budget limits in USD */
  perSessionBudget?: number;

  /** Block all network access by default (strict mode) */
  strictMode?: boolean;

  /** Trust level for the environment: 'development', 'staging', 'production' */
  trustLevel?: 'development' | 'staging' | 'production';
}

/**
 * Default rapid.json configuration
 *
 * Key defaults for a "magical" experience:
 * - eventBus enabled: multi-agent communication works out of the box
 * - RAPID MCP server enabled: agents get bus_send, bus_messages, etc.
 * - yolo mode enabled for claude: no permission prompts in trusted environments
 */
export const DEFAULT_CONFIG: RapidConfig = {
  version: '1.0',
  agents: {
    default: 'claude',
    available: {
      claude: {
        cli: 'claude',
        instructionFile: 'CLAUDE.md',
        yolo: true, // Skip permission prompts in trusted dev environments
      },
      opencode: {
        cli: 'opencode',
        instructionFile: 'AGENTS.md',
      },
      codex: {
        cli: 'codex',
        instructionFile: 'AGENTS.md',
      },
    },
  },
  eventBus: {
    enabled: true, // Multi-agent features ON by default
  },
  mcp: {
    configFile: '.mcp.json',
    servers: {
      rapid: {
        enabled: true,
        type: 'remote',
        url: 'http://localhost:3100/mcp',
      },
    },
  },
};
