import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Device } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { hashOpaqueToken } from '../security/token.util';

/**
 * A device's long-lived credential, issued once at activation-redeem time
 * (see activation-keys.service.ts's `redeem`) and never rotated automatically —
 * unlike a user session, a POS terminal doesn't "log in" repeatedly. Verified
 * by hash comparison against Device.deviceTokenHash, the same storage pattern
 * used for every other credential in this codebase (never the plaintext).
 * A REVOKED device's token stops working immediately — no separate revocation
 * list needed, the device row's own status is the source of truth.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing device credential');
    }

    const tokenHash = hashOpaqueToken(token);
    const deviceWithRestaurant = await this.prisma.runAsPlatform((tx) =>
      tx.device.findUnique({
        where: { deviceTokenHash: tokenHash },
        include: { restaurant: { select: { status: true, deletedAt: true } } }
      })
    );

    if (!deviceWithRestaurant || deviceWithRestaurant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid or revoked device credential');
    }

    // The one enforcement point every tenant device request passes through —
    // this is what actually stops a suspended/archived restaurant's terminals
    // from operating, closing the gap the QA audit found: suspending a
    // restaurant in Super Admin flipped a database flag nothing downstream
    // ever checked.
    const { restaurant, ...device } = deviceWithRestaurant;
    if (restaurant.deletedAt !== null || restaurant.status !== 'ACTIVE') {
      throw new ForbiddenException(
        restaurant.status === 'SUSPENDED'
          ? 'This restaurant account is suspended. Please contact your platform administrator.'
          : 'This restaurant account is no longer active.'
      );
    }

    // Restaurant.status and Subscription.status are two independent fields
    // ("both suspend mechanisms" per the QA audit) — a restaurant can stay
    // ACTIVE while its subscription lapses to PAST_DUE/SUSPENDED/EXPIRED, and
    // that must block terminals just as surely as a restaurant-level
    // suspension does. Same lookup EntitlementGuard already uses for
    // user-session traffic, extended here to device traffic.
    const hasValidSubscription = await this.prisma.runAsPlatform((tx) =>
      tx.subscription.findFirst({
        where: {
          restaurantId: device.restaurantId,
          status: { in: ['ACTIVE', 'TRIAL'] },
          expiresAt: { gt: new Date() }
        },
        select: { id: true }
      })
    );

    if (!hasValidSubscription) {
      throw new ForbiddenException('This restaurant has no active subscription. Please contact your platform administrator.');
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
