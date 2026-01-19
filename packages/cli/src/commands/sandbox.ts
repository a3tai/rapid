/**
 * rapid sandbox - Manage sandbox runtime
 */

import { Command } from 'commander';
import { loadConfig, logger } from '@a3t/rapid-core';
import ora from 'ora';
import type { SandboxConfig } from '@a3t/rapid-runtime';

export const sandboxCommand = new Command('sandbox')
  .description('Manage OS-level sandbox runtime')
  .addCommand(
    new Command('status')
      .description('Show sandbox status')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          const spinner = ora('Checking sandbox status...').start();

          // Dynamic import to avoid loading runtime package at CLI startup
          const { SandboxManager } = await import('@a3t/rapid-runtime');

          const available = await SandboxManager.isAvailable();
          const method = await SandboxManager.getMethod();

          // Load config
          const loaded = await loadConfig();
          const config = loaded?.config;
          const sandboxConfig = config?.sandbox;

          spinner.stop();

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  available,
                  method,
                  platform: process.platform,
                  configured: !!sandboxConfig,
                  enabled: sandboxConfig?.enabled ?? true,
                  mode: sandboxConfig?.mode ?? 'auto',
                },
                null,
                2
              )
            );
            return;
          }

          // Pretty output
          console.log();
          console.log(`  ${logger.brand('RAPID')} Sandbox Status`);
          console.log(`  ${logger.dim('─'.repeat(28))}`);
          console.log();

          console.log(
            `  ${logger.dim('Platform:')}    ${process.platform === 'darwin' ? 'macOS' : process.platform === 'linux' ? 'Linux' : process.platform}`
          );
          console.log(
            `  ${logger.dim('Method:')}      ${method === 'none' ? logger.dim('None available') : method === 'seatbelt' ? 'Seatbelt (sandbox-exec)' : 'Bubblewrap (bwrap)'}`
          );

          const availableIcon = available ? logger.brand('✓') : logger.dim('○');
          console.log(
            `  ${logger.dim('Available:')}   ${availableIcon} ${available ? 'Yes' : 'No'}`
          );

          console.log();

          if (sandboxConfig) {
            console.log(`  ${logger.dim('Configuration:')}`);
            console.log(
              `    ${logger.dim('Enabled:')}  ${sandboxConfig.enabled !== false ? 'Yes' : 'No'}`
            );
            console.log(`    ${logger.dim('Mode:')}     ${sandboxConfig.mode ?? 'auto'}`);

            if (sandboxConfig.network?.allowedDomains?.length) {
              console.log(
                `    ${logger.dim('Network:')}  ${sandboxConfig.network.allowedDomains.length} allowed domains`
              );
            }

            if (sandboxConfig.filesystem?.allowWrite?.length) {
              console.log(
                `    ${logger.dim('Write:')}    ${sandboxConfig.filesystem.allowWrite.length} writable paths`
              );
            }
          } else {
            console.log(`  ${logger.dim('Configuration:')} Not configured in rapid.json`);
          }

          console.log();

          if (!available) {
            if (process.platform === 'darwin') {
              logger.info('Seatbelt should be available on macOS by default');
            } else if (process.platform === 'linux') {
              logger.info('Install bubblewrap: apt install bubblewrap');
            } else {
              logger.info('Sandbox is only available on macOS and Linux');
            }
          }

          console.log();
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('test')
      .description('Test sandbox isolation')
      .option('--network', 'Test network filtering')
      .option('--filesystem', 'Test filesystem restrictions')
      .action(async (_options) => {
        try {
          const spinner = ora('Testing sandbox...').start();

          const { SandboxManager } = await import('@a3t/rapid-runtime');

          const available = await SandboxManager.isAvailable();

          if (!available) {
            spinner.fail('Sandbox is not available on this system');
            process.exit(1);
          }

          // Create a test sandbox with standard preset
          const manager = SandboxManager.fromPreset('standard', {
            cwd: process.cwd(),
            verbose: true,
          });

          await manager.initialize();

          spinner.text = 'Running test command...';

          // Test basic command execution
          const result = await manager.execute(['echo', 'Sandbox test successful'], {
            stdout: 'pipe',
            stderr: 'pipe',
          });

          await manager.shutdown();

          spinner.stop();

          if (result.exitCode === 0) {
            console.log();
            console.log(`  ${logger.brand('✓')} Sandbox test passed`);
            console.log(`  ${logger.dim('Output:')} ${result.stdout?.trim()}`);
            console.log();
          } else {
            console.log();
            console.log(`  ${logger.dim('○')} Sandbox test failed`);
            console.log(`  ${logger.dim('Exit code:')} ${result.exitCode}`);
            if (result.stderr) {
              console.log(`  ${logger.dim('Error:')} ${result.stderr}`);
            }
            console.log();
            process.exit(1);
          }
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('presets').description('Show available sandbox presets').action(async () => {
      try {
        const { SANDBOX_PRESETS } = await import('@a3t/rapid-runtime');

        console.log();
        console.log(`  ${logger.brand('RAPID')} Sandbox Presets`);
        console.log(`  ${logger.dim('─'.repeat(28))}`);
        console.log();

        for (const [name, preset] of Object.entries(SANDBOX_PRESETS) as [
          string,
          Partial<SandboxConfig>,
        ][]) {
          console.log(`  ${logger.bold(name)}`);

          if (preset.enabled === false) {
            console.log(`    ${logger.dim('Disabled - no sandbox isolation')}`);
          } else {
            console.log(`    ${logger.dim('Mode:')} ${preset.mode ?? 'auto'}`);

            if (preset.network?.blockAll) {
              console.log(`    ${logger.dim('Network:')} Blocked`);
            } else if (preset.network?.allowedDomains?.length) {
              console.log(
                `    ${logger.dim('Network:')} ${preset.network.allowedDomains.length} allowed domains`
              );
            }

            if (preset.filesystem?.readOnlyRoot) {
              console.log(`    ${logger.dim('Filesystem:')} Read-only root`);
            }

            if (preset.filesystem?.allowWrite?.length) {
              console.log(
                `    ${logger.dim('Writable:')} ${preset.filesystem.allowWrite.join(', ')}`
              );
            }
          }
          console.log();
        }
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    })
  );
