/**
 * Project Documentation Indexer
 *
 * Scans and indexes all markdown and documentation files in the project,
 * stores them in the context engine for semantic search and retrieval.
 *
 * Features:
 * - Scans for .md files, README files, and code comments (JSDoc/TSDoc)
 * - Extracts content and metadata (title, path, type, tags)
 * - Stores in context engine for semantic search
 * - Supports incremental updates when files change
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import { logger } from './logger.js';
import type { ContextEngine } from './context-engine.js';

/**
 * Represents a parsed documentation entry
 */
export interface DocumentEntry {
  type: 'markdown' | 'code' | 'readme';
  path: string;
  title: string;
  content: string;
  excerpt: string;
  tags: string[];
  headers: string[];
  lastModified: string;
  size: number;
}

/**
 * Configuration for the docs indexer
 */
export interface DocsIndexerConfig {
  projectDir: string;
  contextEngine: ContextEngine;
  includePatterns?: string[]; // glob patterns to include
  excludePatterns?: string[]; // glob patterns to exclude
  maxFileSize?: number; // max bytes to index per file
}

/**
 * Project Documentation Indexer
 */
export class DocsIndexer {
  private projectDir: string;
  private contextEngine: ContextEngine;
  private includePatterns: RegExp[];
  private excludePatterns: RegExp[];
  private maxFileSize: number;
  private defaultIncludes: RegExp[] = [
    /\.md$/i, // Markdown files
    /README/i, // README files
  ];
  private defaultExcludes: RegExp[] = [
    /node_modules/,
    /\.git/,
    /dist/,
    /build/,
    /\.turbo/,
  ];

  constructor(config: DocsIndexerConfig) {
    this.projectDir = config.projectDir;
    this.contextEngine = config.contextEngine;
    this.maxFileSize = config.maxFileSize ?? 1024 * 1024; // 1MB default
    this.includePatterns = this.compilePatterns(config.includePatterns ?? []);
    this.excludePatterns = this.compilePatterns(config.excludePatterns ?? []);

    logger.debug(`DocsIndexer initialized for project: ${config.projectDir}`);
  }

  /**
   * Compile glob patterns to RegExp
   */
  private compilePatterns(patterns: string[]): RegExp[] {
    return patterns.map((p) => {
      // Simple glob to regex conversion
      const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      const regexStr = escaped
        .replace(/\\\*/g, '.*')
        .replace(/\\\?/g, '.');
      return new RegExp(`^${regexStr}$`);
    });
  }

  /**
   * Check if a file should be indexed
   */
  private shouldIndex(filePath: string): boolean {
    // Check exclude patterns first
    for (const pattern of this.defaultExcludes) {
      if (pattern.test(filePath)) {
        return false;
      }
    }

    for (const pattern of this.excludePatterns) {
      if (pattern.test(filePath)) {
        return false;
      }
    }

    // Check include patterns
    const hasMatch =
      this.defaultIncludes.some((p) => p.test(filePath)) ||
      this.includePatterns.some((p) => p.test(filePath));

    return hasMatch;
  }

  /**
   * Extract markdown headers from content
   */
  private extractHeaders(content: string): string[] {
    const headers: string[] = [];
    const headerRegex = /^#{1,6}\s+(.+)$/gm;
    let match;

    while ((match = headerRegex.exec(content)) !== null) {
      if (match[1]) {
        headers.push(match[1]);
      }
    }

    return headers;
  }

