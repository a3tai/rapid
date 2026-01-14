/**
 * Git worktree utilities for RAPID
 *
 * Manages git worktrees for isolated development on feature branches.
 * When on a feature branch, rapid dev can create a sibling worktree
 * to keep the main directory clean.
 */

import { execa, type ExecaError } from 'execa';
import { access } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * Get error message from execa error
 */
function getErrorMessage(err: ExecaError): string {
  if (typeof err.stderr === 'string' && err.stderr) {
    return err.stderr;
  }
  return err.message;
}

/**
 * Information about a git worktree
 */
export interface WorktreeInfo {
  /** Absolute path to the worktree directory */
  path: string;
  /** Git commit hash HEAD points to */
  head: string;
  /** Branch name (null if detached) */
  branch: string | null;
  /** Whether this is the main worktree */
  isMain: boolean;
  /** Whether the worktree is locked */
  locked: boolean;
  /** Whether the worktree directory exists */
  exists: boolean;
  /** Whether this worktree is prunable (stale) */
  prunable: boolean;
}

/**
 * Result of git branch detection
 */
export interface BranchInfo {
  /** Current branch name (null if detached HEAD) */
  name: string | null;
  /** Whether on main/master branch */
  isDefault: boolean;
  /** Whether HEAD is detached */
  detached: boolean;
}

/**
 * Options for creating a worktree
 */
export interface CreateWorktreeOptions {
  /** Force creation even if worktree exists */
  force?: boolean;
  /** Create a new branch with this name */
  newBranch?: string;
  /** Start point for new branch (default: HEAD) */
  startPoint?: string;
}

/**
 * Check if current directory is inside a git repository
 */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--git-dir'], { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root directory of the git repository
 */
export async function getGitRoot(dir: string): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd: dir });
  return stdout.trim();
}

/**
 * Get the current branch information
 */
export async function getCurrentBranch(dir: string): Promise<BranchInfo> {
  try {
    // Check if HEAD is detached
    const { stdout: symbolicRef } = await execa('git', ['symbolic-ref', '-q', 'HEAD'], {
      cwd: dir,
      reject: false,
    });

    if (!symbolicRef) {
      return { name: null, isDefault: false, detached: true };
    }

    const branchName = symbolicRef.trim().replace('refs/heads/', '');
    const isDefault = branchName === 'main' || branchName === 'master';

    return { name: branchName, isDefault, detached: false };
  } catch {
    return { name: null, isDefault: false, detached: true };
  }
}

/**
 * Get the default branch name (main or master)
 */
export async function getDefaultBranch(dir: string): Promise<string> {
  try {
    // Try to get from remote
    const { stdout } = await execa('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], {
      cwd: dir,
      reject: false,
    });

    if (stdout) {
      return stdout.trim().replace('origin/', '');
    }

    // Fall back to checking if main or master exists
    const { stdout: branches } = await execa('git', ['branch', '--list', 'main', 'master'], {
      cwd: dir,
    });

    if (branches.includes('main')) return 'main';
    if (branches.includes('master')) return 'master';

    return 'main'; // Default
  } catch {
    return 'main';
  }
}

/**
 * List all worktrees in the repository
 */
export async function listWorktrees(dir: string): Promise<WorktreeInfo[]> {
  const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], { cwd: dir });

  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> = {};

  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) {
        worktrees.push(current as WorktreeInfo);
      }
      current = {
        path: line.substring(9),
        isMain: false,
        locked: false,
        exists: true,
        prunable: false,
      };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.substring(5);
    } else if (line.startsWith('branch ')) {
      current.branch = line.substring(7).replace('refs/heads/', '');
    } else if (line === 'bare') {
      current.isMain = true;
    } else if (line === 'locked') {
      current.locked = true;
    } else if (line === 'prunable') {
      current.prunable = true;
      current.exists = false;
    } else if (line === 'detached') {
      current.branch = null;
    }
  }

  if (current.path) {
    worktrees.push(current as WorktreeInfo);
  }

  // Mark the first worktree as main (it's the original clone)
  if (worktrees.length > 0 && worktrees[0]) {
    worktrees[0].isMain = true;
  }

  // Check existence for each worktree
  for (const wt of worktrees) {
    try {
      await access(wt.path);
      wt.exists = true;
    } catch {
      wt.exists = false;
      wt.prunable = true;
    }
  }

  return worktrees;
}

/**
 * Find a worktree by branch name
 */
export async function findWorktreeByBranch(
  dir: string,
  branch: string
): Promise<WorktreeInfo | null> {
  const worktrees = await listWorktrees(dir);
  return worktrees.find((wt) => wt.branch === branch) ?? null;
}

/**
 * Generate a worktree path for a branch
 *
 * Creates paths like: ../project-feat-my-feature/
 * For branch: feat/my-feature in project: /path/to/project
 */
