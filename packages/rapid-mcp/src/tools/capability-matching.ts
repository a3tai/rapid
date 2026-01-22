/**
 * Capability Matching System for RAPID
 *
 * This module provides capability-based agent matching and performance tracking.
 * It maintains a taxonomy of agent capabilities and scores task-to-agent fit.
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('capability-matching');

// ============================================================================
// Capability Taxonomy
// ============================================================================

/**
 * Core capability categories for agent skill classification
 */
export type CapabilityCategory = 'tool' | 'language' | 'domain' | 'process';

/**
 * Base definition for all capabilities in the system
 */
export interface CapabilityDef {
  /** Unique identifier for the capability */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category of capability */
  category: CapabilityCategory;
  /** Description of what this capability enables */
  description: string;
  /** Personas that have this capability by default */
  defaultPersonas?: string[];
  /** Related capabilities (prerequisites or related skills) */
  relatedCapabilities?: string[];
}

/**
 * Comprehensive capability taxonomy for RAPID
 */
export const CAPABILITY_REGISTRY: Record<string, CapabilityDef> = {
  // Tool capabilities
  read: {
    id: 'read',
    name: 'File Reading',
    category: 'tool',
    description: 'Read files from the filesystem',
    defaultPersonas: ['worker', 'implementer', 'architect', 'researcher', 'code-reviewer', 'debugger'],
    relatedCapabilities: ['write', 'edit', 'glob', 'grep'],
  },
  write: {
    id: 'write',
    name: 'File Writing',
    category: 'tool',
    description: 'Create and write new files',
    defaultPersonas: ['worker', 'implementer', 'debugger', 'test-writer'],
    relatedCapabilities: ['read', 'edit'],
  },
  edit: {
    id: 'edit',
    name: 'File Editing',
    category: 'tool',
    description: 'Edit existing files with precise modifications',
    defaultPersonas: ['worker', 'implementer', 'debugger', 'code-reviewer'],
    relatedCapabilities: ['read', 'write', 'grep'],
  },
  bash: {
    id: 'bash',
    name: 'Shell Execution',
    category: 'tool',
    description: 'Execute bash commands and shell scripts',
    defaultPersonas: ['worker', 'implementer', 'debugger', 'devops-engineer'],
    relatedCapabilities: ['read', 'write'],
  },
  grep: {
    id: 'grep',
    name: 'Code Search',
    category: 'tool',
    description: 'Search code with regex patterns',
    defaultPersonas: ['worker', 'implementer', 'researcher', 'code-reviewer'],
    relatedCapabilities: ['read', 'glob'],
  },
  glob: {
    id: 'glob',
    name: 'File Pattern Matching',
    category: 'tool',
    description: 'Find files matching glob patterns',
    defaultPersonas: ['worker', 'implementer', 'researcher'],
    relatedCapabilities: ['read', 'grep'],
  },
  bus_send: {
    id: 'bus_send',
    name: 'Event Bus Publishing',
    category: 'tool',
    description: 'Send messages via the event bus for inter-agent coordination',
    defaultPersonas: ['worker', 'implementer', 'orchestrator', 'architect'],
    relatedCapabilities: ['bus_messages', 'bus_wait'],
  },
  bus_messages: {
    id: 'bus_messages',
    name: 'Event Bus Polling',
    category: 'tool',
    description: 'Poll for messages from the event bus',
    defaultPersonas: ['worker', 'implementer', 'orchestrator', 'architect', 'code-reviewer'],
    relatedCapabilities: ['bus_send', 'bus_wait'],
  },
  bus_wait: {
    id: 'bus_wait',
    name: 'Event Bus Blocking',
    category: 'tool',
    description: 'Efficiently wait for messages from the event bus',
    defaultPersonas: ['orchestrator', 'architect', 'worker', 'implementer'],
    relatedCapabilities: ['bus_messages', 'bus_send'],
  },
  web_search: {
    id: 'web_search',
    name: 'Web Search',
    category: 'tool',
    description: 'Search the web for information',
    defaultPersonas: ['researcher', 'code-reviewer', 'architect'],
    relatedCapabilities: ['web_fetch'],
  },
  web_fetch: {
    id: 'web_fetch',
    name: 'Web Fetching',
    category: 'tool',
    description: 'Fetch and parse web pages',
    defaultPersonas: ['researcher', 'code-reviewer', 'architect'],
    relatedCapabilities: ['web_search'],
  },
  task_claim: {
    id: 'task_claim',
    name: 'Task Claiming',
    category: 'tool',
    description: 'Claim tasks from the task queue',
    defaultPersonas: ['worker', 'implementer'],
    relatedCapabilities: ['task_complete', 'task_progress'],
  },
  task_complete: {
    id: 'task_complete',
    name: 'Task Completion',
    category: 'tool',
    description: 'Mark tasks as complete with results',
    defaultPersonas: ['worker', 'implementer'],
    relatedCapabilities: ['task_claim', 'task_progress'],
  },

  // Language capabilities
  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    category: 'language',
    description: 'Write and modify TypeScript code',
    defaultPersonas: ['worker', 'implementer', 'debugger', 'test-writer', 'frontend-developer'],
    relatedCapabilities: ['javascript', 'testing', 'code-review'],
  },
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    category: 'language',
    description: 'Write and modify JavaScript code',
    defaultPersonas: ['worker', 'implementer', 'frontend-developer'],
    relatedCapabilities: ['typescript', 'react'],
  },
  python: {
    id: 'python',
    name: 'Python',
    category: 'language',
    description: 'Write and modify Python code',
    defaultPersonas: [],
    relatedCapabilities: ['testing'],
  },
  rust: {
    id: 'rust',
    name: 'Rust',
    category: 'language',
    description: 'Write and modify Rust code',
    defaultPersonas: [],
    relatedCapabilities: [],
  },
  sql: {
    id: 'sql',
    name: 'SQL',
    category: 'language',
    description: 'Write SQL queries and schemas',
    defaultPersonas: [],
    relatedCapabilities: ['database'],
  },

  // Domain capabilities
  react: {
    id: 'react',
    name: 'React',
    category: 'domain',
    description: 'Build React components and applications',
    defaultPersonas: ['frontend-developer'],
    relatedCapabilities: ['typescript', 'javascript', 'css'],
  },
  css: {
    id: 'css',
    name: 'CSS & Styling',
    category: 'domain',
    description: 'Write and modify CSS stylesheets',
    defaultPersonas: ['frontend-developer'],
    relatedCapabilities: ['react', 'javascript'],
  },
  testing: {
    id: 'testing',
    name: 'Test Writing',
    category: 'domain',
    description: 'Write unit, integration, and end-to-end tests',
    defaultPersonas: ['test-writer', 'worker', 'implementer'],
    relatedCapabilities: ['typescript', 'javascript', 'debugging'],
  },
  debugging: {
    id: 'debugging',
    name: 'Debugging',
    category: 'domain',
    description: 'Diagnose and fix bugs',
    defaultPersonas: ['debugger', 'code-reviewer'],
    relatedCapabilities: ['read', 'grep', 'bash'],
  },
  code_review: {
    id: 'code_review',
    name: 'Code Review',
    category: 'domain',
    description: 'Review code for quality, style, and correctness',
    defaultPersonas: ['code-reviewer', 'architect'],
    relatedCapabilities: ['read', 'grep', 'testing'],
  },
  security: {
    id: 'security',
    name: 'Security Analysis',
    category: 'domain',
    description: 'Identify security vulnerabilities',
    defaultPersonas: ['security-reviewer'],
    relatedCapabilities: ['read', 'grep', 'code_review'],
  },
  documentation: {
    id: 'documentation',
    name: 'Documentation',
    category: 'domain',
    description: 'Write and maintain documentation',
    defaultPersonas: ['documentation-writer'],
    relatedCapabilities: ['read', 'write'],
  },
  database: {
    id: 'database',
    name: 'Database',
    category: 'domain',
    description: 'Design and manage databases',
    defaultPersonas: [],
    relatedCapabilities: ['sql', 'devops'],
  },

  // Process capabilities
  architecture: {
    id: 'architecture',
    name: 'System Architecture',
    category: 'process',
    description: 'Design and plan system architecture',
    defaultPersonas: ['architect'],
    relatedCapabilities: ['code_review', 'planning'],
  },
  planning: {
    id: 'planning',
    name: 'Task Planning',
    category: 'process',
    description: 'Plan and decompose complex tasks',
    defaultPersonas: ['orchestrator', 'architect'],
    relatedCapabilities: ['architecture', 'code_review'],
  },
  devops: {
    id: 'devops',
    name: 'DevOps',
    category: 'process',
    description: 'Infrastructure, deployment, and operations',
    defaultPersonas: ['devops-engineer'],
    relatedCapabilities: ['bash', 'database'],
  },
  research: {
    id: 'research',
    name: 'Research',
    category: 'process',
    description: 'Research and investigation',
    defaultPersonas: ['researcher'],
    relatedCapabilities: ['web_search', 'web_fetch', 'read'],
  },
};

