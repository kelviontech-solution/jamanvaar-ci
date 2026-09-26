import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Is this restaurant (and, if the session belongs to a terminal, that terminal)
 * still allowed to operate? Shared by the tenant request guard and the token
 * refresh so a Restaurant Admin session cannot outlive a suspension, a lapsed
 * subscription or a revoked device. Throws 401/403 with a machine-readable
 * `code` so the app can show why.
 */
export async function assertSessionStillAllowed(
  prisma: PrismaService,
  restaurantId: string,
  deviceId?: string,
  opts: { requireSubscription?: boolean; allowSuspended?: boolean } = {}
): Promise<void> {
  const restaurant = await prisma.runAsPlatform((tx) =>
    tx.restaurant.findUnique({ where: { id: restaurantId }, select: { status: true, deletedAt: true } })
  );
  // A suspended restaurant can still open its billing page: an unpaid invoice is often why it was suspended, and it must be able to pay.
  const billingOnly = opts.allowSuspended === true && restaurant?.status === 'SUSPENDED' && restaurant.deletedAt === null;
  if (!billingOnly && (!restaurant || restaurant.deletedAt !== null || restaurant.status !== 'ACTIVE')) {
    const suspended = restaurant?.status === 'SUSPENDED';
    throw new ForbiddenException({
      statusCode: 403,
      message: suspended
        ? 'This restaurant account is suspended. Please contact your platform administrator.'
        : 'This restaurant account is no longer active.',
      code: suspended ? 'RESTAURANT_SUSPENDED' : 'RESTAURANT_INACTIVE'
    });
  }

  // A tenant session does NOT require a live subscription by default: a lapsed
  // restaurant must still be able to sign in to see its plan and pay. Terminals
  // (DeviceAuthGuard) and the entitlement guard enforce the subscription.
  const subscription = opts.requireSubscription
    ? await prisma.runAsPlatform((tx) =>
        tx.subscription.findFirst({
          where: { restaurantId, status: { in: ['ACTIVE', 'TRIAL'] }, expiresAt: { gt: new Date() } },
          select: { id: true }
        })
      )
    : true;
  if (!subscription) {
    throw new ForbiddenException({
      statusCode: 403,
      message: 'This restaurant has no active subscription. Please contact your platform administrator.',
      code: 'SUBSCRIPTION_INACTIVE'
    });
  }

  if (deviceId) {
    const device = await prisma.runAsPlatform((tx) => tx.device.findUnique({ where: { id: deviceId }, select: { status: true } }));
    if (!device || device.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'This device has been revoked. Contact your platform administrator.',
        code: 'DEVICE_REVOKED'
      });
    }
  }
}
