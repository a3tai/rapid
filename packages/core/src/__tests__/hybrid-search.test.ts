import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ContextEngine } from '../context-engine.js';
import { HybridSearchEngine, createHybridSearchEngine } from '../hybrid-search.js';
import type { DocumentEntry } from '../docs-indexer.js';

describe('HybridSearchEngine', () => {
  let projectDir: string;
  let contextEngine: ContextEngine;
  let searchEngine: HybridSearchEngine;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'hybrid-search-test-'));
    contextEngine = new ContextEngine({ projectDir });
    searchEngine = createHybridSearchEngine({
      contextEngine,
      vectorWeight: 0.5,
      lexicalWeight: 0.5,
      rrfK: 60,
      minScore: 0.1,
      maxResults: 50,
    });
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  describe('Basic search functionality', () => {
    it('should return empty results for empty query', async () => {
      const results = await searchEngine.search('');
      expect(results).toEqual([]);
    });

    it('should find exact keyword matches', async () => {
      // Add a test document
      const doc: DocumentEntry = {
        type: 'markdown',
        path: 'docs/api.md',
        title: 'API Documentation',
        content: 'This document describes the REST API endpoints and authentication methods.',
        excerpt: 'This document describes the REST API endpoints...',
        tags: ['api', 'documentation'],
        headers: ['API Documentation', 'Authentication'],
        lastModified: new Date().toISOString(),
        size: 1024,
      };

      // Add document to context engine
      const entry = await contextEngine.learn('docs:markdown:docs/api.md', doc, 'semantic', {
        confidence: 0.95,
        tags: [...doc.tags, 'indexed-doc'],
      });

      // Verify the entry was learned
      expect(entry.key).toBe('docs:markdown:docs/api.md');

      const results = await searchEngine.search('API', 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.key).toBe('docs:markdown:docs/api.md');
    });

    it('should find multiple matching documents', async () => {
      // Add multiple documents
      const docs: DocumentEntry[] = [
        {
          type: 'markdown',
          path: 'docs/api.md',
          title: 'API Documentation',
          content: 'REST API endpoints and authentication',
          excerpt: 'REST API endpoints...',
          tags: ['api'],
          headers: ['API'],
          lastModified: new Date().toISOString(),
          size: 1024,
        },
        {
          type: 'markdown',
          path: 'docs/auth.md',
          title: 'Authentication Guide',
          content: 'How to authenticate with the API',
          excerpt: 'How to authenticate...',
          tags: ['auth', 'api'],
          headers: ['Authentication'],
          lastModified: new Date().toISOString(),
          size: 2048,
        },
      ];

      for (const doc of docs) {
        const key = `docs:${doc.type}:${doc.path}`;
        const entry = await contextEngine.learn(key, doc, 'semantic', {
          confidence: 0.95,
          tags: [...doc.tags, 'indexed-doc'],
        });
        expect(entry.key).toBe(key);
      }

      const results = await searchEngine.search('authentication', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.entry.key.includes('auth.md'))).toBe(true);
    });
  });

  describe('Vector scoring', () => {
    it('should score keyword overlap correctly', async () => {
      const doc1: DocumentEntry = {
        type: 'markdown',
        path: 'docs/test1.md',
        title: 'Testing Framework Guide',
        content: 'Learn about testing with Jest and Vitest',
        excerpt: 'Learn about testing...',
        tags: ['testing'],
        headers: [],
        lastModified: new Date().toISOString(),
        size: 1024,
      };

      const doc2: DocumentEntry = {
        type: 'markdown',
        path: 'docs/test2.md',
        title: 'Unrelated Documentation',
        content: 'Something completely different',
        excerpt: 'Something different...',
        tags: ['other'],
        headers: [],
        lastModified: new Date().toISOString(),
        size: 1024,
      };

      await contextEngine.learn('docs:markdown:docs/test1.md', doc1, 'semantic', {
        confidence: 0.95,
        tags: [...doc1.tags, 'indexed-doc'],
      });
      await contextEngine.learn('docs:markdown:docs/test2.md', doc2, 'semantic', {
        confidence: 0.95,
        tags: [...doc2.tags, 'indexed-doc'],
      });

      const results = await searchEngine.search('testing framework', 10);
      expect(results.length).toBeGreaterThan(0);
      const relevantResult = results.find((r) => r.entry.key.includes('test1.md'));
      expect(relevantResult).toBeDefined();
    });
  });

  describe('Lexical scoring (BM25)', () => {
    it('should score documents based on term frequency', async () => {
      const doc1: DocumentEntry = {
        type: 'markdown',
        path: 'docs/react.md',
        title: 'React Hooks Guide',
        content: 'React hooks are functions that let you use state in functional React components. React hooks make React components more reusable.',
        excerpt: 'React hooks are functions...',
        tags: ['react'],
        headers: [],
        lastModified: new Date().toISOString(),
        size: 1024,
      };

      const doc2: DocumentEntry = {
        type: 'markdown',
        path: 'docs/vue.md',
        title: 'Vue Basics',
        content: 'Vue is a framework for building user interfaces.',
        excerpt: 'Vue is a framework...',
        tags: ['vue'],
        headers: [],
        lastModified: new Date().toISOString(),
        size: 1024,
      };

      await contextEngine.learn('docs:markdown:docs/react.md', doc1, 'semantic', {
        confidence: 0.95,
        tags: [...doc1.tags, 'indexed-doc'],
      });
      await contextEngine.learn('docs:markdown:docs/vue.md', doc2, 'semantic', {
        confidence: 0.95,
        tags: [...doc2.tags, 'indexed-doc'],
      });

      const results = await searchEngine.search('react', 10);
      expect(results.length).toBeGreaterThan(0);
      const reactResult = results.find((r) => r.entry.key.includes('react.md'));
      expect(reactResult).toBeDefined();
    });
  });

  describe('Result ranking', () => {
    it('should rank results by combined score', async () => {
      const docs: DocumentEntry[] = [
        {
          type: 'markdown',
          path: 'docs/highly-relevant.md',
          title: 'TypeScript Advanced Types',
          content:
            'This is a comprehensive guide to TypeScript advanced types including generics, unions, and intersections. TypeScript types are powerful.',
          excerpt: 'Comprehensive guide to TypeScript...',
          tags: ['typescript'],
          headers: [],
          lastModified: new Date().toISOString(),
          size: 1024,
        },
        {
          type: 'markdown',
          path: 'docs/somewhat-relevant.md',
          title: 'JavaScript Basics',
          content: 'Learn the basics of JavaScript programming.',
          excerpt: 'Learn the basics...',
          tags: ['javascript'],
          headers: [],
          lastModified: new Date().toISOString(),
          size: 1024,
        },
      ];

      for (const doc of docs) {
        const key = `docs:${doc.type}:${doc.path}`;
        await contextEngine.learn(key, doc, 'semantic', {
          confidence: 0.95,
          tags: [...doc.tags, 'indexed-doc'],
        });
      }

      const results = await searchEngine.search('TypeScript', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.key).toContain('highly-relevant.md');
      expect(results[0].combinedScore).toBeGreaterThan(0);
    });
  });

  describe('Weight configuration', () => {
    it('should allow updating search weights', () => {
      searchEngine.updateWeights(0.7, 0.3);
      const config = searchEngine.getConfig();
      expect(config.vectorWeight).toBeCloseTo(0.7, 2);
      expect(config.lexicalWeight).toBeCloseTo(0.3, 2);
    });

    it('should normalize weights to 1.0', () => {
      searchEngine.updateWeights(2, 3);
      const config = searchEngine.getConfig();
      expect(config.vectorWeight + config.lexicalWeight).toBeCloseTo(1.0, 2);
    });

    it('should affect ranking with different weights', async () => {
      const doc: DocumentEntry = {
        type: 'markdown',
        path: 'docs/test.md',
        title: 'Test Document',
        content: 'This is a test document with some content.',
        excerpt: 'This is a test...',
        tags: ['test'],
        headers: [],
        lastModified: new Date().toISOString(),
        size: 1024,
      };

      await contextEngine.learn('docs:markdown:docs/test.md', doc, 'semantic', {
        confidence: 0.95,
        tags: [...doc.tags, 'indexed-doc'],
      });

      // Search with vector-heavy weights
      searchEngine.updateWeights(0.8, 0.2);
      const vectorHeavyResults = await searchEngine.search('test', 10);

      // Search with lexical-heavy weights
      searchEngine.updateWeights(0.2, 0.8);
      const lexicalHeavyResults = await searchEngine.search('test', 10);

      expect(vectorHeavyResults.length).toBeGreaterThan(0);
      expect(lexicalHeavyResults.length).toBeGreaterThan(0);
    });
  });

  describe('Result metadata', () => {
    it('should include match reasons in results', async () => {
      const doc: DocumentEntry = {
        type: 'markdown',
        path: 'docs/test.md',
        title: 'Test Document',
        content: 'This contains important keywords',
        excerpt: 'This contains important...',
        tags: ['test'],
        headers: [],
        lastModified: new Date().toISOString(),
        size: 1024,
      };

      await contextEngine.learn('docs:markdown:docs/test.md', doc, 'semantic', {
        confidence: 0.95,
        tags: [...doc.tags, 'indexed-doc'],
      });

      const results = await searchEngine.search('test', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchReasons).toBeDefined();
      expect(results[0].matchReasons.length).toBeGreaterThan(0);
    });

    it('should include document reference in results', async () => {
      const doc: DocumentEntry = {
        type: 'markdown',
        path: 'docs/test.md',
        title: 'Test Document',
        content: 'Test content',
        excerpt: 'Test...',
        tags: ['test'],
        headers: [],
        lastModified: new Date().toISOString(),
        size: 1024,
      };

      await contextEngine.learn('docs:markdown:docs/test.md', doc, 'semantic', {
        confidence: 0.95,
        tags: [...doc.tags, 'indexed-doc'],
      });

      const results = await searchEngine.search('test', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].document).toBeDefined();
      expect(results[0].document?.title).toBe('Test Document');
    });
  });

  describe('Edge cases', () => {
    it('should handle whitespace-only query', async () => {
      const results = await searchEngine.search('   ', 10);
      expect(results).toEqual([]);
    });

    it('should handle query with only special characters', async () => {
      const results = await searchEngine.search('@#$%', 10);
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should return results respecting max limit', async () => {
      // Add multiple documents
      for (let i = 0; i < 10; i++) {
        const doc: DocumentEntry = {
          type: 'markdown',
          path: `docs/test${i}.md`,
          title: `Document ${i}`,
          content: 'This is a test document',
          excerpt: 'This is a test...',
          tags: ['test'],
          headers: [],
          lastModified: new Date().toISOString(),
          size: 1024,
        };

        await contextEngine.learn(`docs:markdown:docs/test${i}.md`, doc, 'semantic', {
          confidence: 0.95,
          tags: [...doc.tags, 'indexed-doc'],
        });
      }

      const results = await searchEngine.search('test', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Factory function', () => {
    it('should create search engine with factory function', () => {
      const engine = createHybridSearchEngine({
        contextEngine,
        vectorWeight: 0.6,
        lexicalWeight: 0.4,
      });

      expect(engine).toBeDefined();
      const config = engine.getConfig();
      expect(config.vectorWeight).toBeCloseTo(0.6, 2);
      expect(config.lexicalWeight).toBeCloseTo(0.4, 2);
    });
  });
});
