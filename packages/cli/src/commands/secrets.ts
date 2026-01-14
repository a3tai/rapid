/**
 * rapid secrets - Manage project secrets
 */

import { Command } from 'commander';
import {
  loadConfig,
  logger,
  verifySecrets,
  loadSecrets,
  hasOpCli,
  hasVaultCli,
  isOpAuthenticated,
  isVaultAuthenticated,
  getOpAuthStatus,
  hasOpServiceAccountToken,
  generateEnvrc,
  writeEnvrc,
  hasEnvrc,
  getProviderInfo,
} from '@a3t/rapid-core';
import ora from 'ora';

export const secretsCommand = new Command('secrets').description('Manage project secrets');

/**
 * rapid secrets verify - Verify all secrets are accessible
 */
secretsCommand
  .command('verify')
  .description('Verify all secrets are accessible')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Verifying secrets...').start();

    try {
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found');
        process.exit(1);
      }

      const { config } = loaded;
      const secretsConfig = config.secrets;

      if (!secretsConfig) {
        spinner.info('No secrets configured');
        return;
      }

      const provider = secretsConfig.provider || 'env';

      // Check CLI availability
      spinner.text = `Checking ${provider} availability...`;

      if (provider === '1password') {
        const hasOp = await hasOpCli();
        if (!hasOp) {
          spinner.fail('1Password CLI (op) not found');
          console.log();
          logger.info('Install with: brew install 1password-cli');
          logger.info('More info: https://developer.1password.com/docs/cli/get-started/');
          process.exit(1);
        }

        const authenticated = await isOpAuthenticated();
        if (!authenticated) {
          spinner.fail('1Password CLI not authenticated');
          console.log();
          logger.info('Run: eval $(op signin)');
          process.exit(1);
        }
      } else if (provider === 'vault') {
        const hasVault = await hasVaultCli();
        if (!hasVault) {
          spinner.fail('Vault CLI not found');
          console.log();
          logger.info('Install from: https://developer.hashicorp.com/vault/docs/install');
          process.exit(1);
        }

        const authenticated = await isVaultAuthenticated();
        if (!authenticated) {
          spinner.fail('Vault CLI not authenticated');
          console.log();
          logger.info('Run: vault login');
          process.exit(1);
        }
      }

      // Verify secrets
      spinner.text = 'Verifying secrets...';
      const status = await verifySecrets(secretsConfig);

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      // Pretty output
      console.log();
      console.log(`  ${logger.brand('Secrets')} Verification`);
      console.log(`  ${logger.dim('─'.repeat(24))}`);
      console.log();

      console.log(`  ${logger.dim('Provider:')}  ${getProviderInfo(provider).name}`);
      console.log(
        `  ${logger.dim('Auth:')}      ${status.authenticated ? logger.brand('✓') : logger.dim('○')} ${status.authenticated ? 'Authenticated' : 'Not authenticated'}`
      );
      console.log();

      if (status.secrets.length === 0) {
        console.log(`  ${logger.dim('No secrets configured in rapid.json')}`);
        console.log();
        return;
      }

      console.log(`  ${logger.dim('Secrets:')}`);
      for (const secret of status.secrets) {
        const icon = secret.available ? logger.brand('✓') : '✗';
        const ref = logger.dim(`(${provider})`);
        const error = secret.error ? logger.dim(` - ${secret.error}`) : '';

        console.log(`    ${icon} ${secret.name} ${ref}${error}`);
      }
      console.log();

      if (status.allAvailable) {
        logger.info('All secrets verified successfully!');
      } else {
        logger.error('Some secrets are not available');
        process.exit(1);
      }
      console.log();
    } catch (error) {
      spinner.fail('Failed to verify secrets');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid secrets list - List configured secrets
 */
secretsCommand
  .command('list')
  .description('List configured secrets (names only, not values)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const loaded = await loadConfig();

      if (!loaded) {
        logger.error('No rapid.json found');
        process.exit(1);
      }

      const { config } = loaded;
      const secretsConfig = config.secrets;

      if (!secretsConfig || !secretsConfig.items || Object.keys(secretsConfig.items).length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ secrets: [] }, null, 2));
        } else {
          logger.info('No secrets configured');
        }
        return;
      }

      const provider = secretsConfig.provider || 'env';

      if (options.json) {
        const secrets = Object.entries(secretsConfig.items).map(([name, reference]) => ({
          name,
          reference,
          provider,
        }));
        console.log(JSON.stringify({ provider, secrets }, null, 2));
        return;
      }

      // Pretty output
      console.log();
      console.log(`  ${logger.brand('Configured Secrets')}`);
      console.log(`  ${logger.dim('─'.repeat(24))}`);
      console.log();

      console.log(`  ${logger.dim('Provider:')} ${getProviderInfo(provider).name}`);
      console.log();

      // Calculate padding for alignment
      const maxNameLen = Math.max(...Object.keys(secretsConfig.items).map((n) => n.length));

      for (const [name, reference] of Object.entries(secretsConfig.items)) {
        const paddedName = name.padEnd(maxNameLen);
        console.log(`  ${logger.brand('•')} ${paddedName}  ${logger.dim(reference)}`);
      }
      console.log();
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid secrets generate - Generate .envrc from configuration
 */
