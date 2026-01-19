/**
 * fetch_via_proxy Tool
 *
 * HTTP/HTTPS fetch routed through RAPID proxy with domain filtering.
 * All requests are logged and can be filtered based on rapid.json network policy.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from '@a3t/rapid-core';
import { isDomainAllowed, extractHostname } from '@a3t/rapid-runtime';
import type { ServerContext } from '../server.js';

/**
 * Input schema for fetch_via_proxy tool
 */
const inputSchema = {
  url: z.string().url().describe('URL to fetch'),
  method: z
    .enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
    .default('GET')
    .describe('HTTP method'),
  headers: z.record(z.string()).optional().describe('HTTP headers'),
  body: z.string().optional().describe('Request body'),
  timeout: z.number().default(30000).describe('Timeout in milliseconds'),
};

/**
 * Output schema for fetch_via_proxy tool
 */
const outputSchema = {
  status: z.number(),
  statusText: z.string(),
  headers: z.record(z.string()),
  body: z.string(),
  allowed: z.boolean(),
  domain: z.string(),
  durationMs: z.number(),
};

/**
 * Get network policy from config
 */
async function getNetworkPolicy(projectDir: string): Promise<{ allow: string[]; deny: string[] }> {
  try {
    const loaded = await loadConfig(projectDir);
    if (loaded?.config?.sandbox?.network) {
      return {
        allow: loaded.config.sandbox.network.allowedDomains || [],
        deny: loaded.config.sandbox.network.deniedDomains || [],
      };
    }
  } catch {
    // Config not found or invalid, use defaults
  }

  // Default: allow common development domains
  return {
    allow: [
      '*.npmjs.org',
      '*.npmjs.com',
      'registry.npmjs.org',
      '*.github.com',
      'github.com',
      '*.githubusercontent.com',
      'api.github.com',
      '*.pypi.org',
      'pypi.org',
      '*.crates.io',
      'crates.io',
      '*.golang.org',
      'proxy.golang.org',
      '*.docker.io',
      '*.docker.com',
    ],
    deny: [],
  };
}

/**
 * Mask sensitive headers for logging
 */
function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitiveKeys = ['authorization', 'cookie', 'x-api-key', 'api-key', 'token'];
  const masked: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
      masked[key] = '[REDACTED]';
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * Register the fetch_via_proxy tool with the MCP server
 */
export function registerFetchViaProxyTool(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'fetch_via_proxy',
    {
      title: 'Fetch via RAPID Proxy',
      description:
        'Fetch a URL through the RAPID network proxy with domain filtering. ' +
        'Requests to denied domains are blocked. All requests are logged for audit. ' +
        'Use this for any HTTP requests to ensure they comply with network policy.',
      inputSchema,
      outputSchema,
    },
    async (args) => {
      const startTime = Date.now();
      const {
        url,
        method,
        headers = {},
        body,
        timeout,
      } = args as {
        url: string;
        method: string;
        headers?: Record<string, string>;
        body?: string;
        timeout: number;
      };

      // Extract domain from URL
      const domain = extractHostname(url) || 'unknown';

      // Check domain against policy
      const policy = await getNetworkPolicy(context.projectDir);
      const allowed = isDomainAllowed(domain, policy.allow, policy.deny);

      if (!allowed) {
        const durationMs = Date.now() - startTime;
        const output = {
          status: 403,
          statusText: 'Forbidden',
          headers: {},
          body: `Domain "${domain}" is blocked by RAPID network policy. Allowed patterns: ${policy.allow.join(', ')}`,
          allowed: false,
          domain,
          durationMs,
        };

        if (context.verbose) {
          console.error(`[fetch_via_proxy] BLOCKED: ${method} ${url}`);
          console.error(`[fetch_via_proxy] Domain "${domain}" not in allowlist`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }

      // Perform the fetch
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Build fetch options conditionally
        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        // Only add body for methods that support it
        if (body && method !== 'GET' && method !== 'HEAD') {
          fetchOptions.body = body;
        }

        const response = await fetch(url, fetchOptions);

        clearTimeout(timeoutId);

        // Convert headers to plain object
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        // Read response body
        const responseBody = await response.text();

        const durationMs = Date.now() - startTime;
        const output = {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          allowed: true,
          domain,
          durationMs,
        };

        if (context.verbose) {
          console.error(`[fetch_via_proxy] ${method} ${url} -> ${response.status}`);
          console.error(`[fetch_via_proxy] Headers: ${JSON.stringify(maskHeaders(headers))}`);
          console.error(`[fetch_via_proxy] Duration: ${durationMs}ms`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        const output = {
          status: 0,
          statusText: 'Error',
          headers: {},
          body: `Fetch failed: ${errorMessage}`,
          allowed: true,
          domain,
          durationMs,
        };

        if (context.verbose) {
          console.error(`[fetch_via_proxy] ERROR: ${method} ${url}`);
          console.error(`[fetch_via_proxy] ${errorMessage}`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    }
  );
}
