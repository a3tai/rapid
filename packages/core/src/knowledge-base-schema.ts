/**
 * Knowledge Base Schema
 *
 * Comprehensive schema for storing facts, decisions, and discoveries with:
 * - Temporal metadata for fact decay and version tracking
 * - Confidence scoring and source attribution
 * - Decision reasoning and context linkage
 * - Discovery pattern tracking
 * - Categorization taxonomy
 * - Full version history
 */

import { randomUUID } from 'node:crypto';

/**
 * Categorization taxonomy for knowledge items
 */
export enum KnowledgeCategory {
  ARCHITECTURE = 'architecture', // System design and structure
  PATTERN = 'pattern', // Coding and design patterns
  BUG = 'bug', // Discovered bugs and issues
  CONVENTION = 'convention', // Code conventions and standards
  OPTIMIZATION = 'optimization', // Performance optimizations
  SECURITY = 'security', // Security-related findings
  DEPENDENCY = 'dependency', // External dependency info
  WORKFLOW = 'workflow', // Development workflow patterns
  DECISION = 'decision', // Decision records
  DISCOVERY = 'discovery', // Pattern discoveries
}

/**
 * Source of knowledge (who/what discovered it)
 */
export interface KnowledgeSource {
  type: 'agent' | 'user' | 'system' | 'analysis';
  identifier: string; // agent ID, user email, system name, etc.
  timestamp: string; // ISO 8601 timestamp
  context?: string; // Additional context about the source
}

/**
 * A single fact in the knowledge base
 */
export interface Fact {
  id: string;
  category: KnowledgeCategory;
  title: string;
  description: string;
  details: unknown; // Flexible schema for fact-specific data
  confidence: number; // 0-1 confidence score
  source: KnowledgeSource;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string; // Optional expiration for time-sensitive facts
  decayRate?: number; // Decay rate per day (0.1 = 10% per day)
  tags: string[];
  relatedIds: string[]; // References to related facts
  evidenceLinks: string[]; // URLs or references to evidence
}

/**
 * A decision record linking to reasoning and context
 */
export interface DecisionRecord {
  id: string;
  title: string;
  description: string;
  context: string; // What prompted this decision
  options: {
    option: string;
    pros: string[];
    cons: string[];
  }[];
  chosenOption: string; // Which option was chosen
  reasoning: string; // Why this option was chosen
  source: KnowledgeSource;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  relatedFactIds: string[];
  status: 'active' | 'superseded' | 'reconsidered';
  parentDecisionId?: string; // For nested decisions
}

/**
 * A discovery record for patterns found during development
 */
export interface DiscoveryRecord {
  id: string;
  title: string;
  description: string;
  pattern: string; // Description of the pattern discovered
  frequency: number; // How often this pattern occurs
  impact: 'high' | 'medium' | 'low'; // Impact on development
  source: KnowledgeSource;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  examples: string[]; // Code snippets or specific examples
  recommendations: string[]; // Suggested actions based on discovery
  evidenceLinks: string[];
}

/**
 * Version history entry tracking changes to facts
 */
export interface VersionHistoryEntry {
  versionId: string;
  factId: string;
  previousState: Fact | null; // null for initial creation
  newState: Fact;
  changeType: 'created' | 'updated' | 'confidence_adjusted' | 'expired';
  changeReason: string;
  changedBy: KnowledgeSource;
  changedAt: string;
}

/**
 * Categorization taxonomy configuration
 */
export interface TaxonomyConfig {
  categories: Map<KnowledgeCategory, {
    label: string;
    description: string;
    icon?: string;
    color?: string;
  }>;
  tags: Set<string>;
  relationships: Map<KnowledgeCategory, KnowledgeCategory[]>; // Which categories relate to each other
}

/**
 * Fact decay calculation utilities
 */
export class FactDecayCalculator {
  /**
   * Calculate current confidence considering decay
   */
  static calculateCurrentConfidence(fact: Fact): number {
    if (!fact.decayRate || !fact.createdAt) {
      return fact.confidence;
    }

    const now = new Date();
    const created = new Date(fact.createdAt);
    const daysSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

    // Exponential decay: confidence = initial_confidence * (1 - decay_rate)^days
    const decayFactor = Math.pow(1 - fact.decayRate, daysSinceCreation);
    return fact.confidence * decayFactor;
  }

