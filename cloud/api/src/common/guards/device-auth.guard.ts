import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Device } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { hashOpaqueToken } from '../security/token.util';
import { RealtimeBus } from '../realtime/realtime-bus';

/**
 * Every device request used to run four queries (device + restaurant + branch, subscriptions, application entitlement) before
 * doing any work. A passing verdict is now kept for a very short time (DEVICE_AUTH_CACHE_MS, default 2 s, 0 = off). Anything
 * that can change the verdict (a revoke, lock, plan, subscription, entitlement, branch or restaurant change) flushes every entry
 * on every API instance immediately, so the cache only ever hides queries, never a decision. Failures are never cached.
 */
function authCacheMs(): number {
  const v = Number(process.env.DEVICE_AUTH_CACHE_MS);
  return Number.isFinite(v) && v >= 0 ? v : 2000;
}
export const DEVICE_AUTH_CACHE = new Map<string, { at: number; device: any; branch: any }>();
let subscribed: RealtimeBus | null = null;
let invalidationVersion = 0;
function subscribeToInvalidations(bus: RealtimeBus): void {
  if (subscribed === bus) return;
  subscribed = bus;
  bus.invalidations$.subscribe(() => { invalidationVersion++; DEVICE_AUTH_CACHE.clear(); });
}
setInterval(() => { const cutoff = Date.now() - authCacheMs(); for (const [k, v] of DEVICE_AUTH_CACHE) if (v.at < cutoff) DEVICE_AUTH_CACHE.delete(k); }, 30_000).unref?.();

/** Machine-readable reasons a terminal can show on its lock screen. */
export type DeviceDenialCode =
  | 'INVALID_DEVICE_CREDENTIAL'
  | 'DEVICE_REVOKED'
  | 'RESTAURANT_SUSPENDED'
  | 'RESTAURANT_INACTIVE'
  | 'SUBSCRIPTION_INACTIVE'
  | 'APP_DISABLED'
  | 'BRANCH_INACTIVE'
  | 'DEVICE_LOCKED';

/** A locked terminal may still check in and fetch/ack commands (so it can be unlocked). */
const ALLOWED_WHILE_LOCKED = /^\/api\/v1\/devices\/me(\/|\?|$)/;

