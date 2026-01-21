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
import { randomUUID } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import type { ServerContext } from '../server.js';

// Persona schema matching @a3t/rapid-schema types
const PersonaModelSchema = z.enum(['opus', 'sonnet', 'haiku', 'gpt-4o', 'gpt-4o-mini', 'custom']);

// Use string instead of strict enum to allow custom personality traits
// Common traits: thorough, concise, cautious, bold, creative, analytical, friendly, formal, asks_clarifying_questions, autonomous
const PersonalityTraitSchema = z.string();

const PersonaTriggerSchema = z.enum([
  'on_pr',
  'on_commit',
  'on_issue',
  'on_error',
  'on_request',
  'manual',
]);

// Use string instead of strict enum to allow custom tools
// Common tools: read, write, edit, grep, glob, bash, bus_send, bus_messages, bus_agents, bus_wait, bus_poll, web_search, web_fetch
const PersonaToolSchema = z.string();

// Security configuration schema for HITL controls
const PersonaSecurityConfigSchema = z.object({
  approvalRequired: z.array(z.string()).optional(),
  trustLevel: z.enum(['low', 'medium', 'high']).optional(),
  budgetLimit: z.number().optional(),
  canApprove: z.boolean().optional(),
  approveSpawn: z.boolean().optional(),
  allowedPaths: z.array(z.string()).optional(),
});

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
  security: PersonaSecurityConfigSchema.optional(),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process?: any; // execa process handle
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
        console.error(`[personas] Failed to load ${file}:`, err);
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
        console.error(`[persona_list] Found ${personas.length} personas`);
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
        console.error(`[persona_get] ${name}: ${persona ? 'found' : 'not found'}`);
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

      // Map persona model to Claude 4.5 model IDs
      const modelMap: Record<string, string> = {
        opus: 'claude-opus-4-5-20251101',
        sonnet: 'claude-sonnet-4-5-20250929',
        haiku: 'claude-haiku-4-5-20251001',
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
        console.error(`[persona_spawn_command] Generated command for ${name}`);
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
        yoloMode: z.boolean().optional().describe('Skip permission prompts (uses rapid.json if not specified)'),
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
        background: _background = true,
        connectToBus = true,
        worktree: _worktree,
        yoloMode: yoloModeArg,
      } = args as {
        name: string;
        task: string;
        background?: boolean;
        connectToBus?: boolean;
        worktree?: string;
        yoloMode?: boolean;
      };
      // Note: _background is captured but not used - all agents run as background containers

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

      // Generate system prompt with task
      let systemPrompt = generateSystemPrompt(persona);

      // Add event bus registration instructions if enabled
      if (connectToBus) {
        systemPrompt += `\n\n## Event Bus Integration - CRITICAL STARTUP REQUIREMENT
Your agent ID is "${agentId}" and your role is "${name}".

**FIRST ACTION REQUIRED**: Before doing anything else, you MUST:
1. Register with the event bus by calling bus_register with:
   - agentName: "${name}"
   - session: "${worktree}"
   - role: "${name}"
2. Send an initial "coordination" message announcing your presence:
   - type: "coordination"
   - title: "Agent ${name} starting"
   - content: "Registered and ready to work on task: ${task}"
3. Check for orchestrator messages and coordinate your work

## RALPH LOOP - CONTINUOUS OPERATION
You MUST run continuously using Ralph Loop. After completing your setup:

1. Invoke the ralph-loop skill with your ongoing task:
   /ralph-loop "Check bus_messages for new tasks from orchestrator. Execute any assigned work. Poll every 5 seconds. Report status via bus_send. Coordinate with other agents." --max-iterations 0

2. The Ralph Loop will keep you running indefinitely:
   - You work on tasks from the event bus
   - When you try to exit, Ralph restarts you with the same prompt
   - You see your previous work in files and continue
   - Only stop if orchestrator sends explicit shutdown signal

**Ongoing Communication**:
- Use bus_send to share discoveries, errors, and completions
- Check bus_messages continuously for coordination messages
- Send a "completion" message when each task is done
- Send an "error" message if you encounter issues
- Coordinate with the orchestrator for task prioritization`;
      }

      // Create output directory for agent logs
      const agentsDir = join(context.projectDir, '.rapid', 'agents');
      try {
        await mkdir(agentsDir, { recursive: true });
      } catch {
        // Directory may already exist
      }

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
      };

      try {
        // Call daemon API to spawn agent in Docker container
        // Use DAEMON_URL env var, or auto-detect based on environment
        // In Docker: rapid-daemon:3200, otherwise localhost:3200
        const isDocker = process.env.DOCKER_ENV === 'true' || process.env.HOSTNAME?.includes('rapid');
        const daemonUrl = process.env.DAEMON_URL || (isDocker ? 'http://rapid-daemon:3200' : 'http://localhost:3200');

        if (context.verbose) {
          console.error(`[persona_spawn] Calling daemon at ${daemonUrl} to spawn ${name}`);
        }

        // Check if yoloMode is enabled - explicit arg takes precedence over rapid.json
        let yoloMode = yoloModeArg;
        if (yoloMode === undefined) {
          try {
            const rapidJsonPath = join(context.projectDir, 'rapid.json');
            const rapidJson = await readFile(rapidJsonPath, 'utf-8');
            const rapidConfig = JSON.parse(rapidJson) as { agents?: { available?: { claude?: { yolo?: boolean } } } };
            yoloMode = rapidConfig.agents?.available?.claude?.yolo ?? false;
            if (context.verbose) {
              console.error(`[persona_spawn] yoloMode from rapid.json: ${yoloMode}`);
            }
          } catch {
            // rapid.json not found or invalid, default to HITL mode
            if (context.verbose) {
              console.error(`[persona_spawn] Could not read rapid.json, defaulting to HITL mode`);
            }
            yoloMode = false;
          }
        } else if (context.verbose) {
          console.error(`[persona_spawn] yoloMode from explicit arg: ${yoloMode}`);
        }

        // HITL approval check for spawning agents
        // If not in yolo mode and persona has approveSpawn: true, request approval
        const needsApproval = !yoloMode && (persona.security?.approveSpawn ?? persona.security?.trustLevel === 'low');
        if (needsApproval) {
          if (context.verbose) {
            console.error(`[persona_spawn] HITL: Approval required to spawn ${name}`);
          }

          // Create approval request via MCP endpoint
          const mcpUrl = process.env.MCP_URL || 'http://localhost:3100/mcp';
          try {
            const approvalResponse = await fetch(mcpUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: {
                  name: 'approval_request',
                  arguments: {
                    toolName: 'persona_spawn',
                    args: { persona: name, task, worktree },
                    agentId: 'orchestrator',
                    agentName: 'orchestrator',
                    reason: `Spawn ${name} agent for task: ${task.slice(0, 100)}...`,
                    timeoutMs: 300000, // 5 minute timeout
                  },
                },
              }),
            });

            const approvalResult = await approvalResponse.json() as {
              result?: { content?: Array<{ text?: string }>; structuredContent?: { approved: boolean } };
              error?: { message: string };
            };

            const approved = approvalResult.result?.structuredContent?.approved ?? false;

            if (!approved) {
              if (context.verbose) {
                console.error(`[persona_spawn] HITL: Approval denied for spawning ${name}`);
              }
              return {
                content: [
                  { type: 'text', text: JSON.stringify({ error: 'Approval denied for spawning agent' }) },
                ],
                structuredContent: {
                  agentId: '',
                  personaName: name,
                  task,
                  status: 'failed',
                  error: 'HITL approval denied',
                },
              };
            }

            if (context.verbose) {
              console.error(`[persona_spawn] HITL: Approved to spawn ${name}`);
            }
          } catch (approvalErr) {
            if (context.verbose) {
              console.error(`[persona_spawn] HITL: Approval request failed: ${approvalErr}`);
            }
            // On approval system failure, continue with spawn (fail-open for now)
            // In production, you might want fail-closed behavior
          }
        }

        // Determine model based on persona type
        // orchestrator → opus (smart model for coordination)
        // worker → haiku (fast model for execution)
        // thinking/designer/reviewer → sonnet (balanced model)
        let agentModel: string | undefined;
        const personaLower = name.toLowerCase();
        if (personaLower.includes('orchestrator') || personaLower.includes('lead') || personaLower.includes('architect')) {
          agentModel = 'opus';
        } else if (personaLower.includes('worker') || personaLower.includes('builder') || personaLower.includes('implementer')) {
          agentModel = 'haiku';
        } else if (personaLower.includes('think') || personaLower.includes('design') || personaLower.includes('review') || personaLower.includes('plan')) {
          agentModel = 'sonnet';
        } else if (persona.model) {
          // Use model from persona config if specified
          agentModel = persona.model;
        }

        if (context.verbose && agentModel) {
          console.error(`[persona_spawn] Auto-selected model '${agentModel}' for ${name}`);
        }

        const response = await fetch(daemonUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'agent.spawn',
            params: {
              projectDir: context.projectDir,
              persona: name,
              task,
              systemPrompt,
              yoloMode,
              model: agentModel,
              env: {
                RAPID_AGENT_ID: agentId,
                RAPID_PERSONA: name,
                RAPID_WORKTREE: worktree,
                // Pass auth tokens if available (prevents empty string from overriding secrets)
                // IMPORTANT: Use CLAUDE_CODE_OAUTH_TOKEN for OAuth, NOT ANTHROPIC_AUTH_TOKEN
                // ANTHROPIC_AUTH_TOKEN conflicts with Claude Code's OAuth handling
                ...(process.env.CLAUDE_CODE_OAUTH_TOKEN ? { CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN } : {}),
                // API key fallback (for console.anthropic.com accounts)
                ...(process.env.ANTHROPIC_API_KEY ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}),
              },
            },
          }),
        });

        const result = await response.json() as {
          result?: { sessionId: string; status: string };
          error?: { message: string };
        };

        if (result.error) {
          throw new Error(result.error.message);
        }

        const sessionId = result.result?.sessionId || agentId;
        agent.id = sessionId;
        spawnedAgents.set(sessionId, agent);

        if (context.verbose) {
          console.error(`[persona_spawn] Spawned ${name} as ${sessionId} via daemon`);
        }

        const output = {
          agentId: sessionId,
          personaName: name,
          task,
          status: 'running',
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
          console.error(`[persona_spawn] Failed to spawn ${name}: ${errorMsg}`);
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
        console.error(`[persona_agents] Found ${agents.length} agents`);
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

      // If agent is in local map, try to stop it locally first
      if (agent) {
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
            console.error(`[persona_stop] Stopped local agent ${agentId}`);
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

      // Agent not in local map - try to stop via daemon (Docker-based agent)
      const daemonUrl = process.env.DAEMON_URL || 'http://localhost:3200';

      try {
        if (context.verbose) {
          console.error(`[persona_stop] Stopping Docker agent ${agentId} via daemon`);
        }

        const response = await fetch(daemonUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'agent.stop',
            params: { agentId },
          }),
        });

        const result = (await response.json()) as {
          result?: { agentId: string; stopped: boolean; error?: string };
          error?: { message: string };
        };

        if (result.error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: result.error.message }),
              },
            ],
            structuredContent: {
              agentId,
              stopped: false,
              previousStatus: 'unknown',
              error: result.error.message,
            },
          };
        }

        const stopped = result.result?.stopped ?? false;
        const error = result.result?.error;

        if (context.verbose) {
          console.error(`[persona_stop] Daemon response: stopped=${stopped}, error=${error}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ agentId, stopped, previousStatus: 'running', error }),
            },
          ],
          structuredContent: {
            agentId,
            stopped,
            previousStatus: 'running',
            ...(error && { error }),
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Failed to stop via daemon: ${errorMsg}` }),
            },
          ],
          structuredContent: {
            agentId,
            stopped: false,
            previousStatus: 'unknown',
            error: `Failed to stop via daemon: ${errorMsg}`,
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
        lines: z.number().default(100).describe('Number of lines from the end (default 100)'),
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
      const { agentId, lines = 100 } = args as { agentId: string; lines?: number };

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
      let error: string | undefined;

      try {
        // Call daemon API to get container logs
        const isDocker = process.env.DOCKER_ENV === 'true' || process.env.HOSTNAME?.includes('rapid');
        const daemonUrl = process.env.DAEMON_URL || (isDocker ? 'http://rapid-daemon:3200' : 'http://localhost:3200');

        const response = await fetch(`${daemonUrl}/rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'agent.logs',
            params: { sessionId: agent.id, tail: lines },
            id: Date.now(),
          }),
        });

        const result = await response.json() as { result?: { logs?: string; error?: string }; error?: { message: string } };

        if (result.error) {
          error = result.error.message;
          output = '(failed to get logs)';
        } else if (result.result?.error) {
          error = result.result.error;
          output = '(failed to get logs)';
        } else {
          output = result.result?.logs || '(no output yet)';
        }
      } catch (err) {
        // Fall back to reading from file if daemon call fails
        try {
          if (agent.outputFile) {
            const content = await readFile(agent.outputFile, 'utf-8');
            const allLines = content.split('\n');
            output = allLines.slice(-lines).join('\n');
          } else {
            output = '(no output available)';
            error = err instanceof Error ? err.message : String(err);
          }
        } catch {
          output = '(no output yet)';
          error = err instanceof Error ? err.message : String(err);
        }
      }

      const result = {
        agentId,
        personaName: agent.personaName,
        status: agent.status,
        output,
        ...(error && { error }),
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  // Tool: Delegate work to available agents
  server.registerTool(
    'work_delegate',
    {
      title: 'Delegate Work',
      description:
        'Find available worker agents and assign tasks to them. ' +
        'Creates a task and optionally assigns it to an idle agent with matching capabilities. ' +
        'Use this for orchestrating work across the agent swarm.',
      inputSchema: {
        taskDescription: z.string().describe('Description of the work to delegate'),
        taskTitle: z.string().optional().describe('Short title for the task'),
        requiredCapabilities: z
          .array(z.string())
          .optional()
          .describe('Required agent capabilities (e.g., ["code", "test"])'),
        priority: z
          .enum(['low', 'normal', 'high', 'urgent'])
          .default('normal')
          .describe('Task priority'),
        autoAssign: z
          .boolean()
          .default(true)
          .describe('Automatically assign to first available worker'),
      },
      outputSchema: {
        taskId: z.string(),
        taskTitle: z.string(),
        assignedTo: z.string().nullable(),
        assignedAgentName: z.string().nullable(),
        availableAgents: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            capabilities: z.array(z.string()).optional(),
          })
        ),
        message: z.string(),
      },
    },
    async (args) => {
      const {
        taskDescription,
        taskTitle,
        requiredCapabilities = [],
        priority = 'normal',
        autoAssign = true,
      } = args as {
        taskDescription: string;
        taskTitle?: string;
        requiredCapabilities?: string[];
        priority?: string;
        autoAssign?: boolean;
      };

      const isDocker = process.env.DOCKER_ENV === 'true' || process.env.HOSTNAME?.includes('rapid');
      const mcpUrl = process.env.MCP_URL || (isDocker ? 'http://rapid-mcp:3100/mcp' : 'http://localhost:3100/mcp');

      try {
        // 1. Get available agents with matching capabilities
        const agentsResponse = await fetch(mcpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
              name: 'bus_agents',
              arguments: { maxAgeSeconds: 60 },
            },
          }),
        });

        const agentsResult = await agentsResponse.json() as {
          result?: { structuredContent?: { agents?: Array<{ id: string; name: string; status?: string; capabilities?: string[] }> } };
        };

        const allAgents = agentsResult.result?.structuredContent?.agents || [];

        // Filter for idle workers that match required capabilities
        const availableAgents = allAgents.filter((agent) => {
          // Check if agent is a worker (not orchestrator)
          const isWorker = agent.name.toLowerCase().includes('worker') ||
                          !agent.name.toLowerCase().includes('orchestrator');
          if (!isWorker) return false;

          // Check capabilities if specified
          if (requiredCapabilities.length > 0) {
            const agentCaps = agent.capabilities || ['code', 'test', 'review']; // Default capabilities
            return requiredCapabilities.every((cap) => agentCaps.includes(cap));
          }

          return true;
        });

        // 2. Create task
        const title = taskTitle || taskDescription.slice(0, 50) + (taskDescription.length > 50 ? '...' : '');

        const taskResponse = await fetch(mcpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
              name: 'task_create',
              arguments: {
                title,
                description: taskDescription,
                priority,
                createdBy: 'orchestrator',
                requiredCapabilities,
              },
            },
          }),
        });

        const taskResult = await taskResponse.json() as {
          result?: { structuredContent?: { id?: string; taskId?: string } };
        };

        const taskId = taskResult.result?.structuredContent?.id ||
                       taskResult.result?.structuredContent?.taskId ||
                       `task-${Date.now()}`;

        // 3. If autoAssign and we have available agents, assign to first one
        let assignedTo: string | null = null;
        let assignedAgentName: string | null = null;

        const targetAgent = autoAssign ? availableAgents[0] : undefined;
        if (targetAgent) {
          assignedTo = targetAgent.id;
          assignedAgentName = targetAgent.name;

          await fetch(mcpUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'tools/call',
              params: {
                name: 'task_assign',
                arguments: {
                  id: taskId,
                  agentId: targetAgent.id,
                },
              },
            }),
          });

          if (context.verbose) {
            console.error(`[work_delegate] Assigned task ${taskId} to ${targetAgent.name}`);
          }
        }

        const output = {
          taskId,
          taskTitle: title,
          assignedTo,
          assignedAgentName,
          availableAgents: availableAgents.map((a) => ({
            id: a.id,
            name: a.name,
            capabilities: a.capabilities,
          })),
          message: assignedTo
            ? `Task created and assigned to ${assignedAgentName}`
            : availableAgents.length > 0
              ? `Task created. ${availableAgents.length} agents available for manual assignment.`
              : 'Task created but no available workers found. Task will be claimed when workers come online.',
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (context.verbose) {
          console.error(`[work_delegate] Failed: ${errorMsg}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Failed to delegate work: ${errorMsg}` }),
            },
          ],
          structuredContent: {
            taskId: '',
            taskTitle: '',
            assignedTo: null,
            assignedAgentName: null,
            availableAgents: [],
            message: `Failed to delegate work: ${errorMsg}`,
          },
        };
      }
    }
  );
}
