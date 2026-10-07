import http from 'node:http';
import https from 'node:https';
import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { BranchCore, CoreError, type AuthedDevice, type RealtimeEvent } from './core';
import { mayRead } from '../../../cloud/api/src/modules/entity-sync/entity-authority';
import { SYNCABLE_ENTITY_TYPES } from '../../../cloud/api/src/modules/entity-sync/dto/push-entity-sync.dto';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

export interface ServerOptions {
  /** Built web apps to serve from the core itself, e.g. { kds: 'C:/jamanvaar/kds' } at /apps/kds/ (so a TV can load the KDS with the internet down). */
  appDirs?: Record<string, string>;
  recheckMs?: number;
  version?: string;
  /** Serve HTTPS with this certificate. Devices pin its fingerprint (advertised at /discover) when they pair. */
  tls?: { cert: string | Buffer; key: string | Buffer };
}

/** Same visibility rules as the cloud's realtime stream, derived from the authenticated device. */
function visible(e: RealtimeEvent, device: AuthedDevice): boolean {
  if (e.originDeviceId && e.originDeviceId === device.id) return false;
  if (e.deviceId) return e.deviceId === device.id;
  return true;
}

export function createServer(core: BranchCore, opts: ServerOptions = {}): http.Server {
  const send = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req: http.IncomingMessage): Promise<any> =>
    new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (c) => {
        raw += c;
        if (raw.length > 5_000_000) {
          reject(new CoreError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large'));
          req.destroy();
        }
      });
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          reject(new CoreError(400, 'BAD_REQUEST', 'Body is not valid JSON'));
        }
      });
    });

  const tlsFingerprint = opts.tls ? new X509Certificate(opts.tls.cert).fingerprint256 : undefined;
  const handler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();

    const url = new URL(req.url ?? '/', 'http://core');
    const p = url.pathname;
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? null;

    try {
      // ---- open endpoints (reveal nothing about the restaurant's data)
      if (req.method === 'GET' && (p === '/health' || p === '/api/health')) return send(res, 200, { ok: true, service: 'jamanvaar-branch-core', version: opts.version ?? '0' });
      if (req.method === 'GET' && p === '/discover') {
        const c = core.status();
        return send(res, 200, { service: 'jamanvaar-branch-core', restaurantId: c.restaurantId, branchCode: core.cfg.branchCode, schemaVersion: c.schemaVersion, tls: !!opts.tls, tlsFingerprint });
      }

      // ---- static apps served by the core (so screens can load with the internet down)
      if (req.method === 'GET' && p.startsWith('/apps/')) {
        const [, , name, ...rest] = p.split('/');
        const dir = opts.appDirs?.[name];
        if (!dir) return send(res, 404, { message: 'Unknown app' });
        let file = path.join(dir, rest.join('/'));
        if (!file.startsWith(path.resolve(dir))) return send(res, 403, { message: 'Forbidden' });
        if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dir, 'index.html');
        if (!existsSync(file)) return send(res, 404, { message: 'Not built' });
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
        return void res.end(readFileSync(file));
      }

      // ---- everything below needs a device credential
      const allowLocked = p === '/api/v1/devices/me/heartbeat' || p.startsWith('/api/v1/devices/me/commands');
      const device = core.authenticate(bearer, { allowLocked });
      core.assertConsoleResource(device, p);

      if (p === '/api/v1/branch-core/status' && req.method === 'GET') {
        if (device.type !== 'POS_ADMIN' && device.type !== 'KIOSK_ADMIN') throw new CoreError(403, 'FORBIDDEN', 'Only an admin console can view the core status');
        return send(res, 200, core.status());
      }

      if (p === '/api/v1/orders/sync') {
        if (req.method === 'POST') {
          const body = await readBody(req);
          if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 100) throw new CoreError(400, 'BAD_REQUEST', 'events must be a list of 1 to 100');
          return send(res, 201, core.ingestOrders(device, body.events));
        }
        if (req.method === 'GET') {
          const after = url.searchParams.get('afterSeq');
          if (after === null) {
            // Legacy timestamp cursor: return everything (the core's history is small and branch-local).
            return send(res, 200, core.pullOrders(0));
          }
          const n = Number(after);
          if (!Number.isInteger(n) || n < 0) throw new CoreError(400, 'BAD_REQUEST', 'afterSeq must be a non-negative integer');
          return send(res, 200, core.pullOrders(n));
        }
      }

      if (p === '/api/v1/inventory/movements') {
        if (!mayRead('INVENTORY_ITEM', device.type as never)) throw new CoreError(403,'FORBIDDEN','This device cannot access the inventory ledger');
        if (req.method === 'POST') {
          const body = await readBody(req);
          if (!Array.isArray(body.movements) || body.movements.length < 1 || body.movements.length > 200) throw new CoreError(400, 'BAD_REQUEST', 'movements must be a list of 1 to 200');
          return send(res, 201, core.pushMovements(device, body.movements));
        }
        if (req.method === 'GET') return send(res, 200, core.pullMovements(Number(url.searchParams.get('afterSeq') ?? 0) || 0));
      }
      if (p === '/api/v1/inventory/balances' && req.method === 'GET') {
        if (!mayRead('INVENTORY_ITEM', device.type as never)) throw new CoreError(403,'FORBIDDEN','This device cannot access the inventory ledger');
        return send(res, 200, core.balances());
      }

      if (p === '/api/v1/sync/number-leases' && req.method === 'POST') {
        const body = await readBody(req);
        return send(res, 201, core.leaseNumbers(body.kind, body.count));
      }

      const ent = /^\/api\/v1\/entity-sync\/([A-Z_]+)$/.exec(p);
      if (ent) {
        if (!(SYNCABLE_ENTITY_TYPES as readonly string[]).includes(ent[1])) throw new CoreError(400,'BAD_REQUEST','Unknown entity type');
        if (req.method === 'POST') {
          const body = await readBody(req);
          if (!Array.isArray(body.events)) throw new CoreError(400, 'BAD_REQUEST', 'events must be a list');
          return send(res, 201, core.pushEntities(device, ent[1], body.events));
        }
        if (req.method === 'GET') {
          const raw = url.searchParams.get('afterSeq');
          const after = raw === null ? undefined : Number(raw);
          if (after !== undefined && (!Number.isSafeInteger(after) || after < 0)) throw new CoreError(400, 'BAD_REQUEST', 'afterSeq must be a non-negative integer');
          return send(res, 200, core.pullEntities(ent[1], url.searchParams.get('since') ?? undefined, after, device.type));
        }
      }

      if (p === '/api/v1/devices/me/heartbeat' && req.method === 'PATCH') return send(res, 200, core.heartbeat(device, await readBody(req)));
      if (p === '/api/v1/devices/me/commands' && req.method === 'GET') return send(res, 200, core.pendingCommands(device));
      const ack = /^\/api\/v1\/devices\/me\/commands\/([^/]+)\/ack$/.exec(p);
      if (ack && req.method === 'POST') return send(res, 201, core.ackCommand(device, ack[1], await readBody(req)));
      if (p === '/api/v1/devices/me/fleet' && req.method === 'GET') return send(res, 200, core.fleet(device));
      const cmd = /^\/api\/v1\/devices\/me\/fleet\/([^/]+)\/commands$/.exec(p);
      if (cmd && req.method === 'POST') return send(res, 201, core.issueCommand(device, cmd[1], await readBody(req)));

      if (p === '/api/v1/realtime/stream' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        const write = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        write('ready', { deviceId: device.id, serverTime: new Date().toISOString() });
        const onEvent = (e: RealtimeEvent) => {
          if (visible(e, device)) write(e.kind === 'command' ? 'command' : 'change', { kind: e.kind, seq: e.seq ?? null });
        };
        core.listeners.add(onEvent);
        const ping = setInterval(() => write('ping', { at: new Date().toISOString() }), 25_000);
        // A device that has been revoked or locked out since it connected must not keep listening.
        const recheck = setInterval(() => {
          try {
            core.authenticate(bearer, { allowLocked: true });
          } catch (err) {
            write('revoked', { reason: err instanceof CoreError ? err.code : 'DEVICE_NOT_ACTIVE' });
            cleanup();
            res.end();
          }
        }, opts.recheckMs ?? 30_000);
        const cleanup = () => {
          core.listeners.delete(onEvent);
          clearInterval(ping);
          clearInterval(recheck);
        };
        req.on('close', cleanup);
        return;
      }

      return send(res, 404, { statusCode: 404, message: 'Not found' });
    } catch (err) {
      if (err instanceof CoreError) return send(res, err.status, { statusCode: err.status, code: err.code, message: err.message });
      console.error('Branch Core error:', err);
      return send(res, 500, { statusCode: 500, message: 'Internal error' });
    }
  };
  return (opts.tls ? https.createServer({ cert: opts.tls.cert, key: opts.tls.key }, handler) : http.createServer(handler)) as http.Server;
}