  /**
   * Check if fact should be considered expired
   */
  static isExpired(fact: Fact): boolean {
    if (fact.expiresAt) {
      return new Date(fact.expiresAt) < new Date();
    }

    // Auto-expire if confidence drops below threshold
    const currentConfidence = this.calculateCurrentConfidence(fact);
    return currentConfidence < 0.1; // Auto-expire below 10% confidence
  }

  /**
   * Calculate days until fact expires (or null if never expires)
   */
  static daysUntilExpiration(fact: Fact): number | null {
    if (fact.expiresAt) {
      const now = new Date();
      const expiry = new Date(fact.expiresAt);
      const daysLeft = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return Math.max(0, daysLeft);
    }

    if (!fact.decayRate) {
      return null; // Never expires
    }

    // Calculate days until confidence drops below 10%
    // confidence * (1 - decay)^days = 0.1
    // days = log(0.1 / confidence) / log(1 - decay)
    const daysToThreshold = Math.log(0.1 / fact.confidence) / Math.log(1 - fact.decayRate);
    return Math.max(0, daysToThreshold);
  }
}

/**
 * Knowledge base schema validator
 */
export class KnowledgeBaseValidator {
  /**
   * Validate a fact
   */
  static validateFact(fact: unknown): fact is Fact {
    if (typeof fact !== 'object' || fact === null) {
      return false;
    }

    const f = fact as Record<string, unknown>;
    return (
      typeof f.id === 'string' &&
      f.id.length > 0 &&
      typeof f.category === 'string' &&
      Object.values(KnowledgeCategory).includes(f.category as KnowledgeCategory) &&
      typeof f.title === 'string' &&
      f.title.length > 0 &&
      typeof f.description === 'string' &&
      typeof f.confidence === 'number' &&
      f.confidence >= 0 &&
      f.confidence <= 1 &&
      typeof f.source === 'object' &&
      f.source !== null &&
      Array.isArray(f.tags) &&
      Array.isArray(f.relatedIds)
    );
  }

  /**
   * Validate a decision record
   */
  static validateDecisionRecord(record: unknown): record is DecisionRecord {
    if (typeof record !== 'object' || record === null) {
      return false;
    }

    const r = record as Record<string, unknown>;
    return (
      typeof r.id === 'string' &&
      r.id.length > 0 &&
      typeof r.title === 'string' &&
      r.title.length > 0 &&
      typeof r.description === 'string' &&
      typeof r.chosenOption === 'string' &&
      Array.isArray(r.options) &&
      r.options.length > 0 &&
      typeof r.source === 'object'
    );
  }

  /**
   * Validate a discovery record
   */
  static validateDiscoveryRecord(record: unknown): record is DiscoveryRecord {
    if (typeof record !== 'object' || record === null) {
      return false;
    }

    const r = record as Record<string, unknown>;
    return (
      typeof r.id === 'string' &&
      r.id.length > 0 &&
      typeof r.title === 'string' &&
      r.title.length > 0 &&
      typeof r.pattern === 'string' &&
      typeof r.frequency === 'number' &&
      ['high', 'medium', 'low'].includes(r.impact as string) &&
      typeof r.source === 'object' &&
      Array.isArray(r.examples)
    );
  }
}

/**
 * Factory functions for creating schema objects
 */
export class KnowledgeBaseFactory {
  /**
   * Create a new fact
   */
  static createFact(
    title: string,
    description: string,
    category: KnowledgeCategory,
    source: KnowledgeSource,
    options?: {
      confidence?: number;
      decayRate?: number;
      expiresAt?: string;
      tags?: string[];
      relatedIds?: string[];
      evidenceLinks?: string[];
      details?: unknown;
    }
  ): Fact {
    const fact: Fact = {
      id: randomUUID(),
      category,
      title,
      description,
      details: options?.details ?? {},
      confidence: options?.confidence ?? 0.8,
      source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: options?.tags ?? [],
      relatedIds: options?.relatedIds ?? [],
      evidenceLinks: options?.evidenceLinks ?? [],
    };

    if (options?.expiresAt !== undefined) {
      fact.expiresAt = options.expiresAt;
    }

    if (options?.decayRate !== undefined) {
      fact.decayRate = options.decayRate;
    }

    return fact;
  }