/**
 * A device's long-lived credential, issued once at activation-redeem time
 * (see activation-keys.service.ts's `redeem`) and never rotated automatically -
 * unlike a user session, a POS terminal doesn't "log in" repeatedly. Verified
 * by hash comparison against Device.deviceTokenHash, the same storage pattern
 * used for every other credential in this codebase (never the plaintext).
 *
 * This is the one enforcement point every terminal request passes through, so
 * it is where a restaurant's status, its subscription, the device's own status
 * and lock, AND the per-application entitlement (is POS / KDS / ... still
 * enabled for this restaurant) are all checked. Every refusal carries a
 * `code` (and a `reason` for a lock) so the terminal can show why.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly bus: RealtimeBus) {}

  private deny(kind: 'unauthorized' | 'forbidden', code: DeviceDenialCode, message: string, reason?: string): never {
    const body = { statusCode: kind === 'unauthorized' ? 401 : 403, message, code, ...(reason ? { reason } : {}) };
    throw kind === 'unauthorized' ? new UnauthorizedException(body) : new ForbiddenException(body);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      this.deny('unauthorized', 'INVALID_DEVICE_CREDENTIAL', 'Missing device credential');
    }

    const tokenHash = hashOpaqueToken(token as string);
    subscribeToInvalidations(this.bus);
    const versionAtStart = invalidationVersion;
    const ttl = authCacheMs();
    const hit = ttl > 0 ? DEVICE_AUTH_CACHE.get(tokenHash) : undefined;
    let verdict: { device: any; branch: any } | null = hit && Date.now() - hit.at < ttl ? { device: hit.device, branch: hit.branch } : null;
    if (!verdict) {
      const deviceWithRestaurant = await this.prisma.runAsPlatform((tx) =>
        tx.device.findUnique({
          where: { deviceTokenHash: tokenHash },
          include: { restaurant: { select: { status: true, deletedAt: true } }, branch: { select: { name: true, status: true } } }
        })
      );

      if (!deviceWithRestaurant) {
        this.deny('unauthorized', 'INVALID_DEVICE_CREDENTIAL', 'Invalid device credential');
      }
      const { restaurant, branch: foundBranch, ...foundDevice } = deviceWithRestaurant!;
      const device = foundDevice;
      const branchOfDevice = foundBranch;

      if (device.status === 'REVOKED') {
        this.deny('unauthorized', 'DEVICE_REVOKED', 'This device has been revoked. Contact your platform administrator.');
      }
      if (device.status !== 'ACTIVE') {
        this.deny('unauthorized', 'INVALID_DEVICE_CREDENTIAL', 'Invalid or inactive device credential');
      }

      // Suspending a restaurant used to flip a database flag nothing downstream checked.
      if (restaurant.deletedAt !== null || restaurant.status !== 'ACTIVE') {
        if (restaurant.status === 'SUSPENDED') {
          this.deny('forbidden', 'RESTAURANT_SUSPENDED', 'This restaurant account is suspended. Please contact your platform administrator.');
        }
        this.deny('forbidden', 'RESTAURANT_INACTIVE', 'This restaurant account is no longer active.');
      }

      // Restaurant.status and Subscription.status are independent - a restaurant can
      // stay ACTIVE while its subscription lapses, and that must block terminals too.
      // A restaurant may hold one active subscription per product family (a Restaurant plan plus a
      // separate Kiosk plan), so every active subscription is considered, not just the newest one.
      const subscriptions = await this.prisma.runAsPlatform((tx) =>
        tx.subscription.findMany({
          where: {
            restaurantId: device.restaurantId,
            status: { in: ['ACTIVE', 'TRIAL'] },
            expiresAt: { gt: new Date() }
          },
          select: { id: true }
        })
      );
      if (subscriptions.length === 0) {
        this.deny('forbidden', 'SUBSCRIPTION_INACTIVE', 'This restaurant has no active subscription. Please contact your platform administrator.');
      }

      // Restaurant Admin is one POS_ADMIN device for both product families. Activation
      // accepts either admin entitlement; subsequent calls must use the same contract.
      // Keep the actual app rows distinct so kiosk access never enables POS-only modules.
      const entitledApps = device.type === 'POS_ADMIN' ? ['POS_ADMIN', 'KIOSK_ADMIN'] as const : [device.type];
      const entitlement = await this.prisma.runAsPlatform((tx) =>
        tx.applicationEntitlement.findFirst({
          where: { subscriptionId: { in: subscriptions.map((sub) => sub.id) }, appCode: { in: [...entitledApps] }, enabled: true },
          select: { id: true }
        })
      );
      if (!entitlement) {
        const appName = device.type === 'POS_ADMIN' ? 'Restaurant Admin (POS_ADMIN or KIOSK_ADMIN)' : device.type;
        this.deny('forbidden', 'APP_DISABLED', `${appName} is not enabled for this restaurant. Please contact your platform administrator.`);
      }

      if (ttl > 0 && versionAtStart === invalidationVersion) DEVICE_AUTH_CACHE.set(tokenHash, { at: Date.now(), device, branch: branchOfDevice });
      verdict = { device, branch: branchOfDevice };

    }
    const device = verdict!.device;
    const branch = verdict!.branch;

    // A terminal bound to a branch stops when that branch is deactivated (BUG-048). Like an MDM lock it
    // may still check in, so it can learn why and resume as soon as the branch is active again.
    if (branch && branch.status !== 'ACTIVE' && !ALLOWED_WHILE_LOCKED.test(request.originalUrl ?? request.url ?? '')) {
      this.deny('forbidden', 'BRANCH_INACTIVE', `The branch "${branch.name}" has been deactivated. Please contact your platform administrator.`);
    }

    // MDM lock: enforced here, immediately, whether or not the terminal ever fetched the command.
    if (device.isLocked && !ALLOWED_WHILE_LOCKED.test(request.originalUrl ?? request.url ?? '')) {
      this.deny('forbidden', 'DEVICE_LOCKED', 'This terminal has been locked by your platform administrator.', device.lockReason ?? undefined);
    }

    (request as Request & { device: Device }).device = device as Device;
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length).trim() || null;
  }
}
