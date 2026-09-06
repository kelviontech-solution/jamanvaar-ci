import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface HeartbeatDto {
  lastSyncAt?: Date;
  lastBackupAt?: Date;
  syncStatus?: string;
  appVersion?: string;
}

/**
 * No device ever gets fabricated here. Devices only ever appear once the
 * keypair-based activation flow (a later phase — see architecture doc §05)
 * actually registers one. Until then this module is a real, empty, honest
 * CRUD surface, not a placeholder with sample rows.
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(restaurantId?: string) {
    return this.prisma.runAsPlatform((tx) =>
      tx.device.findMany({
        where: restaurantId ? { restaurantId } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          restaurant: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } }
        }
      })
    );
  }

  async getById(id: string) {
    const device = await this.prisma.runAsPlatform((tx) =>
      tx.device.findUnique({
        where: { id },
        include: {
          restaurant: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } }
        }
      })
    );
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async revoke(id: string, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.device.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Device not found');
      if (existing.status === 'REVOKED') throw new ConflictException('Device is already revoked');

      const updated = await tx.device.update({ where: { id }, data: { status: 'REVOKED' } });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'DEVICE_REVOKED',
          category: 'DEVICE',
          details: { deviceId: id, previousStatus: existing.status }
        },
        tx
      );

      return updated;
    });
  }

  /**
   * ENT-001-adjacent gap this closes: Device.lastSyncAt/lastBackupAt/syncStatus
   * existed as schema columns with nothing populating them, because no device
   * had any way to authenticate a write to its own row. DeviceAuthGuard is
   * that path now — the device identifies itself via its own long-lived
   * credential, never a caller-supplied device id.
   */
  async reportHeartbeat(device: Device, dto: HeartbeatDto) {
    return this.prisma.runAsTenant(device.restaurantId, (tx) =>
      tx.device.update({
        where: { id: device.id },
        data: {
          lastSeenAt: new Date(),
          ...(dto.lastSyncAt ? { lastSyncAt: dto.lastSyncAt } : {}),
          ...(dto.lastBackupAt ? { lastBackupAt: dto.lastBackupAt } : {}),
          ...(dto.syncStatus ? { syncStatus: dto.syncStatus } : {}),
          ...(dto.appVersion ? { appVersion: dto.appVersion } : {})
        }
      })
    );
  }
}
