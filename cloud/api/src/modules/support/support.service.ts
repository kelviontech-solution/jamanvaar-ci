import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../notifications/email.service';
import { resendInviteEmail } from '../notifications/email-templates';
import { generateOpaqueToken, hashOpaqueToken } from '../../common/security/token.util';
import { TenantAuthService } from '../tenant-auth/tenant-auth.service';

const ACTIVATION_TOKEN_TTL_DAYS = 7;

/** Only these roles may impersonate a tenant owner for debugging — matches the same set that can manage the platform team. */
const IMPERSONATION_ALLOWED_ROLES = ['PLATFORM_OWNER', 'SUPER_ADMIN', 'SUPPORT_ADMIN'];

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly tenantAuth: TenantAuthService
  ) {}

  async search(query: string) {
    if (!query || query.trim().length < 2) {
      return { restaurants: [], owners: [], devices: [], activationKeys: [] };
    }

    const q = query.trim();

    return this.prisma.runAsPlatform(async (tx) => {
      const [restaurants, owners, devices, activationKeys] = await Promise.all([
        tx.restaurant.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { legalName: { contains: q, mode: 'insensitive' } },
              { gstin: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } }
            ]
          },
          take: 8,
          include: {
            subscriptions: { where: { status: 'ACTIVE' }, include: { plan: true }, take: 1 }
          }
        }),
        tx.user.findMany({
          where: {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { fullName: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } }
            ]
          },
          take: 8,
          include: {
            restaurant: { select: { id: true, name: true, status: true } }
          }
        }),
        tx.device.findMany({
          where: {
            OR: [
              { id: { contains: q, mode: 'insensitive' } },
              { appVersion: { contains: q, mode: 'insensitive' } }
            ]
          },
          take: 8,
          include: {
            restaurant: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } }
          }
        }),
        tx.activationKey.findMany({
          where: {
            code: { contains: q, mode: 'insensitive' }
          },
          take: 8,
          include: {
            restaurant: { select: { id: true, name: true } }
          }
        })
      ]);

      return { restaurants, owners, devices, activationKeys };
    });
  }

  async getDiagnostics(restaurantId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const restaurant = await tx.restaurant.findUnique({
        where: { id: restaurantId },
        include: {
          branches: true,
          users: { orderBy: { createdAt: 'asc' } },
          devices: { orderBy: { createdAt: 'desc' } },
          subscriptions: {
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
            take: 3
          },
          activationKeys: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!restaurant) throw new NotFoundException(`Restaurant ${restaurantId} not found`);

      const recentAudits = await tx.auditLog.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        take: 15
      });

      const activeSubscription = restaurant.subscriptions.find(
        (s) => s.status === 'ACTIVE' || s.status === 'TRIAL'
      );

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const onlineDevicesCount = restaurant.devices.filter(
        (d) => d.status === 'ACTIVE' && d.lastSeenAt && new Date(d.lastSeenAt) > oneHourAgo
      ).length;

      return {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          legalName: restaurant.legalName,
          status: restaurant.status,
          city: restaurant.city,
          state: restaurant.state,
          gstin: restaurant.gstin,
          createdAt: restaurant.createdAt
        },
        owners: restaurant.users,
        branches: restaurant.branches,
        activeSubscription,
        subscriptionsHistory: restaurant.subscriptions,
        devices: restaurant.devices,
        onlineDevicesCount,
        activationKeys: restaurant.activationKeys,
        recentAudits,
        entitlements: activeSubscription?.plan?.entitlements || null
      };
    });
  }

  /**
   * A resend is only meaningful for a still-pending account — the original
   * activation token's plaintext was never persisted (SEC-001), so this
   * mints and emails a brand-new one rather than pretending to "resend" a
   * value that no longer exists anywhere, and invalidates the old one.
   */
  async resendInvite(userId: string, reason: string, actor: PlatformUser) {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('A valid diagnostic reason is required to resend invitations');
    }

    const { updated, restaurantName, activationToken, activationTokenExpiresAt } = await this.prisma.runAsPlatform(
      async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, include: { restaurant: true } });
        if (!user) throw new NotFoundException('User not found');
        if (user.status !== 'PENDING_ACTIVATION') {
          throw new BadRequestException('This account has already been activated — there is no pending invite to resend');
        }

        const activationToken = generateOpaqueToken();
        const activationTokenExpiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

        const updated = await tx.user.update({
          where: { id: userId },
          data: {
            invitedAt: new Date(),
            activationTokenHash: hashOpaqueToken(activationToken),
            activationTokenExpiresAt
          }
        });

        await this.audit.log(
          {
            actorType: 'PLATFORM',
            actorId: actor.id,
            restaurantId: user.restaurantId,
            action: 'SUPPORT_INVITE_RESENT',
            category: 'SUPPORT',
            details: { targetUserId: user.id, email: user.email, reason }
          },
          tx
        );

        return { updated, restaurantName: user.restaurant.name, activationToken, activationTokenExpiresAt };
      }
    );

    let emailSent = false;
    try {
      const { subject, html } = resendInviteEmail({
        restaurantName,
        ownerName: updated.fullName,
        email: updated.email,
        activationToken,
        expiresAt: activationTokenExpiresAt
      });
      emailSent = await this.email.send(updated.email, subject, html);
    } catch {
      // logged inside EmailService; a failed send doesn't undo the token rotation above —
      // the operator still has `activationToken` below to relay manually.
    }

    return { ...updated, activationToken, emailSent };
  }

  async revokeDeviceSession(deviceId: string, reason: string, actor: PlatformUser) {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('A valid diagnostic reason is required to revoke device session');
    }

    return this.prisma.runAsPlatform(async (tx) => {
      const device = await tx.device.findUnique({ where: { id: deviceId } });
      if (!device) throw new NotFoundException('Device not found');

      const updated = await tx.device.update({
        where: { id: deviceId },
        data: { status: 'REVOKED' }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: device.restaurantId,
          action: 'SUPPORT_DEVICE_REVOKED',
          category: 'SUPPORT',
          details: { deviceId, deviceType: device.type, reason }
        },
        tx
      );

      return updated;
    });
  }

  /**
   * Time-boxed (15 min), fully audited impersonation of a restaurant's
   * owner — for support debugging of cloud-backed tenant features (device
   * logins, cloud backups, entitlements sync). This mints a real tenant
   * access token; it does not and cannot show that restaurant's live local
   * POS data (menu/orders/tables), since that data lives only on the
   * restaurant's own on-site device in this offline-first architecture, not
   * in the cloud database — an honest limit, not an oversight.
   */
  async impersonateOwner(restaurantId: string, reason: string, actor: PlatformUser) {
    if (!IMPERSONATION_ALLOWED_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Only a Platform Owner, Super Admin, or Support Admin may impersonate a tenant');
    }
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('A reason of at least 5 characters is required to impersonate a tenant');
    }

    const restaurant = await this.prisma.runAsPlatform((tx) =>
      tx.restaurant.findFirst({ where: { id: restaurantId, deletedAt: null } })
    );
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    const result = await this.tenantAuth.impersonateOwner(restaurantId, actor.id);

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId,
      action: 'TENANT_IMPERSONATION_STARTED',
      category: 'SUPPORT',
      details: { restaurantName: restaurant.name, impersonatedUserId: result.owner.id, impersonatedEmail: result.owner.email, reason, expiresAt: result.expiresAt }
    });

    return {
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
      restaurantName: restaurant.name,
      ownerEmail: result.owner.email,
      ownerName: result.owner.fullName
    };
  }
}
