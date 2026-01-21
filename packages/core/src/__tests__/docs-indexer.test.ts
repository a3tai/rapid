/**
 * Tests for DocsIndexer
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DocsIndexer } from '../docs-indexer.js';
import { ContextEngine } from '../context-engine.js';

describe('DocsIndexer', () => {
  let tempDir: string;
  let contextEngine: ContextEngine;
  let indexer: DocsIndexer;

  beforeAll(() => {
    // Create temporary directory
    tempDir = mkdtempSync(join(tmpdir(), 'docs-indexer-test-'));

    // Create context engine
    contextEngine = new ContextEngine({
      projectDir: tempDir,
    });

    // Create indexer
    indexer = new DocsIndexer({
      projectDir: tempDir,
      contextEngine,
    });
  });

  afterAll(() => {
    // Clean up temporary directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Document parsing', () => {
    it('should parse markdown files correctly', async () => {
      const docPath = join(tempDir, 'test.md');
      const content = `# Test Document

This is a test document with some content.

## Section 1

Here is section 1 content.

## Section 2

Here is section 2 content.
`;

      writeFileSync(docPath, content, 'utf-8');

      // Index the file
      const success = await indexer.indexFile(docPath);
      expect(success).toBe(true);

      // Verify the document was stored in context engine
      const entries = await contextEngine.list({ memoryType: 'semantic' });
      expect(entries.length).toBeGreaterThan(0);

      const entry = entries[0];
      expect(entry.key).toBe('docs:markdown:test.md');
    });

    it('should extract headers from markdown', async () => {
      const docPath = join(tempDir, 'headers.md');
      const content = `# Main Title

## Subsection 1

### Sub-subsection

## Subsection 2
`;

      writeFileSync(docPath, content, 'utf-8');
      await indexer.indexFile(docPath);

      const entries = await contextEngine.list({ memoryType: 'semantic' });
      const headerEntry = entries.find((e) => e.key.includes('headers.md'));

      expect(headerEntry).toBeDefined();
      const doc = headerEntry!.value as any;
      expect(doc.headers).toContain('Main Title');
      expect(doc.headers).toContain('Subsection 1');
      expect(doc.headers).toContain('Sub-subsection');
      expect(doc.headers).toContain('Subsection 2');
    });

    it('should extract title from first H1', async () => {
      const docPath = join(tempDir, 'titled.md');
      const content = `# My Document Title

Some content here.
`;

      writeFileSync(docPath, content, 'utf-8');
      await indexer.indexFile(docPath);

      const entries = await contextEngine.list({ memoryType: 'semantic' });
      const entry = entries.find((e) => e.key.includes('titled.md'));

      expect(entry).toBeDefined();
      const doc = entry!.value as any;
      expect(doc.title).toBe('My Document Title');
    });

    it('should generate tags from path and content', async () => {
      const docDir = join(tempDir, 'guides');
      mkdirSync(docDir, { recursive: true });
      writeFileSync(join(docDir, 'quickstart.md'), '# Quickstart', 'utf-8');

      await indexer.indexFile(join(docDir, 'quickstart.md'));

      const entries = await contextEngine.list({ memoryType: 'semantic' });
      const entry = entries.find((e) => e.key.includes('quickstart.md'));

      expect(entry).toBeDefined();
      expect(entry!.metadata.tags).toContain('guides');
      expect(entry!.metadata.tags).toContain('quickstart');
    });

    it('should extract excerpt from content', async () => {
      const docPath = join(tempDir, 'excerpt2.md');
      const content = `# Document

This is the first paragraph that should become the excerpt.

This is the second paragraph.
`;

      writeFileSync(docPath, content, 'utf-8');
      await indexer.indexFile(docPath);

      const entries = await contextEngine.list({ memoryType: 'semantic' });
      const entry = entries.find((e) => e.key.includes('excerpt2.md'));

      expect(entry).toBeDefined();
      const doc = entry!.value as any;
      // The excerpt should contain meaningful content
      expect(doc.excerpt.length).toBeGreaterThan(0);
    });
  });

  describe('Project indexing', () => {
    it('should index multiple markdown files', async () => {
      const testDir = mkdtempSync(join(tmpdir(), 'multi-file-test-'));

      try {
        // Create test files
        writeFileSync(join(testDir, 'README.md'), '# README', 'utf-8');
        writeFileSync(join(testDir, 'guide.md'), '# Guide', 'utf-8');

        const engine = new ContextEngine({ projectDir: testDir });
        const idx = new DocsIndexer({
          projectDir: testDir,
          contextEngine: engine,
        });

        const result = await idx.indexProject();

        expect(result.indexed).toBeGreaterThanOrEqual(2);
        expect(result.failed).toBe(0);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should exclude node_modules and other directories', async () => {
      const testDir = mkdtempSync(join(tmpdir(), 'exclude-test-'));

      try {
        // Create test files in different directories
        mkdirSync(join(testDir, 'node_modules'), { recursive: true });
        const nodeModulesFile = join(testDir, 'node_modules', 'package.md');
        const regularFile = join(testDir, 'docs.md');

        writeFileSync(nodeModulesFile, '# Package', 'utf-8');
        writeFileSync(regularFile, '# Docs', 'utf-8');

        const engine = new ContextEngine({ projectDir: testDir });
        const idx = new DocsIndexer({
          projectDir: testDir,
          contextEngine: engine,
        });

        const result = await idx.indexProject();

        // Should only index the regular file, not node_modules
        expect(result.indexed).toBe(1);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('Document search', () => {
    it('should search for documents', async () => {
      const testDir = mkdtempSync(join(tmpdir(), 'search-test-'));

      try {
        writeFileSync(join(testDir, 'authentication.md'), '# Authentication Guide\n\nLearn about auth.', 'utf-8');
        writeFileSync(join(testDir, 'deployment.md'), '# Deployment\n\nHow to deploy.', 'utf-8');

        const engine = new ContextEngine({ projectDir: testDir });
        const idx = new DocsIndexer({
          projectDir: testDir,
          contextEngine: engine,
        });

        await idx.indexProject();

        // Search for authentication
        const results = await idx.searchDocuments('authentication');

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].title).toContain('Authentication');
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('Index statistics', () => {
    it('should report indexing statistics', async () => {
      const testDir = mkdtempSync(join(tmpdir(), 'stats-test-'));

      try {
        writeFileSync(join(testDir, 'doc1.md'), '# Doc 1', 'utf-8');
        writeFileSync(join(testDir, 'README.md'), '# README', 'utf-8');

        const engine = new ContextEngine({ projectDir: testDir });
        const idx = new DocsIndexer({
          projectDir: testDir,
          contextEngine: engine,
        });

        await idx.indexProject();

        const stats = await idx.getIndexStats();

        expect(stats.totalDocuments).toBeGreaterThanOrEqual(2);
        expect(stats.byType).toHaveProperty('markdown');
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('File size limits', () => {
    it('should skip files that exceed max size', async () => {
      const testDir = mkdtempSync(join(tmpdir(), 'size-limit-test-'));

      try {
        // Create a file larger than the limit
        const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
        writeFileSync(join(testDir, 'large.md'), largeContent, 'utf-8');
        writeFileSync(join(testDir, 'small.md'), '# Small', 'utf-8');

        const engine = new ContextEngine({ projectDir: testDir });
        const idx = new DocsIndexer({
          projectDir: testDir,
          contextEngine: engine,
          maxFileSize: 1024 * 1024, // 1MB limit
        });

        const result = await idx.indexProject();

        // large.md should be skipped, small.md should be indexed
        expect(result.indexed).toBe(1);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
});
