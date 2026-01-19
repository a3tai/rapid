/**
 * Gateway Management Module
 *
 * Manages LiteLLM and custom API gateway integration for unified model routing.
 * Includes cost tracking, budget management, and request logging.
 */

import { execa } from 'execa';
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { GatewayConfig, GatewayStatus } from './types.js';

/**
 * Cost record for tracking LLM usage
 */
export interface CostRecord {
  timestamp: string;
  requestId: string;
  sessionId?: string;
  agentId?: string;
  projectId?: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
  status: 'success' | 'error';
  cached: boolean;
}

/**
 * Cost summary for reporting
 */
export interface CostSummary {
  period: { start: string; end: string };
  totalCost: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Record<string, { cost: number; requests: number; tokens: number }>;
  byAgent: Record<string, { cost: number; requests: number }>;
  bySession: Record<string, { cost: number; requests: number }>;
}

/**
 * Budget configuration
 */
export interface BudgetConfig {
  maxBudget?: number;
  budgetDuration?: string;
  alertThresholds?: number[];
}

/**
 * LiteLLM YAML config structure
 */
export interface LiteLLMConfig {
  model_list: Array<{
    model_name: string;
    litellm_params: {
      model: string;
      api_key?: string;
    };
  }>;
  litellm_settings?: {
    drop_params?: boolean;
    set_verbose?: boolean;
    max_budget?: number;
    budget_duration?: string;
    cache?: boolean;
    cache_params?: {
      type: string;
      host?: string;
      port?: number;
    };
  };
  router_settings?: {
    routing_strategy?: string;
    num_retries?: number;
    retry_after?: number;
    allowed_fails?: number;
    cooldown_time?: number;
  };
  general_settings?: {
    master_key?: string;
  };
}

/**
 * Default gateway configuration
 */
export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  enabled: false,
  type: 'litellm',
  mode: 'external',
  config: {
    baseUrl: 'http://localhost:4000',
  },
  fallback: 'direct',
};

/**
 * Environment variables to inject for different agents when using a gateway
 */
export const GATEWAY_ENV_VARS: Record<
  string,
  (baseUrl: string, apiKey?: string) => Record<string, string>
> = {
  claude: (baseUrl, apiKey) => ({
    ANTHROPIC_BASE_URL: `${baseUrl}/v1`,
    ...(apiKey && { ANTHROPIC_API_KEY: apiKey }),
  }),
  aider: (baseUrl, apiKey) => ({
    OPENAI_API_BASE: `${baseUrl}/v1`,
    ...(apiKey && { OPENAI_API_KEY: apiKey }),
  }),
  opencode: (baseUrl, apiKey) => ({
    ANTHROPIC_BASE_URL: `${baseUrl}/v1`,
    ...(apiKey && { ANTHROPIC_API_KEY: apiKey }),
  }),
  codex: (baseUrl, apiKey) => ({
    OPENAI_API_BASE: `${baseUrl}/v1`,
    ...(apiKey && { OPENAI_API_KEY: apiKey }),
  }),
};

/**
 * Gateway manager class
 */
export class GatewayManager {
  private config: GatewayConfig;
  private managedProcess: ReturnType<typeof execa> | null = null;
  private lastHealthCheck: Date | null = null;
  private healthy = false;
  private rapidDir: string;
  private costLogPath: string;
  private configPath: string;

  constructor(config?: Partial<GatewayConfig>) {
    this.config = {
      ...DEFAULT_GATEWAY_CONFIG,
      ...config,
    };
    this.rapidDir = join(homedir(), '.rapid');
    this.costLogPath = join(this.rapidDir, 'gateway-costs.jsonl');
    this.configPath = join(this.rapidDir, 'litellm_config.yaml');
  }

  /**
   * Ensure RAPID directory exists
   */
  private ensureRapidDir(): void {
    if (!existsSync(this.rapidDir)) {
      mkdirSync(this.rapidDir, { recursive: true });
    }
  }

  /**
   * Get gateway status
   */
  async getStatus(): Promise<GatewayStatus> {
    if (!this.config.enabled) {
      return {
        enabled: false,
        healthy: false,
      };
    }

    // Check health
    const healthy = await this.checkHealth();

    const status: GatewayStatus = {
      enabled: true,
      type: this.config.type,
      mode: this.config.mode,
      baseUrl: this.config.config?.baseUrl,
      healthy,
    };

    if (this.lastHealthCheck) {
      status.lastHealthCheck = this.lastHealthCheck;
    }

    return status;
  }

