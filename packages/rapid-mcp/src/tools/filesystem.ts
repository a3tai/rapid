/**
 * Filesystem Tools
 *
 * Scoped file operations restricted to the project directory.
 * Provides read_file and write_file tools with path validation.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('filesystem');

/**
 * Validate that a path is within the project directory
 */
function validatePath(projectDir: string, requestedPath: string): string {
  // Resolve the path relative to project directory
  const absolutePath = requestedPath.startsWith('/')
    ? requestedPath
    : resolve(projectDir, requestedPath);

  // Ensure the resolved path is within project directory
  const normalizedProject = resolve(projectDir);
  const normalizedPath = resolve(absolutePath);

  if (!normalizedPath.startsWith(normalizedProject)) {
    throw new Error(
      `Path "${requestedPath}" resolves outside project directory. ` +
        `Access is restricted to ${projectDir}`
    );
  }

  return normalizedPath;
}

/**
 * Guess MIME type from file extension
 */
function guessMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    // Text
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    xml: 'application/xml',
    html: 'text/html',
    css: 'text/css',
    csv: 'text/csv',

    // Code
    js: 'text/javascript',
    ts: 'text/typescript',
    jsx: 'text/javascript',
    tsx: 'text/typescript',
    py: 'text/x-python',
    rb: 'text/x-ruby',
    go: 'text/x-go',
    rs: 'text/x-rust',
    java: 'text/x-java',
    c: 'text/x-c',
    cpp: 'text/x-c++',
    h: 'text/x-c',
    sh: 'text/x-shellscript',

    // Config
    toml: 'text/toml',
    ini: 'text/plain',
    env: 'text/plain',

    // Images (base64)
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',

    // Other
    pdf: 'application/pdf',
    zip: 'application/zip',
  };

  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Register filesystem tools with the MCP server
 */
