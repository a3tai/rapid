#!/usr/bin/env node
/**
 * RAPID Daemon Entry Point (rapidd)
 *
 * Background daemon for session management, config watching, and secrets caching.
 */

import { DaemonServer, isDaemonRunning, getDaemonPid } from './server.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_SOCKET_PATH = join(homedir(), '.rapid', 'rapid.sock');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'start':
      await startDaemon(args.slice(1));
      break;

    case 'stop':
      await stopDaemon();
      break;

    case 'status':
      await showStatus();
      break;

    case 'foreground':
      await runForeground(args.slice(1));
      break;

    default:
      showUsage();
      break;
  }
}

async function startDaemon(args: string[]): Promise<void> {
  const verbose = args.includes('--verbose') || args.includes('-v');
  const httpPort = getArgValue(args, '--http-port');

  // Check if already running
  if (await isDaemonRunning()) {
    console.log('Daemon is already running');
    process.exit(0);
  }

  const scriptPath = process.argv[1];
  if (!scriptPath) {
    console.error('Cannot determine script path');
    process.exit(1);
  }

  // Fork and run in background
  const { spawn } = await import('node:child_process');
  const spawnArgs = [
    scriptPath,
    'foreground',
    ...(verbose ? ['--verbose'] : []),
    ...(httpPort ? ['--http-port', httpPort] : []),
  ];
  const child = spawn(process.execPath, spawnArgs, {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  console.log(`Daemon started (PID: ${child.pid ?? 'unknown'})`);
}

async function stopDaemon(): Promise<void> {
  const pid = await getDaemonPid();

  if (!pid) {
    console.log('Daemon is not running');
    process.exit(0);
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Daemon stopped (PID: ${pid})`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      console.log('Daemon is not running (stale PID file)');
    } else {
      console.error('Failed to stop daemon:', error);
      process.exit(1);
    }
  }
}

async function showStatus(): Promise<void> {
  const running = await isDaemonRunning();
  const pid = await getDaemonPid();

  if (running && pid) {
    console.log('Status: Running');
    console.log(`PID: ${pid}`);
    console.log(`Socket: ${DEFAULT_SOCKET_PATH}`);
  } else if (pid) {
    console.log('Status: Stopped (stale PID file)');
  } else {
    console.log('Status: Stopped');
  }
}

async function runForeground(args: string[]): Promise<void> {
  const verbose = args.includes('--verbose') || args.includes('-v');
  const httpPortStr = getArgValue(args, '--http-port');

  const config: { verbose: boolean; httpPort?: number } = { verbose };
  if (httpPortStr) {
    config.httpPort = parseInt(httpPortStr, 10);
  }

  const daemon = new DaemonServer(config);

  // Handle shutdown signals
  const shutdown = async () => {
    console.log('\nShutting down...');
    await daemon.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  try {
    await daemon.start();

    if (verbose) {
      console.log('Daemon running in foreground. Press Ctrl+C to stop.');
    }
  } catch (error) {
    console.error('Failed to start daemon:', error);
    process.exit(1);
  }
}

function showUsage(): void {
  console.log(`
RAPID Daemon (rapidd)

Usage:
  rapidd start [--verbose] [--http-port PORT]  Start the daemon
  rapidd stop                                  Stop the daemon
  rapidd status                                Show daemon status
  rapidd foreground [--verbose]                Run in foreground

Options:
  --verbose, -v       Enable verbose logging
  --http-port PORT    Enable HTTP API on specified port
`);
}

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && index < args.length - 1) {
    return args[index + 1];
  }
  return undefined;
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