// ============================================================================
// Capability Matching & Scoring
// ============================================================================

/**
 * Agent capability profile with performance metrics
 */
export interface AgentCapabilityProfile {
  /** Agent ID or name */
  agentId: string;
  /** Persona type */
  persona: string;
  /** All capabilities the agent has */
  capabilities: string[];
  /** Performance data per capability */
  performanceByCapability: Record<string, CapabilityPerformance>;
  /** Overall performance stats */
  overallStats: {
    totalTasksCompleted: number;
    avgCompletionTimeMs: number;
    successRate: number;
    lastUpdated: string;
  };
}

/**
 * Performance metrics for a specific capability
 */
export interface CapabilityPerformance {
  /** Number of tasks completed using this capability */
  tasksCompleted: number;
  /** Number of tasks failed using this capability */
  tasksFailed: number;
  /** Average completion time in milliseconds */
  avgCompletionTimeMs: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Last time this capability was used */
  lastUsedAt: string;
  /** Skill level (beginner, intermediate, expert) */
  skillLevel: 'beginner' | 'intermediate' | 'expert';
}

/**
 * Capability match result for a task-agent pair
 */
export interface CapabilityMatchResult {
  /** Agent ID being evaluated */
  agentId: string;
  /** Overall match score (0-100) */
  overallScore: number;
  /** Required capabilities vs available */
  requiredVsAvailable: {
    required: string[];
    hasAll: boolean;
    missing: string[];
    extra: string[];
  };
  /** Detailed scoring breakdown */
  scoreBreakdown: {
    requiredMatch: number; // 0-50: Has all required capabilities
    preferredMatch: number; // 0-30: Has preferred capabilities
    performanceBonus: number; // 0-20: Historical success rate
    experienceBonus: number; // 0-10: Number of tasks completed
  };
  /** Recommendation */
  recommendation: 'excellent' | 'good' | 'fair' | 'poor' | 'ineligible';
}

