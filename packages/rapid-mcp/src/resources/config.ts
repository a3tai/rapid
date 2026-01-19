/**
 * Config Resource
 *
 * Exposes rapid.json configuration as an MCP resource.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '@a3t/rapid-core';
import type { ServerContext } from '../server.js';

/**
 * Register the config resource with the MCP server
 */
export function registerConfigResource(server: McpServer, context: ServerContext): void {
  server.registerResource(
    'rapid-config',
    'rapid://config/current',
    {
      title: 'Current Project Config',
      description: 'RAPID configuration for the current project',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const loaded = await loadConfig(context.projectDir);

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(loaded?.config || {}, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: errorMessage }, null, 2),
            },
          ],
        };
      }
    }
  );
}
