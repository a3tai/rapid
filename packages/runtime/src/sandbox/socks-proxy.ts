/**
 * SOCKS5 Proxy Server with Domain Filtering
 *
 * Provides a SOCKS5 proxy for non-HTTP traffic with domain allowlisting.
 */

import { createServer, type Server, type Socket } from 'node:net';
import type { NetworkConfig } from '../types.js';
import { isDomainAllowed } from './utils.js';

// SOCKS5 constants
const SOCKS_VERSION = 0x05;
const AUTH_NO_AUTH = 0x00;
const CMD_CONNECT = 0x01;
const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;
const REP_SUCCESS = 0x00;
const REP_GENERAL_FAILURE = 0x01;
const REP_CONNECTION_NOT_ALLOWED = 0x02;
const REP_HOST_UNREACHABLE = 0x04;

export interface SocksProxyOptions {
  port?: number;
  host?: string;
  network: NetworkConfig;
  onBlock?: (domain: string) => void;
  onAllow?: (domain: string) => void;
}

export interface SocksProxyInstance {
  server: Server;
  port: number;
  host: string;
  stop: () => Promise<void>;
}

/**
 * Create and start a SOCKS5 proxy server with domain filtering
 */
export async function createSocksProxy(options: SocksProxyOptions): Promise<SocksProxyInstance> {
  const { network, onBlock, onAllow } = options;
  const host = options.host || '127.0.0.1';

  const server = createServer((clientSocket: Socket) => {
    handleSocksConnection(clientSocket, network, onBlock, onAllow);
  });

  // Find available port
  const getPort = await import('get-port');
  const port = options.port || (await getPort.default({ port: getPort.portNumbers(1080, 1180) }));

  // Start listening
  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.once('error', reject);
  });

  const stop = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  return {
    server,
    port,
    host,
    stop,
  };
}

/**
 * Handle a SOCKS5 connection
 */
function handleSocksConnection(
  clientSocket: Socket,
  network: NetworkConfig,
  onBlock?: (domain: string) => void,
  onAllow?: (domain: string) => void
): void {
  let state: 'greeting' | 'request' | 'connected' = 'greeting';

  clientSocket.once('data', (data: Buffer) => {
    if (state !== 'greeting') return;

    // Verify SOCKS5 version
    if (data[0] !== SOCKS_VERSION) {
      clientSocket.end();
      return;
    }

    // Send auth method response (no auth required)
    clientSocket.write(Buffer.from([SOCKS_VERSION, AUTH_NO_AUTH]));
    state = 'request';

    // Handle connection request
    clientSocket.once('data', (requestData: Buffer) => {
      if (state !== 'request') return;

      const version = requestData[0];
      const cmd = requestData[1];
      const atyp = requestData[3];

      if (version !== SOCKS_VERSION || cmd !== CMD_CONNECT) {
        sendReply(clientSocket, REP_GENERAL_FAILURE);
        clientSocket.end();
        return;
      }

      // Parse destination address
      let destHost: string;
      let destPort: number;
      let addrEndOffset: number;

      switch (atyp) {
        case ATYP_IPV4: {
          destHost = `${requestData[4]}.${requestData[5]}.${requestData[6]}.${requestData[7]}`;
          addrEndOffset = 8;
          break;
        }
        case ATYP_DOMAIN: {
          const domainLen = requestData[4] ?? 0;
          destHost = requestData.subarray(5, 5 + domainLen).toString();
          addrEndOffset = 5 + domainLen;
          break;
        }
        case ATYP_IPV6: {
          // For simplicity, represent as hex string
          const parts: string[] = [];
          for (let i = 0; i < 8; i++) {
            parts.push(requestData.readUInt16BE(4 + i * 2).toString(16));
          }
          destHost = parts.join(':');
          addrEndOffset = 20;
          break;
        }
        default: {
          sendReply(clientSocket, REP_GENERAL_FAILURE);
          clientSocket.end();
          return;
        }
      }

      destPort = requestData.readUInt16BE(addrEndOffset);

      // Check domain allowlist
      if (!isDomainAllowed(destHost, network.allowedDomains, network.deniedDomains)) {
        onBlock?.(destHost);
        sendReply(clientSocket, REP_CONNECTION_NOT_ALLOWED);
        clientSocket.end();
        return;
      }

      onAllow?.(destHost);

      // Connect to destination
      const { connect } = require('node:net');
      const destSocket: Socket = connect({ host: destHost, port: destPort }, () => {
        // Send success reply
        sendReply(clientSocket, REP_SUCCESS);
        state = 'connected';

        // Pipe both directions
        destSocket.pipe(clientSocket);
        clientSocket.pipe(destSocket);
      });

      destSocket.on('error', () => {
        sendReply(clientSocket, REP_HOST_UNREACHABLE);
        clientSocket.end();
      });

      clientSocket.on('error', () => {
        destSocket.end();
      });

      clientSocket.on('close', () => {
        destSocket.end();
      });
    });
  });

  clientSocket.on('error', () => {
    // Silently handle errors
  });
}

/**
 * Send a SOCKS5 reply
 */
function sendReply(socket: Socket, reply: number): void {
  // Reply format: VER REP RSV ATYP BND.ADDR BND.PORT
  const response = Buffer.alloc(10);
  response[0] = SOCKS_VERSION;
  response[1] = reply;
  response[2] = 0x00; // Reserved
  response[3] = ATYP_IPV4;
  // BND.ADDR and BND.PORT are zeros (0.0.0.0:0)
  socket.write(response);
}

/**
 * Create SOCKS proxy environment variables
 */
export function createSocksProxyEnv(host: string, port: number): Record<string, string> {
  const proxyUrl = `socks5://${host}:${port}`;
  return {
    ALL_PROXY: proxyUrl,
    all_proxy: proxyUrl,
  };
}