/**
 * Compute capability match score between an agent and a task
 */
export function scoreCapabilityMatch(
  agentProfile: AgentCapabilityProfile,
  requiredCapabilities: string[],
  preferredCapabilities?: string[],
): CapabilityMatchResult {
  const missing: string[] = [];
  const hasAll = requiredCapabilities.every((cap) => {
    if (!agentProfile.capabilities.includes(cap)) {
      missing.push(cap);
      return false;
    }
    return true;
  });

  const extra = agentProfile.capabilities.filter((cap) => !requiredCapabilities.includes(cap));
  const preferredMatches = (preferredCapabilities || []).filter((cap) =>
    agentProfile.capabilities.includes(cap),
  );

  // Score components (out of specified max)
  let requiredMatchScore = 0;
  if (hasAll) {
    requiredMatchScore = 50; // Has all required
  } else {
    const covered = requiredCapabilities.length - missing.length;
    requiredMatchScore = (covered / requiredCapabilities.length) * 50;
  }

  let preferredMatchScore = 0;
  if (preferredCapabilities && preferredCapabilities.length > 0) {
    preferredMatchScore = (preferredMatches.length / preferredCapabilities.length) * 30;
  }

  // Performance bonus (0-20): based on success rate across capabilities used
  let performanceBonus = 0;
  const capabilitiesToEvaluate = requiredCapabilities.slice(0, 3); // Look at first 3
  if (capabilitiesToEvaluate.length > 0) {
    const avgSuccessRate =
      capabilitiesToEvaluate.reduce((sum, cap) => {
        const perf = agentProfile.performanceByCapability[cap];
        return sum + (perf ? perf.successRate : 0.5); // Default 50% if no history
      }, 0) / capabilitiesToEvaluate.length;
    performanceBonus = avgSuccessRate * 20;
  }

  // Experience bonus (0-10): number of tasks completed (scale: 0 tasks = 0, 100+ = 10)
  const experienceBonus = Math.min(10, agentProfile.overallStats.totalTasksCompleted / 10);

  const scoreBreakdown = {
    requiredMatch: requiredMatchScore,
    preferredMatch: preferredMatchScore,
    performanceBonus,
    experienceBonus,
  };

  const overallScore =
    scoreBreakdown.requiredMatch +
    scoreBreakdown.preferredMatch +
    scoreBreakdown.performanceBonus +
    scoreBreakdown.experienceBonus;

  // Determine recommendation
  let recommendation: 'excellent' | 'good' | 'fair' | 'poor' | 'ineligible';
  if (!hasAll) {
    recommendation = 'ineligible';
  } else if (overallScore >= 70) {
    recommendation = 'excellent';
  } else if (overallScore >= 60) {
    recommendation = 'good';
  } else if (overallScore >= 40) {
    recommendation = 'fair';
  } else {
    recommendation = 'poor';
  }

  return {
    agentId: agentProfile.agentId,
    overallScore,
    requiredVsAvailable: {
      required: requiredCapabilities,
      hasAll,
      missing,
      extra,
    },
    scoreBreakdown,
    recommendation,
  };
}