  /**
   * Create a new decision record
   */
  static createDecisionRecord(
    title: string,
    description: string,
    context: string,
    options: { option: string; pros: string[]; cons: string[] }[],
    chosenOption: string,
    reasoning: string,
    source: KnowledgeSource,
    optionalFields?: {
      tags?: string[];
      relatedFactIds?: string[];
      parentDecisionId?: string;
    }
  ): DecisionRecord {
    const record: DecisionRecord = {
      id: randomUUID(),
      title,
      description,
      context,
      options,
      chosenOption,
      reasoning,
      source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: optionalFields?.tags ?? [],
      relatedFactIds: optionalFields?.relatedFactIds ?? [],
      status: 'active',
    };

    if (optionalFields?.parentDecisionId !== undefined) {
      record.parentDecisionId = optionalFields.parentDecisionId;
    }

    return record;
  }

  /**
   * Create a new discovery record
   */
  static createDiscoveryRecord(
    title: string,
    description: string,
    pattern: string,
    frequency: number,
    impact: 'high' | 'medium' | 'low',
    source: KnowledgeSource,
    optionalFields?: {
      tags?: string[];
      examples?: string[];
      recommendations?: string[];
      evidenceLinks?: string[];
    }
  ): DiscoveryRecord {
    return {
      id: randomUUID(),
      title,
      description,
      pattern,
      frequency,
      impact,
      source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: optionalFields?.tags ?? [],
      examples: optionalFields?.examples ?? [],
      recommendations: optionalFields?.recommendations ?? [],
      evidenceLinks: optionalFields?.evidenceLinks ?? [],
    };
  }

  /**
   * Create a version history entry
   */
  static createVersionHistoryEntry(
    factId: string,
    previousState: Fact | null,
    newState: Fact,
    changeType: 'created' | 'updated' | 'confidence_adjusted' | 'expired',
    changeReason: string,
    changedBy: KnowledgeSource
  ): VersionHistoryEntry {
    return {
      versionId: randomUUID(),
      factId,
      previousState,
      newState,
      changeType,
      changeReason,
      changedBy,
      changedAt: new Date().toISOString(),
    };
  }
}

/**
 * Default taxonomy configuration
 */
export const DEFAULT_TAXONOMY: TaxonomyConfig = {
  categories: new Map([
    [
      KnowledgeCategory.ARCHITECTURE,
      {
        label: 'Architecture',
        description: 'System design and structural patterns',
        icon: '🏗️',
        color: '#007AFF',
      },
    ],
    [
      KnowledgeCategory.PATTERN,
      {
        label: 'Pattern',
        description: 'Coding and design patterns',
        icon: '🎨',
        color: '#5AC8FA',
      },
    ],
    [
      KnowledgeCategory.BUG,
      {
        label: 'Bug',
        description: 'Discovered bugs and issues',
        icon: '🐛',
        color: '#FF2D55',
      },
    ],
    [
      KnowledgeCategory.CONVENTION,
      {
        label: 'Convention',
        description: 'Code conventions and standards',
        icon: '📋',
        color: '#34C759',
      },
    ],
    [
      KnowledgeCategory.OPTIMIZATION,
      {
        label: 'Optimization',
        description: 'Performance optimizations',
        icon: '⚡',
        color: '#FFD60A',
      },
    ],
    [
      KnowledgeCategory.SECURITY,
      {
        label: 'Security',
        description: 'Security-related findings',
        icon: '🔒',
        color: '#FF3B30',
      },
    ],
  ]),
  tags: new Set(['verified', 'experimental', 'deprecated', 'critical', 'performance', 'testing']),
  relationships: new Map([
    [KnowledgeCategory.ARCHITECTURE, [KnowledgeCategory.PATTERN, KnowledgeCategory.DECISION]],
    [KnowledgeCategory.PATTERN, [KnowledgeCategory.ARCHITECTURE, KnowledgeCategory.DISCOVERY]],
    [KnowledgeCategory.BUG, [KnowledgeCategory.SECURITY, KnowledgeCategory.OPTIMIZATION]],
  ]),
};
