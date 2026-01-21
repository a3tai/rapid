import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ContextEngine } from '../context-engine.js';
import { HybridSearchEngine, createHybridSearchEngine } from '../hybrid-search.js';
import type { DocumentEntry } from '../docs-indexer.js';

describe('HybridSearchEngine - Simple Tests', () => {
  let projectDir: string;
  let contextEngine: ContextEngine;
  let searchEngine: HybridSearchEngine;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'hybrid-search-simple-test-'));
    contextEngine = new ContextEngine({ projectDir });
    searchEngine = createHybridSearchEngine({
      contextEngine,
      vectorWeight: 0.5,
      lexicalWeight: 0.5,
      minScore: 0.01,
    });
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should have working context engine', async () => {
    const doc: DocumentEntry = {
      type: 'markdown',
      path: 'docs/test.md',
      title: 'Test',
      content: 'test content',
      excerpt: 'test...',
      tags: ['test'],
      headers: [],
      lastModified: new Date().toISOString(),
      size: 100,
    };

    const entry = await contextEngine.learn('docs:markdown:test.md', doc, 'semantic', {
      confidence: 0.95,
      tags: ['test', 'indexed-doc'],
    });

    expect(entry.key).toBe('docs:markdown:test.md');
    expect(entry.value).toEqual(doc);

    const recalled = await contextEngine.recall('docs:markdown:test.md');
    expect(recalled).toBeDefined();
    expect(recalled?.key).toBe('docs:markdown:test.md');

    const all = await contextEngine.list({ memoryType: 'semantic' });
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((e) => e.key === 'docs:markdown:test.md')).toBe(true);
  });

  it('should search for documents in context engine', async () => {
    const doc: DocumentEntry = {
      type: 'markdown',
      path: 'docs/api.md',
      title: 'API Documentation',
      content: 'This describes the REST API',
      excerpt: 'REST API...',
      tags: ['api'],
      headers: [],
      lastModified: new Date().toISOString(),
      size: 1024,
    };

    await contextEngine.learn('docs:markdown:docs/api.md', doc, 'semantic', {
      confidence: 0.95,
      tags: ['api', 'indexed-doc'],
    });

    // Test context engine search directly (use lowercase because context engine does case-sensitive search)
    const searchResults = await contextEngine.search('api', { limit: 10 });
    expect(searchResults.length).toBeGreaterThan(0);
  });

  it('should find documents in hybrid search after adding to context', async () => {
    const doc: DocumentEntry = {
      type: 'markdown',
      path: 'docs/api.md',
      title: 'API Documentation',
      content: 'REST API endpoints and methods',
      excerpt: 'REST API...',
      tags: ['api'],
      headers: [],
      lastModified: new Date().toISOString(),
      size: 1024,
    };

    // Add document to context engine
    await contextEngine.learn('docs:markdown:docs/api.md', doc, 'semantic', {
      confidence: 0.95,
      tags: ['api', 'indexed-doc'],
    });

    // List should show the document
    const all = await contextEngine.list();
    expect(all.length).toBeGreaterThan(0);
    const docEntries = all.filter((e) => e.key.startsWith('docs:'));
    expect(docEntries.length).toBeGreaterThan(0);

    // Hybrid search should find it
    const results = await searchEngine.search('API', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.key).toBe('docs:markdown:docs/api.md');
  });
});
