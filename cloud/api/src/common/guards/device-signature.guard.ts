import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Device } from '@prisma/client';
import { Request } from 'express';
import { createHash, createPublicKey, verify as verifySignature } from 'crypto';

/** How long a signed request is accepted after it was signed, and how long its signature is remembered to refuse a replay. */
const SIGNATURE_WINDOW_MS = 60_000;

const seenSignatures = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - SIGNATURE_WINDOW_MS;
  for (const [key, at] of seenSignatures) if (at < cutoff) seenSignatures.delete(key);
}, 30_000).unref?.();

/**
 * Runs after DeviceAuthGuard, which has already attached `request.device`. A copied bearer token lets an attacker
 * reach this guard, but a payment request from a key-bound Kiosk also needs a signature only the original device's
 * private key (generated on-device, never sent anywhere — see kiosk-user's deviceKeys.ts) can produce.
 *
 * A Kiosk with no registered key (not yet re-activated since this shipped) is let through unsigned, so existing
 * terminals keep working; device.publicKey being set is what turns the requirement on for that one device.
 */
@Injectable()
export class DeviceSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { device: Device; rawBody?: Buffer }>();
    const device = request.device;
    if (!device || device.type !== 'KIOSK' || !device.publicKey) return true;

    const signature = request.headers['x-device-signature'];
    const timestamp = request.headers['x-device-timestamp'];
    if (typeof signature !== 'string' || typeof timestamp !== 'string') {
      throw new UnauthorizedException({ statusCode: 401, message: 'This device must sign its payment requests', code: 'DEVICE_SIGNATURE_REQUIRED' });
    }
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_WINDOW_MS) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Device signature has expired', code: 'DEVICE_SIGNATURE_STALE' });
    }

    const dedupeKey = `${device.id}:${signature}`;
    if (seenSignatures.has(dedupeKey)) {
      throw new UnauthorizedException({ statusCode: 401, message: 'This signed request was already used', code: 'DEVICE_SIGNATURE_REPLAYED' });
    }

    const bodyHash = createHash('sha256').update(request.rawBody ?? Buffer.alloc(0)).digest('hex');
    const payload = `${request.method}\n${request.originalUrl ?? request.url}\n${timestamp}\n${bodyHash}`;

    let valid = false;
    try {
      const publicKey = createPublicKey({ key: JSON.parse(device.publicKey), format: 'jwk' });
      // Web Crypto's ECDSA signatures are raw (r || s) — Node calls that encoding ieee-p1363, the same bytes a
      // browser's `crypto.subtle.sign` produces, with no DER wrapping to add on either side.
      valid = verifySignature('sha256', Buffer.from(payload, 'utf8'), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64'));
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new UnauthorizedException({ statusCode: 401, message: 'Invalid device signature', code: 'DEVICE_SIGNATURE_INVALID' });
    }

    seenSignatures.set(dedupeKey, Date.now());
    return true;
  }
}
