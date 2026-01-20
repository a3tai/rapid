# @a3t/rapid-runtime

OS-level sandbox runtime for RAPID, inspired by Anthropic's sandbox-runtime.

## Overview

Provides process isolation using platform-native sandboxing mechanisms:

- **macOS**: Seatbelt (`sandbox-exec`)
- **Linux**: Bubblewrap (`bwrap`)

## Installation

```bash
pnpm add @a3t/rapid-runtime
```

## Quick Start

```typescript
import { createSandboxManager } from '@a3t/rapid-runtime';

const sandbox = createSandboxManager({
  projectDir: '/path/to/project',
  mode: 'balanced',
});

// Execute command in sandbox
const result = await sandbox.execute('npm', ['test'], {
  cwd: '/path/to/project',
  timeout: 60000,
});

console.log(result.stdout);
```

## Sandbox Presets

| Preset       | Network    | Filesystem               | Use Case           |
| ------------ | ---------- | ------------------------ | ------------------ |
| `strict`     | Blocked    | Read-only (project only) | Untrusted code     |
| `balanced`   | Proxy only | Project + temp dirs      | Normal development |
| `permissive` | Allowed    | Most paths               | Build tools, CI    |
| `none`       | Allowed    | Full access              | Debugging          |

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                   SandboxManager                        │
├────────────────────────────────────────────────────────┤
│  ┌────────────────┐        ┌────────────────┐         │
│  │    Seatbelt    │   OR   │   Bubblewrap   │         │
│  │    (macOS)     │        │    (Linux)     │         │
│  └───────┬────────┘        └───────┬────────┘         │
│          │                         │                   │
│          └───────────┬─────────────┘                   │
│                      ▼                                  │
│  ┌────────────────────────────────────────────────┐   │
│  │              Sandboxed Process                  │   │
│  │  • Restricted filesystem access                 │   │
│  │  • Network via proxy (if enabled)               │   │
│  │  • No access to secrets/credentials             │   │
│  └────────────────────────────────────────────────┘   │
│                      │                                  │
│  ┌──────────────────┴───────────────────┐             │
│  │           Proxy Layer (optional)      │             │
│  │  ┌─────────────┐  ┌─────────────┐    │             │
│  │  │ HTTP Proxy  │  │ SOCKS Proxy │    │             │
│  │  │ (filtering) │  │ (tunneling) │    │             │
│  │  └─────────────┘  └─────────────┘    │             │
│  └──────────────────────────────────────┘             │
└────────────────────────────────────────────────────────┘
```

## API Reference

### SandboxManager

```typescript
const manager = createSandboxManager(options: SandboxManagerOptions);

interface SandboxManagerOptions {
  projectDir: string;           // Project root directory
  mode?: SandboxMode;           // 'strict' | 'balanced' | 'permissive' | 'none'
  network?: NetworkConfig;      // Network restrictions
  filesystem?: FilesystemConfig; // Path access rules
}

// Execute command
await manager.execute(command: string, args: string[], options?: ExecuteOptions);

// Check sandbox availability
const available = manager.isAvailable();
```

### Seatbelt (macOS)

```typescript
import { generateSeatbeltProfile, wrapWithSeatbelt, isSeatbeltAvailable } from '@a3t/rapid-runtime';

// Check availability
if (isSeatbeltAvailable()) {
  // Generate profile
  const profile = generateSeatbeltProfile({
    mode: 'balanced',
    projectDir: '/project',
    allowedPaths: ['/tmp'],
  });

  // Wrap command
  const wrapped = wrapWithSeatbelt('npm', ['test'], profile);
}
```

### Bubblewrap (Linux)

```typescript
import {
  generateBwrapArgs,
  wrapWithBubblewrap,
  isBubblewrapAvailable,
  diagnoseBubblewrap,
} from '@a3t/rapid-runtime';

// Check availability and diagnose issues
if (!isBubblewrapAvailable()) {
  const diagnosis = await diagnoseBubblewrap();
  console.log(diagnosis.suggestions);
}

// Generate bwrap arguments
const args = generateBwrapArgs({
  mode: 'balanced',
  projectDir: '/project',
});

// Wrap command
const wrapped = wrapWithBubblewrap('npm', ['test'], args);
```

### HTTP Proxy

```typescript
import { createHttpProxy } from '@a3t/rapid-runtime';

const proxy = await createHttpProxy({
  port: 0, // Auto-assign
  allowedDomains: ['npmjs.org', 'github.com'],
  blockedDomains: ['malicious.com'],
});

console.log(`Proxy running on ${proxy.address}`);

// Environment for sandboxed process
const env = createProxyEnv(proxy.address);
// { HTTP_PROXY, HTTPS_PROXY, NO_PROXY }

await proxy.close();
```

### SOCKS Proxy

```typescript
import { createSocksProxy } from '@a3t/rapid-runtime';

const socks = await createSocksProxy({
  port: 0,
  allowedDomains: ['*.github.com'],
});

const env = createSocksProxyEnv(socks.address);
await socks.close();
```

## Configuration Types

```typescript
interface SandboxConfig {
  mode: SandboxMode;
  projectDir: string;
  network?: NetworkConfig;
  filesystem?: FilesystemConfig;
  mandatory?: MandatoryProtections;
}

interface NetworkConfig {
  enabled: boolean;
  allowedDomains?: string[];
  blockedDomains?: string[];
  proxyPort?: number;
}

interface FilesystemConfig {
  readOnly?: string[];
  readWrite?: string[];
  noAccess?: string[];
  tempDirs?: string[];
}

interface MandatoryProtections {
  blockKeychain: boolean; // Block keychain access
  blockCredentials: boolean; // Block credential files
  blockSshKeys: boolean; // Block ~/.ssh
  blockCloudCreds: boolean; // Block cloud credentials
}
```

## Platform Support

| Platform | Sandbox Method | Notes                       |
| -------- | -------------- | --------------------------- |
| macOS    | Seatbelt       | Built-in, no install needed |
| Linux    | Bubblewrap     | Install via package manager |
| Windows  | None           | Use WSL2 for Linux sandbox  |

### Linux Setup

```bash
# Ubuntu/Debian
sudo apt install bubblewrap

# Fedora
sudo dnf install bubblewrap

# Arch
sudo pacman -S bubblewrap
```

## Security

The runtime enforces mandatory protections regardless of mode:

- Blocks access to keychain/credential stores
- Blocks SSH keys and cloud credentials
- Isolates environment variables
- Prevents process injection

## Integration with MCP

The `secure_exec` MCP tool uses this runtime:

```typescript
// From rapid-mcp
import { SandboxManager } from '@a3t/rapid-runtime';

server.registerTool('secure_exec', {
  // Uses SandboxManager internally
});
```

## License

MIT
