import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, DeviceCommandStatus, DeviceCommandType, PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Kiosk Pro's real differentiator: remote fleet management. Kiosk Standard keeps the safety
 * basics (lock/unlock/force-logout/disable/wipe); these operational commands need a Pro/Enterprise
 * KIOSK-family subscription.
 */
const KIOSK_PRO_ONLY_COMMANDS: ReadonlySet<DeviceCommandType> = new Set<DeviceCommandType>([
  DeviceCommandType.RESTART_APP,
  DeviceCommandType.CLEAR_CACHE,
  DeviceCommandType.REQUEST_DIAGNOSTICS,
  DeviceCommandType.REQUEST_SYNC,
  DeviceCommandType.REQUEST_HEALTH,
  DeviceCommandType.APP_UPDATE
]);

export interface IssueCommandDto {
  commandType: DeviceCommandType;
  payload?: Record<string, unknown>;
  expiresInMinutes?: number;
}

@Injectable()
export class DeviceCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async listForDevice(deviceId: string) {
    return this.prisma.runAsPlatform((tx) =>
      tx.deviceCommand.findMany({
        where: { deviceId },
        orderBy: { issuedAt: 'desc' },
        take: 50
      })
    );
  }

  async listAllPending() {
    return this.prisma.runAsPlatform((tx) =>
      tx.deviceCommand.findMany({
        where: { status: 'PENDING' },
        include: {
          device: { select: { id: true, type: true, name: true } },
          restaurant: { select: { id: true, name: true } }
        },
        orderBy: { issuedAt: 'desc' }
      })
    );
  }

  async issueCommand(deviceId: string, dto: IssueCommandDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const device = await tx.device.findUnique({
        where: { id: deviceId },
        include: { restaurant: true }
      });
      if (!device) throw new NotFoundException('Device not found');
      if (device.status === 'REVOKED') throw new ConflictException('Cannot issue commands to a revoked device');

      if ((device.type === 'KIOSK' || device.type === 'KIOSK_ADMIN') && KIOSK_PRO_ONLY_COMMANDS.has(dto.commandType)) {
        const proSub = await tx.subscription.findFirst({
          where: {
            restaurantId: device.restaurantId,
            status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] },
            plan: { productFamily: 'KIOSK', tier: { in: ['PRO', 'ENTERPRISE'] } }
          },
          select: { id: true }
        });
        if (!proSub) {
          throw new ForbiddenException(
            `Remote ${dto.commandType.toLowerCase().replace(/_/g, ' ')} for kiosks is part of Kiosk Pro. Upgrade this restaurant's Kiosk plan to use it.`
          );
        }
      }

      const expiresAt = new Date(Date.now() + (dto.expiresInMinutes || 1440) * 60 * 1000); // default 24h

      const command = await tx.deviceCommand.create({
        data: {
          deviceId,
          restaurantId: device.restaurantId,
          commandType: dto.commandType,
          status: DeviceCommandStatus.PENDING,
          payload: (dto.payload || {}) as any,
          issuedById: actor.id,
          expiresAt
        }
      });

      // Handle immediate device state transitions for lock/wipe
      if (dto.commandType === DeviceCommandType.LOCK) {
        await tx.device.update({
          where: { id: deviceId },
          data: { isLocked: true, lockReason: (dto.payload?.reason as string) || 'Locked by Super Admin', lockedAt: new Date() }
        });
      } else if (dto.commandType === DeviceCommandType.UNLOCK) {
        await tx.device.update({
          where: { id: deviceId },
          data: { isLocked: false, lockReason: null, lockedAt: null }
        });
      } else if (dto.commandType === DeviceCommandType.DISABLE_DEVICE) {
        await tx.device.update({
          where: { id: deviceId },
          data: { status: 'REVOKED' }
        });
      }

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: device.restaurantId,
          action: `DEVICE_COMMAND_${dto.commandType}`,
          category: 'MDM',
          details: {
            deviceId,
            commandId: command.id,
            commandType: dto.commandType,
            expiresAt: expiresAt.toISOString()
          }
        },
        tx
      );

      return command;
    });
  }

  async lockDevice(deviceId: string, reason: string, actor: PlatformUser) {
    return this.issueCommand(deviceId, { commandType: DeviceCommandType.LOCK, payload: { reason } }, actor);
  }

  async unlockDevice(deviceId: string, actor: PlatformUser) {
    return this.issueCommand(deviceId, { commandType: DeviceCommandType.UNLOCK, payload: {} }, actor);
  }

  async forceLogout(deviceId: string, actor: PlatformUser) {
    return this.issueCommand(deviceId, { commandType: DeviceCommandType.FORCE_LOGOUT, payload: {} }, actor);
  }

  async wipeDevice(deviceId: string, confirmationPhrase: string, actor: PlatformUser) {
    if (confirmationPhrase !== 'WIPE DEVICE DATA') {
      throw new ForbiddenException('Invalid wipe confirmation phrase');
    }
    return this.issueCommand(
      deviceId,
      {
        commandType: DeviceCommandType.WIPE_LOCAL_DATA,
        payload: { instruction: 'APPLICATION_CACHE_AND_LOCAL_STORE_RESET', confirmedBy: actor.email }
      },
      actor
    );
  }

  /**
   * Called by physical terminals to retrieve their pending commands
   */
  async getPendingForDevice(device: Device) {
    const now = new Date();
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      // Auto-expire past-due pending commands
      await tx.deviceCommand.updateMany({
        where: { deviceId: device.id, status: 'PENDING', expiresAt: { lt: now } },
        data: { status: 'EXPIRED' }
      });

      const pending = await tx.deviceCommand.findMany({
        where: { deviceId: device.id, status: 'PENDING' },
        orderBy: { issuedAt: 'asc' }
      });

      if (pending.length > 0) {
        // Mark as SENT
        await tx.deviceCommand.updateMany({
          where: { id: { in: pending.map((p) => p.id) } },
          data: { status: 'SENT', acknowledgedAt: now }
        });
      }

      return pending;
    });
  }

  /**
   * Terminal reports execution outcome of a command
   */
  async acknowledgeCommand(
    device: Device,
    commandId: string,
    outcome: { status: 'SUCCEEDED' | 'FAILED'; result?: Record<string, unknown>; error?: string }
  ) {
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      const command = await tx.deviceCommand.findFirst({
        where: { id: commandId, deviceId: device.id }
      });
      if (!command) throw new NotFoundException('Command not found for this device');

      const updated = await tx.deviceCommand.update({
        where: { id: commandId },
        data: {
          status: outcome.status as any,
          result: outcome.result as any,
          errorMessage: outcome.error,
          executedAt: new Date()
        }
      });

      await this.audit.log(
        {
          actorType: 'SYSTEM',
          actorId: device.id,
          restaurantId: device.restaurantId,
          action: `DEVICE_COMMAND_ACK_${outcome.status}`,
          category: 'MDM',
          details: { commandId, outcome: outcome.status, error: outcome.error }
        },
        tx
      );

      return updated;
    });
  }
}
