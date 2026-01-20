/**
 * Security Tools
 *
 * SAST, dependency audit, and secret scanning tools.
 * Provides check_security tool for comprehensive security analysis.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execa } from 'execa';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerContext } from '../server.js';

/**
 * Security issue severity
 */
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Security issue
 */
interface SecurityIssue {
  type: 'secret' | 'vulnerability' | 'code';
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
  fixed?: boolean;
}

/**
 * Common secret patterns to detect
 */
const SECRET_PATTERNS = [
  // API Keys
  { pattern: /sk-[a-zA-Z0-9]{48}/g, name: 'OpenAI API Key' },
  { pattern: /anthropic-[a-zA-Z0-9_-]{40,}/g, name: 'Anthropic API Key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: 'GitHub Personal Access Token' },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, name: 'GitHub OAuth Token' },
  { pattern: /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g, name: 'GitHub Fine-grained Token' },
  { pattern: /xox[baprs]-[a-zA-Z0-9-]{10,}/g, name: 'Slack Token' },
  { pattern: /AKIA[0-9A-Z]{16}/g, name: 'AWS Access Key ID' },
  { pattern: /npm_[a-zA-Z0-9]{36}/g, name: 'NPM Token' },

  // Private Keys
  { pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, name: 'Private Key' },
  { pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g, name: 'PGP Private Key' },

  // Generic patterns
  { pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/gi, name: 'Hardcoded Password' },
  { pattern: /secret\s*[:=]\s*['"][^'"]{8,}['"]/gi, name: 'Hardcoded Secret' },
  { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{16,}['"]/gi, name: 'Hardcoded API Key' },
];

/**
 * Files to skip when scanning
 */
const SKIP_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist/,
  /build/,
  /coverage/,
  /\.next/,
  /\.nuxt/,
  /vendor/,
  /\.pnpm/,
  /\.yarn/,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.min\.js$/,
  /\.bundle\.js$/,
  /\.map$/,
];

/**
 * Scan a file for secrets
 */
async function scanFileForSecrets(filePath: string, projectDir: string): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = filePath.replace(projectDir + '/', '');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      for (const { pattern, name } of SECRET_PATTERNS) {
        // Reset regex state
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          issues.push({
            type: 'secret',
            severity: 'critical',
            message: `Potential ${name} found`,
            file: relativePath,
            line: i + 1,
          });
        }
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return issues;
}

/**
 * Recursively scan directory for secrets
 */
async function scanDirectoryForSecrets(
  dir: string,
  projectDir: string,
  issues: SecurityIssue[],
  maxFiles = 10000
): Promise<void> {
  if (issues.length >= maxFiles) return;

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (issues.length >= maxFiles) break;

      const fullPath = join(dir, entry.name);

      // Skip excluded patterns
      if (SKIP_PATTERNS.some((pattern) => pattern.test(fullPath))) {
        continue;
      }

      if (entry.isDirectory()) {
        await scanDirectoryForSecrets(fullPath, projectDir, issues, maxFiles);
      } else if (entry.isFile()) {
        // Only scan text-like files
        const ext = entry.name.split('.').pop()?.toLowerCase();
        const textExts = [
          'js',
          'ts',
          'jsx',
          'tsx',
          'py',
          'rb',
          'go',
          'rs',
          'java',
          'c',
          'cpp',
          'h',
          'hpp',
          'cs',
          'php',
          'sh',
          'bash',
          'zsh',
          'yaml',
          'yml',
          'json',
          'xml',
          'env',
          'ini',
          'conf',
          'config',
          'md',
          'txt',
          'sql',
          'tf',
          'hcl',
        ];

        if (ext !== undefined && textExts.includes(ext)) {
          const stats = await stat(fullPath);
          // Skip large files (> 1MB)
          if (stats.size < 1024 * 1024) {
            const fileIssues = await scanFileForSecrets(fullPath, projectDir);
            issues.push(...fileIssues);
          }
        }
      }
    }
  } catch {
    // Skip directories that can't be read
  }
}

/**
 * Run npm audit for dependency vulnerabilities
 */
async function runNpmAudit(projectDir: string): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  try {
    // Check if package.json exists
    await stat(join(projectDir, 'package.json'));

    // Run npm audit
    const result = await execa('npm', ['audit', '--json'], {
      cwd: projectDir,
      reject: false,
      timeout: 60000,
    });

    if (result.stdout) {
      const audit = JSON.parse(result.stdout);

      if (audit.vulnerabilities) {
        for (const [name, vuln] of Object.entries(audit.vulnerabilities) as [
          string,
          { severity: string; via: Array<{ title?: string }> },
        ][]) {
          const severityMap: Record<string, Severity> = {
            critical: 'critical',
            high: 'high',
            moderate: 'medium',
            low: 'low',
            info: 'info',
          };

          issues.push({
            type: 'vulnerability',
            severity: severityMap[vuln.severity] || 'medium',
            message: `${name}: ${vuln.via?.[0]?.title || 'Vulnerability detected'}`,
          });
        }
      }
    }
  } catch {
    // npm audit failed or not available
  }

  return issues;
}

/**
 * Common security anti-patterns for SAST
 */
