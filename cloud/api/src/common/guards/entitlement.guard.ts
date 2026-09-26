import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationEntitlementsService } from '../../modules/application-entitlements/application-entitlements.service';

export const REQUIRE_FEATURE_KEY = 'require_feature';

/** Marks a tenant route as available only when the restaurant is entitled to this application/feature. */
export const RequiresFeature = (appCode: AppCode) => SetMetadata(REQUIRE_FEATURE_KEY, appCode);

const MESSAGES: Record<string, string> = {
  RESTAURANT_INACTIVE: 'This restaurant is not active.',
  NO_SUBSCRIPTION: 'No active subscription found.',
  SUBSCRIPTION_EXPIRED: 'The subscription has expired.',
  NOT_INCLUDED: 'This feature is not included in the current plan.',
  DISABLED: 'This feature has been turned off for this restaurant.'
};

/**
 * Backend authorization for a plan feature. It asks the one entitlement service; it never looks at a plan
 * name, tier or price, and a frontend flag can never satisfy it.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly entitlements: ApplicationEntitlementsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const appCode = this.reflector.getAllAndOverride<AppCode>(REQUIRE_FEATURE_KEY, [context.getHandler(), context.getClass()]);
    if (!appCode) return true;
    const request = context.switchToHttp().getRequest();
    const restaurantId: string | undefined = request.tenantUser?.restaurantId;
    if (!restaurantId) throw new ForbiddenException('Tenant context required for entitlement check');
    const result = await this.prisma.runAsPlatform((tx) => this.entitlements.resolve(tx, restaurantId, appCode));
    if (!result.enabled) {
      throw new ForbiddenException({ statusCode: 403, code: 'ENTITLEMENT_REQUIRED', feature: appCode, reason: result.reason, message: MESSAGES[result.reason] ?? 'Not available.' });
    }
    return true;
  }
}