  /**
   * Extract title from markdown file
   */
  private extractTitle(content: string, filePath: string): string {
    // Try to find first H1 header
    const headerMatch = content.match(/^#\s+(.+)$/m);
    if (headerMatch && headerMatch[1]) {
      return headerMatch[1];
    }

    // Fall back to filename
    return basename(filePath, extname(filePath))
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }

  /**
   * Extract excerpt from content
   */
  private extractExcerpt(content: string, maxLength: number = 200): string {
    // Remove frontmatter
    let text = content.replace(/^---[\s\S]*?---\n/m, '');

    // Remove markdown formatting
    text = text
      .replace(/#+\s+/g, '') // headers
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
      .replace(/`[^`]+`/g, '') // code
      .replace(/\*\*(.+?)\*\*/g, '$1') // bold
      .replace(/\*(.+?)\*/g, '$1'); // italic

    // Get first paragraph or first maxLength chars
    const paragraph = text.split('\n\n')[0];
    const excerpt = paragraph || text;

    return excerpt.slice(0, maxLength).trim() + (excerpt.length > maxLength ? '...' : '');
  }

  /**
   * Generate tags from file path and content
   */
  private generateTags(filePath: string, content: string): string[] {
    const tags = new Set<string>();

    // Add tags based on directory structure
    const pathParts = filePath.split('/').slice(1, -1); // remove first (.) and last (filename)
    for (const part of pathParts) {
      if (part && part !== 'src' && part !== 'packages' && part !== 'apps') {
        tags.add(part.toLowerCase());
      }
    }

    // Add tags from filename
    const filename = basename(filePath, extname(filePath));
    if (filename.toLowerCase() !== 'readme') {
      tags.add(filename.toLowerCase().replace(/[-_]/g, '-'));
    }

    // Extract keywords from content (hashtags, code fence languages)
    const hashtagMatch = content.match(/#{1,6}\s+(.+)/g);
    if (hashtagMatch) {
      for (const tag of hashtagMatch) {
        const cleaned = tag.replace(/#+\s+/, '').split(/\s+/)[0];
        if (cleaned) tags.add(cleaned.toLowerCase());
      }
    }

    // Look for code fence languages
    const codeMatch = content.match(/```(\w+)/g);
    if (codeMatch) {
      for (const lang of codeMatch) {
        const cleaned = lang.replace(/```/, '');
        if (cleaned) tags.add(cleaned.toLowerCase());
      }
    }

    return Array.from(tags);
  }

  /**
   * Parse a markdown file
   */
  private parseMarkdownFile(filePath: string, content: string): DocumentEntry {
    const relativePath = relative(this.projectDir, filePath);
    const headers = this.extractHeaders(content);
    const title = this.extractTitle(content, filePath);
    const excerpt = this.extractExcerpt(content);
    const tags = this.generateTags(filePath, content);
    const stat = statSync(filePath);

    return {
      type: 'markdown',
      path: relativePath,
      title,
      content,
      excerpt,
      tags,
      headers,
      lastModified: new Date(stat.mtime).toISOString(),
      size: stat.size,
    };
  }

  /**
   * Scan directory recursively for documents
   */
  private scanDirectory(dirPath: string, documents: DocumentEntry[]): void {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        const relativePath = relative(this.projectDir, fullPath);

        if (entry.isDirectory()) {
          // Skip excluded directories
          if (!this.defaultExcludes.some((p) => p.test(relativePath))) {
            this.scanDirectory(fullPath, documents);
          }
        } else if (entry.isFile()) {
          if (this.shouldIndex(fullPath)) {
            try {
              const stat = statSync(fullPath);

              // Skip files that are too large
              if (stat.size > this.maxFileSize) {
                logger.warn(
                  `Skipping ${fullPath}: exceeds max size (${stat.size} > ${this.maxFileSize})`
                );
                continue;
              }

              const content = readFileSync(fullPath, 'utf-8');
              const doc = this.parseMarkdownFile(fullPath, content);
              documents.push(doc);
              logger.debug(`Indexed document: ${fullPath}`);
            } catch (error) {
              logger.warn(
                `Failed to index ${fullPath}: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        }
      }
    } catch (error) {
      logger.warn(
        `Failed to scan directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Index all documents in the project
   */
  async indexProject(): Promise<{ indexed: number; failed: number }> {
    logger.info('Starting project documentation indexing...');

    const documents: DocumentEntry[] = [];
    let indexed = 0;
    let failed = 0;

    // Scan project directory
    if (existsSync(this.projectDir)) {
      this.scanDirectory(this.projectDir, documents);
    }

    logger.info(`Found ${documents.length} documentation files`);

    // Store in context engine
    for (const doc of documents) {
      try {
        // Create a unique key for the document
        const key = `docs:${doc.type}:${doc.path}`;

        // Store the document in the context engine
        await this.contextEngine.learn(key, doc, 'semantic', {
          confidence: 0.95, // High confidence for indexed docs
          tags: [...doc.tags, doc.type, 'indexed-doc'],
          relatedKeys: [], // Can be populated with related docs
        });

        indexed++;
      } catch (error) {
        logger.error(
          `Failed to store document ${doc.path}: ${error instanceof Error ? error.message : String(error)}`
        );
        failed++;
      }
    }

    logger.info(`Indexing complete: ${indexed} indexed, ${failed} failed`);
    return { indexed, failed };
  }

  /**
   * Index a specific file
   */
  async indexFile(filePath: string): Promise<boolean> {
    try {
      if (!existsSync(filePath)) {
        logger.warn(`File not found: ${filePath}`);
        return false;
      }

      if (!this.shouldIndex(filePath)) {
        logger.debug(`File does not match include patterns: ${filePath}`);
        return false;
      }

      const stat = statSync(filePath);

      if (stat.size > this.maxFileSize) {
        logger.warn(
          `File exceeds max size: ${filePath} (${stat.size} > ${this.maxFileSize})`
        );
        return false;
      }

      const content = readFileSync(filePath, 'utf-8');
      const doc = this.parseMarkdownFile(filePath, content);

      // Store in context engine
      const key = `docs:${doc.type}:${doc.path}`;
      await this.contextEngine.learn(key, doc, 'semantic', {
        confidence: 0.95,
        tags: [...doc.tags, doc.type, 'indexed-doc'],
      });

      logger.info(`Indexed file: ${filePath}`);
      return true;
    } catch (error) {
      logger.error(
        `Failed to index file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Search for documents
   */
  async searchDocuments(query: string, limit: number = 10): Promise<DocumentEntry[]> {
    try {
      // Search in context engine
      const results = await this.contextEngine.search(query, {
        memoryType: 'semantic',
        limit,
      });

      // Filter for indexed documents and extract DocumentEntry values
      const docs = results
        .filter((entry) => entry.key.startsWith('docs:'))
        .slice(0, limit)
        .map((entry) => entry.value as DocumentEntry);

      logger.debug(`Search for "${query}" found ${docs.length} results`);
      return docs;
    } catch (error) {
      logger.error(
        `Search failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }

  /**
   * Get documentation statistics
   */
  async getIndexStats(): Promise<{
    totalDocuments: number;
    byType: Record<string, number>;
    totalSize: number;
  }> {
    try {
      const all = await this.contextEngine.list({ memoryType: 'semantic' });
      const docs = all.filter((e) => e.key.startsWith('docs:'));

      const byType: Record<string, number> = { markdown: 0, code: 0, readme: 0 };
      let totalSize = 0;

      for (const entry of docs) {
        const doc = entry.value as DocumentEntry | undefined;
        if (doc) {
          byType[doc.type] = (byType[doc.type] || 0) + 1;
          totalSize += doc.size;
        }
      }

      return {
        totalDocuments: docs.length,
        byType,
        totalSize,
      };
    } catch (error) {
      logger.error(
        `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`
      );
      return { totalDocuments: 0, byType: {}, totalSize: 0 };
    }
  }
}

/**
 * Create a new docs indexer
 */
export function createDocsIndexer(config: DocsIndexerConfig): DocsIndexer {
  return new DocsIndexer(config);
}
