import { assertBranchProduct } from '../security/branch-license';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Device } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { hashOpaqueToken } from '../security/token.util';
import { RealtimeBus } from '../realtime/realtime-bus';
import { requiredConsoleApps, enabledConsoleApps } from '../security/admin-product-access';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TENANT_JWT_AUDIENCE, TENANT_JWT_ISSUER, TenantAccessTokenPayload } from '../../modules/tenant-auth/tenant-auth.service';

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
export const DEVICE_AUTH_CACHE = new Map<string, { at: number; device: any; branch: any; enabledApps: string[] }>();
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
  constructor(private readonly prisma: PrismaService, private readonly bus: RealtimeBus, private readonly config: ConfigService = new ConfigService()) {}

  private deny(kind: 'unauthorized' | 'forbidden', code: DeviceDenialCode, message: string, reason?: string): never {
    const body = { statusCode: kind === 'unauthorized' ? 401 : 403, message, code, ...(reason ? { reason } : {}) };
    throw kind === 'unauthorized' ? new UnauthorizedException(body) : new ForbiddenException(body);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    // Express decodes route parameters and accepts trailing slashes. Match that interpretation
    // before applying resource-specific authorization, including percent-encoded entity names.
    let authorizationPath: string;
    try { authorizationPath = decodeURIComponent((request.originalUrl ?? request.url ?? '').split('?')[0]).replace(/\/+$/, ''); }
    catch { throw new ForbiddenException('Invalid request path'); }
    const token = this.extractBearerToken(request);
    if (!token) {
      this.deny('unauthorized', 'INVALID_DEVICE_CREDENTIAL', 'Missing device credential');
    }

    const tokenHash = hashOpaqueToken(token as string);
    subscribeToInvalidations(this.bus);
    const versionAtStart = invalidationVersion;
    const ttl = authCacheMs();
    const hit = ttl > 0 ? DEVICE_AUTH_CACHE.get(tokenHash) : undefined;
    let verdict: { device: any; branch: any; enabledApps: string[] } | null = hit && Date.now() - hit.at < ttl ? hit : null;
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
      const entitledApps = device.type === 'POS_ADMIN' ? ['POS_ADMIN', 'KIOSK_ADMIN', 'QR_ORDERING'] as const : [device.type];
      const entitlements = await this.prisma.runAsPlatform((tx) =>
        tx.applicationEntitlement.findMany({
          where: { subscriptionId: { in: subscriptions.map((sub) => sub.id) }, appCode: { in: [...entitledApps] }, enabled: true },
          select: { appCode: true }
        })
      );
      if (!entitlements.length) {
        const appName = device.type === 'POS_ADMIN' ? 'Management console (POS_ADMIN, KIOSK_ADMIN or QR_ORDERING)' : device.type;
        this.deny('forbidden', 'APP_DISABLED', `${appName} is not enabled for this restaurant. Please contact your platform administrator.`);
      }

      const enabledApps = entitlements.map(row => row.appCode);
      if (ttl > 0 && versionAtStart === invalidationVersion) DEVICE_AUTH_CACHE.set(tokenHash, { at: Date.now(), device, branch: branchOfDevice, enabledApps });
      verdict = { device, branch: branchOfDevice, enabledApps };

    }
    const device = verdict!.device;
    const branch = verdict!.branch;

    if (device.type === 'POS_ADMIN' || device.type === 'KIOSK_ADMIN') {
      const required = requiredConsoleApps(authorizationPath);
      if (!required.some(app => verdict!.enabledApps.includes(app))) {
        // A resource denial must not lock the whole shared console; the other product may remain enabled.
        throw new ForbiddenException({ statusCode: 403, code: 'PRODUCT_ACCESS_DENIED', message: 'Your subscription does not enable this application resource.' });
      }
    }

    // A terminal bound to a branch stops when that branch is deactivated (BUG-048). Like an MDM lock it
    // may still check in, so it can learn why and resume as soon as the branch is active again.
    if (branch && branch.status !== 'ACTIVE' && !ALLOWED_WHILE_LOCKED.test(authorizationPath)) {
      this.deny('forbidden', 'BRANCH_INACTIVE', `The branch "${branch.name}" has been deactivated. Please contact your platform administrator.`);
    }

    // MDM lock: enforced here, immediately, whether or not the terminal ever fetched the command.
    if (device.isLocked && !ALLOWED_WHILE_LOCKED.test(authorizationPath)) {
      this.deny('forbidden', 'DEVICE_LOCKED', 'This terminal has been locked by your platform administrator.', device.lockReason ?? undefined);
    }

    let scopedDevice = device;
    const requestedBranch = request.headers['x-admin-branch'];
    // Restaurant-wide QR management is an explicit owner-authorized request scope.
    // It never changes the terminal binding or opens cross-branch POS/entity synchronization.
    const restaurantQrScope = requestedBranch === 'all' && /^\/api\/v1\/(restaurant\/qr(?:\/|\?|$)|menu\/(preview|publish|branch-overrides)(?:\?|$))/.test(authorizationPath);
    const payoutPath = /^\/api\/v1\/payments\/payout-(summary|history)(?:\?|$)/.test(authorizationPath);
    const requiresRestaurantOwner = payoutPath && await this.prisma.runAsTenant(device.restaurantId, tx => tx.branch.count({ where: { restaurantId: device.restaurantId } })) > 1;
    const managesQrCrm = /^\/api\/v1\/restaurant\/qr\/crm(?:\/|$)/.test(authorizationPath);
    const requiresFinancialActor = managesQrCrm || /^\/api\/v1\/restaurant\/qr\/payment-activation-request(?:\?|$)/.test(authorizationPath) || /^\/api\/v1\/restaurant\/qr\/workflows(?:\/|$)/.test(authorizationPath) || /^\/api\/v1\/restaurant\/qr\/advanced\/orders\/[^/]+\/refund-cash(?:\?|$)/.test(authorizationPath);
    const managesRestaurantProfile = request.method === 'PATCH' && ['/api/v1/devices/me/restaurant', '/api/v1/devices/me/branch-operating-profile'].includes(authorizationPath);
    if (managesRestaurantProfile && !['POS_ADMIN', 'KIOSK_ADMIN'].includes(device.type)) throw new ForbiddenException('Only an administrator console can change the restaurant profile');
    const managesStaff = request.method === 'POST' && /^\/api\/v1\/entity-sync\/STAFF_USER$/.test(authorizationPath) && device.type === 'POS_ADMIN';
    const sensitiveOrder = Array.isArray(request.body?.events) && request.body.events.some((event: unknown) => {
      if (!event || typeof event !== 'object') return false;
      const value = event as { status?: unknown; paymentStatus?: unknown; meta?: { statusCorrection?: unknown; refundAmountPaise?: unknown } };
      return (typeof value.status === 'string' && ['CANCELLED','VOID','VOIDED','REFUNDED'].includes(value.status.toUpperCase())) || value.paymentStatus === 'REFUNDED' || value.meta?.statusCorrection === true || typeof value.meta?.refundAmountPaise === 'number';
    });
    const managesOrders = sensitiveOrder && request.method === 'POST' && /^\/api\/v1\/orders\/sync$/.test(authorizationPath) && device.type === 'POS_ADMIN';
    // The UPI VPA on ReceiptConfig is where every customer's "scan to pay" lands -- changing it
    // silently redirects real money. It travels bundled inside the generic KIOSK_CONFIGURATION push
    // (welcome screen, display settings and the receipt template all share one blob), so a MANAGER
    // editing an unrelated field (e.g. the welcome banner) must stay frictionless; only an actual
    // change to the payout VPA itself is gated, by diffing against what's currently stored.
    const kioskConfigPush = request.method === 'POST' && /^\/api\/v1\/entity-sync\/KIOSK_CONFIGURATION$/.test(authorizationPath) && ['POS_ADMIN', 'KIOSK_ADMIN'].includes(device.type);
    let managesUpiDestination = false;
    let managesKitchenStations = false;
    if (kioskConfigPush) {
      const events = (request.body as { events?: Array<{ externalId?: string; payload?: { stationRegistry?: unknown; receipt?: { upiId?: string; upiPayeeName?: string } } }> })?.events;
      for (const event of Array.isArray(events) ? events : []) {
        const incoming = event?.payload?.receipt;
        if (!incoming || typeof incoming !== 'object') continue;
        const existing = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
          tx.syncedEntity.findFirst({
            where: { restaurantId: device.restaurantId, entityType: 'KIOSK_CONFIGURATION', externalId: event.externalId },
            select: { payload: true }
          })
        );
        const existingReceipt = (existing?.payload as { receipt?: { upiId?: string; upiPayeeName?: string } } | null)?.receipt;
        if (event.payload?.stationRegistry !== undefined && JSON.stringify(event.payload.stationRegistry) !== JSON.stringify((existing?.payload as {stationRegistry?: unknown} | null)?.stationRegistry)) managesKitchenStations = true;
        if ((incoming.upiId ?? '') !== (existingReceipt?.upiId ?? '') || (incoming.upiPayeeName ?? '') !== (existingReceipt?.upiPayeeName ?? '')) {
          managesUpiDestination = true;
        }
      }
    }
    if (managesKitchenStations && device.type !== 'POS_ADMIN') throw new ForbiddenException('Kitchen stations are managed in Restaurant Admin');
    if (managesKitchenStations && !verdict!.enabledApps.includes('POS_ADMIN')) throw new ForbiddenException('Kitchen station management requires Restaurant Admin access');
    if (requestedBranch !== undefined || requiresRestaurantOwner || requiresFinancialActor || managesStaff || managesOrders || managesUpiDestination || managesRestaurantProfile || managesKitchenStations) {
      if (requestedBranch !== undefined && (device.type !== 'POS_ADMIN' || typeof requestedBranch !== 'string' || (!restaurantQrScope && !/^[0-9a-f-]{36}$/i.test(requestedBranch)))) throw new ForbiddenException('Invalid admin branch scope');
      const proof = request.headers['x-owner-authorization'];
      let claims: TenantAccessTokenPayload;
      try {
        if (typeof proof !== 'string') throw new Error('Owner proof required');
        claims = await new JwtService().verifyAsync<TenantAccessTokenPayload>(proof, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), issuer: TENANT_JWT_ISSUER, audience: TENANT_JWT_AUDIENCE });
      } catch { throw new ForbiddenException({code:'ADMIN_SESSION_REQUIRED',message:'Current owner or branch-manager sign-in is required'}); }
      if (claims.impersonatedBy || claims.restaurantId !== device.restaurantId || claims.did !== device.id) throw new ForbiddenException('Admin scope does not belong to this device');
      const authorized = await this.prisma.runAsTenant(device.restaurantId, async tx => {
        const user = await tx.user.findFirst({ where: { id: claims.sub, restaurantId: device.restaurantId, status: 'ACTIVE' } });
        if (!user || !['OWNER', 'MANAGER'].includes(user.role)) return false;
        if (restaurantQrScope) return user.role === 'OWNER';
        if (requiresRestaurantOwner && user.role !== 'OWNER') return false;
        // Stricter than the branch-manager allowance just below: changing where customer payments
        // land is OWNER-only, full stop -- a branch's own manager is not exempt the way they are for
        // ordinary financial-actor or staff-administration actions.
        if ((managesUpiDestination || managesRestaurantProfile) && user.role !== 'OWNER') return false;
        if ((requiresFinancialActor || managesStaff || managesOrders || managesKitchenStations) && user.role !== 'OWNER' && user.branchId !== device.branchId) return false;
        if (requestedBranch === undefined) return true;
        if (user.role !== 'OWNER' && (user.branchId ?? device.branchId) !== requestedBranch) return false;
        return Boolean(await tx.branch.findFirst({ where: { id: requestedBranch, restaurantId: device.restaurantId, status: 'ACTIVE' } }));
      });
      if (!authorized) throw new ForbiddenException('You cannot manage this branch');
      // Request scope only: never move the registered terminal or rewrite its historical orders.
      if (typeof requestedBranch === 'string') scopedDevice = { ...device, branchId: restaurantQrScope ? null : requestedBranch };
      scopedDevice = { ...scopedDevice, adminActorId: claims.sub } as Device;
    }
    if (scopedDevice.branchId && !ALLOWED_WHILE_LOCKED.test(authorizationPath)) {
      await this.prisma.runAsTenant(device.restaurantId, async tx => {
        if (['POS_ADMIN','KIOSK_ADMIN'].includes(device.type)) {
          const allowed = await enabledConsoleApps(tx, device.restaurantId, scopedDevice.branchId);
          if (!requiredConsoleApps(authorizationPath).some(app => allowed.includes(app))) throw new ForbiddenException({code:'BRANCH_PRODUCT_DISABLED',message:'This application resource is not active in the selected branch.'});
        } else await assertBranchProduct(tx, device.restaurantId, scopedDevice.branchId, device.type);
      });
    }
    (request as Request & { device: Device }).device = scopedDevice as Device;
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length).trim() || null;
  }
}
