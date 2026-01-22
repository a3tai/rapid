/**
 * Persona Management Tools
 *
 * MCP tools for loading, listing, and spawning AI personas.
 * Personas are defined in .rapid/personas/*.yaml and can be
 * spawned as specialized agents with custom prompts and capabilities.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execa } from 'execa';
// @ts-expect-error - ExecaChildProcess type not exported in current execa version
import type { ExecaChildProcess } from 'execa';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';
import { createLogBuffer, type LogBuffer } from '@a3t/rapid-eventbus';
import { getProjectId } from '../utils/projectId.js';
import YAML from 'yaml';

const logger = createLogger('personas');

// Singleton LogBuffer instance for agent output
let logBuffer: LogBuffer | null = null;

/**
 * Get or create the LogBuffer instance for agent output
 */
async function getLogBuffer(projectDir: string): Promise<LogBuffer> {
  if (!logBuffer) {
    const projectId = await getProjectId(projectDir);
    // Check REDIS_URL first (Docker), then fall back to REDIS_HOST/PORT (local)
    const redisUrl = process.env.REDIS_URL;
    logBuffer = createLogBuffer({
      redis: redisUrl
        ? { url: redisUrl }
        : {
            host: process.env.REDIS_HOST ?? 'localhost',
            port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
          },
      projectId,
    });
    await logBuffer.connect();
  }
  return logBuffer;
}

/**
 * Request approval to create a PR when an agent completes
 *
 * Uses RAPID's HITL (Human-in-the-Loop) system:
 * - Sends approval_request to event bus
 * - Orchestrator or human decides whether to create PR
 * - If approved → create PR via worktree_merge_workflow
 * - If rejected → optionally cleanup worktree
 */
