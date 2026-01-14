/**
 * rapid auth - Show and manage authentication status
 */

import { Command } from 'commander';
import {
  logger,
  getAuthStatus,
  detectAllCredentials,
  type DetectedCredential,
} from '@a3t/rapid-core';
import ora from 'ora';

export const authCommand = new Command('auth')
  .description('Show authentication status from external tools')
  .option('--json', 'Output as JSON')
  .option('--source <source>', 'Filter by source (claude-code, codex, gemini-cli, aider, env)')
  .option('--provider <provider>', 'Filter by provider (anthropic, openai, google)')
  .action(async (options) => {
    try {
      const spinner = ora('Checking authentication...').start();

      const status = await getAuthStatus();

      spinner.stop();

      if (options.json) {
        let credentials = status.sources;

        // Apply filters
        if (options.source) {
          credentials = credentials.filter((c: DetectedCredential) => c.source === options.source);
        }
        if (options.provider) {
          credentials = credentials.filter(
            (c: DetectedCredential) => c.provider === options.provider
          );
        }

        // Remove sensitive values for JSON output
        const sanitized = credentials.map((c: DetectedCredential) => ({
          source: c.source,
          provider: c.provider,
          authType: c.authType,
          envVar: c.envVar,
          expiresAt: c.expiresAt?.toISOString(),
          accountInfo: c.accountInfo,
          configPath: c.configPath,
          hasValue: !!c.value,
        }));

        console.log(
          JSON.stringify(
            {
              authenticated: sanitized.length > 0,
              sources: sanitized,
              warnings: status.warnings,
            },
            null,
            2
          )
        );
        return;
      }

      // Pretty output
      console.log();
      console.log(`  ${logger.brand('RAPID')} Authentication`);
      console.log(`  ${logger.dim('─'.repeat(24))}`);
      console.log();

      if (!status.authenticated) {
        console.log(`  ${logger.dim('No authentication detected')}`);
        console.log();
        console.log('  To authenticate, use one of these methods:');
        console.log();
        console.log(`    ${logger.brand('Claude Pro/Max:')}`);
        console.log('      Run `claude` and sign in with your Anthropic account');
        console.log();
        console.log(`    ${logger.brand('OpenAI (ChatGPT Plus/Pro):')}`);
        console.log('      Run `codex` and sign in with ChatGPT');
        console.log();
        console.log(`    ${logger.brand('Gemini:')}`);
        console.log('      Run `gemini` and sign in with your Google account');
        console.log();
        console.log(`    ${logger.brand('API Keys:')}`);
        console.log('      Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY');
        console.log();
        return;
      }

      // Show detected credentials
      for (const cred of status.sources) {
        // Apply filters
        if (options.source && cred.source !== options.source) continue;
        if (options.provider && cred.provider !== options.provider) continue;

        const isPrimary = cred === status.preferredSource;
        const icon = isPrimary ? logger.brand('●') : logger.dim('○');
        const authIcon = cred.authType === 'oauth' ? logger.brand('OAuth') : logger.dim('API Key');

        console.log(`  ${icon} ${logger.bold(cred.source)}`);
        console.log(`    Provider: ${cred.provider}`);
        console.log(`    Auth: ${authIcon}`);

        if (cred.accountInfo?.email) {
          console.log(`    Account: ${cred.accountInfo.email}`);
        }
        if (cred.accountInfo?.organization) {
          console.log(`    Org: ${cred.accountInfo.organization}`);
        }
        if (cred.accountInfo?.plan) {
          console.log(`    Plan: ${logger.brand(cred.accountInfo.plan)}`);
        }
        if (cred.expiresAt) {
          const now = new Date();
          const expiresIn = Math.round((cred.expiresAt.getTime() - now.getTime()) / 1000 / 60);
          if (expiresIn > 0) {
            console.log(`    Expires: in ${expiresIn} minutes`);
          } else {
            console.log(`    Expires: ${logger.dim('EXPIRED')}`);
          }
        }
        if (cred.configPath) {
          console.log(`    Config: ${logger.dim(cred.configPath)}`);
        }
        if (cred.envVar) {
          console.log(`    Env: ${logger.dim(cred.envVar)}`);
        }

        if (isPrimary) {
          console.log(`    ${logger.brand('→ Primary source')}`);
        }

        console.log();
      }

      // Warnings
      if (status.warnings && status.warnings.length > 0) {
        console.log(`  ${logger.dim('Warnings:')}`);
        for (const warning of status.warnings) {
          console.log(`    ! ${warning}`);
        }
        console.log();
      }

      // Helpful info
      console.log(`  ${logger.dim('Tip:')} RAPID will automatically use detected`);
      console.log(`  ${logger.dim('     ')} credentials when launching AI agents.`);
      console.log();
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Subcommand: rapid auth env
authCommand
  .command('env')
  .description('Show environment variables for detected credentials')
  .option('--export', 'Output as export statements')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const credentials = await detectAllCredentials();

      // Group by provider and prefer OAuth
      const byProvider = new Map<string, { envVar: string; masked: string }>();

      for (const cred of credentials) {
        if (!cred.value) continue;

        const existing = byProvider.get(cred.provider);
        if (!existing || (cred.authType === 'oauth' && cred.envVar)) {
          let envVar: string;
          switch (cred.provider) {
            case 'anthropic':
              envVar = cred.authType === 'oauth' ? 'ANTHROPIC_AUTH_TOKEN' : 'ANTHROPIC_API_KEY';
              break;
            case 'openai':
              envVar = cred.authType === 'oauth' ? 'OPENAI_AUTH_TOKEN' : 'OPENAI_API_KEY';
              break;
            case 'google':
              envVar =
                cred.authType === 'oauth' ? 'GOOGLE_AUTH_TOKEN' : cred.envVar || 'GEMINI_API_KEY';
              break;
            default:
              continue;
          }

          // Mask the value
          const masked = cred.value.slice(0, 8) + '...' + cred.value.slice(-4);

          byProvider.set(cred.provider, { envVar, masked });
        }
      }

      if (options.json) {
        const result: Record<string, string> = {};
        for (const [, { envVar, masked }] of byProvider) {
          result[envVar] = masked;
        }
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (options.export) {
        for (const [, { envVar }] of byProvider) {
          // Note: We don't actually export the real value for security
          // This is for documentation purposes
          console.log(`# ${envVar} detected from external auth`);
          console.log(`# export ${envVar}="<your-token>"`);
        }
        return;
      }

      // Pretty output
      console.log();
      console.log(`  ${logger.brand('RAPID')} Auth Environment`);
      console.log(`  ${logger.dim('─'.repeat(24))}`);
      console.log();

      if (byProvider.size === 0) {
        console.log(`  ${logger.dim('No credentials detected')}`);
        console.log();
        return;
      }

      for (const [provider, { envVar, masked }] of byProvider) {
        console.log(`  ${logger.brand(provider)}`);
        console.log(`    ${envVar}=${masked}`);
        console.log();
      }

      console.log(`  ${logger.dim('These will be automatically injected when running agents.')}`);
      console.log();
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
