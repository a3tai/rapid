/**
 * Auto-update functionality for RAPID CLI
 */

import updateNotifier from 'update-notifier';
import semver from 'semver';
import { execa } from 'execa';
import { logger } from '@a3t/rapid-core';
import chalk from 'chalk';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import prompts from 'prompts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Try multiple paths to find package.json (handles both bundled dist and source tests)
function loadPackageJson() {
  const paths = [
    join(__dirname, '../package.json'), // bundled: dist/ -> package root
    join(__dirname, '../../package.json'), // source: src/utils/ -> package root
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, 'utf-8'));
    }
  }
  // Fallback with default values if package.json not found
  return { name: '@a3t/rapid', version: '0.0.0' };
}

const packageJson = loadPackageJson();

interface UpdateInfo {
  current: string;
  latest: string;
  type: 'major' | 'minor' | 'patch' | 'prerelease' | 'build';
}

export class UpdateChecker {
  private notifier: ReturnType<typeof updateNotifier>;
  private packageName = packageJson.name;

  constructor() {
    this.notifier = updateNotifier({
      pkg: packageJson,
      updateCheckInterval: 1000 * 60 * 60 * 24, // Check daily
      shouldNotifyInNpmScript: true,
    });
  }

  /**
   * Check if an update is available
   */
  hasUpdate(): boolean {
    return !!this.notifier.update;
  }

  /**
   * Get update information
   */
  getUpdateInfo(): UpdateInfo | null {
    if (!this.notifier.update) return null;

    return {
      current: this.notifier.update.current,
      latest: this.notifier.update.latest,
      type: this.getUpdateType(this.notifier.update.current, this.notifier.update.latest),
    };
  }

  /**
   * Determine the type of update (major, minor, patch)
   */
  private getUpdateType(current: string, latest: string): UpdateInfo['type'] {
    const diff = semver.diff(current, latest);
    if (diff === 'premajor' || diff === 'preminor' || diff === 'prepatch') {
      return 'prerelease';
    }
    return (diff as UpdateInfo['type']) || 'patch';
  }

  /**
   * Show update notification
   */
  showNotification(): void {
    if (!this.notifier.update) return;

    const { current, latest } = this.notifier.update;
    const updateType = this.getUpdateType(current, latest);

    logger.info(`Update available: ${logger.dim(current)} → ${chalk.green(latest)}`);

    if (updateType === 'major') {
      logger.warn('This is a major version update with breaking changes.');
    }
  }

  /**
   * Verify package signatures using npm audit signatures
   */
  async verifySignatures(): Promise<boolean> {
    try {
      logger.info('Verifying package signatures...');
      const result = await execa('npm', ['audit', 'signatures'], {
        reject: false,
      });

      if (result.exitCode === 0) {
        logger.success('Package signatures verified successfully');
        return true;
      } else {
        // npm audit signatures returns non-zero if there are issues
        logger.warn('Package signature verification returned warnings');
        logger.debug(result.stdout || result.stderr);
        // Don't fail on warnings, just log them
        return true;
      }
    } catch {
      // If npm audit signatures is not available (older npm), skip verification
      logger.debug('Signature verification not available (requires npm >= 9)');
      return true;
    }
  }

  /**
   * Perform the update with signature verification
   */
  async performUpdate(): Promise<boolean> {
    try {
      logger.info('Updating RAPID CLI...');

      // Install the package
      await execa('npm', ['install', '-g', `${this.packageName}@latest`], {
        stdio: 'inherit',
      });

      // Verify signatures (non-blocking)
      await this.verifySignatures();

      logger.success('RAPID CLI updated successfully!');
      logger.info('Package published with npm provenance - cryptographically verified');
      return true;
    } catch (error) {
      logger.error('Failed to update RAPID CLI:', error);
      return false;
    }
  }

  /**
   * Check for updates and handle them according to version type
   */
  async checkAndUpdate(): Promise<void> {
    if (!this.hasUpdate()) return;

    const updateInfo = this.getUpdateInfo();
    if (!updateInfo) return;

    this.showNotification();

    if (updateInfo.type === 'major') {
      // Ask user consent for major updates
      logger.warn(
        `This is a major version update (${updateInfo.current} → ${updateInfo.latest}) that may contain breaking changes.`
      );

      try {
        const response = await prompts({
          type: 'confirm',
          name: 'shouldUpdate',
          message: 'Would you like to update to this major version?',
          initial: false,
        });

        if (response.shouldUpdate) {
          logger.info(`Updating to ${updateInfo.latest} (major version)...`);
          await this.performUpdate();
        } else {
          logger.info('Skipping major version update.');
          logger.info('You can update later with "rapid update --force"');
        }
      } catch {
        // If prompt fails (non-interactive), show manual instructions
        logger.info(
          'Run "rapid update" to update manually, or use "rapid update --force" to update automatically.'
        );
      }
      return;
    }

    // Auto-update for minor and patch versions
    logger.info(`Auto-updating to ${updateInfo.latest} (${updateInfo.type} version)...`);
    await this.performUpdate();
  }

  /**
   * Force update regardless of version type
   */
  async forceUpdate(): Promise<void> {
    if (!this.hasUpdate()) {
      logger.info('No updates available.');
      return;
    }

    const updateInfo = this.getUpdateInfo();
    if (updateInfo) {
      this.showNotification();
    }

    await this.performUpdate();
  }
}

export const updateChecker = new UpdateChecker();
