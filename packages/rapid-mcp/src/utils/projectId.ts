/**
 * Project ID Detection Utility
 *
 * Provides consistent project identification across worktrees and directories.
 * Ensures all agents in the same RAPID project can discover each other.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Find the project root by searching for rapid.json upward from the given directory
 */
export async function findProjectRoot(startDir: string): Promise<string> {
  let currentDir = startDir;
  const maxDepth = 20; // Prevent infinite loops
  let depth = 0;

  while (depth < maxDepth) {
    const rapidJsonPath = join(currentDir, 'rapid.json');
    if (existsSync(rapidJsonPath)) {
      return currentDir;
    }

    const parentDir = join(currentDir, '..');
    if (parentDir === currentDir) {
      // Reached filesystem root without finding rapid.json
      break;
    }

    currentDir = parentDir;
    depth++;
  }

  // Fallback: return original directory
  return startDir;
}

/**
 * Derive a consistent project ID from a directory
 *
 * Strategy:
 * 1. Find the actual project root (directory containing rapid.json)
 * 2. Use the basename of the project root as the project ID
 * 3. This ensures all worktrees of the same project use the same ID
 */
export async function getProjectId(directory: string): Promise<string> {
  try {
    const projectRoot = await findProjectRoot(directory);
    const projectName = projectRoot.split('/').pop();
    return projectName || 'rapid-project';
  } catch {
    // Fallback to directory basename
    const fallbackName = directory.split('/').pop();
    return fallbackName || 'rapid-project';
  }
}