async function requestMergeApproval(
  projectDir: string,
  worktree: string,
  personaName: string,
  task: string,
  agentId: string
): Promise<{ requestSent: boolean; error?: string }> {
  const hostProjectDir = process.env.RAPID_HOST_PROJECT_DIR || projectDir;
  const worktreeDir = join(hostProjectDir, '.worktrees', worktree);

  logger.info(`[requestMergeApproval] Requesting approval for worktree '${worktree}'`);

  try {
    // Check if there are any commits
    const { stdout: diffOutput } = await execa(
      'git',
      ['log', 'origin/main..HEAD', '--oneline'],
      { cwd: worktreeDir, reject: false }
    );

    if (!diffOutput.trim()) {
      logger.info(`[requestMergeApproval] No commits in ${worktree}, skipping approval request`);
      return { requestSent: false, error: 'No commits to merge' };
    }

    // Get commit count and summary
    const commitLines = diffOutput.trim().split('\n').filter(l => l);
    const commitSummary = commitLines.slice(0, 5).join('\n');
    const hasMore = commitLines.length > 5;

    // Get current branch
    const { stdout: branch } = await execa(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: worktreeDir }
    );

    // Push the branch so it's ready for PR
    await execa('git', ['push', '-u', 'origin', branch.trim()], {
      cwd: worktreeDir,
      reject: false,
    });

    // Send approval request to event bus via Redis pub/sub
    // This will be picked up by the HITL approval system
    const Redis = (await import('ioredis')).default;
    const redisUrl = process.env.REDIS_URL;
    const redis = redisUrl
      ? new Redis(redisUrl)
      : new Redis({
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        });

    // Create a merge request that matches the MergeRequest interface in merge-approval.ts
    const mergeRequest = {
      id: `merge-${agentId.slice(0, 8)}-${Date.now()}`,
      agentId,
      agentName: personaName,
      worktree,
      branch: branch.trim(),
      task,
      commitCount: commitLines.length,
      commitSummary: commitSummary + (hasMore ? `\n... and ${commitLines.length - 5} more` : ''),
      projectDir: hostProjectDir,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };

    // Store in merge requests sorted set (used by merge_list and merge_decide tools)
    await redis.zadd('rapid:merge_requests', Date.now(), JSON.stringify(mergeRequest));

    // Publish event for UI notification
    await redis.publish(
      'rapid:events',
      JSON.stringify({
        type: 'merge_request',
        ...mergeRequest,
      })
    );

    await redis.quit();

    logger.info(`[requestMergeApproval] Approval request sent for ${worktree}`);
    return { requestSent: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[requestMergeApproval] Failed to send approval request: ${errorMsg}`);
    return { requestSent: false, error: errorMsg };
  }
}

// Persona schema - flexible to allow any model names (they change regularly)
const PersonaModelSchema = z.string();
const PersonaRuntimeSchema = z.string();

// Allow any string for personality traits - personas can define custom traits
const PersonalityTraitSchema = z.string();

// Allow any string for triggers - extensible
const PersonaTriggerSchema = z.string();

// Allow any string for tools - personas may use various tools
const PersonaToolSchema = z.string();

const PersonaConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  model: PersonaModelSchema.optional(),
  runtime: PersonaRuntimeSchema.optional(),
  customModel: z.string().optional(),
  systemPrompt: z.string(),
  personality: z.array(PersonalityTraitSchema).optional(),
  tools: z.array(PersonaToolSchema).optional(),
  triggers: z.array(PersonaTriggerSchema).optional(),
  maxTurns: z.number().optional(),
  canSpawn: z.boolean().optional(),
  extends: z.string().optional(),
  contextFiles: z.array(z.string()).optional(),
  envVars: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

type PersonaConfig = z.infer<typeof PersonaConfigSchema>;

const DEFAULT_PERSONA_RUNTIME = process.env.RAPID_DEFAULT_PERSONA_RUNTIME ?? 'claude';
const DEFAULT_PERSONA_MODEL = process.env.RAPID_DEFAULT_PERSONA_MODEL ?? 'smart';

const CLAUDE_MODEL_FAST =
  process.env.RAPID_CLAUDE_FAST_MODEL ?? 'claude-haiku-4-5-20251001';
const CLAUDE_MODEL_SMART =
  process.env.RAPID_CLAUDE_SMART_MODEL ?? 'claude-opus-4-5-20251101';
const CLAUDE_MODEL_THINKING =
  process.env.RAPID_CLAUDE_THINKING_MODEL ?? 'claude-sonnet-4-5-20250929';

const CODEX_MODEL_FAST = process.env.RAPID_CODEX_FAST_MODEL ?? 'gpt-4o-mini';
const CODEX_MODEL_SMART = process.env.RAPID_CODEX_SMART_MODEL ?? 'gpt-4o';
const CODEX_MODEL_THINKING = process.env.RAPID_CODEX_THINKING_MODEL ?? 'o3';

function resolvePersonaRuntime(persona: PersonaConfig): string {
  return persona.runtime ?? DEFAULT_PERSONA_RUNTIME;
}

function normalizeModelAlias(model?: string): string {
  if (!model) return DEFAULT_PERSONA_MODEL;

  // Normalize to lowercase for matching
  const normalized = model.toLowerCase().trim();

  // Handle natural language model names
  if (normalized.includes('haiku') || normalized === 'fast') {
    return 'fast';
  }
  if (normalized.includes('opus') || normalized === 'smart') {
    return 'smart';
  }
  if (normalized.includes('sonnet') || normalized === 'thinking') {
    return 'thinking';
  }
  // Handle GPT model names for codex runtime
  if (normalized.includes('gpt-4o-mini') || normalized.includes('4o-mini')) {
    return 'fast';
  }
  if (normalized.includes('gpt-4o') || normalized.includes('4o')) {
    return 'smart';
  }
  if (normalized.includes('o3') || normalized.includes('o1')) {
    return 'thinking';
  }

  return model;
}

function resolvePersonaModel(model: string | undefined, runtime: string): string {
  const alias = normalizeModelAlias(model);

  if (alias === 'fast') {
    return runtime === 'codex' ? CODEX_MODEL_FAST : CLAUDE_MODEL_FAST;
  }
  if (alias === 'smart') {
    return runtime === 'codex' ? CODEX_MODEL_SMART : CLAUDE_MODEL_SMART;
  }
  if (alias === 'thinking') {
    return runtime === 'codex' ? CODEX_MODEL_THINKING : CLAUDE_MODEL_THINKING;
  }

  return alias;
}

// Cache for loaded personas
const personaCache = new Map<string, PersonaConfig>();

// Track spawned agents
interface SpawnedAgent {
  id: string;
  personaName: string;
  task?: string;
  startedAt: Date;
  process?: ExecaChildProcess<string>;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  exitCode?: number;
  outputFile?: string;
  sessionId?: string;
}

const spawnedAgents = new Map<string, SpawnedAgent>();

/**
 * Load all personas from the .rapid/personas directory
 */
async function loadPersonas(projectDir: string): Promise<PersonaConfig[]> {
  const personasDir = join(projectDir, '.rapid', 'personas');
  const personas: PersonaConfig[] = [];

  try {
    const files = await readdir(personasDir);
    const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of yamlFiles) {
      try {
        const content = await readFile(join(personasDir, file), 'utf-8');
        const parsed = YAML.parse(content);
        const validated = PersonaConfigSchema.parse(parsed);
        personas.push(validated);
        personaCache.set(validated.name, validated);
      } catch (err) {
        logger.error(`[personas] Failed to load ${file}:`, err);
      }
    }
  } catch {
    // Directory doesn't exist, return empty
  }

  return personas;
}

/**
 * Get a single persona by name
 */
async function getPersona(projectDir: string, name: string): Promise<PersonaConfig | null> {
  // Check cache first
  if (personaCache.has(name)) {
    return personaCache.get(name)!;
  }

  // Try to load from file
  const personasDir = join(projectDir, '.rapid', 'personas');
  const possibleFiles = [`${name}.yaml`, `${name}.yml`];

  for (const file of possibleFiles) {
    try {
      const content = await readFile(join(personasDir, file), 'utf-8');
      const parsed = YAML.parse(content);
      const validated = PersonaConfigSchema.parse(parsed);
      personaCache.set(validated.name, validated);
      return validated;
    } catch {
      // File doesn't exist, try next
    }
  }

  return null;
}

/**
 * Generate a system prompt from a persona config
 */
function generateSystemPrompt(persona: PersonaConfig): string {
  let prompt = persona.systemPrompt;

  // Add personality traits as behavioral guidelines
  if (persona.personality && persona.personality.length > 0) {
    prompt += '\n\n## Behavioral Guidelines\n';
    prompt += `Your personality traits: ${persona.personality.join(', ')}.\n`;
    prompt += 'Adjust your communication style accordingly.';
  }

  // Add tool usage guidance
  if (persona.tools && persona.tools.length > 0) {
    prompt += '\n\n## Available Tools\n';
    prompt += `You have access to: ${persona.tools.join(', ')}.\n`;
    prompt += 'Use these tools to accomplish your tasks.';
  }

  // Add turn limit reminder
  if (persona.maxTurns) {
    prompt += `\n\nNote: You have a maximum of ${persona.maxTurns} turns to complete your task.`;
  }

  return prompt;
}

/**
 * Register persona management tools with the MCP server
 */
export function registerPersonaTools(server: McpServer, context: ServerContext): void {
const logger = createLogger('personas');
  // Tool: List available personas
  server.registerTool(
    'persona_list',
    {
      title: 'List Personas',
      description:
        'List all available personas from .rapid/personas/. ' +
        'Returns persona names, descriptions, and configurations.',
      inputSchema: {
        includePrompts: z
          .boolean()
          .default(false)
          .describe('Include full system prompts in output'),
      },
      outputSchema: {
        personas: z.array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            model: z.string().optional(),
            runtime: z.string().optional(),
            personality: z.array(z.string()).optional(),
            tools: z.array(z.string()).optional(),
            triggers: z.array(z.string()).optional(),
            systemPrompt: z.string().optional(),
          })
        ),
        count: z.number(),
      },
    },
    async (args) => {
      const { includePrompts } = args as { includePrompts?: boolean };
      const personas = await loadPersonas(context.projectDir);

      const output = {
        personas: personas.map((p) => ({
          name: p.name,
          description: p.description,
          model: p.model,
          runtime: p.runtime,
          personality: p.personality,
          tools: p.tools,
          triggers: p.triggers,
          ...(includePrompts ? { systemPrompt: p.systemPrompt } : {}),
        })),
        count: personas.length,
      };

      if (context.verbose) {
        logger.error(`[persona_list] Found ${personas.length} personas`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Get persona details
  server.registerTool(
    'persona_get',
    {
      title: 'Get Persona',
      description: 'Get detailed configuration for a specific persona.',
      inputSchema: {
        name: z.string().describe('Persona name to retrieve'),
      },
      outputSchema: {
        persona: PersonaConfigSchema.nullable(),
        systemPrompt: z.string().optional(),
        found: z.boolean(),
      },
    },
    async (args) => {
      const { name } = args as { name: string };
      const persona = await getPersona(context.projectDir, name);

      const output = {
        persona,
        systemPrompt: persona ? generateSystemPrompt(persona) : undefined,
        found: !!persona,
      };

      if (context.verbose) {
        logger.error(`[persona_get] ${name}: ${persona ? 'found' : 'not found'}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Generate spawn command
  server.registerTool(
    'persona_spawn_command',
    {
      title: 'Generate Spawn Command',
      description:
        'Generate the command to spawn an agent with a specific persona. ' +
        'Returns the CLI command and environment setup needed.',
      inputSchema: {
        name: z.string().describe('Persona name to spawn'),
        task: z.string().optional().describe('Task description for the agent'),
      },
      outputSchema: {
        command: z.string(),
        model: z.string(),
        systemPrompt: z.string(),
        envVars: z.array(z.string()),
        ready: z.boolean(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { name, task } = args as { name: string; task?: string };
      const persona = await getPersona(context.projectDir, name);

      if (!persona) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ready: false, error: `Persona '${name}' not found` }),
            },
          ],
          structuredContent: {
            command: '',
            model: '',
            systemPrompt: '',
            envVars: [],
            ready: false,
            error: `Persona '${name}' not found`,
          },
        };
      }

      const runtime = resolvePersonaRuntime(persona);
      const modelId = resolvePersonaModel(persona.model, runtime);

      // Generate system prompt with task
      let systemPrompt = generateSystemPrompt(persona);
      if (task) {
        systemPrompt += `\n\n## Current Task\n${task}`;
      }

      const escapedPrompt = systemPrompt.replace(/"/g, '\\"');
      const command =
        runtime === 'codex'
          ? `codex exec --model ${modelId} -C ${context.projectDir} -`
          : `claude --model ${modelId} --system-prompt "${escapedPrompt}"`;

      const output = {
        command,
        model: modelId,
        systemPrompt,
        envVars: persona.envVars || [],
        ready: true,
      };

      if (context.verbose) {
        logger.error(`[persona_spawn_command] Generated command for ${name}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Spawn an agent with a persona
  server.registerTool(
    'persona_spawn',
    {
      title: 'Spawn Agent',
      description:
        'Spawn a new AI agent with a specific persona. ' +
        "The agent runs as a subprocess with the persona's system prompt and capabilities. " +
        'Auto-creates an isolated worktree if worktree parameter not provided. ' +
        'Returns the agent ID for tracking.',
      inputSchema: {
        name: z.string().describe('Persona name to spawn'),
        task: z.string().describe('Task description for the agent'),
        runtime: z
          .string()
          .optional()
          .describe('Runtime to use: "claude" or "codex" (overrides persona default)'),
        model: z
          .string()
          .optional()
          .describe('Model to use: "fast", "smart", "thinking", or specific model ID (overrides persona default)'),
        background: z.boolean().default(true).describe('Run in background (default true)'),
        connectToBus: z.boolean().default(true).describe('Register agent with event bus'),
        worktree: z
          .string()
          .optional()
          .describe('Git worktree name or branch (auto-generated if not provided)'),
      },
      outputSchema: {
        agentId: z.string(),
        personaName: z.string(),
        task: z.string(),
        status: z.string(),
        outputFile: z.string().optional(),
        worktree: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const {
        name,
        task,
        runtime: runtimeOverride,
        model: modelOverride,
        background = true,
        connectToBus = true,
        worktree: _worktree,
      } = args as {
        name: string;
        task: string;
        runtime?: string;
        model?: string;
        background?: boolean;
        connectToBus?: boolean;
        worktree?: string;
      };

      // Generate worktree if not provided
      let worktree = _worktree;
      if (!worktree) {
        // Generate branch name: {persona}-{timestamp}
        const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
        worktree = `${name}-${timestamp}`;
      }

      const persona = await getPersona(context.projectDir, name);

      if (!persona) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Persona '${name}' not found` }),
            },
          ],
          structuredContent: {
            agentId: '',
            personaName: name,
            task,
            status: 'failed',
            error: `Persona '${name}' not found`,
          },
        };
      }

      // Generate UUID for the agent
      const agentId = randomUUID();

      // Create worktree for the agent
      try {
        // Git commands run inside the container, so use context.projectDir (container mount point)
        // The worktree is created relative to this, which will appear on the host via the volume mount
        const gitWorkDir = context.projectDir;
        const worktreeDir = join(gitWorkDir, '.worktrees', worktree);

        // For logging, also note the host path where this will appear
        const hostProjectDir = process.env.RAPID_HOST_PROJECT_DIR || context.projectDir;
        const hostWorktreeDir = join(hostProjectDir, '.worktrees', worktree);

        logger.info(`[persona_spawn] Creating worktree '${worktree}'`, {
          gitWorkDir,
          worktreeDir,
          hostWorktreeDir,
          contextProjectDir: context.projectDir,
          envHostDir: process.env.RAPID_HOST_PROJECT_DIR,
        });

        // Create git worktree using container's project directory
        const worktreeResult = await execa('git', ['worktree', 'add', '-b', worktree, worktreeDir], {
          cwd: gitWorkDir,
          reject: false,
        });

        if (worktreeResult.exitCode !== 0) {
          logger.warn(`[persona_spawn] Worktree creation warning: ${worktreeResult.stderr}`);
        }

        if (context.verbose) {
          logger.error(`[persona_spawn] Worktree '${worktree}' created successfully`);
        }
      } catch (err) {
        if (context.verbose) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error(`[persona_spawn] Warning: Failed to create worktree: ${errMsg}`);
        }
        // Don't fail the whole spawn, just log the warning
      }

      // Use runtime/model overrides if provided, otherwise fall back to persona defaults
      const runtime = runtimeOverride ?? resolvePersonaRuntime(persona);
      const model = resolvePersonaModel(modelOverride ?? persona.model, runtime);

      // Generate system prompt with task
      let systemPrompt = generateSystemPrompt(persona);

      // Add event bus registration instructions if enabled
      if (connectToBus) {
        systemPrompt += `\n\n## Event Bus Integration
You are connected to the RAPID event bus as agent "${agentId}" with name "${name}".
Use bus_send to share discoveries, errors, and completions with other agents.
Check bus_messages periodically for coordination messages from other agents.`;
      }

      // Create output directory for agent logs
      const agentsDir = join(context.projectDir, '.rapid', 'agents');
      try {
        await mkdir(agentsDir, { recursive: true });
      } catch {
        // Directory may already exist
      }

      const outputFile = join(agentsDir, `${agentId}.log`);
      const promptFile = join(agentsDir, `${agentId}.prompt`);

      // Write system prompt to file for reference
      await writeFile(promptFile, systemPrompt, 'utf-8');

      // Create the agent record
      const agent: SpawnedAgent = {
        id: agentId,
        personaName: name,
        task,
        startedAt: new Date(),
        status: 'running',
        outputFile,
      };

      // Initialize Redis log buffer for this agent
      let buffer: LogBuffer | null = null;
      try {
        buffer = await getLogBuffer(context.projectDir);
        await buffer.initAgent({
          agentId,
          personaName: name,
          task,
          startedAt: agent.startedAt.toISOString(),
          status: 'running',
        });
      } catch (err) {
        logger.warn('Failed to initialize Redis log buffer, falling back to file-only logging:', err);
      }

      try {
        // Call daemon to spawn agent in Docker container
        const daemonUrl = process.env.DAEMON_URL || 'http://localhost:3200';
        const hostProjectDir = process.env.RAPID_HOST_PROJECT_DIR || context.projectDir;

        logger.info(`[persona_spawn] Calling daemon at ${daemonUrl} to spawn ${name}`);

        const spawnRequest = {
          jsonrpc: '2.0',
          id: agentId,
          method: 'agent.spawn',
          params: {
            projectDir: hostProjectDir,
            persona: name,
            task,
            model,
            systemPrompt,
            worktree,
            env: {
              RAPID_AGENT_ID: agentId,
              RAPID_PERSONA: name,
              RAPID_WORKTREE: worktree,
              RAPID_AGENT_RUNTIME: runtime,
            },
          },
        };

        const response = await fetch(daemonUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(spawnRequest),
        });

        if (!response.ok) {
          throw new Error(`Daemon returned ${response.status}: ${await response.text()}`);
        }

        const result = await response.json() as { result?: { sessionId: string }; error?: { message: string } };

        if (result.error) {
          throw new Error(result.error.message);
        }

        // Update agent record with daemon session ID
        if (result.result?.sessionId) {
          agent.sessionId = result.result.sessionId;
        }
        spawnedAgents.set(agentId, agent);

        logger.info(`[persona_spawn] Daemon spawned ${name} with session ${result.result?.sessionId}`);

        // Daemon always runs agents in background
        // Output is streamed to Redis and can be retrieved via agent_logs tool
        if (context.verbose) {
          logger.info(`[persona_spawn] Spawned ${name} as ${agentId} via daemon`);
        }

        const output = {
          agentId,
          personaName: name,
          task,
          status: agent.status,
          outputFile,
          worktree,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        agent.status = 'failed';
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (context.verbose) {
          logger.error(`[persona_spawn] Failed to spawn ${name}: ${errorMsg}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Failed to spawn: ${errorMsg}` }),
            },
          ],
          structuredContent: {
            agentId,
            personaName: name,
            task,
            status: 'failed',
            error: errorMsg,
          },
        };
      }
    }
  );

  // Tool: List spawned agents
  server.registerTool(
    'persona_agents',
    {
      title: 'List Spawned Agents',
      description: 'List all agents that have been spawned, including their status.',
      inputSchema: {
        statusFilter: z
          .enum(['all', 'running', 'completed', 'failed', 'stopped'])
          .default('all')
          .describe('Filter by status'),
      },
      outputSchema: {
        agents: z.array(
          z.object({
            id: z.string(),
            personaName: z.string(),
            task: z.string().optional(),
            status: z.string(),
            startedAt: z.string(),
            exitCode: z.number().optional(),
            outputFile: z.string().optional(),
          })
        ),
        count: z.number(),
      },
    },
    async (args) => {
      const { statusFilter = 'all' } = args as { statusFilter?: string };

      const agents = Array.from(spawnedAgents.values())
        .filter((a) => statusFilter === 'all' || a.status === statusFilter)
        .map((a) => ({
          id: a.id,
          personaName: a.personaName,
          task: a.task,
          status: a.status,
          startedAt: a.startedAt.toISOString(),
          exitCode: a.exitCode,
          outputFile: a.outputFile,
        }));

      const output = {
        agents,
        count: agents.length,
      };

      if (context.verbose) {
        logger.error(`[persona_agents] Found ${agents.length} agents`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  // Tool: Stop a spawned agent
  server.registerTool(
    'persona_stop',
    {
      title: 'Stop Spawned Agent',
      description: 'Stop a running agent by its ID.',
      inputSchema: {
        agentId: z.string().describe('Agent ID to stop'),
      },
      outputSchema: {
        agentId: z.string(),
        stopped: z.boolean(),
        previousStatus: z.string(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { agentId } = args as { agentId: string };

      const agent = spawnedAgents.get(agentId);

      if (!agent) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Agent '${agentId}' not found` }),
            },
          ],
          structuredContent: {
            agentId,
            stopped: false,
            previousStatus: 'unknown',
            error: `Agent '${agentId}' not found`,
          },
        };
      }

      const previousStatus = agent.status;

      if (agent.status !== 'running') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                agentId,
                stopped: false,
                previousStatus,
                error: `Agent is not running (status: ${agent.status})`,
              }),
            },
          ],
          structuredContent: {
            agentId,
            stopped: false,
            previousStatus,
            error: `Agent is not running (status: ${agent.status})`,
          },
        };
      }

      try {
        if (agent.process) {
          agent.process.kill('SIGTERM');
        }
        agent.status = 'stopped';

        if (context.verbose) {
          logger.error(`[persona_stop] Stopped agent ${agentId}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ agentId, stopped: true, previousStatus }),
            },
          ],
          structuredContent: {
            agentId,
            stopped: true,
            previousStatus,
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Failed to stop: ${errorMsg}` }),
            },
          ],
          structuredContent: {
            agentId,
            stopped: false,
            previousStatus,
            error: errorMsg,
          },
        };
      }
    }
  );

  // Tool: Get agent output
  server.registerTool(
    'persona_output',
    {
      title: 'Get Agent Output',
      description: 'Get the output from a spawned agent.',
      inputSchema: {
        agentId: z.string().describe('Agent ID'),
        tail: z.number().default(100).describe('Number of lines from the end (default 100)'),
      },
      outputSchema: {
        agentId: z.string(),
        personaName: z.string(),
        status: z.string(),
        output: z.string(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { agentId, tail = 100 } = args as { agentId: string; tail?: number };

      const agent = spawnedAgents.get(agentId);

      if (!agent) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Agent '${agentId}' not found` }),
            },
          ],
          structuredContent: {
            agentId,
            personaName: 'unknown',
            status: 'unknown',
            output: '',
            error: `Agent '${agentId}' not found`,
          },
        };
      }

      let output = '';
      try {
        if (agent.outputFile) {
          const content = await readFile(agent.outputFile, 'utf-8');
          const lines = content.split('\n');
          output = lines.slice(-tail).join('\n');
        }
      } catch {
        output = '(no output yet)';
      }

      const result = {
        agentId,
        personaName: agent.personaName,
        status: agent.status,
        output,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );
}