/**
 * Find best matching agents for a task
 */
export function findBestMatchingAgents(
  agents: AgentCapabilityProfile[],
  requiredCapabilities: string[],
  preferredCapabilities?: string[],
  topN: number = 5,
): CapabilityMatchResult[] {
  return agents
    .map((agent) => scoreCapabilityMatch(agent, requiredCapabilities, preferredCapabilities))
    .filter((result) => result.requiredVsAvailable.hasAll) // Only eligible agents
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, topN);
}

/**
 * Get personas with a specific capability
 */
export function getPersonasWithCapability(capabilityId: string): string[] {
  const def = CAPABILITY_REGISTRY[capabilityId];
  return def?.defaultPersonas || [];
}

/**
 * Get all capabilities required for a persona type
 */
export function getCapabilitiesForPersona(persona: string): string[] {
  const capabilities: string[] = [];
  Object.values(CAPABILITY_REGISTRY).forEach((def) => {
    if (def.defaultPersonas?.includes(persona)) {
      capabilities.push(def.id);
    }
  });
  return capabilities;
}

/**
 * Infer capabilities from task description
 */
export function inferCapabilitiesFromTask(
  taskDescription: string,
  taskTags?: string[],
): {
  required: string[];
  preferred: string[];
} {
  const description = (taskDescription + ' ' + (taskTags || []).join(' ')).toLowerCase();
  const required: Set<string> = new Set();
  const preferred: Set<string> = new Set();

  // Pattern matching for common keywords
  const patterns: Array<{
    keywords: string[];
    capability: string;
    strength: 'required' | 'preferred';
  }> = [
    {
      keywords: ['typescript', 'ts', 'tsconfig'],
      capability: 'typescript',
      strength: 'required',
    },
    {
      keywords: ['javascript', 'js'],
      capability: 'javascript',
      strength: 'required',
    },
    { keywords: ['react', 'component', 'jsx'], capability: 'react', strength: 'required' },
    { keywords: ['test', 'unit', 'jest'], capability: 'testing', strength: 'required' },
    { keywords: ['security', 'vulnerability'], capability: 'security', strength: 'required' },
    { keywords: ['debug', 'bug', 'fix'], capability: 'debugging', strength: 'preferred' },
    { keywords: ['review'], capability: 'code_review', strength: 'preferred' },
    { keywords: ['document', 'readme', 'docs'], capability: 'documentation', strength: 'preferred' },
    { keywords: ['research', 'investigation', 'explore'], capability: 'research', strength: 'required' },
    { keywords: ['design', 'architecture'], capability: 'architecture', strength: 'preferred' },
  ];

  patterns.forEach(({ keywords, capability, strength }) => {
    if (keywords.some((kw) => description.includes(kw))) {
      if (strength === 'required') {
        required.add(capability);
      } else {
        preferred.add(capability);
      }
    }
  });

  // Always require basic tool capabilities
  required.add('read');
  required.add('bash');

  return {
    required: Array.from(required),
    preferred: Array.from(preferred),
  };
}

/**
 * Validate that an agent has required capabilities
 */
export function validateAgentCapabilities(
  agent: AgentCapabilityProfile,
  requiredCapabilities: string[],
): {
  valid: boolean;
  missing: string[];
} {
  const missing = requiredCapabilities.filter((cap) => !agent.capabilities.includes(cap));
  return {
    valid: missing.length === 0,
    missing,
  };
}

logger.info('Capability matching module initialized', {
  capabilitiesRegistered: Object.keys(CAPABILITY_REGISTRY).length,
});
