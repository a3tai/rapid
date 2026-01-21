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

const logger = createLogger('personas');

// Simple YAML parser for persona configs (handles basic YAML structure)
function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let inMultiline = false;
  let multilineIndent = 0;

  for (const line of lines) {
    // Skip empty lines and comments at root level
    if (!inMultiline && (line.trim() === '' || line.trim().startsWith('#'))) {
      continue;
    }

    // Check for multiline indicator
    if (line.includes(': |')) {
      if (currentKey && currentValue.length > 0) {
        result[currentKey] = currentValue.join('\n').trim();
        currentValue = [];
      }
      currentKey = line.split(':')[0]?.trim() ?? '';
      inMultiline = true;
      multilineIndent = 0;
      continue;
    }

    // Handle multiline content
    if (inMultiline) {
      const trimmed = line.trimStart();
      const indent = line.length - trimmed.length;

      if (multilineIndent === 0 && trimmed.length > 0) {
        multilineIndent = indent;
      }

      // Check if we've exited the multiline block
      if (indent < multilineIndent && trimmed.length > 0 && !line.startsWith(' ')) {
        result[currentKey!] = currentValue.join('\n');
        currentValue = [];
        inMultiline = false;
        currentKey = null;
      } else {
        currentValue.push(line.slice(multilineIndent) || '');
        continue;
      }
    }

    // Handle key: value pairs
    if (line.includes(':') && !line.startsWith(' ') && !line.startsWith('-')) {
      if (currentKey && currentValue.length > 0) {
        result[currentKey] = currentValue.join('\n').trim();
        currentValue = [];
      }

      const colonIdx = line.indexOf(':');
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();

      if (value === '') {
        currentKey = key;
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Simple array: [item1, item2]
        result[key] = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim());
      } else if (value === 'true') {
        result[key] = true;
      } else if (value === 'false') {
        result[key] = false;
      } else if (/^\d+$/.test(value)) {
        result[key] = parseInt(value, 10);
      } else {
        result[key] = value;
      }
      currentKey = key;
    } else if (line.trim().startsWith('- ')) {
      // Array item
      const item = line.trim().slice(2);
      if (!Array.isArray(result[currentKey!])) {
        result[currentKey!] = [];
      }
      (result[currentKey!] as string[]).push(item);
    }
  }

  // Handle final multiline block
  if (inMultiline && currentKey && currentValue.length > 0) {
    result[currentKey] = currentValue.join('\n');
  }

  return result;
}

// Persona schema matching @a3t/rapid-schema types
const PersonaModelSchema = z.enum(['opus', 'sonnet', 'haiku', 'gpt-4o', 'gpt-4o-mini', 'custom']);

const PersonalityTraitSchema = z.enum([
  'thorough',
  'concise',
  'cautious',
  'bold',
  'creative',
  'analytical',
  'friendly',
  'formal',
  'asks_clarifying_questions',
  'autonomous',
]);

const PersonaTriggerSchema = z.enum([
  'on_pr',
  'on_commit',
  'on_issue',
  'on_error',
  'on_request',
  'manual',
]);

const PersonaToolSchema = z.enum([
  'read',
  'write',
  'edit',
  'grep',
  'glob',
  'bash',
  'bus_send',
  'bus_messages',
  'bus_agents',
  'web_search',
  'web_fetch',
]);

const PersonaConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  model: PersonaModelSchema.optional(),
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
        const parsed = parseYaml(content);
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
      const parsed = parseYaml(content);
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

      // Map persona model to Claude model ID
      const modelMap: Record<string, string> = {
        opus: 'claude-opus-4-5-20251101',
        sonnet: 'claude-sonnet-4-20250514',
        haiku: 'claude-haiku-4-20250514',
      };

      const modelId = persona.model
        ? modelMap[persona.model] || persona.customModel
        : modelMap.sonnet;

      // Generate system prompt with task
      let systemPrompt = generateSystemPrompt(persona);
      if (task) {
        systemPrompt += `\n\n## Current Task\n${task}`;
      }

      // Build the spawn command (for Claude Code Task agent)
      const command = `claude --model ${modelId} --system-prompt "${systemPrompt.replace(/"/g, '\\"')}"`;

      const output = {
        command,
        model: modelId || 'claude-sonnet-4-20250514',
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
        background = true,
        connectToBus = true,
        worktree: _worktree,
      } = args as {
        name: string;
        task: string;
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
        // Resolve the actual host project directory (important for Docker environments)
        const hostProjectDir = process.env.RAPID_HOST_PROJECT_DIR || context.projectDir;
        const worktreeDir = join(hostProjectDir, '.worktrees', worktree);

        if (context.verbose) {
          logger.error(`[persona_spawn] Creating worktree '${worktree}' at ${worktreeDir}`);
        }

        // Create git worktree using the host project directory
        await execa('git', ['worktree', 'add', '-b', worktree, worktreeDir], {
          cwd: hostProjectDir,
          reject: false,
        });

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

      // Map persona model to Claude model ID
      const modelMap: Record<string, string> = {
        opus: 'opus',
        sonnet: 'sonnet',
        haiku: 'haiku',
      };

      const model = persona.model ? modelMap[persona.model] || 'sonnet' : 'sonnet';

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

      try {
        // Build the claude command with proper arguments
        const claudeArgs = [
          '--model',
          model,
          '--print',
          '--output-format',
          'text',
          '--append-system-prompt',
          systemPrompt,
          task,
        ];

        if (background) {
          // Spawn in background, capture output to file
          const hostProjectDir = process.env.RAPID_HOST_PROJECT_DIR || context.projectDir;
          const worktreeDir = join(hostProjectDir, '.worktrees', worktree);
          const proc = execa('claude', claudeArgs, {
            cwd: worktreeDir,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            reject: false,
            env: {
              ...process.env,
              RAPID_AGENT_ID: agentId,
              RAPID_PERSONA: name,
              RAPID_PROJECT_DIR: context.projectDir,
              RAPID_HOST_PROJECT_DIR: hostProjectDir,
              RAPID_WORKTREE: worktree,
              RAPID_WORKTREE_DIR: worktreeDir,
            },
          });

          agent.process = proc;
          spawnedAgents.set(agentId, agent);

          // Stream output to file
          const outputStream = createWriteStream(outputFile, { flags: 'a' });

          proc.stdout?.pipe(outputStream);
          proc.stderr?.pipe(outputStream);

          // Handle completion
          proc
            .then((result) => {
              const a = spawnedAgents.get(agentId);
              if (a) {
                a.status = result.exitCode === 0 ? 'completed' : 'failed';
                a.exitCode = result.exitCode ?? 1;
              }
            })
            .catch(() => {
              const a = spawnedAgents.get(agentId);
              if (a) {
                a.status = 'failed';
              }
            });

          if (context.verbose) {
            logger.error(`[persona_spawn] Spawned ${name} as ${agentId} in background`);
          }
        } else {
          // Run synchronously and wait for completion
          spawnedAgents.set(agentId, agent);

          const hostProjectDir = process.env.RAPID_HOST_PROJECT_DIR || context.projectDir;
          const worktreeDir = join(hostProjectDir, '.worktrees', worktree);
          const result = await execa('claude', claudeArgs, {
            cwd: worktreeDir,
            reject: false,
            env: {
              ...process.env,
              RAPID_AGENT_ID: agentId,
              RAPID_PERSONA: name,
              RAPID_PROJECT_DIR: context.projectDir,
              RAPID_HOST_PROJECT_DIR: hostProjectDir,
              RAPID_WORKTREE: worktree,
              RAPID_WORKTREE_DIR: worktreeDir,
            },
          });

          // Write output to file
          await writeFile(outputFile, result.stdout + '\n' + result.stderr, 'utf-8');

          agent.status = result.exitCode === 0 ? 'completed' : 'failed';
          agent.exitCode = result.exitCode ?? 1;
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
