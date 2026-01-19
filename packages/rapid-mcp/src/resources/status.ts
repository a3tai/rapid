/**
 * Status Resource
 *
 * Exposes daemon and sandbox status as an MCP resource.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isDaemonRunning, getDaemonPid } from '@a3t/rapid-daemon';
import { detectSandboxMethod, hasSeatbelt, hasBubblewrap } from '@a3t/rapid-runtime';
import type { ServerContext } from '../server.js';

/**
 * Register the status resource with the MCP server
 */
export function registerStatusResource(server: McpServer, context: ServerContext): void {
  server.registerResource(
    'rapid-status-daemon',
    'rapid://status/daemon',
    {
      title: 'Daemon Status',
      description: 'Status of the RAPID daemon including session count and uptime',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const running = await isDaemonRunning();
        const pid = running ? await getDaemonPid() : undefined;

        const status = {
          running,
          pid,
          socketPath: '~/.rapid/rapid.sock',
          version: '0.1.0',
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(status, null, 2),
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
              text: JSON.stringify(
                {
                  running: false,
                  error: errorMessage,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  server.registerResource(
    'rapid-status-sandbox',
    'rapid://status/sandbox',
    {
      title: 'Sandbox Status',
      description: 'Available sandbox methods and capabilities on this system',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const platform = process.platform;
        const method = await detectSandboxMethod();

        const status = {
          platform,
          method,
          capabilities: {
            seatbelt: platform === 'darwin' ? await hasSeatbelt() : false,
            bubblewrap: platform === 'linux' ? await hasBubblewrap() : false,
            networkNamespaces: platform === 'linux',
          },
          projectDir: context.projectDir,
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(status, null, 2),
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
              text: JSON.stringify(
                {
                  error: errorMessage,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  server.registerResource(
    'rapid-status-project',
    'rapid://status/project',
    {
      title: 'Project Status',
      description: 'Current project directory and RAPID configuration status',
      mimeType: 'application/json',
    },
    async (uri) => {
      const { stat } = await import('node:fs/promises');
      const { join } = await import('node:path');

      let hasRapidJson = false;
      let hasAgentsMd = false;
      let hasClaudeMd = false;
      let hasMcpJson = false;

      try {
        await stat(join(context.projectDir, 'rapid.json'));
        hasRapidJson = true;
      } catch {
        // File doesn't exist
      }

      try {
        await stat(join(context.projectDir, 'AGENTS.md'));
        hasAgentsMd = true;
      } catch {
        // File doesn't exist
      }

      try {
        await stat(join(context.projectDir, 'CLAUDE.md'));
        hasClaudeMd = true;
      } catch {
        // File doesn't exist
      }

      try {
        await stat(join(context.projectDir, '.mcp.json'));
        hasMcpJson = true;
      } catch {
        // File doesn't exist
      }

      const status = {
        projectDir: context.projectDir,
        files: {
          'rapid.json': hasRapidJson,
          'AGENTS.md': hasAgentsMd,
          'CLAUDE.md': hasClaudeMd,
          '.mcp.json': hasMcpJson,
        },
        configured: hasRapidJson,
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
  );
}
