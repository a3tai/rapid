/**
 * HTTP/HTTPS Proxy Server with Domain Filtering
 *
 * Provides a forward proxy that enforces domain allowlisting.
 * Inspired by Anthropic's sandbox-runtime network filtering.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect, type Socket } from 'node:net';
import type { NetworkConfig } from '../types.js';
import { isDomainAllowed, extractHostname } from './utils.js';

export interface HttpProxyOptions {
  port?: number;
  host?: string;
  network: NetworkConfig;
  onBlock?: (domain: string, url: string) => void;
  onAllow?: (domain: string, url: string) => void;
}

export interface HttpProxyInstance {
  server: Server;
  port: number;
  host: string;
  stop: () => Promise<void>;
}

/**
 * Create and start an HTTP/HTTPS proxy server with domain filtering
 */
export async function createHttpProxy(options: HttpProxyOptions): Promise<HttpProxyInstance> {
  const { network, onBlock, onAllow } = options;
  const host = options.host || '127.0.0.1';

  const server = createServer();

  // Handle regular HTTP requests (forward proxy)
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || '';
    const hostname = extractHostname(url) || req.headers.host?.split(':')[0];

    if (!hostname) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request: No hostname');
      return;
    }

    if (!isDomainAllowed(hostname, network.allowedDomains, network.deniedDomains)) {
      onBlock?.(hostname, url);
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end(`Blocked: Domain ${hostname} is not in allowlist`);
      return;
    }

    onAllow?.(hostname, url);

    // Parse target URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(url);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request: Invalid URL');
      return;
    }

    const targetPort = targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80);

    // Forward the request
    const proxyReq = connect({ host: targetUrl.hostname, port: Number(targetPort) }, () => {
      // Write the HTTP request to the target
      proxyReq.write(`${req.method} ${targetUrl.pathname}${targetUrl.search} HTTP/1.1\r\n`);
      proxyReq.write(`Host: ${targetUrl.host}\r\n`);

      for (const [key, value] of Object.entries(req.headers)) {
        if (key.toLowerCase() !== 'proxy-connection' && value) {
          const headerValue = Array.isArray(value) ? value.join(', ') : value;
          proxyReq.write(`${key}: ${headerValue}\r\n`);
        }
      }
      proxyReq.write('\r\n');

      // Pipe request body
      req.pipe(proxyReq, { end: true });
    });

    proxyReq.on('data', (chunk) => {
      res.write(chunk);
    });

    proxyReq.on('end', () => {
      res.end();
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Bad Gateway: ${err.message}`);
    });
  });

  // Handle HTTPS CONNECT requests (tunnel)
  server.on('connect', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
    const parts = (req.url || '').split(':');
    const hostname = parts[0];
    const port = parts[1] ? parseInt(parts[1], 10) : 443;

    if (!hostname) {
      clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      clientSocket.end();
      return;
    }

    if (!isDomainAllowed(hostname, network.allowedDomains, network.deniedDomains)) {
      onBlock?.(hostname, req.url || '');
      clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      clientSocket.write(`Blocked: Domain ${hostname} is not in allowlist`);
      clientSocket.end();
      return;
    }

    onAllow?.(hostname, req.url || '');

    // Establish tunnel to target
    const serverSocket = connect({ host: hostname, port }, () => {
      clientSocket.write(
        'HTTP/1.1 200 Connection Established\r\n' + 'Proxy-agent: rapid-sandbox\r\n' + '\r\n'
      );

      // Forward initial data if any
      if (head.length > 0) {
        serverSocket.write(head);
      }

      // Pipe both directions
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      clientSocket.write(`HTTP/1.1 502 Bad Gateway\r\n\r\n${err.message}`);
      clientSocket.end();
    });

    clientSocket.on('error', () => {
      serverSocket.end();
    });
  });

  // Find available port
  const getPort = await import('get-port');
  const port = options.port || (await getPort.default({ port: getPort.portNumbers(8888, 8988) }));

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
 * Create proxy environment variables
 */
export function createProxyEnv(host: string, port: number): Record<string, string> {
  const proxyUrl = `http://${host}:${port}`;
  return {
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    NO_PROXY: 'localhost,127.0.0.1',
    no_proxy: 'localhost,127.0.0.1',
  };
}
