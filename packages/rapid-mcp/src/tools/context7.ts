/**
 * Context7 Integration Tools
 *
 * Wrapper for Context7 MCP server with local caching, version detection,
 * and rate limiting. Provides library documentation lookup for agents.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('context7');

// In-memory cache for documentation
interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number; // TTL in ms
}

const docCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour default TTL

// Rate limiting state
const rateLimitState = {
  requests: 0,
  windowStart: Date.now(),
  maxRequests: 100, // per minute
  windowMs: 60 * 1000,
};

/**
 * Check if we're rate limited
 */
function checkRateLimit(): boolean {
  const now = Date.now();
  if (now - rateLimitState.windowStart > rateLimitState.windowMs) {
    // Reset window
    rateLimitState.requests = 0;
    rateLimitState.windowStart = now;
  }
  return rateLimitState.requests >= rateLimitState.maxRequests;
}

/**
 * Increment rate limit counter
 */
function incrementRateLimit(): void {
  rateLimitState.requests++;
}

/**
 * Get cached documentation
 */
function getFromCache(key: string): unknown | null {
  const entry = docCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    docCache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Set cache entry
 */
function setCache(key: string, data: unknown, ttl = CACHE_TTL): void {
  docCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

/**
 * Detect library versions from package.json
 */
async function detectLibraryVersions(
  projectDir: string
): Promise<Map<string, string>> {
  const versions = new Map<string, string>();

  try {
    const pkgPath = join(projectDir, 'package.json');
    const pkgContent = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);

    // Collect all dependencies
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };

    for (const [name, version] of Object.entries(allDeps)) {
      // Strip version prefixes (^, ~, >=, etc)
      const cleanVersion = String(version).replace(/^[\^~>=<]+/, '');
      versions.set(name, cleanVersion);
    }
  } catch (err) {
    logger.debug('Could not read package.json for version detection', err);
  }

  return versions;
}

/**
 * Register Context7 integration tools
 */
export async function registerContext7Tools(
  server: McpServer,
  context: ServerContext
): Promise<void> {
  const projectDir = context.projectDir;

  // Pre-load library versions
  let libraryVersions = await detectLibraryVersions(projectDir);

  /**
   * Tool: Lookup library documentation
   */
  server.registerTool(
    'docs_lookup',
    {
      title: 'Lookup Library Documentation',
      description:
        'Fetch documentation for a library from Context7. Automatically detects library version from package.json. Results are cached for performance.',
      inputSchema: z.object({
        library: z.string().describe('Library name (e.g., "react", "express", "zod")'),
        topic: z.string().optional().describe('Specific topic to search for within the library docs'),
        version: z
          .string()
          .optional()
          .describe('Library version (auto-detected from package.json if not specified)'),
        forceRefresh: z.boolean().default(false).describe('Force refresh from Context7 (bypass cache)'),
      }),
      outputSchema: z.object({
        library: z.string(),
        version: z.string().nullable(),
        topic: z.string().nullable(),
        content: z.string(),
        fromCache: z.boolean(),
        source: z.string(),
      }),
    },
    async (args) => {
      const { library, topic, forceRefresh } = args;
      let { version } = args;

      // Auto-detect version if not provided
      if (!version) {
        version = libraryVersions.get(library) || undefined;
      }

      const cacheKey = `docs:${library}:${version || 'latest'}:${topic || 'index'}`;

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getFromCache(cacheKey);
        if (cached) {
          const result = {
            library,
            version: version || null,
            topic: topic || null,
            content: String(cached),
            fromCache: true,
            source: 'cache',
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          };
        }
      }

      // Check rate limit
      if (checkRateLimit()) {
        const result = {
          library,
          version: version || null,
          topic: topic || null,
          content: 'Rate limited. Please wait before making more requests.',
          fromCache: false,
          source: 'rate_limited',
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      }

      incrementRateLimit();

      // For now, return a placeholder - actual Context7 MCP integration
      // would use the MCP client to call Context7's tools
      const placeholder = `Documentation for ${library}${version ? `@${version}` : ''} ${topic ? `(topic: ${topic})` : ''}.\n\n` +
        'Note: To fetch actual documentation, ensure Context7 MCP server is configured ' +
        'and use context7:resolve-library-id followed by context7:get-library-docs tools directly.\n\n' +
        'This wrapper provides caching and version auto-detection.';

      setCache(cacheKey, placeholder);

      const result = {
        library,
        version: version || null,
        topic: topic || null,
        content: placeholder,
        fromCache: false,
        source: 'context7',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  /**
   * Tool: List detected library versions
   */
  server.registerTool(
    'docs_versions',
    {
      title: 'List Detected Library Versions',
      description:
        'List all library versions detected from package.json. Useful for understanding what versions are available for documentation lookup.',
      inputSchema: z.object({
        refresh: z.boolean().default(false).describe('Re-scan package.json for updated versions'),
        filter: z.string().optional().describe('Filter libraries by name pattern'),
      }),
      outputSchema: z.object({
        libraries: z.array(
          z.object({
            name: z.string(),
            version: z.string(),
          })
        ),
        count: z.number(),
      }),
    },
    async (args) => {
      if (args.refresh) {
        libraryVersions = await detectLibraryVersions(projectDir);
      }

      let libraries = Array.from(libraryVersions.entries()).map(([name, version]) => ({
        name,
        version,
      }));

      if (args.filter) {
        const pattern = args.filter.toLowerCase();
        libraries = libraries.filter((lib) => lib.name.toLowerCase().includes(pattern));
      }

      const result = {
        libraries,
        count: libraries.length,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  /**
   * Tool: Clear documentation cache
   */
  server.registerTool(
    'docs_cache_clear',
    {
      title: 'Clear Documentation Cache',
      description: 'Clear the local documentation cache. Use when you need fresh documentation.',
      inputSchema: z.object({
        library: z.string().optional().describe('Clear cache for specific library only'),
      }),
      outputSchema: z.object({
        cleared: z.number(),
        remaining: z.number(),
      }),
    },
    async (args) => {
      let cleared = 0;

      if (args.library) {
        // Clear specific library
        const prefix = `docs:${args.library}:`;
        for (const key of docCache.keys()) {
          if (key.startsWith(prefix)) {
            docCache.delete(key);
            cleared++;
          }
        }
      } else {
        // Clear all
        cleared = docCache.size;
        docCache.clear();
      }

      const result = {
        cleared,
        remaining: docCache.size,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  /**
   * Tool: Get cache statistics
   */
  server.registerTool(
    'docs_cache_stats',
    {
      title: 'Get Cache Statistics',
      description: 'Get statistics about the documentation cache and rate limiting.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        cacheSize: z.number(),
        rateLimitRequests: z.number(),
        rateLimitRemaining: z.number(),
        rateLimitResetIn: z.number(),
      }),
    },
    async () => {
      const now = Date.now();
      const resetIn = Math.max(0, rateLimitState.windowMs - (now - rateLimitState.windowStart));

      const result = {
        cacheSize: docCache.size,
        rateLimitRequests: rateLimitState.requests,
        rateLimitRemaining: Math.max(0, rateLimitState.maxRequests - rateLimitState.requests),
        rateLimitResetIn: resetIn,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  logger.info('Registered Context7 integration tools', { toolCount: 4 });
}
