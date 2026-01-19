import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { assembleContext, matchesExcludePattern, isBinaryFile } from './context.js';

describe('matchesExcludePattern', () => {
  it('matches exact filenames', () => {
    expect(matchesExcludePattern('node_modules', ['node_modules'])).toBe(true);
    expect(matchesExcludePattern('README.md', ['node_modules'])).toBe(false);
  });

  it('matches glob patterns', () => {
    expect(matchesExcludePattern('src/test.ts', ['**/*.ts'])).toBe(true);
    expect(matchesExcludePattern('src/test.js', ['**/*.ts'])).toBe(false);
    expect(matchesExcludePattern('dist/index.js', ['dist/**'])).toBe(true);
  });
});

describe('isBinaryFile', () => {
  it('identifies binary file extensions', () => {
    expect(isBinaryFile('image.png')).toBe(true);
    expect(isBinaryFile('photo.jpg')).toBe(true);
    expect(isBinaryFile('archive.zip')).toBe(true);
    expect(isBinaryFile('program.exe')).toBe(true);
  });

  it('identifies text file extensions', () => {
    expect(isBinaryFile('code.ts')).toBe(false);
    expect(isBinaryFile('README.md')).toBe(false);
    expect(isBinaryFile('config.json')).toBe(false);
  });

  it('identifies lock files as binary', () => {
    expect(isBinaryFile('package-lock.json')).toBe(true);
    expect(isBinaryFile('pnpm-lock.yaml')).toBe(true);
    expect(isBinaryFile('yarn.lock')).toBe(true);
  });
});

describe('assembleContext with agentInstructionFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `rapid-context-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('includes all files when no agentInstructionFile is specified', async () => {
    await writeFile(join(testDir, 'README.md'), '# README');
    await writeFile(join(testDir, 'AGENTS.md'), '# Generic agent instructions');
    await writeFile(join(testDir, 'CLAUDE.md'), '# Claude-specific instructions');

    const result = await assembleContext(testDir, {
      files: ['README.md', 'AGENTS.md', 'CLAUDE.md'],
    });

    expect(result.files.length).toBe(3);
    expect(result.files.map((f) => f.relativePath)).toContain('README.md');
    expect(result.files.map((f) => f.relativePath)).toContain('AGENTS.md');
    expect(result.files.map((f) => f.relativePath)).toContain('CLAUDE.md');
  });

  it('excludes AGENTS.md when agentInstructionFile is specified and present', async () => {
    await writeFile(join(testDir, 'README.md'), '# README');
    await writeFile(join(testDir, 'AGENTS.md'), '# Generic agent instructions');
    await writeFile(join(testDir, 'CLAUDE.md'), '# Claude-specific instructions');

    const result = await assembleContext(
      testDir,
      {
        files: ['README.md', 'AGENTS.md', 'CLAUDE.md'],
      },
      {
        agentInstructionFile: 'CLAUDE.md',
      }
    );

    expect(result.files.length).toBe(2);
    expect(result.files.map((f) => f.relativePath)).toContain('README.md');
    expect(result.files.map((f) => f.relativePath)).toContain('CLAUDE.md');
    expect(result.files.map((f) => f.relativePath)).not.toContain('AGENTS.md');

    // AGENTS.md should be in skipped files
    expect(result.skippedFiles.some((f) => f.path.includes('AGENTS.md'))).toBe(true);
  });

  it('includes AGENTS.md when agentInstructionFile is AGENTS.md itself', async () => {
    await writeFile(join(testDir, 'README.md'), '# README');
    await writeFile(join(testDir, 'AGENTS.md'), '# Generic agent instructions');

    const result = await assembleContext(
      testDir,
      {
        files: ['README.md', 'AGENTS.md'],
      },
      {
        agentInstructionFile: 'AGENTS.md',
      }
    );

    expect(result.files.length).toBe(2);
    expect(result.files.map((f) => f.relativePath)).toContain('AGENTS.md');
  });

  it('includes AGENTS.md when agentInstructionFile is not in the files list', async () => {
    await writeFile(join(testDir, 'README.md'), '# README');
    await writeFile(join(testDir, 'AGENTS.md'), '# Generic agent instructions');

    const result = await assembleContext(
      testDir,
      {
        files: ['README.md', 'AGENTS.md'],
      },
      {
        // OPENCODE.md is specified but not in files list
        agentInstructionFile: 'OPENCODE.md',
      }
    );

    // Should include AGENTS.md since the agent-specific file isn't available
    expect(result.files.length).toBe(2);
    expect(result.files.map((f) => f.relativePath)).toContain('AGENTS.md');
  });

  it('handles undefined agentInstructionFile gracefully', async () => {
    await writeFile(join(testDir, 'README.md'), '# README');
    await writeFile(join(testDir, 'AGENTS.md'), '# Generic agent instructions');

    const result = await assembleContext(
      testDir,
      {
        files: ['README.md', 'AGENTS.md'],
      },
      {
        agentInstructionFile: undefined,
      }
    );

    expect(result.files.length).toBe(2);
    expect(result.files.map((f) => f.relativePath)).toContain('AGENTS.md');
  });

  it('is case-insensitive when matching instruction files', async () => {
    await writeFile(join(testDir, 'readme.md'), '# README');
    await writeFile(join(testDir, 'agents.md'), '# Generic agent instructions');
    await writeFile(join(testDir, 'claude.md'), '# Claude-specific instructions');

    const result = await assembleContext(
      testDir,
      {
        files: ['readme.md', 'agents.md', 'claude.md'],
      },
      {
        agentInstructionFile: 'CLAUDE.md', // uppercase
      }
    );

    expect(result.files.length).toBe(2);
    expect(result.files.map((f) => f.relativePath)).not.toContain('agents.md');
  });
});
