import { describe, it, expect } from 'vitest';
import {
  KnowledgeCategory,
  FactDecayCalculator,
  KnowledgeBaseValidator,
  KnowledgeBaseFactory,
  DEFAULT_TAXONOMY,
  type Fact,
  type KnowledgeSource,
} from '../knowledge-base-schema.js';

describe('Knowledge Base Schema', () => {
  const testSource: KnowledgeSource = {
    type: 'agent',
    identifier: 'test-agent',
    timestamp: new Date().toISOString(),
  };

  describe('KnowledgeCategory', () => {
    it('should have all expected categories', () => {
      expect(KnowledgeCategory.ARCHITECTURE).toBe('architecture');
      expect(KnowledgeCategory.PATTERN).toBe('pattern');
      expect(KnowledgeCategory.BUG).toBe('bug');
      expect(KnowledgeCategory.CONVENTION).toBe('convention');
      expect(KnowledgeCategory.OPTIMIZATION).toBe('optimization');
      expect(KnowledgeCategory.SECURITY).toBe('security');
      expect(KnowledgeCategory.DEPENDENCY).toBe('dependency');
      expect(KnowledgeCategory.WORKFLOW).toBe('workflow');
      expect(KnowledgeCategory.DECISION).toBe('decision');
      expect(KnowledgeCategory.DISCOVERY).toBe('discovery');
    });
  });

  describe('FactDecayCalculator', () => {
    it('should calculate confidence with decay', () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      const fact: Fact = {
        id: 'test-1',
        category: KnowledgeCategory.ARCHITECTURE,
        title: 'Test Fact',
        description: 'A test fact',
        details: {},
        confidence: 1.0,
        source: testSource,
        createdAt: oneDayAgo,
        updatedAt: oneDayAgo,
        decayRate: 0.1, // 10% per day
        tags: [],
        relatedIds: [],
        evidenceLinks: [],
      };

      const currentConfidence = FactDecayCalculator.calculateCurrentConfidence(fact);
      expect(currentConfidence).toBeLessThan(1.0);
      expect(currentConfidence).toBeGreaterThan(0.8); // Should be ~0.9
    });

    it('should not decay facts without decay rate', () => {
      const fact: Fact = {
        id: 'test-2',
        category: KnowledgeCategory.PATTERN,
        title: 'No Decay Fact',
        description: 'This fact does not decay',
        details: {},
        confidence: 0.95,
        source: testSource,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
        relatedIds: [],
        evidenceLinks: [],
      };

      const currentConfidence = FactDecayCalculator.calculateCurrentConfidence(fact);
      expect(currentConfidence).toBe(0.95);
    });

    it('should identify expired facts', () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();

      const expiredFact: Fact = {
        id: 'test-3',
        category: KnowledgeCategory.BUG,
        title: 'Expired Fact',
        description: 'This is expired',
        details: {},
        confidence: 0.5,
        source: testSource,
        createdAt: pastDate,
        updatedAt: pastDate,
        expiresAt: new Date(Date.now() - 100).toISOString(),
        tags: [],
        relatedIds: [],
        evidenceLinks: [],
      };

      expect(FactDecayCalculator.isExpired(expiredFact)).toBe(true);
    });

    it('should calculate days until expiration', () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const fact: Fact = {
        id: 'test-4',
        category: KnowledgeCategory.SECURITY,
        title: 'Test',
        description: 'Test',
        details: {},
        confidence: 0.9,
        source: testSource,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: tomorrow,
        tags: [],
        relatedIds: [],
        evidenceLinks: [],
      };

      const daysLeft = FactDecayCalculator.daysUntilExpiration(fact);
      expect(daysLeft).toBeDefined();
      expect(daysLeft!).toBeGreaterThan(0);
      expect(daysLeft!).toBeLessThanOrEqual(1.1); // Slightly more than 1 day
    });
  });

  describe('KnowledgeBaseValidator', () => {
    it('should validate correct facts', () => {
      const validFact: Fact = {
        id: 'test-5',
        category: KnowledgeCategory.ARCHITECTURE,
        title: 'Valid Fact',
        description: 'This is valid',
        details: { key: 'value' },
        confidence: 0.8,
        source: testSource,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: ['verified'],
        relatedIds: [],
        evidenceLinks: [],
      };

      expect(KnowledgeBaseValidator.validateFact(validFact)).toBe(true);
    });

    it('should reject invalid facts', () => {
      expect(KnowledgeBaseValidator.validateFact(null)).toBe(false);
      expect(KnowledgeBaseValidator.validateFact(undefined)).toBe(false);
      expect(KnowledgeBaseValidator.validateFact({ id: '' })).toBe(false);
      expect(KnowledgeBaseValidator.validateFact({ id: 'test', confidence: 1.5 })).toBe(false);
    });

    it('should validate decision records', () => {
      const decisionRecord = KnowledgeBaseFactory.createDecisionRecord(
        'Test Decision',
        'Should we refactor?',
        'Code is becoming hard to maintain',
        [
          { option: 'Refactor now', pros: ['Easier maintenance'], cons: ['Time cost'] },
          { option: 'Wait', pros: ['Save time'], cons: ['Technical debt'] },
        ],
        'Refactor now',
        'Better long-term value',
        testSource
      );

      expect(KnowledgeBaseValidator.validateDecisionRecord(decisionRecord)).toBe(true);
    });

    it('should validate discovery records', () => {
      const discoveryRecord = KnowledgeBaseFactory.createDiscoveryRecord(
        'Async Pattern',
        'Found common async pattern',
        'Promise chains with error handling',
        5,
        'high',
        testSource
      );

      expect(KnowledgeBaseValidator.validateDiscoveryRecord(discoveryRecord)).toBe(true);
    });
  });

  describe('KnowledgeBaseFactory', () => {
    it('should create facts with generated IDs', () => {
      const fact1 = KnowledgeBaseFactory.createFact(
        'First Fact',
        'Description 1',
        KnowledgeCategory.PATTERN,
        testSource
      );

      const fact2 = KnowledgeBaseFactory.createFact(
        'Second Fact',
        'Description 2',
        KnowledgeCategory.PATTERN,
        testSource
      );

      expect(fact1.id).not.toEqual(fact2.id);
      expect(fact1.id.length).toBeGreaterThan(0);
      expect(fact2.id.length).toBeGreaterThan(0);
    });

    it('should create facts with custom options', () => {
      const fact = KnowledgeBaseFactory.createFact(
        'Custom Fact',
        'Description',
        KnowledgeCategory.ARCHITECTURE,
        testSource,
        {
          confidence: 0.95,
          decayRate: 0.05,
          tags: ['verified', 'critical'],
          evidenceLinks: ['https://example.com/evidence'],
        }
      );

      expect(fact.confidence).toBe(0.95);
      expect(fact.decayRate).toBe(0.05);
      expect(fact.tags).toContain('verified');
      expect(fact.tags).toContain('critical');
      expect(fact.evidenceLinks).toContain('https://example.com/evidence');
    });

    it('should create decision records', () => {
      const decision = KnowledgeBaseFactory.createDecisionRecord(
        'Architecture Decision',
        'Which database to use?',
        'Need scalable persistence',
        [
          { option: 'PostgreSQL', pros: ['Reliable'], cons: ['Complex setup'] },
          { option: 'MongoDB', pros: ['Easy setup'], cons: ['Consistency concerns'] },
        ],
        'PostgreSQL',
        'Better for relational data and transactions',
        testSource,
        { tags: ['infrastructure'] }
      );

      expect(decision.chosenOption).toBe('PostgreSQL');
      expect(decision.status).toBe('active');
      expect(decision.tags).toContain('infrastructure');
    });

    it('should create discovery records', () => {
      const discovery = KnowledgeBaseFactory.createDiscoveryRecord(
        'State Management Pattern',
        'Found common state management pattern',
        'Using Context API with custom hooks',
        3,
        'high',
        testSource,
        {
          examples: ['Component A', 'Component B'],
          recommendations: ['Use custom hooks for state'],
          tags: ['react', 'pattern'],
        }
      );

      expect(discovery.pattern).toBe('Using Context API with custom hooks');
      expect(discovery.frequency).toBe(3);
      expect(discovery.impact).toBe('high');
      expect(discovery.examples).toContain('Component A');
      expect(discovery.tags).toContain('react');
    });

    it('should create version history entries', () => {
      const originalFact = KnowledgeBaseFactory.createFact(
        'Original',
        'Original fact',
        KnowledgeCategory.BUG,
        testSource,
        { confidence: 0.8 }
      );

      const updatedFact = { ...originalFact, confidence: 0.95, title: 'Updated' };

      const versionEntry = KnowledgeBaseFactory.createVersionHistoryEntry(
        originalFact.id,
        originalFact,
        updatedFact,
        'confidence_adjusted',
        'More evidence found',
        testSource
      );

      expect(versionEntry.factId).toBe(originalFact.id);
      expect(versionEntry.previousState?.confidence).toBe(0.8);
      expect(versionEntry.newState.confidence).toBe(0.95);
      expect(versionEntry.changeType).toBe('confidence_adjusted');
    });
  });

  describe('DEFAULT_TAXONOMY', () => {
    it('should have all categories configured', () => {
      const categories = Array.from(DEFAULT_TAXONOMY.categories.keys());
      expect(categories).toContain(KnowledgeCategory.ARCHITECTURE);
      expect(categories).toContain(KnowledgeCategory.PATTERN);
      expect(categories).toContain(KnowledgeCategory.BUG);
      expect(categories).toContain(KnowledgeCategory.SECURITY);
    });

    it('should have category metadata', () => {
      const archConfig = DEFAULT_TAXONOMY.categories.get(KnowledgeCategory.ARCHITECTURE);
      expect(archConfig).toBeDefined();
      expect(archConfig?.label).toBe('Architecture');
      expect(archConfig?.icon).toBe('🏗️');
      expect(archConfig?.color).toBe('#007AFF');
    });

    it('should have default tags', () => {
      expect(DEFAULT_TAXONOMY.tags.size).toBeGreaterThan(0);
      expect(DEFAULT_TAXONOMY.tags.has('verified')).toBe(true);
      expect(DEFAULT_TAXONOMY.tags.has('critical')).toBe(true);
    });

    it('should have category relationships', () => {
      const archRelationships = DEFAULT_TAXONOMY.relationships.get(KnowledgeCategory.ARCHITECTURE);
      expect(archRelationships).toBeDefined();
      expect(archRelationships?.length).toBeGreaterThan(0);
    });
  });

  describe('Integration', () => {
    it('should work with factory and validator together', () => {
      // Create facts
      const fact = KnowledgeBaseFactory.createFact(
        'Integration Test',
        'Testing factory with validator',
        KnowledgeCategory.PATTERN,
        testSource,
        { confidence: 0.9, tags: ['test'] }
      );

      // Validate
      expect(KnowledgeBaseValidator.validateFact(fact)).toBe(true);

      // Modify and validate again
      const modifiedFact = { ...fact, confidence: 0.85, title: 'Modified Fact' };
      expect(KnowledgeBaseValidator.validateFact(modifiedFact)).toBe(true);
    });

    it('should support comprehensive knowledge workflow', () => {
      // Create a fact
      const originalFact = KnowledgeBaseFactory.createFact(
        'System Design',
        'Microservices vs Monolith',
        KnowledgeCategory.ARCHITECTURE,
        testSource,
        { confidence: 0.8, decayRate: 0.01, tags: ['architecture', 'design'] }
      );

      // Create a decision tied to it
      const decision = KnowledgeBaseFactory.createDecisionRecord(
        'Architecture Selection',
        'Choose architecture pattern',
        'Need scalable, maintainable system',
        [
          { option: 'Microservices', pros: ['Scalable'], cons: ['Complex'] },
          { option: 'Monolith', pros: ['Simple'], cons: ['Monolithic'] },
        ],
        'Microservices',
        'Better for long-term growth',
        testSource,
        { relatedFactIds: [originalFact.id] }
      );

      // Create a discovery based on the decision
      const discovery = KnowledgeBaseFactory.createDiscoveryRecord(
        'Service Communication Pattern',
        'Discovered async messaging pattern',
        'Event-driven architecture for service communication',
        2,
        'high',
        testSource,
        { recommendations: ['Use message queue for reliability'] }
      );

      // Validate all
      expect(KnowledgeBaseValidator.validateFact(originalFact)).toBe(true);
      expect(KnowledgeBaseValidator.validateDecisionRecord(decision)).toBe(true);
      expect(KnowledgeBaseValidator.validateDiscoveryRecord(discovery)).toBe(true);

      // Check relationships
      expect(decision.relatedFactIds).toContain(originalFact.id);
    });
  });
});