  /**
   * Check if the gateway is healthy
   */
  async checkHealth(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const baseUrl = this.config.config?.baseUrl;
    if (!baseUrl) {
      return false;
    }

    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      this.lastHealthCheck = new Date();
      this.healthy = response.ok;
      return this.healthy;
    } catch {
      this.lastHealthCheck = new Date();
      this.healthy = false;
      return false;
    }
  }

  /**
   * Start the gateway (managed mode only)
   */
  async start(): Promise<void> {
    if (this.config.mode !== 'managed') {
      throw new Error('Can only start gateway in managed mode');
    }

    if (this.managedProcess) {
      throw new Error('Gateway already running');
    }

    // Check if litellm is installed
    if (!(await this.hasLitellm())) {
      throw new Error('LiteLLM is not installed. Install it with: pip install litellm[proxy]');
    }

    const args = ['--port', this.getPort().toString()];

    // Add config file if specified
    if (this.config.config?.configFile) {
      args.push('--config', this.config.config.configFile);
    }

    this.managedProcess = execa('litellm', args, {
      stdio: 'pipe',
      detached: true,
    });

    // Wait for gateway to be ready
    await this.waitForHealth(30000);
  }

  /**
   * Stop the gateway (managed mode only)
   */
  async stop(): Promise<void> {
    if (this.managedProcess) {
      this.managedProcess.kill('SIGTERM');
      this.managedProcess = null;
    }
  }

  /**
   * Get environment variables for an agent
   */
  getEnvironmentForAgent(agentName: string): Record<string, string> {
    if (!this.config.enabled || !this.config.config?.baseUrl) {
      return {};
    }

    const baseUrl = this.config.config.baseUrl;
    const apiKey = this.config.config.apiKey;

    const envFn = GATEWAY_ENV_VARS[agentName];
    if (!envFn) {
      // Default to OpenAI-compatible env vars
      return {
        OPENAI_API_BASE: `${baseUrl}/v1`,
        ...(apiKey && { OPENAI_API_KEY: apiKey }),
      };
    }

    return envFn(baseUrl, apiKey);
  }

  /**
   * Resolve a model alias to the actual model name
   */
  resolveModel(alias: string): string {
    if (!this.config.models?.aliases) {
      return alias;
    }

    return this.config.models.aliases[alias] || alias;
  }

  /**
   * Get the default model
   */
  getDefaultModel(): string | undefined {
    return this.config.models?.default;
  }

  /**
   * Check if LiteLLM is installed
   */
  private async hasLitellm(): Promise<boolean> {
    try {
      await execa('litellm', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the port from the base URL
   */
  private getPort(): number {
    const baseUrl = this.config.config?.baseUrl || 'http://localhost:4000';
    const url = new URL(baseUrl);
    return parseInt(url.port, 10) || 4000;
  }

  /**
   * Wait for the gateway to become healthy
   */
  private async waitForHealth(timeoutMs: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await this.checkHealth()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Gateway failed to become healthy');
  }

  /**
   * Log a cost record
   */
  logCost(record: CostRecord): void {
    this.ensureRapidDir();
    appendFileSync(this.costLogPath, JSON.stringify(record) + '\n');
  }

  /**
   * Get cost records within a time range
   */
  getCostRecords(options?: {
    since?: Date;
    until?: Date;
    model?: string;
    agent?: string;
    session?: string;
    limit?: number;
  }): CostRecord[] {
    if (!existsSync(this.costLogPath)) {
      return [];
    }

    const content = readFileSync(this.costLogPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    let records: CostRecord[] = lines.map((line) => JSON.parse(line));

    // Apply filters
    if (options?.since) {
      const sinceTime = options.since.getTime();
      records = records.filter((r) => new Date(r.timestamp).getTime() >= sinceTime);
    }
    if (options?.until) {
      const untilTime = options.until.getTime();
      records = records.filter((r) => new Date(r.timestamp).getTime() <= untilTime);
    }
    if (options?.model) {
      records = records.filter((r) => r.model === options.model);
    }
    if (options?.agent) {
      records = records.filter((r) => r.agentId === options.agent);
    }
    if (options?.session) {
      records = records.filter((r) => r.sessionId === options.session);
    }
    if (options?.limit) {
      records = records.slice(-options.limit);
    }

    return records;
  }

  /**
   * Get cost summary
   */
  getCostSummary(options?: { hours?: number; days?: number }): CostSummary {
    const hours = options?.hours ?? (options?.days ? options.days * 24 : 24);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const records = this.getCostRecords({ since });

    const summary: CostSummary = {
      period: {
        start: since.toISOString(),
        end: new Date().toISOString(),
      },
      totalCost: 0,
      totalRequests: records.length,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      byModel: {},
      byAgent: {},
      bySession: {},
    };

    for (const record of records) {
      summary.totalCost += record.cost;
      summary.totalInputTokens += record.inputTokens;
      summary.totalOutputTokens += record.outputTokens;

      // By model
      const modelKey = record.model;
      if (!summary.byModel[modelKey]) {
        summary.byModel[modelKey] = { cost: 0, requests: 0, tokens: 0 };
      }
      const modelData = summary.byModel[modelKey]!;
      modelData.cost += record.cost;
      modelData.requests += 1;
      modelData.tokens += record.inputTokens + record.outputTokens;

      // By agent
      if (record.agentId) {
        const agentKey = record.agentId;
        if (!summary.byAgent[agentKey]) {
          summary.byAgent[agentKey] = { cost: 0, requests: 0 };
        }
        const agentData = summary.byAgent[agentKey]!;
        agentData.cost += record.cost;
        agentData.requests += 1;
      }

      // By session
      if (record.sessionId) {
        const sessionKey = record.sessionId;
        if (!summary.bySession[sessionKey]) {
          summary.bySession[sessionKey] = { cost: 0, requests: 0 };
        }
        const sessionData = summary.bySession[sessionKey]!;
        sessionData.cost += record.cost;
        sessionData.requests += 1;
      }
    }

    return summary;
  }

  /**
   * Check if budget is exceeded
   */
  isBudgetExceeded(budget: BudgetConfig): { exceeded: boolean; current: number; limit: number } {
    if (!budget.maxBudget) {
      return { exceeded: false, current: 0, limit: 0 };
    }

    // Parse duration (e.g., "30d", "7d", "24h")
    let hours = 24 * 30; // default 30 days
    if (budget.budgetDuration) {
      const match = budget.budgetDuration.match(/^(\d+)([dhm])$/);
      if (match && match[1] && match[2]) {
        const value = parseInt(match[1], 10);
        const unit = match[2];
        if (unit === 'd') hours = value * 24;
        else if (unit === 'h') hours = value;
        else if (unit === 'm') hours = value / 60;
      }
    }

    const summary = this.getCostSummary({ hours });
    return {
      exceeded: summary.totalCost >= budget.maxBudget,
      current: summary.totalCost,
      limit: budget.maxBudget,
    };
  }

  /**
   * Write LiteLLM config file
   */
  writeLiteLLMConfig(config: LiteLLMConfig): string {
    this.ensureRapidDir();

    // Convert to YAML-like format (JSON with comments)
    const yamlContent = this.configToYaml(config);
    writeFileSync(this.configPath, yamlContent);

    return this.configPath;
  }

  /**
   * Convert config to YAML format
   */
  private configToYaml(config: LiteLLMConfig): string {
    const lines: string[] = [];

    // Model list
    lines.push('model_list:');
    for (const model of config.model_list) {
      lines.push(`  - model_name: "${model.model_name}"`);
      lines.push('    litellm_params:');
      lines.push(`      model: "${model.litellm_params.model}"`);
      if (model.litellm_params.api_key) {
        lines.push(`      api_key: "${model.litellm_params.api_key}"`);
      }
    }

    // LiteLLM settings
    if (config.litellm_settings) {
      lines.push('');
      lines.push('litellm_settings:');
      if (config.litellm_settings.drop_params !== undefined) {
        lines.push(`  drop_params: ${config.litellm_settings.drop_params}`);
      }
      if (config.litellm_settings.set_verbose !== undefined) {
        lines.push(`  set_verbose: ${config.litellm_settings.set_verbose}`);
      }
      if (config.litellm_settings.max_budget !== undefined) {
        lines.push(`  max_budget: ${config.litellm_settings.max_budget}`);
      }
      if (config.litellm_settings.budget_duration) {
        lines.push(`  budget_duration: "${config.litellm_settings.budget_duration}"`);
      }
      if (config.litellm_settings.cache) {
        lines.push('  cache: true');
        if (config.litellm_settings.cache_params) {
          lines.push('  cache_params:');
          lines.push(`    type: "${config.litellm_settings.cache_params.type}"`);
          if (config.litellm_settings.cache_params.host) {
            lines.push(`    host: "${config.litellm_settings.cache_params.host}"`);
          }
          if (config.litellm_settings.cache_params.port) {
            lines.push(`    port: ${config.litellm_settings.cache_params.port}`);
          }
        }
      }
    }

    // Router settings
    if (config.router_settings) {
      lines.push('');
      lines.push('router_settings:');
      if (config.router_settings.routing_strategy) {
        lines.push(`  routing_strategy: "${config.router_settings.routing_strategy}"`);
      }
      if (config.router_settings.num_retries !== undefined) {
        lines.push(`  num_retries: ${config.router_settings.num_retries}`);
      }
      if (config.router_settings.retry_after !== undefined) {
        lines.push(`  retry_after: ${config.router_settings.retry_after}`);
      }
      if (config.router_settings.allowed_fails !== undefined) {
        lines.push(`  allowed_fails: ${config.router_settings.allowed_fails}`);
      }
      if (config.router_settings.cooldown_time !== undefined) {
        lines.push(`  cooldown_time: ${config.router_settings.cooldown_time}`);
      }
    }

    // General settings
    if (config.general_settings) {
      lines.push('');
      lines.push('general_settings:');
      if (config.general_settings.master_key) {
        lines.push(`  master_key: "${config.general_settings.master_key}"`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Generate default LiteLLM config for common models
   */
  static generateDefaultConfig(options?: {
    budget?: BudgetConfig;
    useCache?: boolean;
    verbose?: boolean;
  }): LiteLLMConfig {
    const config: LiteLLMConfig = {
      model_list: [
        {
          model_name: 'claude-sonnet',
          litellm_params: {
            model: 'anthropic/claude-sonnet-4-20250514',
            api_key: 'os.environ/ANTHROPIC_API_KEY',
          },
        },
        {
          model_name: 'claude-opus',
          litellm_params: {
            model: 'anthropic/claude-opus-4-20250514',
            api_key: 'os.environ/ANTHROPIC_API_KEY',
          },
        },
        {
          model_name: 'gpt-4o',
          litellm_params: {
            model: 'openai/gpt-4o',
            api_key: 'os.environ/OPENAI_API_KEY',
          },
        },
        {
          model_name: 'gpt-4o-mini',
          litellm_params: {
            model: 'openai/gpt-4o-mini',
            api_key: 'os.environ/OPENAI_API_KEY',
          },
        },
      ],
      litellm_settings: {
        drop_params: true,
        set_verbose: options?.verbose ?? false,
      },
      router_settings: {
        routing_strategy: 'simple-shuffle',
        num_retries: 3,
        retry_after: 5,
        allowed_fails: 2,
        cooldown_time: 60,
      },
    };

    if (options?.budget?.maxBudget) {
      config.litellm_settings!.max_budget = options.budget.maxBudget;
      config.litellm_settings!.budget_duration = options.budget.budgetDuration ?? '30d';
    }

    if (options?.useCache) {
      config.litellm_settings!.cache = true;
      config.litellm_settings!.cache_params = {
        type: 'redis',
        host: 'localhost',
        port: 6379,
      };
    }

    return config;
  }

  /**
   * Generate LiteLLM config file content
   */
  static generateLitellmConfig(options: {
    models?: Record<string, { litellm_provider: string; model: string }>;
    generalSettings?: Record<string, unknown>;
  }): string {
    const config: Record<string, unknown> = {
      model_list: Object.entries(options.models || {}).map(([name, def]) => ({
        model_name: name,
        litellm_params: {
          model: `${def.litellm_provider}/${def.model}`,
        },
      })),
    };

    if (options.generalSettings) {
      config.general_settings = options.generalSettings;
    }

    return JSON.stringify(config, null, 2);
  }

  /**
   * Generate docker-compose snippet for sidecar mode
   */
  static generateDockerComposeSidecar(port = 4000): string {
    return `
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    ports:
      - "${port}:${port}"
    environment:
      - PORT=${port}
    volumes:
      - ./litellm_config.yaml:/app/config.yaml
    command: ["--config", "/app/config.yaml"]
`.trim();
  }
}

/**
 * Create a gateway manager with default configuration
 */
export function createGatewayManager(config?: Partial<GatewayConfig>): GatewayManager {
  return new GatewayManager(config);
}

/**
 * Check if an external gateway is available
 */
export async function checkExternalGateway(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Expand environment variables in a string
 */
export function expandEnvVar(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => {
    return process.env[name] || '';
  });
}