secretsCommand
  .command('generate')
  .description('Generate .envrc file from rapid.json configuration')
  .option('--force', 'Overwrite existing .envrc', false)
  .option('--stdout', 'Print to stdout instead of writing file', false)
  .action(async (options) => {
    try {
      const loaded = await loadConfig();

      if (!loaded) {
        logger.error('No rapid.json found');
        process.exit(1);
      }

      const { config, rootDir } = loaded;
      const secretsConfig = config.secrets;

      if (!secretsConfig) {
        logger.error('No secrets configuration in rapid.json');
        process.exit(1);
      }

      const content = generateEnvrc(secretsConfig);

      if (options.stdout) {
        console.log(content);
        return;
      }

      // Check if .envrc exists
      const envrcExists = await hasEnvrc(rootDir, secretsConfig);
      if (envrcExists && !options.force) {
        logger.error('.envrc already exists. Use --force to overwrite.');
        process.exit(1);
      }

      const spinner = ora('Generating .envrc...').start();

      const filepath = await writeEnvrc(rootDir, secretsConfig);

      spinner.succeed('Generated .envrc');
      console.log();
      console.log(`  ${logger.dim('File:')} ${filepath}`);
      console.log();

      const itemCount = secretsConfig.items ? Object.keys(secretsConfig.items).length : 0;
      logger.info(`Generated .envrc with ${itemCount} secret${itemCount !== 1 ? 's' : ''}`);
      logger.info(`Run ${logger.brand('direnv allow')} to activate`);
      console.log();
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid secrets info - Show provider information and status
 */
secretsCommand
  .command('info')
  .description('Show secrets provider information and authentication status')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Checking provider status...').start();

    try {
      const loaded = await loadConfig();

      if (!loaded) {
        spinner.fail('No rapid.json found');
        process.exit(1);
      }

      const { config, rootDir } = loaded;
      const secretsConfig = config.secrets || { provider: 'env' };
      const provider = secretsConfig.provider || 'env';

      const info = getProviderInfo(provider);

      let cliInstalled = true;
      let authenticated = true;

      let opAuthStatus: { authenticated: boolean; method: string; accountInfo?: string } | null =
        null;

      if (provider === '1password') {
        cliInstalled = await hasOpCli();
        if (cliInstalled) {
          opAuthStatus = await getOpAuthStatus();
          authenticated = opAuthStatus.authenticated;
        } else {
          authenticated = false;
        }
      } else if (provider === 'vault') {
        cliInstalled = await hasVaultCli();
        authenticated = cliInstalled && (await isVaultAuthenticated());
      }

      const envrcExists = await hasEnvrc(rootDir, secretsConfig);
      const hasServiceToken = hasOpServiceAccountToken();

      spinner.stop();

      const status = {
        provider,
        providerName: info.name,
        cliRequired: info.cliRequired,
        cliInstalled,
        authenticated,
        authMethod: opAuthStatus?.method,
        accountInfo: opAuthStatus?.accountInfo,
        hasServiceToken,
        envrcExists,
        envrcPath: secretsConfig.envrc?.path || '.envrc',
        secretsCount: secretsConfig.items ? Object.keys(secretsConfig.items).length : 0,
      };

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      // Pretty output
      console.log();
      console.log(`  ${logger.brand('Secrets')} Provider Info`);
      console.log(`  ${logger.dim('─'.repeat(24))}`);
      console.log();

      console.log(`  ${logger.dim('Provider:')}      ${info.name}`);

      if (info.cliRequired) {
        const cliIcon = cliInstalled ? logger.brand('✓') : '✗';
        console.log(
          `  ${logger.dim('CLI:')}          ${cliIcon} ${info.cliRequired} ${cliInstalled ? '' : logger.dim('(not installed)')}`
        );

        if (cliInstalled && provider === '1password' && opAuthStatus) {
          const authIcon = authenticated ? logger.brand('✓') : '✗';
          const methodLabel =
            opAuthStatus.method === 'service-account'
              ? 'Service Account'
              : opAuthStatus.method === 'user'
                ? 'User'
                : 'Not authenticated';
          const accountLabel = opAuthStatus.accountInfo ? ` (${opAuthStatus.accountInfo})` : '';
          console.log(`  ${logger.dim('Auth:')}         ${authIcon} ${methodLabel}${accountLabel}`);

          if (hasServiceToken) {
            console.log(
              `  ${logger.dim('Token:')}        ${logger.brand('✓')} OP_SERVICE_ACCOUNT_TOKEN set`
            );
          }
        } else if (cliInstalled) {
          const authIcon = authenticated ? logger.brand('✓') : '✗';
          console.log(
            `  ${logger.dim('Auth:')}         ${authIcon} ${authenticated ? 'Authenticated' : 'Not authenticated'}`
          );
        }

        if (info.installUrl && !cliInstalled) {
          console.log();
          console.log(`  ${logger.dim('Install:')}      ${info.installUrl}`);
        }

        if (info.authCommand && cliInstalled && !authenticated) {
          console.log();
          console.log(`  ${logger.dim('Authenticate:')} ${info.authCommand}`);
          if (provider === '1password') {
            console.log(
              `  ${logger.dim('Or set:')}       OP_SERVICE_ACCOUNT_TOKEN for non-interactive auth`
            );
          }
        }
      }

      console.log();

      const envrcIcon = envrcExists ? logger.brand('✓') : logger.dim('○');
      console.log(
        `  ${logger.dim('.envrc:')}       ${envrcIcon} ${envrcExists ? 'Exists' : 'Not generated'}`
      );
      console.log(`  ${logger.dim('Secrets:')}      ${status.secretsCount} configured`);
      console.log();

      if (!envrcExists && status.secretsCount > 0) {
        logger.info(`Run ${logger.brand('rapid secrets generate')} to create .envrc`);
        console.log();
      }
    } catch (error) {
      spinner.fail('Failed to get provider info');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * rapid secrets run -- <command> - Run a command with secrets injected
 */
secretsCommand
  .command('run')
  .description('Run a command with secrets loaded into environment')
  .argument('<command...>', 'Command to run with secrets')
  .option('--show', 'Show which secrets are being loaded (names only)', false)
  .action(async (commandArgs: string[], options) => {
    try {
      const loaded = await loadConfig();

      if (!loaded) {
        logger.error('No rapid.json found');
        process.exit(1);
      }

      const { config } = loaded;
      const secretsConfig = config.secrets;

      if (!secretsConfig || !secretsConfig.items) {
        logger.error('No secrets configured in rapid.json');
        process.exit(1);
      }

      const provider = secretsConfig.provider || 'env';

      // Check CLI availability for 1Password
      if (provider === '1password') {
        const hasOp = await hasOpCli();
        if (!hasOp) {
          logger.error('1Password CLI (op) not found');
          logger.info('Install with: brew install 1password-cli');
          process.exit(1);
        }

        const authenticated = await isOpAuthenticated();
        if (!authenticated) {
          logger.error('1Password not authenticated');
          logger.info('Run: eval $(op signin)');
          process.exit(1);
        }
      }

      // Load secrets
      const secrets = await loadSecrets(secretsConfig);
      const secretCount = Object.keys(secrets).length;

      if (secretCount === 0) {
        logger.warn('No secrets were loaded');
      } else if (options.show) {
        logger.info(`Loaded ${secretCount} secret${secretCount !== 1 ? 's' : ''}:`);
        for (const name of Object.keys(secrets)) {
          console.log(`  ${logger.brand('•')} ${name}`);
        }
        console.log();
      }

      // Run the command with secrets in environment
      const { execa } = await import('execa');
      const [cmd, ...args] = commandArgs;

      if (!cmd) {
        logger.error('No command specified');
        process.exit(1);
      }

      await execa(cmd, args, {
        stdio: 'inherit',
        env: {
          ...process.env,
          ...secrets,
        },
      });
    } catch (error) {
      if ((error as { exitCode?: number }).exitCode !== undefined) {
        process.exit((error as { exitCode: number }).exitCode);
      }
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
