/**
 * Git SSH signing configuration for RAPID
 *
 * Configures git to use SSH keys for commit/tag signing.
 * This enables verified commits without GPG complexity.
 */

import { execa } from 'execa';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

/**
 * SSH key information
 */
export interface SshKeyInfo {
  /** Key type (ed25519, rsa, etc.) */
  type: string;
  /** Public key content */
  publicKey: string;
  /** Key comment (usually email) */
  comment: string;
  /** Full path to the key file */
  path: string;
}

/**
 * Git signing configuration status
 */
export interface SigningStatus {
  enabled: boolean;
  format: 'ssh' | 'gpg' | 'x509' | 'none';
  signingKey?: string;
  allowedSignersFile?: string;
}

/**
 * List available SSH keys
 */
export async function listSshKeys(): Promise<SshKeyInfo[]> {
  const sshDir = join(homedir(), '.ssh');
  const keys: SshKeyInfo[] = [];

  // Common key file patterns
  const keyPatterns = ['id_ed25519', 'id_rsa', 'id_ecdsa', 'id_dsa'];

  for (const pattern of keyPatterns) {
    const pubKeyPath = join(sshDir, `${pattern}.pub`);
    try {
      const content = await readFile(pubKeyPath, 'utf-8');
      const parts = content.trim().split(' ');
      if (parts.length >= 2) {
        keys.push({
          type: parts[0] ?? 'unknown',
          publicKey: content.trim(),
          comment: parts[2] ?? '',
          path: join(sshDir, pattern),
        });
      }
    } catch {
      // Key doesn't exist, skip
    }
  }

  return keys;
}

/**
 * Get the currently configured signing key
 */
export async function getSigningStatus(): Promise<SigningStatus> {
  try {
    const format = await getGitConfig('gpg.format');
    const signingKey = await getGitConfig('user.signingkey');
    const allowedSignersFile = await getGitConfig('gpg.ssh.allowedSignersFile');

    if (!format || format === 'openpgp') {
      const result: SigningStatus = {
        enabled: !!signingKey,
        format: signingKey ? 'gpg' : 'none',
      };
      if (signingKey) result.signingKey = signingKey;
      return result;
    }

    const result: SigningStatus = {
      enabled: !!signingKey,
      format: format as 'ssh' | 'x509',
    };
    if (signingKey) result.signingKey = signingKey;
    if (allowedSignersFile) result.allowedSignersFile = allowedSignersFile;
    return result;
  } catch {
    return { enabled: false, format: 'none' };
  }
}

/**
 * Get a git config value
 */
async function getGitConfig(key: string): Promise<string | null> {
  try {
    const { stdout } = await execa('git', ['config', '--global', '--get', key]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Set a git config value
 */
async function setGitConfig(key: string, value: string): Promise<void> {
  await execa('git', ['config', '--global', key, value]);
}

/**
 * Configure git to use SSH signing with the specified key
 */
export async function configureSshSigning(key: SshKeyInfo): Promise<void> {
  // Set gpg.format to ssh
  await setGitConfig('gpg.format', 'ssh');

  // Set the signing key (public key content)
  await setGitConfig('user.signingkey', key.publicKey);

  // Enable commit signing by default
  await setGitConfig('commit.gpgsign', 'true');

  // Enable tag signing by default
  await setGitConfig('tag.gpgsign', 'true');

  // Set up allowed signers file for verification
  const allowedSignersPath = join(homedir(), '.ssh', 'allowed_signers');
  await setGitConfig('gpg.ssh.allowedSignersFile', allowedSignersPath);

  // Create/update allowed signers file
  await updateAllowedSigners(key);
}

/**
 * Update the allowed signers file with the current key
 */
async function updateAllowedSigners(key: SshKeyInfo): Promise<void> {
  const allowedSignersPath = join(homedir(), '.ssh', 'allowed_signers');

  // Get git user email for the principal
  const email = await getGitConfig('user.email');
  if (!email) {
    throw new Error('Git user.email not configured');
  }

  // Format: principal namespaces key-type key-data
  const entry = `${email} ${key.publicKey}`;

  try {
    // Ensure directory exists
    await mkdir(dirname(allowedSignersPath), { recursive: true });

    // Read existing file if it exists
    let content = '';
    try {
      content = await readFile(allowedSignersPath, 'utf-8');
    } catch {
      // File doesn't exist yet
    }

    // Check if this key is already in the file
    if (content.includes(key.publicKey)) {
      return; // Already configured
    }

    // Append the new entry
    const newContent = content ? `${content.trim()}\n${entry}\n` : `${entry}\n`;
    await writeFile(allowedSignersPath, newContent);
  } catch (err) {
    throw new Error(
      `Failed to update allowed signers: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Disable git signing
 */
export async function disableSigning(): Promise<void> {
  await execa('git', ['config', '--global', '--unset', 'gpg.format'], { reject: false });
  await execa('git', ['config', '--global', '--unset', 'user.signingkey'], { reject: false });
  await execa('git', ['config', '--global', '--unset', 'commit.gpgsign'], { reject: false });
  await execa('git', ['config', '--global', '--unset', 'tag.gpgsign'], { reject: false });
}

/**
 * Verify that signing is working
 */
export async function verifySigning(): Promise<{ success: boolean; error?: string }> {
  try {
    // Try to create a signed commit message (without actually committing)
    const { stdout } = await execa(
      'git',
      ['commit', '--dry-run', '-S', '-m', 'test', '--allow-empty'],
      { reject: false }
    );

    // Check if the output indicates success
    if (stdout.includes('error') || stdout.includes('failed')) {
      return { success: false, error: stdout };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if SSH agent has the signing key loaded
 */
export async function isKeyLoaded(key: SshKeyInfo): Promise<boolean> {
  try {
    const { stdout } = await execa('ssh-add', ['-L']);
    return stdout.includes(key.publicKey.split(' ')[1] ?? '');
  } catch {
    return false;
  }
}

/**
 * Add key to SSH agent
 */
export async function addKeyToAgent(
  key: SshKeyInfo
): Promise<{ success: boolean; error?: string }> {
  try {
    await execa('ssh-add', [key.path]);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
