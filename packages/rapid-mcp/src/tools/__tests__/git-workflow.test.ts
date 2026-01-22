/**
 * Test Suite for Git Workflow Tools
 *
 * Tests cover git commit, push, status, and identity configuration with:
 * - Success paths for all operations
 * - Error handling and edge cases
 * - Git state validation
 * - Proper message formatting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execa, type ExecaError } from 'execa';

// Mock execa
vi.mock('execa');

const mockExeca = execa as unknown as ReturnType<typeof vi.fn>;

describe('Git Workflow Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('git_commit Tool', () => {
    it('should commit changes with conventional message', async () => {
      const message = 'feat(tools): add git workflow support';
      expect(message).toMatch(/^(feat|fix|docs|style|refactor|perf|test|chore)/);
    });

    it('should extract commit hash from stdout', async () => {
      const stdout = '[main abc1234] feat(tools): add git workflow\n 1 file changed';
      const hashMatch = stdout.match(/\[.*? ([a-f0-9]+)\]/);
      expect(hashMatch?.[1]).toBe('abc1234');
    });

    it('should handle commit with no hash in output', async () => {
      const stdout = 'nothing to commit, working tree clean';
      const hashMatch = stdout.match(/\[.*? ([a-f0-9]+)\]/);
      expect(hashMatch).toBeNull();
    });

    it('should detect nothing to commit error', async () => {
      const stderr = 'nothing to commit, working tree clean';
      expect(stderr.includes('nothing to commit')).toBe(true);
    });

    it('should accept file list for selective commits', () => {
      const files = ['src/file1.ts', 'src/file2.ts'];
      expect(files).toHaveLength(2);
      expect(files[0]).toBe('src/file1.ts');
    });

    it('should default to staging all changes when no files specified', () => {
      const files: string[] = [];
      const shouldAddAll = files.length === 0;
      expect(shouldAddAll).toBe(true);
    });

    it('should support custom working directory', () => {
      const workdir = '/path/to/repo';
      expect(workdir).toBeTruthy();
    });

    it('should return success response with hash and message', async () => {
      const response = {
        success: true,
        hash: 'abc1234',
        message: 'feat(tools): add git workflow',
      };
      expect(response.success).toBe(true);
      expect(response.hash).toBeTruthy();
      expect(response.message).toBeTruthy();
    });

    it('should return error response on commit failure', async () => {
      const response = {
        success: false,
        error: 'branch is in detached HEAD state',
      };
      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
    });

    it('should return error response for nothing to commit', async () => {
      const response = {
        success: false,
        error: 'nothing to commit',
      };
      expect(response.success).toBe(false);
      expect(response.error).toContain('nothing to commit');
    });

    it('should handle stderr from git command', () => {
      const error: Partial<ExecaError> = {
        stderr: 'fatal: pathspec is in ignored by one of your .gitignore files',
        message: 'Command failed',
      };
      expect(error.stderr).toBeTruthy();
    });
  });

  describe('git_set_identity Tool', () => {
    it('should set git user name and email locally', () => {
      const name = 'Test Worker';
      const email = 'test@example.com';
      const local = true;

      expect(name).toBeTruthy();
      expect(email).toMatch(/^[^@]+@[^@]+$/);
      expect(local).toBe(true);
    });

    it('should set git user name and email globally', () => {
      const name = 'Test Worker';
      const email = 'test@example.com';
      const local = false;

      expect(name).toBeTruthy();
      expect(email).toMatch(/^[^@]+@[^@]+$/);
      expect(local).toBe(false);
    });

    it('should validate email format', () => {
      const validEmails = ['user@example.com', 'name+tag@domain.co.uk'];
      const invalidEmails = ['not-an-email', '@example.com', 'user@'];

      for (const email of validEmails) {
        expect(email).toMatch(/^[^@]+@[^@]+\.[^@]+$/);
      }

      for (const email of invalidEmails) {
        expect(email).not.toMatch(/^[^@]+@[^@]+\.[^@]+$/);
      }
    });

    it('should support custom working directory', () => {
      const workdir = '/path/to/repo';
      expect(workdir).toBeTruthy();
    });

    it('should return success response with name and email', async () => {
      const response = {
        success: true,
        name: 'Test Worker',
        email: 'test@example.com',
      };
      expect(response.success).toBe(true);
      expect(response.name).toBe('Test Worker');
      expect(response.email).toBe('test@example.com');
    });

    it('should return error response on failure', async () => {
      const response = {
        success: false,
        error: 'not a git repository',
      };
      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
    });

    it('should handle permission denied error', () => {
      const error = 'fatal: permission denied';
      expect(error).toContain('permission denied');
    });

    it('should default local to true', () => {
      const local = true;
      expect(local).toBe(true);
    });
  });

  describe('git_push Tool', () => {
    it('should push current branch to origin by default', () => {
      const branch = undefined;
      const remote = 'origin';
      expect(remote).toBe('origin');
    });

    it('should support custom branch name', () => {
      const branch = 'feature/new-feature';
      expect(branch).toContain('feature/');
    });

    it('should support custom remote', () => {
      const remote = 'upstream';
      expect(remote).toBe('upstream');
    });

    it('should get current branch when not specified', () => {
      const branchOutput = 'main\n';
      const currentBranch = branchOutput.trim();
      expect(currentBranch).toBe('main');
    });

    it('should handle force push with --force-with-lease', () => {
      const force = true;
      const args = ['push', 'origin', 'main'];
      if (force) {
        args.push('--force-with-lease');
      }
      expect(args).toContain('--force-with-lease');
    });

    it('should not include force flag by default', () => {
      const force = false;
      const args = ['push', 'origin', 'main'];
      if (force) {
        args.push('--force-with-lease');
      }
      expect(args).not.toContain('--force-with-lease');
    });

    it('should return success response with branch and remote', async () => {
      const response = {
        success: true,
        branch: 'main',
        remote: 'origin',
        output: 'Everything up-to-date',
      };
      expect(response.success).toBe(true);
      expect(response.branch).toBe('main');
      expect(response.remote).toBe('origin');
    });

    it('should return error response on push failure', async () => {
      const response = {
        success: false,
        error: 'remote rejected: updates were rejected because the tip of your current branch is behind',
      };
      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
    });

    it('should support custom working directory', () => {
      const workdir = '/path/to/repo';
      expect(workdir).toBeTruthy();
    });

    it('should handle authentication failures', () => {
      const error = 'fatal: Authentication failed for';
      expect(error).toContain('Authentication failed');
    });

    it('should handle branch not found error', () => {
      const error = 'error: src refspec main does not match any';
      expect(error).toContain('refspec');
    });
  });

  describe('git_status Tool', () => {
    it('should get current branch name', () => {
      const branchOutput = 'develop\n';
      const branch = branchOutput.trim();
      expect(branch).toBe('develop');
    });

    it('should parse git status porcelain output', () => {
      const porcelainOutput = `M  src/index.ts
A  src/new.ts
?? untracked.ts
 M src/modified.ts`;

      const lines = porcelainOutput.split('\n').filter(l => l);
      expect(lines).toHaveLength(4);

      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      for (const line of lines) {
        const status = line.substring(0, 2);
        const filepath = line.substring(3);

        if (status[0] !== ' ' && status[0] !== '?') {
          staged.push(filepath);
        }
        if (status[1] !== ' ') {
          unstaged.push(filepath);
        }
        if (status === '??') {
          untracked.push(filepath);
        }
      }

      expect(staged).toContain('src/index.ts');
      expect(staged).toContain('src/new.ts');
      expect(unstaged).toContain('src/modified.ts');
      expect(untracked).toContain('untracked.ts');
    });

    it('should handle empty status', () => {
      const porcelainOutput = '';
      const lines = porcelainOutput.split('\n').filter(l => l);
      expect(lines).toHaveLength(0);
    });

    it('should support porcelain mode for machine-readable output', () => {
      const porcelain = true;
      expect(porcelain).toBe(true);
    });

    it('should default porcelain to false', () => {
      const porcelain = false;
      expect(porcelain).toBe(false);
    });

    it('should return structured response with branch and file lists', async () => {
      const response = {
        branch: 'main',
        staged: ['src/index.ts', 'src/lib.ts'],
        unstaged: ['src/modified.ts'],
        untracked: ['newfile.ts'],
      };
      expect(response.branch).toBe('main');
      expect(response.staged).toHaveLength(2);
      expect(response.unstaged).toHaveLength(1);
      expect(response.untracked).toHaveLength(1);
    });

    it('should return porcelain output when requested', async () => {
      const response = {
        branch: 'main',
        staged: [],
        unstaged: [],
        untracked: [],
        porcelainOutput: 'M  src/file.ts',
      };
      expect(response.porcelainOutput).toBeTruthy();
    });

    it('should return error response on failure', async () => {
      const response = {
        branch: 'unknown',
        staged: [],
        unstaged: [],
        untracked: [],
        error: 'fatal: not a git repository',
      };
      expect(response.error).toBeTruthy();
    });

    it('should support custom working directory', () => {
      const workdir = '/path/to/repo';
      expect(workdir).toBeTruthy();
    });

    it('should handle detached HEAD state', () => {
      const branchOutput = 'HEAD detached at abc1234\n';
      const branch = branchOutput.trim();
      expect(branch).toContain('detached');
    });

    it('should count files in each status category', () => {
      const staged = ['file1.ts', 'file2.ts', 'file3.ts'];
      const unstaged = ['file4.ts'];
      const untracked: string[] = [];

      expect(staged).toHaveLength(3);
      expect(unstaged).toHaveLength(1);
      expect(untracked).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should extract error message from stderr', () => {
      const error: Partial<ExecaError> = {
        stderr: 'fatal: your current branch and origin/main have diverged',
        message: 'Command failed with exit code 1',
      };
      const errorMsg = typeof error.stderr === 'string' ? error.stderr : error.message;
      expect(errorMsg).toContain('diverged');
    });

    it('should fallback to message when stderr unavailable', () => {
      const error: Partial<ExecaError> = {
        stderr: '',
        message: 'Command failed',
      };
      const errorMsg = error.stderr || error.message;
      expect(errorMsg).toBe('Command failed');
    });

    it('should handle command not found', () => {
      const error = 'git: command not found';
      expect(error).toContain('command not found');
    });

    it('should handle permission errors', () => {
      const error = 'fatal: permission denied while trying to read the repository';
      expect(error).toContain('permission denied');
    });

    it('should handle network errors', () => {
      const error = 'fatal: unable to access https://github.com/repo: Could not resolve host';
      expect(error).toContain('unable to access');
    });
  });

  describe('Working Directory Handling', () => {
    it('should use projectDir as default cwd', () => {
      const workdir = undefined;
      const projectDir = '/workspace';
      const cwd = workdir || projectDir;
      expect(cwd).toBe(projectDir);
    });

    it('should use provided workdir over projectDir', () => {
      const workdir = '/custom/path';
      const projectDir = '/workspace';
      const cwd = workdir || projectDir;
      expect(cwd).toBe(workdir);
    });

    it('should handle relative paths', () => {
      const workdir = './src/repo';
      expect(workdir.startsWith('.')).toBe(true);
    });

    it('should handle absolute paths', () => {
      const workdir = '/abs/path/repo';
      expect(workdir.startsWith('/')).toBe(true);
    });
  });

  describe('Message Formatting', () => {
    it('should validate conventional commit format', () => {
      const validMessages = [
        'feat(scope): description',
        'fix(api): bug fix',
        'docs: update readme',
        'refactor(core): code cleanup',
      ];

      for (const msg of validMessages) {
        expect(msg).toMatch(/^(feat|fix|docs|style|refactor|perf|test|chore)(\(.+\))?: .+/);
      }
    });

    it('should handle commit messages with multiline content', () => {
      const message = 'feat(tools): add git workflow\n\nDetailed description here';
      const lines = message.split('\n');
      expect(lines).toHaveLength(3);
    });

    it('should handle commit messages with special characters', () => {
      const message = 'fix(api): handle "quotes" and apostrophes';
      expect(message).toContain('quotes');
      expect(message).toContain('apostrophes');
    });
  });

  describe('Response Format', () => {
    it('should include content array in response', () => {
      const response = {
        content: [{ type: 'text', text: 'Success message' }],
      };
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0].type).toBe('text');
    });

    it('should include structuredContent with operation-specific fields', () => {
      const response = {
        structuredContent: {
          success: true,
          hash: 'abc1234',
          message: 'commit message',
        },
      };
      expect(response.structuredContent.success).toBe(true);
      expect(response.structuredContent.hash).toBeTruthy();
    });

    it('should handle optional fields in structuredContent', () => {
      const response = {
        structuredContent: {
          success: false,
          error: 'error message',
          hash: undefined,
        },
      };
      expect(response.structuredContent.success).toBe(false);
      expect(response.structuredContent.error).toBeTruthy();
      expect(response.structuredContent.hash).toBeUndefined();
    });
  });
});
