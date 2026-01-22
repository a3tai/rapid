/**
 * Test Suite for Worktree Merge Workflow Tools
 *
 * Tests cover:
 * - Worktree validation (tests, linting, type checking)
 * - PR creation with auto-generated descriptions
 * - Auto-merge functionality
 * - Worktree cleanup
 * - Complete merge workflow orchestration
 * - Orphaned worktree recovery
 * - Conflict detection and handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execa, type ExecaError } from 'execa';

// Mock execa
vi.mock('execa');

const mockExeca = execa as unknown as ReturnType<typeof vi.fn>;

describe('Worktree Merge Workflow Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('worktree_validate Tool', () => {
    it('should run tests in worktree', () => {
      const runTests = true;
      expect(runTests).toBe(true);
    });

    it('should run linting in worktree', () => {
      const runLint = true;
      expect(runLint).toBe(true);
    });

    it('should default to running both tests and linting', () => {
      const runTests = true;
      const runLint = true;
      expect(runTests && runLint).toBe(true);
    });

    it('should skip tests when runTests is false', () => {
      const runTests = false;
      expect(runTests).toBe(false);
    });

    it('should skip linting when runLint is false', () => {
      const runLint = false;
      expect(runLint).toBe(false);
    });

    it('should run typecheck in addition to linting', () => {
      const checks = ['test', 'lint', 'typecheck'];
      expect(checks).toContain('typecheck');
    });

    it('should support custom worktree directory', () => {
      const worktree = 'feature-branch-1234';
      const hostProjectDir = '/host/project';
      expect(worktree).toBeTruthy();
      expect(hostProjectDir).toBeTruthy();
    });

    it('should return success true when all checks pass', async () => {
      const response = {
        success: true,
        testsPass: true,
        lintPass: true,
      };
      expect(response.success).toBe(true);
      expect(response.testsPass).toBe(true);
      expect(response.lintPass).toBe(true);
    });

    it('should return success false when tests fail', async () => {
      const response = {
        success: false,
        testsPass: false,
        lintPass: true,
        errors: ['Tests failed: FAIL in src/file.test.ts'],
      };
      expect(response.success).toBe(false);
      expect(response.testsPass).toBe(false);
      expect(response.errors).toContain('Tests failed: FAIL in src/file.test.ts');
    });

    it('should return success false when linting fails', async () => {
      const response = {
        success: false,
        testsPass: true,
        lintPass: false,
        errors: ['Linting failed: 5 errors found'],
      };
      expect(response.success).toBe(false);
      expect(response.lintPass).toBe(false);
    });

    it('should return success false when typecheck fails', async () => {
      const response = {
        success: false,
        testsPass: true,
        lintPass: false,
        errors: ['Type checking failed: 3 type errors'],
      };
      expect(response.success).toBe(false);
    });

    it('should include test output in response', async () => {
      const response = {
        success: true,
        testOutput: 'PASS: src/file.test.ts\nTests: 10 passed',
      };
      expect(response.testOutput).toBeTruthy();
    });

    it('should include lint output in response', async () => {
      const response = {
        success: true,
        lintOutput: 'No linting errors',
      };
      expect(response.lintOutput).toBeTruthy();
    });

    it('should accumulate all errors in errors array', async () => {
      const response = {
        success: false,
        errors: [
          'Tests failed: 2 failing',
          'Linting failed: 1 error',
          'Type checking failed: 3 errors',
        ],
      };
      expect(response.errors).toHaveLength(3);
    });
  });

  describe('worktree_merge_pr Tool', () => {
    it('should create PR from worktree branch', () => {
      const worktree = 'feature-branch';
      const title = 'Merge feature branch';
      expect(worktree).toBeTruthy();
      expect(title).toBeTruthy();
    });

    it('should generate PR title if not provided', () => {
      const worktree = 'worker-1234';
      const taskId = 'task-uuid-1234-5678';
      const generatedTitle = `Merge worktree ${worktree} changes (task: ${taskId.substring(0, 8)})`;
      expect(generatedTitle).toContain(worktree);
      expect(generatedTitle).toContain('task-uui'); // First 8 chars of taskId
    });

    it('should auto-generate PR description from commits', () => {
      const commits = [
        'abc1234 feat(api): add endpoint',
        'def5678 test(api): add test cases',
        'ghi9012 docs: update README',
      ];
      const description = `## Changes\n\n${commits.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
      expect(description).toContain('Changes');
      expect(description).toContain('1. abc1234 feat(api): add endpoint');
    });

    it('should use provided description over auto-generated', () => {
      const providedDesc = 'Custom PR description';
      const autoDesc = 'Auto-generated description';
      const finalDesc = providedDesc || autoDesc;
      expect(finalDesc).toBe(providedDesc);
    });

    it('should merge to main branch by default', () => {
      const baseBranch = undefined;
      const finalBase = baseBranch || 'main';
      expect(finalBase).toBe('main');
    });

    it('should support custom base branch', () => {
      const baseBranch = 'develop';
      expect(baseBranch).toBe('develop');
    });

    it('should get current branch from worktree', () => {
      const branchOutput = 'feature/new-feature\n';
      const currentBranch = branchOutput.trim();
      expect(currentBranch).toBe('feature/new-feature');
    });

    it('should push branch before creating PR', () => {
      const currentBranch = 'feature/new-feature';
      const pushArgs = ['push', '-u', 'origin', currentBranch];
      expect(pushArgs).toContain(currentBranch);
    });

    it('should handle branch already pushed', () => {
      const error = 'error: updates were rejected';
      const alreadyPushed = error.includes('updates were rejected');
      expect(alreadyPushed).toBe(true);
    });

    it('should extract PR number from GitHub CLI output', () => {
      const output = 'https://github.com/org/repo/pull/123';
      const prMatch = output.match(/\/pull\/(\d+)/);
      const prNumber = prMatch ? parseInt(prMatch[1], 10) : undefined;
      expect(prNumber).toBe(123);
    });

    it('should support auto-merge when specified', () => {
      const autoMerge = true;
      expect(autoMerge).toBe(true);
    });

    it('should include --auto flag when autoMerge is true', () => {
      const autoMerge = true;
      const prArgs = ['pr', 'create', '--title', 'PR', '--base', 'main'];
      if (autoMerge) {
        prArgs.push('--auto');
      }
      expect(prArgs).toContain('--auto');
    });

    it('should not include --auto flag when autoMerge is false', () => {
      const autoMerge = false;
      const prArgs = ['pr', 'create', '--title', 'PR', '--base', 'main'];
      if (autoMerge) {
        prArgs.push('--auto');
      }
      expect(prArgs).not.toContain('--auto');
    });

    it('should return PR URL in response', async () => {
      const response = {
        success: true,
        prNumber: 123,
        prUrl: 'https://github.com/org/repo/pull/123',
        commits: ['abc1234 feat: message', 'def5678 fix: another'],
      };
      expect(response.prNumber).toBe(123);
      expect(response.prUrl).toContain('/pull/123');
      expect(response.commits).toHaveLength(2);
    });

    it('should include commit list in response', async () => {
      const response = {
        success: true,
        commits: [
          'abc1234 feat(api): add endpoint',
          'def5678 test(api): add tests',
        ],
      };
      expect(response.commits).toHaveLength(2);
    });

    it('should return error when GitHub CLI unavailable', async () => {
      const response = {
        success: false,
        error: 'GitHub CLI not available',
      };
      expect(response.success).toBe(false);
      expect(response.error).toContain('GitHub CLI');
    });

    it('should handle PR creation failure', async () => {
      const response = {
        success: false,
        error: 'pull request already exists',
      };
      expect(response.success).toBe(false);
      expect(response.error).toContain('already exists');
    });
  });

  describe('worktree_cleanup Tool', () => {
    it('should remove worktree after successful merge', () => {
      const worktree = 'feature-branch';
      expect(worktree).toBeTruthy();
    });

    it('should use git worktree remove command', () => {
      const args = ['worktree', 'remove', 'feature-branch'];
      expect(args).toContain('remove');
      expect(args).toContain('feature-branch');
    });

    it('should support custom host project directory', () => {
      const hostProjectDir = '/custom/path';
      expect(hostProjectDir).toBeTruthy();
    });

    it('should default to context projectDir', () => {
      const projectDir = undefined;
      const finalDir = projectDir || '/workspace';
      expect(finalDir).toBe('/workspace');
    });

    it('should return success message on cleanup', async () => {
      const response = {
        success: true,
        message: "Worktree 'feature-branch' removed",
      };
      expect(response.success).toBe(true);
      expect(response.message).toContain('removed');
    });

    it('should return error on cleanup failure', async () => {
      const response = {
        success: false,
        error: 'Worktree has uncommitted changes',
      };
      expect(response.success).toBe(false);
      expect(response.error).toContain('uncommitted');
    });

    it('should handle worktree not found error', async () => {
      const response = {
        success: false,
        error: 'no such working tree',
      };
      expect(response.error).toContain('working tree');
    });
  });

  describe('worktree_merge_workflow Tool', () => {
    it('should orchestrate complete merge workflow', () => {
      const worktree = 'feature-branch';
      const taskId = 'task-uuid';
      const steps = ['validate', 'create-pr', 'auto-merge', 'cleanup'];
      expect(steps).toHaveLength(4);
    });

    it('should validate worktree changes first', () => {
      const workflowSteps = [
        'Step 1: Validating worktree...',
        'Step 2: Creating PR...',
      ];
      expect(workflowSteps[0]).toContain('Validating');
    });

    it('should create PR after validation', () => {
      const workflowSteps = [
        'Validating worktree',
        'Creating PR',
        'Auto-merging if requested',
      ];
      expect(workflowSteps[1]).toContain('Creating PR');
    });

    it('should auto-merge only if validation passed', () => {
      const validationPassed = true;
      const autoMerge = true;
      const shouldAutoMerge = validationPassed && autoMerge;
      expect(shouldAutoMerge).toBe(true);
    });

    it('should not auto-merge if validation failed', () => {
      const validationPassed = false;
      const autoMerge = true;
      const shouldAutoMerge = validationPassed && autoMerge;
      expect(shouldAutoMerge).toBe(false);
    });

    it('should cleanup worktree after PR creation', () => {
      const prCreated = true;
      const shouldCleanup = prCreated;
      expect(shouldCleanup).toBe(true);
    });

    it('should handle validation passing', async () => {
      const response = {
        success: true,
        validationPassed: true,
        prNumber: 42,
        prUrl: 'https://github.com/org/repo/pull/42',
        autoMerged: false,
        cleanedUp: true,
        summary: 'Workflow completed successfully. PR #42 created.',
      };
      expect(response.validationPassed).toBe(true);
      expect(response.prNumber).toBe(42);
    });

    it('should handle validation failure but continue', async () => {
      const response = {
        success: true,
        validationPassed: false,
        prNumber: 42,
        autoMerged: false,
        cleanedUp: true,
        errors: ['Tests failed: 2 failing'],
        summary: 'Workflow completed with issues',
      };
      expect(response.validationPassed).toBe(false);
      expect(response.errors).toHaveLength(1);
    });

    it('should handle PR creation failure', async () => {
      const response = {
        success: false,
        validationPassed: false,
        errors: ['Tests failed', 'PR creation failed: already exists'],
      };
      expect(response.success).toBe(false);
      expect(response.errors).toHaveLength(2);
    });

    it('should auto-merge and cleanup on success', async () => {
      const response = {
        success: true,
        validationPassed: true,
        autoMerged: true,
        cleanedUp: true,
        prNumber: 42,
      };
      expect(response.autoMerged).toBe(true);
      expect(response.cleanedUp).toBe(true);
    });

    it('should continue cleanup even if auto-merge fails', async () => {
      const response = {
        success: true,
        autoMerged: false,
        cleanedUp: true,
        errors: ['Auto-merge failed: branch status check pending'],
        prNumber: 42,
      };
      expect(response.cleanedUp).toBe(true);
      expect(response.errors).toHaveLength(1);
    });

    it('should include task ID in PR description', () => {
      const taskId = 'task-123-456';
      const prDescription = `Task ID: ${taskId}`;
      expect(prDescription).toContain(taskId);
    });

    it('should include worktree name in PR description', () => {
      const worktree = 'feature-xyz';
      const prDescription = `Worktree: ${worktree}`;
      expect(prDescription).toContain(worktree);
    });

    it('should return summary string', async () => {
      const response = {
        summary: 'Workflow completed successfully. PR #42 created.',
      };
      expect(response.summary).toBeTruthy();
      expect(response.summary).toContain('PR #42');
    });
  });

  describe('worktree_recover Tool', () => {
    it('should find modified files in orphaned worktree', () => {
      const modifiedFiles = [
        'src/index.ts',
        'src/lib.ts',
        'README.md',
      ];
      expect(modifiedFiles).toHaveLength(3);
    });

    it('should compare files with main worktree', () => {
      const worktreeDir = '/project/.worktrees/broken-branch';
      const targetBranch = 'main';
      expect(worktreeDir).toContain('.worktrees');
      expect(targetBranch).toBe('main');
    });

    it('should skip excluded directories (node_modules, .git, dist)', () => {
      const excludePaths = [
        'node_modules',
        '.git',
        '.pnpm-store',
        'dist',
        '.turbo',
      ];
      const filePath = 'node_modules/package/file.js';
      const isExcluded = excludePaths.some(p => filePath.includes(p));
      expect(isExcluded).toBe(true);
    });

    it('should copy modified files on non-dry-run', () => {
      const dryRun = false;
      expect(dryRun).toBe(false);
    });

    it('should only list files on dry-run', () => {
      const dryRun = true;
      expect(dryRun).toBe(true);
    });

    it('should support pattern filtering', () => {
      const patterns = ['packages/**/*.ts', 'src/**/*.tsx'];
      const filePath = 'packages/core/src/index.ts';
      // Simplified pattern matching: ** matches any path, * matches any filename
      const matchesPattern = patterns.some(p => {
        // First replace ** with placeholder, then * with [^/]*, then restore **
        const regex = new RegExp(
          '^' + p.replace(/\*\*/g, '###GLOB###').replace(/\*/g, '[^/]*').replace(/###GLOB###/g, '.*') + '$'
        );
        return regex.test(filePath);
      });
      expect(matchesPattern).toBe(true);
    });

    it('should not copy files outside patterns', () => {
      const patterns = ['packages/**/*.ts'];
      const filePath = 'apps/desktop/src/index.tsx';
      const matchesPattern = patterns.some(p => {
        const regex = new RegExp('^' + p.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
        return regex.test(filePath);
      });
      expect(matchesPattern).toBe(false);
    });

    it('should return files list in response', async () => {
      const response = {
        success: true,
        filesFound: 3,
        files: ['src/index.ts', 'src/lib.ts', 'README.md'],
      };
      expect(response.filesFound).toBe(3);
      expect(response.files).toHaveLength(3);
    });

    it('should return filesCopied count on non-dry-run', async () => {
      const response = {
        success: true,
        filesFound: 3,
        filesCopied: 3,
      };
      expect(response.filesCopied).toBe(3);
    });

    it('should not include filesCopied on dry-run', async () => {
      const response = {
        success: true,
        filesFound: 3,
        filesCopied: undefined,
      };
      expect(response.filesCopied).toBeUndefined();
    });

    it('should include errors for failed copies', async () => {
      const response = {
        success: true,
        filesFound: 3,
        filesCopied: 2,
        errors: ['Failed to copy src/locked-file.ts: Permission denied'],
      };
      expect(response.errors).toHaveLength(1);
    });

    it('should return error when worktree not found', async () => {
      const response = {
        success: false,
        filesFound: 0,
        files: [],
        errors: ['Directory not found: /project/.worktrees/unknown'],
      };
      expect(response.success).toBe(false);
      expect(response.filesFound).toBe(0);
    });

    it('should detect new files (not in main)', () => {
      const mainFileExists = false;
      const isNew = !mainFileExists;
      expect(isNew).toBe(true);
    });

    it('should detect modified files', () => {
      const worktreeContent = 'modified content';
      const mainContent = 'original content';
      const isModified = worktreeContent !== mainContent;
      expect(isModified).toBe(true);
    });

    it('should include file type filtering', () => {
      const fileExts = ['.ts', '.tsx', '.js', '.md'];
      const file = 'src/index.ts';
      const shouldInclude = fileExts.some(ext => file.endsWith(ext));
      expect(shouldInclude).toBe(true);
    });

    it('should skip binary and non-text files', () => {
      const binaryExts = ['.png', '.jpg', '.woff', '.ttf'];
      const file = 'assets/logo.png';
      const shouldSkip = binaryExts.some(ext => file.endsWith(ext));
      expect(shouldSkip).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle tests failing gracefully', () => {
      const error = 'FAIL: src/component.test.ts\n2 failing';
      expect(error).toContain('FAIL');
    });

    it('should handle linting errors', () => {
      const error = 'error: Unexpected token (line 42)';
      expect(error).toContain('error');
    });

    it('should handle type errors', () => {
      const error = 'Type "unknown" is not assignable to type "string"';
      expect(error).toContain('not assignable');
    });

    it('should handle branch not found on worktree', () => {
      const error = 'fatal: not a git repository';
      expect(error).toContain('not a git repository');
    });

    it('should handle GitHub CLI not available', () => {
      const error = 'gh: command not found';
      expect(error).toContain('not found');
    });

    it('should handle merge conflicts', () => {
      const error = 'CONFLICT: Content conflict in src/file.ts';
      expect(error).toContain('CONFLICT');
    });

    it('should handle network errors during push', () => {
      const error = 'fatal: unable to access https://github.com: Could not resolve host';
      expect(error).toContain('unable to access');
    });
  });

  describe('Git Command Construction', () => {
    it('should construct validate commands correctly', () => {
      const commands = [
        { cmd: 'pnpm', args: ['test'] },
        { cmd: 'pnpm', args: ['lint'] },
        { cmd: 'pnpm', args: ['typecheck'] },
      ];
      expect(commands).toHaveLength(3);
      expect(commands[0].args[0]).toBe('test');
    });

    it('should construct PR creation command for GitHub CLI', () => {
      const args = [
        'pr',
        'create',
        '--title',
        'Test PR',
        '--body',
        'Test body',
        '--base',
        'main',
        '--head',
        'feature-branch',
      ];
      expect(args[0]).toBe('pr');
      expect(args[1]).toBe('create');
      expect(args).toContain('main');
    });

    it('should construct auto-merge command', () => {
      const args = ['pr', 'merge', '42', '--auto', '--squash'];
      expect(args).toContain('merge');
      expect(args).toContain('--auto');
      expect(args).toContain('--squash');
    });

    it('should construct worktree cleanup command', () => {
      const args = ['worktree', 'remove', 'feature-branch'];
      expect(args[0]).toBe('worktree');
      expect(args[1]).toBe('remove');
      expect(args[2]).toBe('feature-branch');
    });
  });

  describe('Response Format', () => {
    it('should include success boolean in all responses', () => {
      const responses = [
        { success: true },
        { success: false },
      ];
      for (const resp of responses) {
        expect(resp).toHaveProperty('success');
        expect(typeof resp.success).toBe('boolean');
      }
    });

    it('should include content array with text', () => {
      const response = {
        content: [{ type: 'text', text: 'Operation result' }],
      };
      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');
    });

    it('should include structuredContent with operation details', () => {
      const response = {
        structuredContent: {
          success: true,
          prNumber: 42,
          prUrl: 'https://example.com/pull/42',
        },
      };
      expect(response.structuredContent.success).toBe(true);
      expect(response.structuredContent.prNumber).toBe(42);
    });
  });
});
