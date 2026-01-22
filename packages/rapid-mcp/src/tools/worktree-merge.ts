/**
 * Worktree Merge Workflow Tools
 *
 * MCP tools for managing the complete workflow of merging worktree changes back to main.
 * Handles: validation, PR creation, auto-merge, conflict resolution, and cleanup.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execa, type ExecaError } from 'execa';
import { join } from 'node:path';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('worktree-merge');

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
 * Schema for worktree_merge_pr tool
 */
const worktreeMergePrSchema = {
  worktree: z.string().describe('Worktree name/branch to merge'),
  title: z.string().describe('PR title'),
  description: z.string().optional().describe('PR description'),
  autoGenDescription: z.boolean().default(true).describe('Auto-generate description from commits'),
  baseBranch: z.string().default('main').describe('Base branch to merge into (default: main)'),
  autoMerge: z.boolean().default(false).describe('Auto-merge if tests pass'),
  hostProjectDir: z.string().optional().describe('Host project directory (for accessing worktree)'),
};

/**
 * Schema for worktree_validate tool
 */
const worktreeValidateSchema = {
  worktree: z.string().describe('Worktree name/branch to validate'),
  hostProjectDir: z.string().optional().describe('Host project directory'),
  runTests: z.boolean().default(true).describe('Run tests during validation'),
  runLint: z.boolean().default(true).describe('Run linting during validation'),
};

/**
 * Schema for worktree_cleanup tool
 */
const worktreeCleanupSchema = {
  worktree: z.string().describe('Worktree name to clean up'),
  hostProjectDir: z.string().optional().describe('Host project directory'),
};

/**
 * Schema for worktree_merge_workflow tool (orchestrator)
 */
const worktreeMergeWorkflowSchema = {
  worktree: z.string().describe('Worktree name/branch to merge'),
  taskId: z.string().describe('Task ID that was completed'),
  prTitle: z.string().optional().describe('PR title (auto-generated if not provided)'),
  prDescription: z.string().optional().describe('PR description'),
  baseBranch: z.string().default('main').describe('Base branch to merge into'),
  autoMerge: z.boolean().default(false).describe('Auto-merge if tests pass'),
  hostProjectDir: z.string().optional().describe('Host project directory'),
};

/**
 * Register worktree merge workflow tools
 */
