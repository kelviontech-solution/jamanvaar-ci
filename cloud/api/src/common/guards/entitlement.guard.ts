import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

export const REQUIRE_ENTITLEMENT_KEY = 'require_entitlement';

export const RequireEntitlement = (entitlementKey: string) =>
  SetMetadata(REQUIRE_ENTITLEMENT_KEY, entitlementKey);

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredEntitlement = this.reflector.getAllAndOverride<string>(
      REQUIRE_ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredEntitlement) {
      return true; // No entitlement restriction
    }

    const request = context.switchToHttp().getRequest();
    const user = request.tenantUser;
    const restaurantId = user?.restaurantId || request.headers['x-restaurant-id'];

    if (!restaurantId) {
      throw new ForbiddenException('Tenant context required for entitlement check');
    }

    // Single source of truth: active subscription in PostgreSQL
    const subscription = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.subscription.findFirst({
        where: {
          restaurantId,
          status: { in: ['ACTIVE', 'TRIAL'] },
          expiresAt: { gt: new Date() }
        },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
      })
    );

    if (!subscription) {
      throw new ForbiddenException('No active subscription found. Access is restricted.');
    }

    const entitlements = subscription.plan.entitlements as Record<string, boolean>;
    if (!entitlements || !entitlements[requiredEntitlement]) {
      throw new ForbiddenException(
        `Feature "${requiredEntitlement}" is not enabled under your current ${subscription.plan.name} plan. Upgrade to JAMANVAAR PRO to unlock.`
      );
    }

    return true;
  }
}
