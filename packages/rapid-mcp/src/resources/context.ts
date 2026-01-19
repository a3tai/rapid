/**
 * Context Resource
 *
 * Exposes assembled context (AGENTS.md, CLAUDE.md, etc.) as an MCP resource.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { assembleContext, loadConfig } from '@a3t/rapid-core';
import type { ServerContext } from '../server.js';

/**
 * Register the context resource with the MCP server
 */
export function registerContextResource(server: McpServer, context: ServerContext): void {
  server.registerResource(
    'rapid-context',
    'rapid://context/assembled',
    {
      title: 'Assembled Context',
      description:
        'Combined context from AGENTS.md, CLAUDE.md, and other instruction files. ' +
        'This is injected into agent prompts for project-specific guidance.',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      try {
        const loaded = await loadConfig(context.projectDir);
        const contextConfig = loaded?.config?.context ?? { files: [] };
        const assembled = await assembleContext(context.projectDir, contextConfig);

        const content =
          assembled?.content || '# No Context Found\n\nNo instruction files found in project.';

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: content,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: `# Error Loading Context\n\n${errorMessage}`,
            },
          ],
        };
      }
    }
  );
}