const SAST_PATTERNS = [
  // SQL Injection risks
  {
    pattern: /(?:sql\s*|query\s*|execute\s*)\(\s*[`"'].*\$\{.*\}.*[`"']/gi,
    message: 'Potential SQL injection: string interpolation in database query',
    severity: 'high' as Severity,
  },
  // Eval/exec risks
  {
    pattern: /\beval\s*\(|Function\s*\(\s*[`"']/gi,
    message: 'Use of eval() or Function() constructor detected - security risk',
    severity: 'critical' as Severity,
  },
  // Hardcoded credentials
  {
    pattern: /(?:password|apikey|secret)\s*[:=]\s*[`"'](?!.*\$|.*#)/gi,
    message: 'Hardcoded credentials detected',
    severity: 'critical' as Severity,
  },
  // Insecure random
  {
    pattern: /\bMath\.random\s*\(\)\s*\*/g,
    message: 'Using Math.random() for security purposes - use crypto instead',
    severity: 'high' as Severity,
  },
  // XXE/XML risks (simplified)
  {
    pattern: /new\s+XMLHttpRequest\(\)|DOMParser|parseXML/gi,
    message: 'XML parsing detected - ensure XXE prevention is in place',
    severity: 'medium' as Severity,
  },
];

/**
 * Perform static analysis security testing
 */
async function performStaticAnalysis(
  projectDir: string,
  verbose: boolean = false
): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  try {
    // Scan TypeScript/JavaScript files
    const tsFiles = await scanDirectory(projectDir, [/\.[jt]sx?$/], SKIP_PATTERNS);

    for (const filePath of tsFiles.slice(0, 100)) {
      // Limit to first 100 files for performance
      try {
        const content = await readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const relativePath = filePath.replace(projectDir + '/', '');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line === undefined) continue;

          for (const { pattern, message, severity } of SAST_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(line)) {
              issues.push({
                type: 'code',
                severity,
                message,
                file: relativePath,
                line: i + 1,
              });
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    if (verbose && issues.length > 0) {
      console.error(`[check_security] SAST found ${issues.length} potential issue(s)`);
    }
  } catch (error) {
    if (verbose) {
      console.error(`[check_security] SAST analysis failed: ${error}`);
    }
  }

  return issues;
}

/**
 * Scan directory for files matching patterns
 */
async function scanDirectory(
  dir: string,
  includePatterns: RegExp[],
  excludePatterns: RegExp[],
  maxDepth: number = 10,
  currentDepth: number = 0
): Promise<string[]> {
  const files: string[] = [];

  if (currentDepth >= maxDepth) {
    return files;
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = fullPath.replace(dir + '/', '');

      // Check exclude patterns
      if (excludePatterns.some((p) => p.test(relPath))) {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await scanDirectory(
          dir,
          includePatterns,
          excludePatterns,
          maxDepth,
          currentDepth + 1
        );
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Check include patterns
        if (includePatterns.some((p) => p.test(fullPath))) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}

/**
 * Register security tools with the MCP server
 */
export function registerSecurityTools(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'check_security',
    {
      title: 'Security Check',
      description:
        'Run security checks on the project including secret scanning, ' +
        'dependency audit, and static analysis. Returns a list of issues found.',
      inputSchema: {
        checks: z
          .array(z.enum(['secrets', 'dependencies', 'sast']))
          .default(['secrets', 'dependencies'])
          .describe('Which checks to run'),
        fix: z.boolean().default(false).describe('Attempt to fix issues (not implemented)'),
      },
      outputSchema: {
        passed: z.boolean(),
        issues: z.array(
          z.object({
            type: z.enum(['secret', 'vulnerability', 'code']),
            severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
            message: z.string(),
            file: z.string().optional(),
            line: z.number().optional(),
            fixed: z.boolean().optional(),
          })
        ),
        summary: z.object({
          total: z.number(),
          critical: z.number(),
          high: z.number(),
          medium: z.number(),
          low: z.number(),
        }),
        checksRun: z.array(z.string()),
      },
    },
    async (args) => {
      const { checks } = args as { checks: ('secrets' | 'dependencies' | 'sast')[]; fix: boolean };
      const issues: SecurityIssue[] = [];
      const checksRun: string[] = [];

      // Secret scanning
      if (checks.includes('secrets')) {
        checksRun.push('secrets');
        if (context.verbose) {
          console.error('[check_security] Running secret scan...');
        }
        await scanDirectoryForSecrets(context.projectDir, context.projectDir, issues);
      }

      // Dependency audit
      if (checks.includes('dependencies')) {
        checksRun.push('dependencies');
        if (context.verbose) {
          console.error('[check_security] Running dependency audit...');
        }
        const depIssues = await runNpmAudit(context.projectDir);
        issues.push(...depIssues);
      }

      // SAST (Static Analysis Security Testing)
      if (checks.includes('sast')) {
        checksRun.push('sast');
        const sastIssues = await performStaticAnalysis(context.projectDir, context.verbose);
        issues.push(...sastIssues);
      }

      // Calculate summary
      const summary = {
        total: issues.length,
        critical: issues.filter((i) => i.severity === 'critical').length,
        high: issues.filter((i) => i.severity === 'high').length,
        medium: issues.filter((i) => i.severity === 'medium').length,
        low: issues.filter((i) => i.severity === 'low').length,
      };

      const passed = summary.critical === 0 && summary.high === 0;

      const output = {
        passed,
        issues,
        summary,
        checksRun,
      };

      if (context.verbose) {
        console.error(
          `[check_security] Complete: ${summary.total} issues (${summary.critical} critical, ${summary.high} high)`
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
