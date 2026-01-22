/**
 * Git Workflow Tools
 *
 * Provides MCP tools for agents to manage git commits, pushes, and merges.
 * Enables agents to complete work in worktrees and merge changes back to main.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execa, type ExecaError } from 'execa';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('git-workflow');

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
 * Schema for git_commit tool
 */
const gitCommitSchema = {
  message: z
    .string()
    .describe('Commit message (required). Use conventional format: type(scope): subject'),
  files: z.array(z.string()).optional().describe('Specific files to commit (default: all staged)'),
  workdir: z.string().optional().describe('Working directory (defaults to project root)'),
};

/**
 * Schema for git_set_identity tool
 */
const gitSetIdentitySchema = {
  name: z.string().describe('Git user name (e.g., "Claude Worker")'),
  email: z.string().email().describe('Git user email'),
  workdir: z.string().optional().describe('Working directory (defaults to project root)'),
  local: z.boolean().default(true).describe('Apply to local repository only (not global)'),
};

/**
 * Schema for git_push tool
 */
const gitPushSchema = {
  branch: z.string().optional().describe('Branch name to push (defaults to current branch)'),
  remote: z.string().default('origin').describe('Remote name (default: origin)'),
  force: z.boolean().default(false).describe('Force push (use with caution)'),
  workdir: z.string().optional().describe('Working directory (defaults to project root)'),
};

/**
 * Schema for git_status tool
 */
const gitStatusSchema = {
  workdir: z.string().optional().describe('Working directory (defaults to project root)'),
  porcelain: z.boolean().default(false).describe('Machine-readable output'),
};

/**
 * Register git workflow tools
 */
