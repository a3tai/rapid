/**
 * Tests for update checker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdateChecker } from '../utils/update-checker.js';

// Mock the dependencies
vi.mock('update-notifier');
vi.mock('semver');
vi.mock('execa');
vi.mock('prompts');
vi.mock('@a3t/rapid-core', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    dim: vi.fn((text: string) => text),
  },
}));

describe('UpdateChecker', () => {
  let updateChecker: UpdateChecker;

  beforeEach(() => {
    vi.clearAllMocks();
    updateChecker = new UpdateChecker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be instantiated correctly', () => {
    expect(updateChecker).toBeInstanceOf(UpdateChecker);
  });

  // More tests can be added as needed
});
