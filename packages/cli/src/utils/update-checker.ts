/**
 * Auto-update functionality for RAPID CLI
 */

import updateNotifier from 'update-notifier';
import semver from 'semver';
import { execa } from 'execa';
import { logger } from '@a3t/rapid-core';
import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import prompts from 'prompts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

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
   * Perform the update
   */
  async performUpdate(): Promise<boolean> {
    try {
      logger.info('Updating RAPID CLI...');

      await execa('npm', ['install', '-g', `${this.packageName}@latest`], {
        stdio: 'inherit',
      });

      logger.success('RAPID CLI updated successfully!');
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
      } catch (error) {
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
