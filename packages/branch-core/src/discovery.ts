import dgram from 'node:dgram';
import os from 'node:os';

/**
 * LAN discovery, so a device never needs a hard-coded IP address: the Branch Core answers a UDP broadcast
 * probe with where it lives. The answer reveals only that a Branch Core exists and its address (no orders,
 * no customers, nothing secret); every real request still needs a device credential.
 *
 * Browsers cannot send UDP, so browser-hosted apps use the address configured at setup (or a pairing QR /
 * the conventional name `jamanvaar.local`); packaged desktop and Android shells use this probe.
 */

export const DISCOVERY_PORT = 5179;
const PROBE = 'JAMANVAAR_DISCOVER_V1';

export interface DiscoveryAnswer {
  service: 'jamanvaar-branch-core';
  url: string;
  restaurantId: string;
  branchCode: string;
}

/** Non-internal IPv4 addresses of this machine (what other devices on the LAN can reach). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

export function startDiscoveryResponder(opts: { port?: number; httpPort: number; restaurantId: string; branchCode: string; host?: string }): Promise<{ close(): void; port: number }> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('error', reject);
    socket.on('message', (msg, rinfo) => {
      if (msg.toString() !== PROBE) return;
      // Answer with the address of the interface that faces the asker, when we can tell which one it is.
      const mine = lanAddresses();
      const same = mine.find((a) => a.split('.').slice(0, 3).join('.') === rinfo.address.split('.').slice(0, 3).join('.'));
      const host = opts.host ?? same ?? mine[0] ?? '127.0.0.1';
      const answer: DiscoveryAnswer = { service: 'jamanvaar-branch-core', url: `http://${host}:${opts.httpPort}`, restaurantId: opts.restaurantId, branchCode: opts.branchCode };
      socket.send(JSON.stringify(answer), rinfo.port, rinfo.address);
    });
    socket.bind(opts.port ?? DISCOVERY_PORT, () => resolve({ port: socket.address().port, close: () => socket.close() }));
  });
}

/** Broadcasts a probe and collects the Branch Cores that answer within `timeoutMs`. */
export function discoverBranchCores(opts: { timeoutMs?: number; port?: number; address?: string } = {}): Promise<DiscoveryAnswer[]> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const found = new Map<string, DiscoveryAnswer>();
    socket.on('message', (msg) => {
      try {
        const a = JSON.parse(msg.toString()) as DiscoveryAnswer;
        if (a.service === 'jamanvaar-branch-core' && typeof a.url === 'string') found.set(a.url, a);
      } catch {
        // not one of ours
      }
    });
    socket.bind(0, () => {
      socket.setBroadcast(true);
      socket.send(PROBE, opts.port ?? DISCOVERY_PORT, opts.address ?? '255.255.255.255');
    });
    setTimeout(() => {
      socket.close();
      resolve([...found.values()]);
    }, opts.timeoutMs ?? 1500);
  });
}
