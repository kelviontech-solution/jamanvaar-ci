import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
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

  async resendInvite(userId: string, reason: string, actor: PlatformUser) {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('A valid diagnostic reason is required to resend invitations');
    }

    return this.prisma.runAsPlatform(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      const updated = await tx.user.update({
        where: { id: userId },
        data: { invitedAt: new Date() }
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

      return updated;
    });
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
}
