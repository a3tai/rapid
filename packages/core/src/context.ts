/**
 * Context file assembly for AI agents
 *
 * Reads and assembles context from files and directories specified in rapid.json,
 * then formats it for injection into agent system prompts.
 */

import { readFile, readdir, access, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { minimatch } from 'minimatch';
import type { ContextConfig } from './types.js';
import { logger } from './logger.js';

/** Default maximum size per file (100KB) */
const DEFAULT_MAX_FILE_SIZE = 100 * 1024;

/** Default maximum total size (500KB) */
const DEFAULT_MAX_TOTAL_SIZE = 500 * 1024;

/** File extensions considered binary */
const BINARY_EXTENSIONS = new Set([
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.tiff',
  '.tif',
  // Documents
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  // Archives
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.xz',
  // Executables
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.app',
  // Fonts
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  // Media
  '.mp3',
  '.mp4',
  '.wav',
  '.avi',
  '.mov',
  '.mkv',
  '.webm',
  '.ogg',
  '.flac',
  // Data
  '.db',
  '.sqlite',
  '.sqlite3',
  // Compiled
  '.wasm',
  '.pyc',
  '.pyo',
  '.class',
  '.o',
  '.obj',
  // Lock files (often binary-ish)
  '.lock',
  // Package manager
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

/**
 * Result of reading a context file
 */
export interface ContextFileResult {
  path: string;
  relativePath: string;
  content: string;
  size: number;
  truncated: boolean;
}

/**
 * Information about a skipped file
 */
export interface SkippedFile {
  path: string;
  reason: 'missing' | 'binary' | 'too-large' | 'excluded' | 'directory' | 'error';
  error?: string;
}

/**
 * Result of assembling all context files
 */
export interface AssembledContext {
  files: ContextFileResult[];
  totalSize: number;
  skippedFiles: SkippedFile[];
  content: string;
}

/**
 * Options for context assembly
 */
export interface ContextAssemblyOptions {
  /** Maximum size per file in bytes (default: 100KB) */
  maxFileSize?: number;
  /** Maximum total size in bytes (default: 500KB) */
  maxTotalSize?: number;
  /** Whether to include file headers with paths (default: true) */
  includeHeaders?: boolean;
  /** File extensions to treat as binary (in addition to built-in list) */
  binaryExtensions?: string[];
}

/**
 * Check if a file path matches any exclude patterns
 */
export function matchesExcludePattern(
  relativePath: string,
  excludePatterns: string[]
): boolean {
  for (const pattern of excludePatterns) {
    if (minimatch(relativePath, pattern, { dot: true })) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a file is likely binary based on extension
 */
export function isBinaryFile(filepath: string, additionalExtensions?: string[]): boolean {
  const ext = extname(filepath).toLowerCase();
  const filename = filepath.split('/').pop() ?? '';

  // Check extension
  if (BINARY_EXTENSIONS.has(ext)) {
    return true;
  }

  // Check full filename (for things like package-lock.json)
  if (BINARY_EXTENSIONS.has(filename)) {
    return true;
  }

  // Check additional extensions
  if (additionalExtensions) {
    for (const addExt of additionalExtensions) {
      if (ext === addExt || filename === addExt) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Read a single context file with safety checks
 */
export async function readContextFile(
  filepath: string,
  rootDir: string,
  options: ContextAssemblyOptions = {}
): Promise<ContextFileResult | SkippedFile> {
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const absolutePath = filepath.startsWith('/') ? filepath : join(rootDir, filepath);
  const relativePath = relative(rootDir, absolutePath);

  try {
    // Check if file exists
    await access(absolutePath);

    // Check if it's a directory
    const stats = await stat(absolutePath);
    if (stats.isDirectory()) {
      return { path: absolutePath, reason: 'directory' };
    }

    // Check file size
    if (stats.size > maxFileSize) {
      logger.debug(`Skipping ${relativePath}: exceeds max file size (${stats.size} > ${maxFileSize})`);
      return { path: absolutePath, reason: 'too-large' };
    }

    // Check if binary by extension
    if (isBinaryFile(absolutePath, options.binaryExtensions)) {
      logger.debug(`Skipping ${relativePath}: binary file extension`);
      return { path: absolutePath, reason: 'binary' };
    }

    // Read file content
    const content = await readFile(absolutePath, 'utf-8');

    // Additional binary check via content (null bytes indicate binary)
    if (content.includes('\0')) {
      logger.debug(`Skipping ${relativePath}: contains null bytes`);
      return { path: absolutePath, reason: 'binary' };
    }

    return {
      path: absolutePath,
      relativePath,
      content,
      size: stats.size,
      truncated: false,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug(`Skipping ${relativePath}: file not found`);
      return { path: absolutePath, reason: 'missing' };
    }
    logger.debug(`Skipping ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    return {
      path: absolutePath,
      reason: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Recursively read files from a directory
 */
export async function readContextDirectory(
  dirPath: string,
  rootDir: string,
  excludePatterns: string[],
  options: ContextAssemblyOptions = {}
): Promise<{ files: ContextFileResult[]; skipped: SkippedFile[] }> {
  const files: ContextFileResult[] = [];
  const skipped: SkippedFile[] = [];
  const absolutePath = dirPath.startsWith('/') ? dirPath : join(rootDir, dirPath);

  try {
    await access(absolutePath);
    const stats = await stat(absolutePath);

    if (!stats.isDirectory()) {
      // It's a file, not a directory - read it directly
      const result = await readContextFile(absolutePath, rootDir, options);
      if ('content' in result) {
        files.push(result);
      } else {
        skipped.push(result);
      }
      return { files, skipped };
    }

    const entries = await readdir(absolutePath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(absolutePath, entry.name);
      const relativePath = relative(rootDir, entryPath);

      // Check exclude patterns
      if (matchesExcludePattern(relativePath, excludePatterns)) {
        skipped.push({ path: entryPath, reason: 'excluded' });
        continue;
      }

      if (entry.isDirectory()) {
        // Recurse into subdirectory
        const subResult = await readContextDirectory(entryPath, rootDir, excludePatterns, options);
        files.push(...subResult.files);
        skipped.push(...subResult.skipped);
      } else if (entry.isFile()) {
        const result = await readContextFile(entryPath, rootDir, options);
        if ('content' in result) {
          files.push(result);
        } else {
          skipped.push(result);
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug(`Directory not found: ${absolutePath}`);
    } else {
      logger.debug(`Error reading directory ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { files, skipped };
}

/**
 * Assemble all context files from configuration
 */
export async function assembleContext(
  rootDir: string,
  config: ContextConfig,
  options: ContextAssemblyOptions = {}
): Promise<AssembledContext> {
  const maxTotalSize = options.maxTotalSize ?? DEFAULT_MAX_TOTAL_SIZE;
  const excludePatterns = config.exclude ?? [];

  const allFiles: ContextFileResult[] = [];
  const skippedFiles: SkippedFile[] = [];
  let totalSize = 0;

  // Process explicit files first
  if (config.files && config.files.length > 0) {
    for (const filePath of config.files) {
      const relativePath = filePath;

      // Check exclude patterns
      if (matchesExcludePattern(relativePath, excludePatterns)) {
        skippedFiles.push({ path: filePath, reason: 'excluded' });
        continue;
      }

      const result = await readContextFile(filePath, rootDir, options);

      if ('content' in result) {
        // Check total size limit
        if (totalSize + result.size > maxTotalSize) {
          logger.debug(`Skipping ${filePath}: would exceed total size limit`);
          skippedFiles.push({ path: filePath, reason: 'too-large' });
          continue;
        }
        totalSize += result.size;
        allFiles.push(result);
      } else {
        skippedFiles.push(result);
      }
    }
  }

  // Process directories
  if (config.dirs && config.dirs.length > 0) {
    for (const dirPath of config.dirs) {
      const { files, skipped } = await readContextDirectory(dirPath, rootDir, excludePatterns, options);

      for (const file of files) {
        // Check total size limit
        if (totalSize + file.size > maxTotalSize) {
          logger.debug(`Skipping ${file.relativePath}: would exceed total size limit`);
          skippedFiles.push({ path: file.path, reason: 'too-large' });
          continue;
        }
        totalSize += file.size;
        allFiles.push(file);
      }

      skippedFiles.push(...skipped);
    }
  }

  const content = formatContextContent(allFiles, options);

  return {
    files: allFiles,
    totalSize,
    skippedFiles,
    content,
  };
}

/**
 * Format assembled context as a string for injection
 */
export function formatContextContent(
  files: ContextFileResult[],
  options: { includeHeaders?: boolean } = {}
): string {
  const includeHeaders = options.includeHeaders ?? true;

  if (files.length === 0) {
    return '';
  }

  const sections: string[] = [
    '## Project Context Files',
    '',
    'The following files provide additional context about the project:',
    '',
  ];

  for (const file of files) {
    if (includeHeaders) {
      sections.push(`### ${file.relativePath}`);
      sections.push('```');
      sections.push(file.content.trim());
      sections.push('```');
      sections.push('');
    } else {
      sections.push(file.content.trim());
      sections.push('');
    }
  }

  return sections.join('\n');
}
