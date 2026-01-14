/**
 * Update command for RAPID CLI
 */

import { Command } from 'commander';
import { updateChecker } from '../utils/update-checker.js';
import { logger } from '@a3t/rapid-core';

export const updateCommand = new Command('update')
  .description('Check for and apply updates')
  .option('--check', 'Check for updates only')
  .option('--force', 'Force update even for major versions')
  .action(async (options) => {
    try {
      if (options.check) {
        // Check for updates only
        logger.header('Checking for updates...');

        if (!updateChecker.hasUpdate()) {
          logger.success('You are using the latest version!');
          return;
        }

        const updateInfo = updateChecker.getUpdateInfo();
        if (updateInfo) {
          updateChecker.showNotification();

          if (updateInfo.type === 'major') {
            logger.warn('This is a major version update with breaking changes.');
            logger.info('Use "rapid update --force" to update.');
          } else {
            logger.info('Use "rapid update" to apply the update.');
          }
        }
        return;
      }

      // Perform update
      if (!updateChecker.hasUpdate()) {
        logger.success('You are already using the latest version!');
        return;
      }

      const updateInfo = updateChecker.getUpdateInfo();
      if (updateInfo && updateInfo.type === 'major' && !options.force) {
        logger.warn('This is a major version update with breaking changes.');
        logger.info('Use --force to update anyway.');
        return;
      }

      await updateChecker.forceUpdate();
    } catch (error) {
      logger.error('Update failed:', error);
      process.exit(1);
    }
  });