export function registerGitWorkflowTools(server: McpServer, context: ServerContext): void {
  /**
   * git_commit tool - Stage and commit changes with standardized messages
   */
  server.registerTool(
    'git_commit',
    {
      title: 'Git Commit',
      description:
        'Stage and commit changes with a standardized commit message. ' +
        'Use conventional commit format: type(scope): subject. ' +
        'Recommended types: feat, fix, docs, style, refactor, perf, test, chore.',
      inputSchema: gitCommitSchema,
      outputSchema: {
        success: z.boolean(),
        hash: z.string().optional().describe('Commit hash (first 7 characters)'),
        message: z.string().optional().describe('Commit message'),
        error: z.string().optional().describe('Error message if commit failed'),
      },
    },
    async (args) => {
      const { message, files = [], workdir } = args as {
        message: string;
        files?: string[];
        workdir?: string;
      };

      const cwd = workdir || context.projectDir;

      try {
        // Stage files
        if (files.length > 0) {
          await execa('git', ['add', ...files], { cwd });
        } else {
          // Stage all changes
          await execa('git', ['add', '-A'], { cwd });
        }

        // Commit with message
        const { stdout } = await execa('git', ['commit', '-m', message], { cwd });

        // Extract commit hash
        const hashMatch = stdout.match(/\[.*? ([a-f0-9]+)\]/);
        const hash = hashMatch ? hashMatch[1] : undefined;

        logger.info(`[git_commit] Committed: ${message}`);

        return {
          content: [
            {
              type: 'text',
              text: `Successfully committed: ${message}`,
            },
          ],
          structuredContent: {
            success: true,
            hash,
            message,
          },
        };
      } catch (err) {
        const error = err as ExecaError;
        const errorMsg = getErrorMessage(error);

        // Check if there's nothing to commit
        if (errorMsg.includes('nothing to commit')) {
          return {
            content: [
              {
                type: 'text',
                text: 'No changes to commit',
              },
            ],
            structuredContent: {
              success: false,
              error: 'nothing to commit',
            },
          };
        }

        logger.error(`[git_commit] Failed: ${errorMsg}`);

        return {
          content: [
            {
              type: 'text',
              text: `Failed to commit: ${errorMsg}`,
            },
          ],
          structuredContent: {
            success: false,
            error: errorMsg,
          },
        };
      }
    }
  );

  /**
   * git_set_identity tool - Configure git user name/email for commits
   */
  server.registerTool(
    'git_set_identity',
    {
      title: 'Set Git Identity',
      description:
        'Configure git user name and email for commits in a specific repository or globally. ' +
        'Important: Set identity before committing to ensure proper attribution.',
      inputSchema: gitSetIdentitySchema,
      outputSchema: {
        success: z.boolean(),
        name: z.string().optional(),
        email: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { name, email, workdir, local = true } = args as {
        name: string;
        email: string;
        workdir?: string;
        local: boolean;
      };

      const cwd = workdir || context.projectDir;

      try {
        const scope = local ? [] : ['--global'];

        // Set user name
        await execa('git', ['config', ...scope, 'user.name', name], { cwd });

        // Set user email
        await execa('git', ['config', ...scope, 'user.email', email], { cwd });

        logger.info(`[git_set_identity] Set identity: ${name} <${email}> (${local ? 'local' : 'global'})`);

        return {
          content: [
            {
              type: 'text',
              text: `Set git identity: ${name} <${email}>`,
            },
          ],
          structuredContent: {
            success: true,
            name,
            email,
          },
        };
      } catch (err) {
        const error = err as ExecaError;
        const errorMsg = getErrorMessage(error);

        logger.error(`[git_set_identity] Failed: ${errorMsg}`);

        return {
          content: [
            {
              type: 'text',
              text: `Failed to set git identity: ${errorMsg}`,
            },
          ],
          structuredContent: {
            success: false,
            error: errorMsg,
          },
        };
      }
    }
  );

  /**
   * git_push tool - Push changes to remote
   */
  server.registerTool(
    'git_push',
    {
      title: 'Git Push',
      description:
        'Push commits to a remote repository. ' +
        'Use with caution when force=true. ' +
        'Requires authentication credentials (SSH key or git credentials).',
      inputSchema: gitPushSchema,
      outputSchema: {
        success: z.boolean(),
        branch: z.string().optional(),
        remote: z.string().optional(),
        output: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { branch, remote = 'origin', force = false, workdir } = args as {
        branch?: string;
        remote: string;
        force: boolean;
        workdir?: string;
      };

      const cwd = workdir || context.projectDir;

      try {
        // Get current branch if not specified
        let targetBranch = branch;
        if (!targetBranch) {
          const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
          targetBranch = stdout.trim();
        }

        const args = ['push', remote, targetBranch];
        if (force) {
          args.push('--force-with-lease');
        }

        const { stdout } = await execa('git', args, { cwd });

        logger.info(`[git_push] Pushed ${targetBranch} to ${remote}`);

        return {
          content: [
            {
              type: 'text',
              text: `Successfully pushed ${targetBranch} to ${remote}`,
            },
          ],
          structuredContent: {
            success: true,
            branch: targetBranch,
            remote,
            output: stdout,
          },
        };
      } catch (err) {
        const error = err as ExecaError;
        const errorMsg = getErrorMessage(error);

        logger.error(`[git_push] Failed: ${errorMsg}`);

        return {
          content: [
            {
              type: 'text',
              text: `Failed to push: ${errorMsg}`,
            },
          ],
          structuredContent: {
            success: false,
            error: errorMsg,
          },
        };
      }
    }
  );

  /**
   * git_status tool - Show repository status
   */
  server.registerTool(
    'git_status',
    {
      title: 'Git Status',
      description:
        'Show the status of the git repository including staged and unstaged changes.',
      inputSchema: gitStatusSchema,
      outputSchema: {
        branch: z.string(),
        staged: z.array(z.string()),
        unstaged: z.array(z.string()),
        untracked: z.array(z.string()),
        porcelainOutput: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { workdir, porcelain = false } = args as {
        workdir?: string;
        porcelain: boolean;
      };

      const cwd = workdir || context.projectDir;

      try {
        // Get current branch
        const { stdout: branchStdout } = await execa(
          'git',
          ['rev-parse', '--abbrev-ref', 'HEAD'],
          { cwd }
        );
        const branch = branchStdout.trim();

        // Get status
        const { stdout: statusOutput } = await execa('git', ['status', '--porcelain'], { cwd });

        if (porcelain) {
          return {
            content: [
              {
                type: 'text',
                text: statusOutput,
              },
            ],
            structuredContent: {
              branch,
              staged: [],
              unstaged: [],
              untracked: [],
              porcelainOutput: statusOutput,
            },
          };
        }

        // Parse status output
        const staged: string[] = [];
        const unstaged: string[] = [];
        const untracked: string[] = [];

        for (const line of statusOutput.split('\n')) {
          if (!line) continue;
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

        logger.info(`[git_status] Branch: ${branch}, Staged: ${staged.length}, Unstaged: ${unstaged.length}`);

        return {
          content: [
            {
              type: 'text',
              text: `On branch ${branch}\nStaged: ${staged.length}, Unstaged: ${unstaged.length}, Untracked: ${untracked.length}`,
            },
          ],
          structuredContent: {
            branch,
            staged,
            unstaged,
            untracked,
          },
        };
      } catch (err) {
        const error = err as ExecaError;
        const errorMsg = getErrorMessage(error);

        logger.error(`[git_status] Failed: ${errorMsg}`);

        return {
          content: [
            {
              type: 'text',
              text: `Failed to get git status: ${errorMsg}`,
            },
          ],
          structuredContent: {
            branch: 'unknown',
            staged: [],
            unstaged: [],
            untracked: [],
            error: errorMsg,
          },
        };
      }
    }
  );
}