export function generateWorktreePath(repoRoot: string, branchName: string): string {
  const projectName = basename(repoRoot);
  const parentDir = dirname(repoRoot);

  // Sanitize branch name for filesystem
  const safeBranchName = branchName
    .replace(/\//g, '-') // Replace slashes with dashes
    .replace(/[^a-zA-Z0-9-_]/g, '') // Remove special chars
    .toLowerCase();

  return join(parentDir, `${projectName}-${safeBranchName}`);
}

/**
 * Create a new worktree for a branch
 */
export async function createWorktree(
  repoRoot: string,
  worktreePath: string,
  branch: string,
  options: CreateWorktreeOptions = {}
): Promise<{ success: boolean; path: string; error?: string }> {
  try {
    // Check if worktree already exists at this path
    const existing = await listWorktrees(repoRoot);
    const existingAtPath = existing.find((wt) => resolve(wt.path) === resolve(worktreePath));

    if (existingAtPath && existingAtPath.exists && !options.force) {
      return { success: true, path: worktreePath }; // Already exists
    }

    // If path exists but is stale, remove it first
    if (existingAtPath && !existingAtPath.exists) {
      await execa('git', ['worktree', 'remove', '--force', worktreePath], {
        cwd: repoRoot,
        reject: false,
      });
    }

    // Build worktree add command
    const args = ['worktree', 'add'];

    if (options.force) {
      args.push('--force');
    }

    if (options.newBranch) {
      args.push('-b', options.newBranch);
    }

    args.push(worktreePath);

    if (!options.newBranch) {
      args.push(branch);
    } else if (options.startPoint) {
      args.push(options.startPoint);
    }

    await execa('git', args, { cwd: repoRoot });

    return { success: true, path: worktreePath };
  } catch (err) {
    const error = err as ExecaError;
    return {
      success: false,
      path: worktreePath,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Remove a worktree
 */
export async function removeWorktree(
  repoRoot: string,
  worktreePath: string,
  options: { force?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const args = ['worktree', 'remove'];
    if (options.force) {
      args.push('--force');
    }
    args.push(worktreePath);

    await execa('git', args, { cwd: repoRoot });
    return { success: true };
  } catch (err) {
    const error = err as ExecaError;
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Prune stale worktrees (those whose directories no longer exist)
 */
export async function pruneWorktrees(repoRoot: string): Promise<{
  success: boolean;
  pruned: string[];
  error?: string;
}> {
  try {
    // Get list of prunable worktrees first
    const worktrees = await listWorktrees(repoRoot);
    const prunable = worktrees.filter((wt) => wt.prunable).map((wt) => wt.path);

    // Run git worktree prune
    await execa('git', ['worktree', 'prune'], { cwd: repoRoot });

    return { success: true, pruned: prunable };
  } catch (err) {
    const error = err as ExecaError;
    return {
      success: false,
      pruned: [],
      error: getErrorMessage(error),
    };
  }
}

/**
 * Lock a worktree to prevent accidental removal
 */
export async function lockWorktree(
  repoRoot: string,
  worktreePath: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const args = ['worktree', 'lock'];
    if (reason) {
      args.push('--reason', reason);
    }
    args.push(worktreePath);

    await execa('git', args, { cwd: repoRoot });
    return { success: true };
  } catch (err) {
    const error = err as ExecaError;
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Unlock a worktree
 */
export async function unlockWorktree(
  repoRoot: string,
  worktreePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await execa('git', ['worktree', 'unlock', worktreePath], { cwd: repoRoot });
    return { success: true };
  } catch (err) {
    const error = err as ExecaError;
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Get or create a worktree for the current branch
 *
 * - If on main/master, returns the current directory
 * - If on a feature branch, creates/returns a sibling worktree
 */
export async function getOrCreateWorktreeForBranch(
  dir: string
): Promise<{ path: string; created: boolean; isMain: boolean }> {
  const gitRoot = await getGitRoot(dir);
  const branch = await getCurrentBranch(dir);

  // If on default branch or detached, use current directory
  if (branch.isDefault || branch.detached || !branch.name) {
    return { path: gitRoot, created: false, isMain: true };
  }

  // Check if a worktree already exists for this branch
  const existing = await findWorktreeByBranch(gitRoot, branch.name);
  if (existing && existing.exists) {
    return { path: existing.path, created: false, isMain: existing.isMain };
  }

  // Create a new worktree
  const worktreePath = generateWorktreePath(gitRoot, branch.name);
  const result = await createWorktree(gitRoot, worktreePath, branch.name);

  if (!result.success) {
    // Fall back to current directory if worktree creation fails
    return { path: gitRoot, created: false, isMain: true };
  }

  return { path: worktreePath, created: true, isMain: false };
}

/**
 * Clean up worktrees for merged branches
 */
export async function cleanupMergedWorktrees(
  repoRoot: string
): Promise<{ removed: string[]; errors: string[] }> {
  const removed: string[] = [];
  const errors: string[] = [];

  // Get default branch
  const defaultBranch = await getDefaultBranch(repoRoot);

  // Get list of merged branches
  const { stdout } = await execa('git', ['branch', '--merged', defaultBranch], { cwd: repoRoot });
  const mergedBranches = stdout
    .split('\n')
    .map((b: string) => b.trim().replace(/^\*\s*/, ''))
    .filter((b: string) => b && b !== defaultBranch);

  // Get worktrees
  const worktrees = await listWorktrees(repoRoot);

  // Remove worktrees for merged branches
  for (const wt of worktrees) {
    if (wt.isMain || !wt.branch) continue;

    if (mergedBranches.includes(wt.branch)) {
      const result = await removeWorktree(repoRoot, wt.path, { force: true });
      if (result.success) {
        removed.push(wt.path);
      } else if (result.error) {
        errors.push(`${wt.path}: ${result.error}`);
      }
    }
  }

  return { removed, errors };
}
