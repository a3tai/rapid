/**
 * Hybrid Search Engine
 *
 * Combines vector similarity search with keyword/lexical search (BM25-like)
 * for comprehensive document retrieval. Uses Reciprocal Rank Fusion (RRF)
 * to combine results from multiple search strategies.
 *
 * Features:
 * - Vector similarity search using simple embeddings
 * - Lexical search with TF-IDF and BM25-like scoring
 * - Configurable weight for semantic vs lexical search
 * - Reciprocal Rank Fusion for result combination
 * - Integration with context engine and docs indexer
 */

import { logger } from './logger.js';
import type { ContextEngine, ContextEntry } from './context-engine.js';
import type { DocumentEntry } from './docs-indexer.js';

/**
 * Search result with combined score
 */
export interface HybridSearchResult {
  entry: ContextEntry;
  document?: DocumentEntry;
  vectorScore: number;
  lexicalScore: number;
  combinedScore: number;
  matchReasons: string[];
}

/**
 * Configuration for hybrid search
 */
export interface HybridSearchConfig {
  contextEngine: ContextEngine;
  vectorWeight?: number; // 0-1, default 0.5
  lexicalWeight?: number; // 0-1, default 0.5
  rrfK?: number; // RRF parameter, default 60
  minScore?: number; // Minimum combined score to include result, default 0.1
  maxResults?: number; // Maximum results to return, default 50
}

/**
 * BM25 parameters for lexical search
 */
interface BM25Params {
  k1: number; // Term frequency saturation parameter (default 1.5)
  b: number; // Length normalization parameter (default 0.75)
  avgDocLength: number; // Average document length
  documentCount: number; // Total number of documents
}

/**
 * Hybrid Search Engine combining vector and lexical search
 */
export class HybridSearchEngine {
  private contextEngine: ContextEngine;
  private vectorWeight: number;
  private lexicalWeight: number;
  private rrfK: number;
  private minScore: number;
  private maxResults: number;

  constructor(config: HybridSearchConfig) {
    this.contextEngine = config.contextEngine;
    this.vectorWeight = config.vectorWeight ?? 0.5;
    this.lexicalWeight = config.lexicalWeight ?? 0.5;
    this.rrfK = config.rrfK ?? 60;
    this.minScore = config.minScore ?? 0.01; // Lower threshold to be more inclusive
    this.maxResults = config.maxResults ?? 50;

    // Normalize weights
    const totalWeight = this.vectorWeight + this.lexicalWeight;
    this.vectorWeight /= totalWeight;
    this.lexicalWeight /= totalWeight;

    logger.debug(
      `HybridSearchEngine initialized with vector=${this.vectorWeight.toFixed(2)}, lexical=${this.lexicalWeight.toFixed(2)}`
    );
  }

  /**
   * Tokenize query string
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .split(/\s+/)
      .filter((token) => token.length > 0);
  }

  /**
   * Calculate simple TF-IDF score for lexical search
   */
  private calculateBM25Score(
    query: string,
    document: string,
    params: BM25Params
  ): number {
    const queryTokens = this.tokenize(query);
    const docTokens = this.tokenize(document);
    const docLength = docTokens.length;

    if (queryTokens.length === 0 || docTokens.length === 0) {
      return 0;
    }

    let score = 0;
    let matchCount = 0;

    for (const token of queryTokens) {
      // Count term frequency in document
      const tf = docTokens.filter((t) => t === token).length;

      if (tf > 0) {
        matchCount++;
        // BM25 formula: IDF * (TF * (k1 + 1)) / (TF + k1 * (1 - b + b * (dl / avgdl)))
        const numerator = tf * (params.k1 + 1);
        const denominator =
          tf +
          params.k1 *
            (1 - params.b + params.b * (docLength / Math.max(params.avgDocLength, 1)));

        score += numerator / denominator;
      }
    }

    // Normalize: proportion of query terms found * normalized score
    if (matchCount === 0) {
      return 0;
    }

    const matchRatio = matchCount / queryTokens.length;
    const normalizedScore = Math.min(score / (queryTokens.length * 2), 1.0);

    return matchRatio * normalizedScore;
  }

  /**
   * Calculate simple vector similarity (cosine similarity)
   * For now, using keyword overlap as proxy for vector similarity
   */
  private calculateVectorScore(
    query: string,
    document: DocumentEntry
  ): number {
    const queryTokens = this.tokenize(query);
    const docText = (document.title + ' ' + document.excerpt + ' ' + document.tags.join(' ')).toLowerCase();
    const docTokens = this.tokenize(docText);

    if (queryTokens.length === 0 || docTokens.length === 0) {
      return 0;
    }

    // Count matching tokens
    let matches = 0;
    for (const token of queryTokens) {
      if (docTokens.includes(token)) {
        matches++;
      }
    }

    // Simple overlap score
    return matches / queryTokens.length;
  }

