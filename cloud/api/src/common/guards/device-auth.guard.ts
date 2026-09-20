import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Device } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { hashOpaqueToken } from '../security/token.util';

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
  constructor(private readonly prisma: PrismaService) {}

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
    const deviceWithRestaurant = await this.prisma.runAsPlatform((tx) =>
      tx.device.findUnique({
        where: { deviceTokenHash: tokenHash },
        include: { restaurant: { select: { status: true, deletedAt: true } }, branch: { select: { name: true, status: true } } }
      })
    );

    if (!deviceWithRestaurant) {
      this.deny('unauthorized', 'INVALID_DEVICE_CREDENTIAL', 'Invalid device credential');
    }
    const { restaurant, branch, ...device } = deviceWithRestaurant!;

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
    const subscription = await this.prisma.runAsPlatform((tx) =>
      tx.subscription.findFirst({
        where: {
          restaurantId: device.restaurantId,
          status: { in: ['ACTIVE', 'TRIAL'] },
          expiresAt: { gt: new Date() }
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      })
    );
    if (!subscription) {
      this.deny('forbidden', 'SUBSCRIPTION_INACTIVE', 'This restaurant has no active subscription. Please contact your platform administrator.');
    }

    // Per-application switch: disabling POS / KDS / ... for a restaurant in Super
    // Admin must stop the terminals that are already running, not just block new ones.
    const entitlement = await this.prisma.runAsPlatform((tx) =>
      tx.applicationEntitlement.findUnique({
        where: { subscriptionId_appCode: { subscriptionId: subscription!.id, appCode: device.type } }
      })
    );
    if (!entitlement || !entitlement.enabled) {
      this.deny('forbidden', 'APP_DISABLED', `${device.type} is not enabled for this restaurant. Please contact your platform administrator.`);
    }

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