export function registerFilesystemTools(server: McpServer, context: ServerContext): void {
  // read_file tool
  server.registerTool(
    'read_file',
    {
      title: 'Read File',
      description:
        'Read a file from the project directory. ' +
        'Paths are relative to the project root. ' +
        'Access is restricted to files within the project directory.',
      inputSchema: {
        path: z.string().describe('Relative path within project'),
        encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
        maxSize: z
          .number()
          .default(1024 * 1024)
          .describe('Maximum file size in bytes (default 1MB)'),
      },
      outputSchema: {
        content: z.string(),
        size: z.number(),
        encoding: z.string(),
        mimeType: z.string().optional(),
        relativePath: z.string(),
      },
    },
    async (args) => {
      const {
        path: requestedPath,
        encoding,
        maxSize,
      } = args as {
        path: string;
        encoding: 'utf-8' | 'base64';
        maxSize: number;
      };

      try {
        const absolutePath = validatePath(context.projectDir, requestedPath);
        const relativePath = relative(context.projectDir, absolutePath);

        // Check file size first
        const stats = await stat(absolutePath);
        if (stats.size > maxSize) {
          throw new Error(`File size ${stats.size} bytes exceeds maximum ${maxSize} bytes`);
        }

        // Read file
        const buffer = await readFile(absolutePath);
        const content =
          encoding === 'base64' ? buffer.toString('base64') : buffer.toString('utf-8');

        const output = {
          content,
          size: stats.size,
          encoding,
          mimeType: guessMimeType(absolutePath),
          relativePath,
        };

        if (context.verbose) {
          logger.error(`[read_file] ${relativePath} (${stats.size} bytes)`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const output = {
          content: '',
          size: 0,
          encoding,
          error: errorMessage,
          relativePath: requestedPath,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    }
  );

  // write_file tool
  server.registerTool(
    'write_file',
    {
      title: 'Write File',
      description:
        'Write content to a file in the project directory. ' +
        'Paths are relative to the project root. ' +
        'Parent directories are created automatically. ' +
        'Access is restricted to files within the project directory.',
      inputSchema: {
        path: z.string().describe('Relative path within project'),
        content: z.string().describe('File content'),
        encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
        createDirs: z.boolean().default(true).describe('Create parent directories'),
      },
      outputSchema: {
        written: z.boolean(),
        path: z.string(),
        size: z.number(),
        relativePath: z.string(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const {
        path: requestedPath,
        content,
        encoding,
        createDirs,
      } = args as {
        path: string;
        content: string;
        encoding: 'utf-8' | 'base64';
        createDirs: boolean;
      };

      try {
        const absolutePath = validatePath(context.projectDir, requestedPath);
        const relativePath = relative(context.projectDir, absolutePath);

        // Create parent directories if needed
        if (createDirs) {
          await mkdir(dirname(absolutePath), { recursive: true });
        }

        // Write file
        const buffer =
          encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content);

        await writeFile(absolutePath, buffer);

        const output = {
          written: true,
          path: absolutePath,
          size: buffer.length,
          relativePath,
        };

        if (context.verbose) {
          logger.error(`[write_file] ${relativePath} (${buffer.length} bytes)`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const output = {
          written: false,
          path: requestedPath,
          size: 0,
          relativePath: requestedPath,
          error: errorMessage,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    }
  );

  // list_files tool
  server.registerTool(
    'list_files',
    {
      title: 'List Files',
      description:
        'List files in a directory within the project. ' +
        'Returns file names and basic metadata. ' +
        'Access is restricted to the project directory.',
      inputSchema: {
        path: z.string().default('.').describe('Relative directory path'),
        pattern: z.string().optional().describe('Glob pattern to filter files'),
        recursive: z.boolean().default(false).describe('Include subdirectories'),
        maxFiles: z.number().default(1000).describe('Maximum number of files to return'),
      },
      outputSchema: {
        files: z.array(
          z.object({
            name: z.string(),
            path: z.string(),
            type: z.enum(['file', 'directory']),
            size: z.number().optional(),
          })
        ),
        totalCount: z.number(),
        truncated: z.boolean(),
      },
    },
    async (args) => {
      const {
        path: requestedPath,
        recursive,
        maxFiles,
      } = args as {
        path: string;
        pattern?: string;
        recursive: boolean;
        maxFiles: number;
      };

      try {
        const absolutePath = validatePath(context.projectDir, requestedPath);
        const { readdir } = await import('node:fs/promises');

        const entries = await readdir(absolutePath, { withFileTypes: true });
        const files: Array<{
          name: string;
          path: string;
          type: 'file' | 'directory';
          size?: number;
        }> = [];

        for (const entry of entries) {
          if (files.length >= maxFiles) break;

          const entryPath = join(requestedPath, entry.name);
          const fileInfo: {
            name: string;
            path: string;
            type: 'file' | 'directory';
            size?: number;
          } = {
            name: entry.name,
            path: entryPath,
            type: entry.isDirectory() ? 'directory' : 'file',
          };

          if (entry.isFile()) {
            fileInfo.size = (await stat(join(absolutePath, entry.name))).size;
          }

          files.push(fileInfo);

          // Recursively list subdirectories
          if (recursive && entry.isDirectory() && files.length < maxFiles) {
            const subEntries = await readdir(join(absolutePath, entry.name), {
              withFileTypes: true,
            });
            for (const subEntry of subEntries) {
              if (files.length >= maxFiles) break;
              const subPath = join(entryPath, subEntry.name);
              const subFileInfo: {
                name: string;
                path: string;
                type: 'file' | 'directory';
                size?: number;
              } = {
                name: subEntry.name,
                path: subPath,
                type: subEntry.isDirectory() ? 'directory' : 'file',
              };

              if (subEntry.isFile()) {
                subFileInfo.size = (await stat(join(absolutePath, entry.name, subEntry.name))).size;
              }

              files.push(subFileInfo);
            }
          }
        }

        const output = {
          files,
          totalCount: files.length,
          truncated: files.length >= maxFiles,
        };

        if (context.verbose) {
          logger.error(`[list_files] ${requestedPath} (${files.length} entries)`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const output = {
          files: [],
          totalCount: 0,
          truncated: false,
          error: errorMessage,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    }
  );
}