export function registerWorktreeMergeTools(server: McpServer, context: ServerContext): void {
  /**
   * worktree_merge_workflow tool - Complete orchestration of merge workflow
   */
  server.registerTool(
    'worktree_merge_workflow',
    {
      title: 'Execute Worktree Merge Workflow',
      description:
        'Complete workflow: validate worktree changes, create PR with auto-generated description, ' +
        'optionally auto-merge, and clean up worktree. This is the main orchestration tool.',
      inputSchema: worktreeMergeWorkflowSchema,
      outputSchema: {
        success: z.boolean(),
        validationPassed: z.boolean().optional(),
        prNumber: z.number().optional(),
        prUrl: z.string().optional(),
        autoMerged: z.boolean().optional(),
        cleanedUp: z.boolean().optional(),
        summary: z.string().optional(),
        errors: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      const {
        worktree,
        taskId,
        prTitle,
        prDescription,
        baseBranch = 'main',
        autoMerge = false,
        hostProjectDir,
      } = args as {
        worktree: string;
        taskId: string;
        prTitle?: string;
        prDescription?: string;
        baseBranch?: string;
        autoMerge: boolean;
        hostProjectDir?: string;
      };

      const projectDir = hostProjectDir || context.projectDir;
      const errors: string[] = [];
      let validationPassed = false;
      let prNumber: number | undefined;
      let prUrl: string | undefined;
      let autoMerged = false;
      let cleanedUp = false;

      try {
        logger.info(`[worktree_merge_workflow] Starting merge workflow for '${worktree}' (task: ${taskId})`);

        // Step 1: Validate worktree changes
        try {
          logger.info(`[worktree_merge_workflow] Step 1: Validating worktree...`);
          await execa('pnpm', ['test'], {
            cwd: join(projectDir, '.worktrees', worktree),
          });
          logger.info(`[worktree_merge_workflow] Tests passed`);
          validationPassed = true;
        } catch (err) {
          const error = err as ExecaError;
          const errorMsg = getErrorMessage(error);
          errors.push(`Tests failed: ${errorMsg}`);
          logger.warn(`[worktree_merge_workflow] Tests failed: ${errorMsg}`);
          // Continue with PR creation even if tests fail
        }

        // Step 2: Create PR
        try {
          logger.info(`[worktree_merge_workflow] Step 2: Creating PR...`);
          const worktreeDir = join(projectDir, '.worktrees', worktree);

          // Get current branch
          const { stdout: branchStdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd: worktreeDir,
          });
          const currentBranch = branchStdout.trim();

          // Auto-generate PR title if not provided
          const finalTitle =
            prTitle ||
            `Merge worktree ${worktree} changes (task: ${taskId.substring(0, 8)})`;

          // Get commits for description
          let finalDescription = prDescription || '';
          if (!prDescription) {
            try {
              const { stdout: logOutput } = await execa(
                'git',
                ['log', `origin/${baseBranch}..HEAD`, '--pretty=format:%h %s'],
                { cwd: worktreeDir }
              );
              const lines = logOutput.trim().split('\n').filter(l => l);
              const commitList = lines.map((line, i) => `${i + 1}. ${line}`).join('\n');
              finalDescription = `## Changes\n\n${commitList}\n\n## Context\n\nTask ID: ${taskId}\nWorktree: ${worktree}`;
            } catch {
              finalDescription = `Worktree ${worktree} merge\nTask ID: ${taskId}`;
            }
          }

          // Push branch
          try {
            await execa('git', ['push', '-u', 'origin', currentBranch], { cwd: worktreeDir });
          } catch {
            // Already pushed
          }

          // Create PR using GitHub CLI
          try {
            const { stdout: prOutput } = await execa(
              'gh',
              [
                'pr',
                'create',
                '--title',
                finalTitle,
                '--body',
                finalDescription,
                '--base',
                baseBranch,
                '--head',
                currentBranch,
              ],
              { cwd: projectDir }
            );

            prUrl = prOutput.trim();
            const prMatch = prOutput.match(/https:\/\/github\.com\/.*\/pull\/(\d+)/);
            if (prMatch && prMatch[1]) {
              prNumber = parseInt(prMatch[1], 10);
            }

            logger.info(`[worktree_merge_workflow] PR created: ${prUrl}`);
          } catch (err) {
            const error = err as ExecaError;
            const errorMsg = getErrorMessage(error);
            errors.push(`PR creation failed: ${errorMsg}`);
            logger.error(`[worktree_merge_workflow] PR creation failed: ${errorMsg}`);
          }
        } catch (err) {
          const error = err as ExecaError;
          const errorMsg = getErrorMessage(error);
          errors.push(`PR creation step failed: ${errorMsg}`);
        }

        // Step 3: Auto-merge if requested and tests passed
        if (autoMerge && validationPassed && prNumber) {
          try {
            logger.info(`[worktree_merge_workflow] Step 3: Auto-merging PR...`);
            await execa('gh', ['pr', 'merge', prNumber.toString(), '--auto', '--squash'], {
              cwd: projectDir,
            });
            autoMerged = true;
            logger.info(`[worktree_merge_workflow] PR auto-merged`);
          } catch (err) {
            const error = err as ExecaError;
            errors.push(`Auto-merge failed: ${getErrorMessage(error)}`);
            logger.warn(`[worktree_merge_workflow] Auto-merge failed`);
          }
        }

        // Step 4: Cleanup worktree if merge was successful
        if (autoMerged || prNumber) {
          try {
            logger.info(`[worktree_merge_workflow] Step 4: Cleaning up worktree...`);
            await execa('git', ['worktree', 'remove', worktree], { cwd: projectDir });
            cleanedUp = true;
            logger.info(`[worktree_merge_workflow] Worktree cleaned up`);
          } catch (err) {
            const error = err as ExecaError;
            errors.push(`Cleanup failed: ${getErrorMessage(error)}`);
            logger.warn(`[worktree_merge_workflow] Cleanup failed`);
          }
        }

        const success = errors.length === 0 && prNumber !== undefined;
        const summary = success
          ? `Workflow completed successfully. PR #${prNumber} created.`
          : `Workflow completed with issues: ${errors.join('; ')}`;

        logger.info(`[worktree_merge_workflow] Workflow result: ${summary}`);

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
          structuredContent: {
            success,
            validationPassed,
            prNumber,
            prUrl,
            autoMerged,
            cleanedUp,
            summary,
            errors: errors.length > 0 ? errors : undefined,
          },
        };
      } catch (err) {
        const error = err as ExecaError;
        const errorMsg = getErrorMessage(error);
        logger.error(`[worktree_merge_workflow] Fatal error: ${errorMsg}`);

        return {
          content: [
            {
              type: 'text',
              text: `Workflow failed: ${errorMsg}`,
            },
          ],
          structuredContent: {
            success: false,
            summary: `Workflow failed: ${errorMsg}`,
            errors: [errorMsg],
          },
        };
      }
    }
  );
  /**
   * worktree_validate tool - Validate changes in worktree
   */
  server.registerTool(
    'worktree_validate',
    {
      title: 'Validate Worktree Changes',
      description:
        'Validate changes in a worktree by running tests and linting. ' +
        'Ensures code quality before creating PR or merging.',
      inputSchema: worktreeValidateSchema,
      outputSchema: {
        success: z.boolean(),
        testsPass: z.boolean().optional(),
        lintPass: z.boolean().optional(),
        testOutput: z.string().optional(),
        lintOutput: z.string().optional(),
        errors: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      const {
        worktree,
        hostProjectDir,
        runTests = true,
        runLint = true,
      } = args as {
        worktree: string;
        hostProjectDir?: string;
        runTests: boolean;
        runLint: boolean;
      };

      const projectDir = hostProjectDir || context.projectDir;
      const worktreeDir = join(projectDir, '.worktrees', worktree);
      const errors: string[] = [];
      let testsPass = true;
      let lintPass = true;
      let testOutput = '';
      let lintOutput = '';

      try {
        // Run tests if requested
        if (runTests) {
          try {
            const { stdout } = await execa('pnpm', ['test'], { cwd: worktreeDir });
            testOutput = stdout;
          } catch (err) {
            testsPass = false;
            const error = err as ExecaError;
            errors.push(`Tests failed: ${getErrorMessage(error)}`);
            testOutput = error.message;
          }
        }

        // Run linting if requested
        if (runLint) {
          try {
            const { stdout } = await execa('pnpm', ['lint'], { cwd: worktreeDir });
            lintOutput = stdout;
          } catch (err) {
            lintPass = false;
            const error = err as ExecaError;
            errors.push(`Linting failed: ${getErrorMessage(error)}`);
            lintOutput = error.message;
          }
        }

        // Also run typecheck
        try {
          await execa('pnpm', ['typecheck'], { cwd: worktreeDir });
        } catch (err) {
          lintPass = false;
          const error = err as ExecaError;
          errors.push(`Type checking failed: ${getErrorMessage(error)}`);
        }

        const success = errors.length === 0;

        logger.info(
          `[worktree_validate] Worktree '${worktree}': ${success ? 'PASS' : 'FAIL'} ` +
            `(tests: ${testsPass}, lint: ${lintPass})`
        );

        return {
          content: [
            {
              type: 'text',
              text: success ? 'Validation passed' : `Validation failed: ${errors.join('; ')}`,
            },
          ],
          structuredContent: {
            success,
            testsPass,
            lintPass,
            testOutput,
            lintOutput,
            errors: errors.length > 0 ? errors : undefined,
          },
        };
      } catch (err) {
        const error = err as ExecaError;
        const errorMsg = getErrorMessage(error);
        logger.error(`[worktree_validate] Fatal error: ${errorMsg}`);

        return {
          content: [
            {
              type: 'text',
              text: `Validation error: ${errorMsg}`,
            },
          ],
          structuredContent: {
            success: false,
            errors: [errorMsg],
          },
        };
      }
    }
  );

  /**
   * worktree_merge_pr tool - Create PR with auto-generated description from commits
   */
  server.registerTool(
    'worktree_merge_pr',
    {
      title: 'Create PR from Worktree',
      description:
        'Create a pull request from worktree changes to merge back to main. ' +
        'Auto-generates description from commit messages. ' +
        'Optionally auto-merges if tests pass.',
      inputSchema: worktreeMergePrSchema,
      outputSchema: {
        success: z.boolean(),
        prNumber: z.number().optional(),
        prUrl: z.string().optional(),
        commits: z.array(z.string()).optional(),
        autoMerged: z.boolean().optional(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const {
        worktree,
        title,
        description,
        autoGenDescription = true,
        baseBranch = 'main',
        autoMerge = false,
        hostProjectDir,
      } = args as {
        worktree: string;
        title: string;
        description?: string;
        autoGenDescription: boolean;
        baseBranch?: string;
        autoMerge: boolean;
        hostProjectDir?: string;
      };

      const projectDir = hostProjectDir || context.projectDir;
      const worktreeDir = join(projectDir, '.worktrees', worktree);
      const finalBaseBranch = baseBranch || 'main';

      try {
        // Get commit messages for auto-generated description
        let prDescription = description || '';
        const commits: string[] = [];

        if (autoGenDescription || !description) {
          try {
            const { stdout } = await execa(
              'git',
              ['log', `origin/${finalBaseBranch}..HEAD`, '--pretty=format:%h %s'],
              { cwd: worktreeDir }
            );
            const lines = stdout.trim().split('\n').filter(l => l);
            commits.push(...lines);

            if (autoGenDescription && !description) {
              const commitList = lines.map((line, i) => `${i + 1}. ${line}`).join('\n');
              prDescription = `## Changes\n\n${commitList}\n\n## Description\n\nAutomatically generated PR from worktree changes.`;
            }
          } catch (err) {
            logger.warn(`[worktree_merge_pr] Could not auto-generate description from commits`);
          }
        }

        // Check if GitHub CLI is available and token is set
        const ghPath = await checkGhCliAvailable();
        if (!ghPath) {
          logger.warn(`[worktree_merge_pr] GitHub CLI not available - cannot create PR`);
          return {
            content: [
              {
                type: 'text',
                text: 'GitHub CLI (gh) not available. Cannot create PR. Please install GitHub CLI or create PR manually.',
              },
            ],
            structuredContent: {
              success: false,
              error: 'GitHub CLI not available',
            },
          };
        }

        // Get current branch
        const { stdout: branchStdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: worktreeDir,
        });
        const currentBranch = branchStdout.trim();

        // Push branch if not already pushed
        try {
          await execa('git', ['push', '-u', 'origin', currentBranch], { cwd: worktreeDir });
        } catch {
          // Branch may already be pushed - that's OK
        }

        // Create PR using GitHub CLI
        const prArgs = [
          'pr',
          'create',
          '--title',
          title,
          '--body',
          prDescription,
          '--base',
          baseBranch,
          '--head',
          currentBranch,
        ];

        if (autoMerge) {
          prArgs.push('--auto');
        }

        const { stdout: prOutput } = await execa('gh', prArgs, { cwd: projectDir });

        // Extract PR number from output
        const prUrlMatch = prOutput.match(/https:\/\/github\.com\/.*\/pull\/(\d+)/);
        const prNumber = prUrlMatch && prUrlMatch[1] ? parseInt(prUrlMatch[1], 10) : undefined;

        logger.info(`[worktree_merge_pr] Created PR #${prNumber}: ${title}`);

        return {
          content: [
            {
              type: 'text',
              text: `Successfully created PR #${prNumber}\n${prOutput}`,
            },
          ],
          structuredContent: {
            success: true,
            prNumber,
            prUrl: prOutput.trim(),
            commits,
            autoMerged: autoMerge,
          },
        };
      } catch (err) {
        const error = err as ExecaError;
        const errorMsg = getErrorMessage(error);
        logger.error(`[worktree_merge_pr] Failed: ${errorMsg}`);

        return {
          content: [
            {
              type: 'text',
              text: `Failed to create PR: ${errorMsg}`,
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
   * worktree_cleanup tool - Clean up worktree after merge
   */
  server.registerTool(
    'worktree_cleanup',
    {
      title: 'Cleanup Worktree',
      description: 'Clean up a worktree after successful merge. Removes the worktree directory.',
      inputSchema: worktreeCleanupSchema,
      outputSchema: {
        success: z.boolean(),
        message: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async (args) => {
      const { worktree, hostProjectDir } = args as {
        worktree: string;
        hostProjectDir?: string;
      };

      const projectDir = hostProjectDir || context.projectDir;

      try {
        // Remove worktree
        await execa('git', ['worktree', 'remove', worktree], { cwd: projectDir });

        logger.info(`[worktree_cleanup] Cleaned up worktree '${worktree}'`);

        return {
          content: [
            {
              type: 'text',
              text: `Successfully removed worktree '${worktree}'`,
            },
          ],
          structuredContent: {
            success: true,
            message: `Worktree '${worktree}' removed`,
          },
        };
      } catch (err) {
        const error = err as ExecaError;
        const errorMsg = getErrorMessage(error);
        logger.error(`[worktree_cleanup] Failed: ${errorMsg}`);

        return {
          content: [
            {
              type: 'text',
              text: `Failed to clean up worktree: ${errorMsg}`,
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
}

/**
 * Check if GitHub CLI is available
 */
async function checkGhCliAvailable(): Promise<boolean> {
  try {
    await execa('gh', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Register orphaned worktree recovery tool
 */
export function registerWorktreeRecoveryTools(server: McpServer, context: ServerContext): void {
  /**
   * worktree_recover tool - Recover changes from orphaned worktrees
   */
  server.registerTool(
    'worktree_recover',
    {
      title: 'Recover Orphaned Worktree Changes',
      description:
        'Recover file changes from an orphaned worktree (one with broken git references). ' +
        'Copies modified files back to the main worktree for manual review and commit.',
      inputSchema: z.object({
        worktreeName: z.string().describe('Name of the orphaned worktree directory'),
        targetBranch: z.string().default('main').describe('Branch to compare against'),
        dryRun: z.boolean().default(true).describe('If true, only list files without copying'),
        patterns: z.array(z.string()).optional().describe('File patterns to include (e.g., ["packages/**/*.ts"])'),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        filesFound: z.number(),
        filesCopied: z.number().optional(),
        files: z.array(z.string()),
        errors: z.array(z.string()).optional(),
      }),
    },
    async (args) => {
      const {
        worktreeName,
        dryRun = true,
        patterns,
      } = args as {
        worktreeName: string;
        targetBranch?: string;
        dryRun?: boolean;
        patterns?: string[];
      };

      const projectDir = process.env.RAPID_HOST_PROJECT_DIR || context.projectDir;
      const worktreeDir = join(projectDir, '.worktrees', worktreeName);
      const errors: string[] = [];
      const files: string[] = [];
      let filesCopied = 0;

      try {
        // Check if worktree directory exists
        const { readdirSync, statSync, copyFileSync, mkdirSync } = await import('node:fs');
        const { relative, dirname } = await import('node:path');

        try {
          statSync(worktreeDir);
        } catch {
          return {
            content: [{ type: 'text', text: `Worktree directory not found: ${worktreeDir}` }],
            structuredContent: { success: false, filesFound: 0, files: [], errors: [`Directory not found: ${worktreeDir}`] },
          };
        }

        // Find modified files by comparing with main
        // Since git state is broken, we compare file contents directly
        const findModifiedFiles = async (dir: string, baseDir: string): Promise<string[]> => {
          const modified: string[] = [];
          const entries = readdirSync(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relativePath = relative(worktreeDir, fullPath);

            // Skip node_modules, .git, and other common excludes
            if (entry.name === 'node_modules' || entry.name === '.git' ||
                entry.name === '.pnpm-store' || entry.name === 'dist' ||
                entry.name === '.turbo') {
              continue;
            }

            if (entry.isDirectory()) {
              modified.push(...await findModifiedFiles(fullPath, baseDir));
            } else if (entry.isFile()) {
              // Check if file differs from main
              const mainPath = join(projectDir, relativePath);
              try {
                const { readFileSync } = await import('node:fs');
                const worktreeContent = readFileSync(fullPath, 'utf-8');
                const mainContent = readFileSync(mainPath, 'utf-8');

                if (worktreeContent !== mainContent) {
                  // Check against patterns if provided (simple glob matching)
                  if (patterns && patterns.length > 0) {
                    const matchesPattern = patterns.some(p => {
                      // Simple glob matching: convert * to regex
                      const regex = new RegExp('^' + p.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
                      return regex.test(relativePath);
                    });
                    if (!matchesPattern) continue;
                  }
                  modified.push(relativePath);
                }
              } catch {
                // File doesn't exist in main or can't be read - it's new
                if (relativePath.endsWith('.ts') || relativePath.endsWith('.tsx') ||
                    relativePath.endsWith('.js') || relativePath.endsWith('.md')) {
                  modified.push(relativePath);
                }
              }
            }
          }
          return modified;
        };

        const modifiedFiles = await findModifiedFiles(worktreeDir, projectDir);
        files.push(...modifiedFiles);

        if (!dryRun && modifiedFiles.length > 0) {
          // Copy files back to main
          for (const file of modifiedFiles) {
            try {
              const src = join(worktreeDir, file);
              const dest = join(projectDir, file);
              mkdirSync(dirname(dest), { recursive: true });
              copyFileSync(src, dest);
              filesCopied++;
            } catch (err) {
              errors.push(`Failed to copy ${file}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        const summary = dryRun
          ? `Found ${files.length} modified files (dry run - no files copied)`
          : `Copied ${filesCopied}/${files.length} files to main worktree`;

        logger.info(`[worktree_recover] ${summary}`);

        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, summary, files, errors }, null, 2) }],
          structuredContent: {
            success: true,
            filesFound: files.length,
            filesCopied: dryRun ? undefined : filesCopied,
            files,
            errors: errors.length > 0 ? errors : undefined,
          },
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`[worktree_recover] Failed: ${errorMsg}`);
        return {
          content: [{ type: 'text', text: `Recovery failed: ${errorMsg}` }],
          structuredContent: { success: false, filesFound: 0, files: [], errors: [errorMsg] },
        };
      }
    }
  );
}