  /**
   * Perform lexical search using BM25
   */
  private async lexicalSearch(query: string, limit: number): Promise<[ContextEntry, number][]> {
    try {
      const allEntries = await this.contextEngine.list({ memoryType: 'semantic' });

      // Calculate BM25 scores
      const docEntries = allEntries.filter((e) => e.key.startsWith('docs:'));
      const totalDocLength = docEntries.reduce((sum, e) => {
        const doc = e.value as DocumentEntry;
        return sum + (doc.content ? doc.content.length : 0);
      }, 0);

      const params: BM25Params = {
        k1: 1.5,
        b: 0.75,
        avgDocLength: totalDocLength / Math.max(docEntries.length, 1),
        documentCount: Math.max(docEntries.length, 1),
      };

      const scores: [ContextEntry, number][] = [];

      for (const entry of docEntries) {
        const doc = entry.value as DocumentEntry;
        const fullText = `${doc.title} ${doc.excerpt} ${doc.content}`;
        const bm25Score = this.calculateBM25Score(query, fullText, params);

        if (bm25Score > 0) {
          scores.push([entry, bm25Score]);
        }
      }

      // Sort by score descending
      scores.sort((a, b) => b[1] - a[1]);
      return scores.slice(0, limit);
    } catch (error) {
      logger.warn(`Lexical search failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Perform vector similarity search
   */
  private async vectorSearch(query: string, limit: number): Promise<[ContextEntry, number][]> {
    try {
      const allEntries = await this.contextEngine.list({ memoryType: 'semantic' });
      const docEntries = allEntries.filter((e) => e.key.startsWith('docs:'));

      const scores: [ContextEntry, number][] = [];

      for (const entry of docEntries) {
        const doc = entry.value as DocumentEntry;
        const vectorScore = this.calculateVectorScore(query, doc);

        if (vectorScore > 0) {
          scores.push([entry, vectorScore]);
        }
      }

      // Sort by score descending
      scores.sort((a, b) => b[1] - a[1]);
      return scores.slice(0, limit);
    } catch (error) {
      logger.warn(`Vector search failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Reciprocal Rank Fusion - combines rankings from multiple search strategies
   */
  private combineResults(
    vectorResults: [ContextEntry, number][],
    lexicalResults: [ContextEntry, number][]
  ): Map<string, { entry: ContextEntry; vectorScore: number; lexicalScore: number }> {
    const combined = new Map<
      string,
      { entry: ContextEntry; vectorScore: number; lexicalScore: number }
    >();

    // Add vector results
    for (let i = 0; i < vectorResults.length; i++) {
      const result = vectorResults[i];
      if (!result) continue;

      const [entry, score] = result;
      const rrf = 1 / (this.rrfK + i + 1);

      combined.set(entry.key, {
        entry,
        vectorScore: score * rrf,
        lexicalScore: 0,
      });
    }

    // Add lexical results
    for (let i = 0; i < lexicalResults.length; i++) {
      const result = lexicalResults[i];
      if (!result) continue;

      const [entry, score] = result;
      const rrf = 1 / (this.rrfK + i + 1);

      if (combined.has(entry.key)) {
        combined.get(entry.key)!.lexicalScore = score * rrf;
      } else {
        combined.set(entry.key, {
          entry,
          vectorScore: 0,
          lexicalScore: score * rrf,
        });
      }
    }

    return combined;
  }

  /**
   * Calculate combined score from vector and lexical scores
   */
  private calculateCombinedScore(vectorScore: number, lexicalScore: number): number {
    return vectorScore * this.vectorWeight + lexicalScore * this.lexicalWeight;
  }

  /**
   * Perform hybrid search combining vector and lexical search
   */
  async search(query: string, limit: number = 20): Promise<HybridSearchResult[]> {
    try {
      logger.debug(`Hybrid search for: "${query}"`);

      if (!query || query.trim().length === 0) {
        logger.debug('Empty query, returning empty results');
        return [];
      }

      // Perform both searches
      const searchLimit = Math.max(limit * 2, 50); // Get more results to allow for combining
      const [vectorResults, lexicalResults] = await Promise.all([
        this.vectorSearch(query, searchLimit),
        this.lexicalSearch(query, searchLimit),
      ]);

      logger.debug(`Vector search: ${vectorResults.length}, Lexical search: ${lexicalResults.length}`);

      // Combine results using RRF
      const combined = this.combineResults(vectorResults, lexicalResults);

      // Calculate combined scores and sort
      const results: HybridSearchResult[] = [];

      for (const { entry, vectorScore, lexicalScore } of combined.values()) {
        const combinedScore = this.calculateCombinedScore(vectorScore, lexicalScore);

        if (combinedScore >= this.minScore) {
          const doc = entry.value as DocumentEntry;
          const matchReasons: string[] = [];

          if (vectorScore > 0) {
            matchReasons.push(`Vector match (${(vectorScore * 100).toFixed(1)}%)`);
          }
          if (lexicalScore > 0) {
            matchReasons.push(`Lexical match (${(lexicalScore * 100).toFixed(1)}%)`);
          }

          results.push({
            entry,
            document: doc,
            vectorScore,
            lexicalScore,
            combinedScore,
            matchReasons,
          });
        }
      }

      // Sort by combined score descending
      results.sort((a, b) => b.combinedScore - a.combinedScore);

      // Return top results
      const topResults = results.slice(0, Math.min(limit, this.maxResults));
      logger.debug(`Hybrid search returned ${topResults.length} results`);

      return topResults;
    } catch (error) {
      logger.error(`Hybrid search failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Update search weights (semantic vs lexical)
   */
  updateWeights(vectorWeight: number, lexicalWeight: number): void {
    const total = vectorWeight + lexicalWeight;
    this.vectorWeight = vectorWeight / total;
    this.lexicalWeight = lexicalWeight / total;
    logger.debug(
      `Updated search weights: vector=${this.vectorWeight.toFixed(2)}, lexical=${this.lexicalWeight.toFixed(2)}`
    );
  }

  /**
   * Get search configuration
   */
  getConfig(): {
    vectorWeight: number;
    lexicalWeight: number;
    rrfK: number;
    minScore: number;
    maxResults: number;
  } {
    return {
      vectorWeight: this.vectorWeight,
      lexicalWeight: this.lexicalWeight,
      rrfK: this.rrfK,
      minScore: this.minScore,
      maxResults: this.maxResults,
    };
  }
}

/**
 * Create a new hybrid search engine
 */
export function createHybridSearchEngine(config: HybridSearchConfig): HybridSearchEngine {
  return new HybridSearchEngine(config);
}
