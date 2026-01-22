/**
 * Tests for Capability Matching System
 */

import { describe, it, expect } from 'vitest';
import {
  CAPABILITY_REGISTRY,
  scoreCapabilityMatch,
  findBestMatchingAgents,
  getPersonasWithCapability,
  getCapabilitiesForPersona,
  inferCapabilitiesFromTask,
  validateAgentCapabilities,
  type AgentCapabilityProfile,
} from '../capability-matching.js';

describe('Capability Matching System', () => {
  // Sample agent profiles for testing
  const workerProfile: AgentCapabilityProfile = {
    agentId: 'worker-1',
    persona: 'worker',
    capabilities: ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'typescript'],
    performanceByCapability: {
      typescript: {
        tasksCompleted: 5,
        tasksFailed: 1,
        avgCompletionTimeMs: 45000,
        successRate: 0.833,
        lastUsedAt: new Date().toISOString(),
        skillLevel: 'intermediate',
      },
      bash: {
        tasksCompleted: 8,
        tasksFailed: 0,
        avgCompletionTimeMs: 30000,
        successRate: 1.0,
        lastUsedAt: new Date().toISOString(),
        skillLevel: 'expert',
      },
      read: {
        tasksCompleted: 15,
        tasksFailed: 0,
        avgCompletionTimeMs: 10000,
        successRate: 1.0,
        lastUsedAt: new Date().toISOString(),
        skillLevel: 'expert',
      },
    },
    overallStats: {
      totalTasksCompleted: 20,
      avgCompletionTimeMs: 30000,
      successRate: 0.95,
      lastUpdated: new Date().toISOString(),
    },
  };

  const implementerProfile: AgentCapabilityProfile = {
    agentId: 'implementer-1',
    persona: 'implementer',
    capabilities: ['read', 'write', 'edit', 'bash', 'typescript', 'testing', 'debugging'],
    performanceByCapability: {
      testing: {
        tasksCompleted: 12,
        tasksFailed: 1,
        avgCompletionTimeMs: 50000,
        successRate: 0.92,
        lastUsedAt: new Date().toISOString(),
        skillLevel: 'advanced',
      },
      typescript: {
        tasksCompleted: 20,
        tasksFailed: 2,
        avgCompletionTimeMs: 55000,
        successRate: 0.91,
        lastUsedAt: new Date().toISOString(),
        skillLevel: 'expert',
      },
    },
    overallStats: {
      totalTasksCompleted: 50,
      avgCompletionTimeMs: 48000,
      successRate: 0.92,
      lastUpdated: new Date().toISOString(),
    },
  };

  const researcherProfile: AgentCapabilityProfile = {
    agentId: 'researcher-1',
    persona: 'researcher',
    capabilities: ['read', 'grep', 'glob', 'web_search', 'web_fetch', 'research'],
    performanceByCapability: {},
    overallStats: {
      totalTasksCompleted: 5,
      avgCompletionTimeMs: 120000,
      successRate: 0.8,
      lastUpdated: new Date().toISOString(),
    },
  };

  describe('Capability Registry', () => {
    it('should have capability definitions registered', () => {
      expect(Object.keys(CAPABILITY_REGISTRY).length).toBeGreaterThan(0);
    });

    it('should have typescript capability', () => {
      const ts = CAPABILITY_REGISTRY.typescript;
      expect(ts).toBeDefined();
      expect(ts.category).toBe('language');
      expect(ts.defaultPersonas).toContain('worker');
    });

    it('should categorize capabilities correctly', () => {
      const toolCaps = Object.values(CAPABILITY_REGISTRY).filter((c) => c.category === 'tool');
      const langCaps = Object.values(CAPABILITY_REGISTRY).filter((c) => c.category === 'language');
      expect(toolCaps.length).toBeGreaterThan(0);
      expect(langCaps.length).toBeGreaterThan(0);
    });
  });

  describe('Capability Scoring', () => {
    it('should score perfect match as excellent', () => {
      const result = scoreCapabilityMatch(implementerProfile, ['testing', 'typescript']);
      expect(result.recommendation).toBe('excellent');
      expect(result.overallScore).toBeGreaterThan(70);
      expect(result.requiredVsAvailable.hasAll).toBe(true);
    });

    it('should identify missing capabilities', () => {
      // workerProfile has: ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'typescript']
      // Testing that capabilities that aren't in the profile are identified as missing
      const result = scoreCapabilityMatch(
        workerProfile,
        ['typescript', 'testing'],
        [],
      );
      expect(result.requiredVsAvailable.hasAll).toBe(false);
      expect(result.requiredVsAvailable.missing).toContain('testing');
      expect(result.requiredVsAvailable.missing.length).toBe(1);
      expect(result.recommendation).toBe('ineligible');
    });

    it('should boost score for preferred capabilities', () => {
      const resultWithoutPreferred = scoreCapabilityMatch(
        implementerProfile,
        ['typescript'],
        [],
      );
      const resultWithPreferred = scoreCapabilityMatch(
        implementerProfile,
        ['typescript'],
        ['testing', 'debugging'],
      );
      expect(resultWithPreferred.overallScore).toBeGreaterThan(resultWithoutPreferred.overallScore);
    });

    it('should reward performance history', () => {
      const expertProfile = { ...implementerProfile };
      expertProfile.overallStats.totalTasksCompleted = 100;
      expertProfile.overallStats.successRate = 0.99;

      const result = scoreCapabilityMatch(expertProfile, ['typescript', 'testing']);
      expect(result.scoreBreakdown.experienceBonus).toBeGreaterThan(5);
      expect(result.scoreBreakdown.performanceBonus).toBeGreaterThan(15);
    });

    it('should calculate score breakdown correctly', () => {
      const result = scoreCapabilityMatch(
        implementerProfile,
        ['typescript', 'testing'],
        ['debugging'],
      );
      const total =
        result.scoreBreakdown.requiredMatch +
        result.scoreBreakdown.preferredMatch +
        result.scoreBreakdown.performanceBonus +
        result.scoreBreakdown.experienceBonus;
      expect(result.overallScore).toBeCloseTo(total, 0);
    });
  });

  describe('Finding Best Matching Agents', () => {
    it('should return eligible agents sorted by score', () => {
      const agents = [workerProfile, implementerProfile, researcherProfile];
      const results = findBestMatchingAgents(agents, ['typescript', 'testing']);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].overallScore).toBeGreaterThanOrEqual(results[1]?.overallScore || 0);
    });

    it('should exclude ineligible agents', () => {
      const agents = [workerProfile, implementerProfile, researcherProfile];
      const results = findBestMatchingAgents(agents, ['react', 'typescript']);
      expect(results.length).toBeLessThan(agents.length);
      results.forEach((r) => {
        expect(r.recommendation).not.toBe('ineligible');
      });
    });

    it('should respect topN parameter', () => {
      const agents = [workerProfile, implementerProfile, researcherProfile];
      const results = findBestMatchingAgents(agents, ['bash', 'read'], undefined, 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should rank implementer highest for code tasks', () => {
      const agents = [workerProfile, implementerProfile];
      const results = findBestMatchingAgents(agents, ['typescript', 'testing', 'debugging']);
      expect(results[0].agentId).toBe(implementerProfile.agentId);
    });
  });

  describe('Persona Capabilities', () => {
    it('should retrieve capabilities for persona', () => {
      const caps = getCapabilitiesForPersona('worker');
      expect(caps.length).toBeGreaterThan(0);
      expect(caps).toContain('read');
      expect(caps).toContain('bash');
    });

    it('should return empty for unknown persona', () => {
      const caps = getCapabilitiesForPersona('unknown-persona-xyz');
      expect(caps.length).toBe(0);
    });

    it('should return personas with capability', () => {
      const personas = getPersonasWithCapability('bash');
      expect(personas.length).toBeGreaterThan(0);
      expect(personas).toContain('worker');
    });
  });

  describe('Task Capability Inference', () => {
    it('should infer typescript from task description', () => {
      const result = inferCapabilitiesFromTask(
        'Implement a new feature in TypeScript with unit tests',
      );
      expect(result.required).toContain('typescript');
    });

    it('should infer testing capability', () => {
      const result = inferCapabilitiesFromTask('Write comprehensive unit tests for the API');
      expect(result.required).toContain('testing');
    });

    it('should infer react from description', () => {
      const result = inferCapabilitiesFromTask('Build a React component for the dashboard');
      expect(result.required).toContain('react');
    });

    it('should handle task tags', () => {
      const result = inferCapabilitiesFromTask('Fix the build', [
        'security',
        'vulnerability',
      ]);
      expect(result.required).toContain('security');
    });

    it('should always include basic tools', () => {
      const result = inferCapabilitiesFromTask('Do something');
      expect(result.required).toContain('read');
      expect(result.required).toContain('bash');
    });

    it('should differentiate required vs preferred', () => {
      const result = inferCapabilitiesFromTask(
        'Debug the TypeScript compilation error in the build',
      );
      expect(result.required.length).toBeGreaterThan(0);
      expect(result.preferred.length).toBeGreaterThan(0);
    });
  });

  describe('Agent Capability Validation', () => {
    it('should validate when agent has all required capabilities', () => {
      const validation = validateAgentCapabilities(implementerProfile, [
        'typescript',
        'testing',
      ]);
      expect(validation.valid).toBe(true);
      expect(validation.missing.length).toBe(0);
    });

    it('should find missing capabilities', () => {
      const validation = validateAgentCapabilities(workerProfile, [
        'typescript',
        'react',
        'testing',
      ]);
      expect(validation.valid).toBe(false);
      expect(validation.missing).toContain('react');
      expect(validation.missing).toContain('testing');
    });

    it('should handle empty requirements', () => {
      const validation = validateAgentCapabilities(workerProfile, []);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should select best agent for frontend task', () => {
      const agents = [workerProfile, implementerProfile, researcherProfile];
      // For a task that requires typescript and testing, implementer is the best match
      const results = findBestMatchingAgents(
        agents,
        ['typescript', 'testing'],
        ['react'],
        1,
      );
      expect(results.length).toBeGreaterThan(0);
      // Implementer should be selected as they have most capabilities
      expect(results[0].agentId).toBe(implementerProfile.agentId);
    });

    it('should select researcher for research task', () => {
      const agents = [workerProfile, implementerProfile, researcherProfile];
      // For a task requiring research and web_search, researcher is the best match
      const results = findBestMatchingAgents(
        agents,
        ['research', 'web_search'],
        [],
        1,
      );
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].agentId).toBe(researcherProfile.agentId);
    });

    it('should handle specialist requirements', () => {
      const agents = [workerProfile, implementerProfile];
      const results = findBestMatchingAgents(agents, [
        'read',
        'write',
        'bash',
        'testing',
        'debugging',
      ]);
      expect(results[0].agentId).toBe(implementerProfile.agentId);
    });
  });

  describe('Edge Cases', () => {
    it('should handle agent with no performance data', () => {
      const newAgent: AgentCapabilityProfile = {
        agentId: 'new-agent',
        persona: 'worker',
        capabilities: ['read', 'bash'],
        performanceByCapability: {},
        overallStats: {
          totalTasksCompleted: 0,
          avgCompletionTimeMs: 0,
          successRate: 0,
          lastUpdated: new Date().toISOString(),
        },
      };
      const result = scoreCapabilityMatch(newAgent, ['read', 'bash']);
      expect(result.recommendation).not.toBe('ineligible');
      expect(result.overallScore).toBeGreaterThan(0);
    });

    it('should handle agent with duplicate capabilities', () => {
      const result = scoreCapabilityMatch(
        workerProfile,
        ['typescript', 'typescript', 'bash'],
      );
      expect(result.requiredVsAvailable.hasAll).toBe(true);
    });

    it('should handle very high experience counts', () => {
      const veteranAgent = { ...implementerProfile };
      veteranAgent.overallStats.totalTasksCompleted = 1000;
      const result = scoreCapabilityMatch(veteranAgent, ['typescript']);
      expect(result.scoreBreakdown.experienceBonus).toBeLessThanOrEqual(10);
    });
  });

  describe('Integration Scenarios', () => {
    it('should support capability-based task matching workflow', () => {
      // 1. Use explicit capabilities for the task
      const requiredCaps = ['typescript', 'testing', 'bash', 'read'];
      const preferredCaps = ['security', 'debugging'];

      // 2. Validate agent can handle it
      const validation = validateAgentCapabilities(implementerProfile, requiredCaps);
      expect(validation.valid).toBe(true);

      // 3. Score the match
      const score = scoreCapabilityMatch(implementerProfile, requiredCaps, preferredCaps);
      expect(score.recommendation).toBe('excellent');
    });

    it('should support multi-agent coordination', () => {
      const agents = [workerProfile, implementerProfile, researcherProfile];

      // Research phase - needs research and web_search capabilities
      const researchMatches = findBestMatchingAgents(
        agents,
        ['research', 'web_search'],
        ['read'],
        1,
      );
      expect(researchMatches[0].agentId).toBe(researcherProfile.agentId);

      // Implementation phase - needs typescript and testing
      const implMatches = findBestMatchingAgents(
        agents,
        ['typescript', 'testing'],
        ['debugging'],
        1,
      );
      expect(implMatches[0].agentId).toBe(implementerProfile.agentId);
    });
  });
});
