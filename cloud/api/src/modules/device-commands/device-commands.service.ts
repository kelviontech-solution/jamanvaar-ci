import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, DeviceCommandStatus, DeviceCommandType, DeviceType, PlatformUser, Prisma } from '@prisma/client';
import { deviceHealth } from '../../common/device-health';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
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

const REDELIVER_AFTER_MS = 2 * 60 * 1000;
const MAX_REDELIVERIES = 3;

@Injectable()
export class DeviceCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeBus
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

  private notifyDevice(command: { deviceId: string; restaurantId: string }) {
    this.realtime.publish({ restaurantId: command.restaurantId, branchId: null, deviceId: command.deviceId, kind: 'command' });
  }

  async issueCommand(deviceId: string, dto: IssueCommandDto, actor: PlatformUser) {
    const command = await this.prisma.runAsPlatform(async (tx) => {
      const device = await tx.device.findUnique({
        where: { id: deviceId },
        include: { restaurant: true }
      });
      if (!device) throw new NotFoundException('Device not found');
      return this.persistCommand(tx, device, dto, { actorType: 'PLATFORM', id: actor.id });
    });
    this.notifyDevice(command);
    return command;
  }

  /** Commands a restaurant's own admin console may send to the devices it manages. Destructive ones stay Super Admin only. */
  static readonly FLEET_COMMANDS: ReadonlySet<DeviceCommandType> = new Set<DeviceCommandType>([
    DeviceCommandType.REQUEST_SYNC,
    DeviceCommandType.REQUEST_HEALTH,
    DeviceCommandType.REQUEST_DIAGNOSTICS,
    DeviceCommandType.RESTART_APP,
    DeviceCommandType.CLEAR_CACHE,
    DeviceCommandType.LOCK,
    DeviceCommandType.UNLOCK,
    DeviceCommandType.FORCE_LOGOUT
  ]);

  /** The devices a console can see and command: its whole restaurant, or only its own branch when it is branch-bound. */
  private scopeWhere(issuer: Device) {
    return { restaurantId: issuer.restaurantId, ...(issuer.branchId ? { branchId: issuer.branchId } : {}) };
  }

  /**
   * A Kiosk Admin / Restaurant Admin console sending a command to a device it manages. Authenticated as
   * the console device itself, restricted to its own restaurant (and branch), limited to FLEET_COMMANDS,
   * idempotent on `idempotencyKey`, and audited as the console.
   */
  async issueFromDevice(issuer: Device, targetId: string, dto: IssueCommandDto & { idempotencyKey?: string }) {
    if (issuer.type !== 'KIOSK_ADMIN' && issuer.type !== 'POS_ADMIN') {
      throw new ForbiddenException('Only an admin console can send commands to other devices');
    }
    if (!DeviceCommandsService.FLEET_COMMANDS.has(dto.commandType)) {
      throw new BadRequestException(`${dto.commandType} cannot be sent from a restaurant console`);
    }
    const command = await this.prisma.runAsTenant(issuer.restaurantId, async (tx) => {
      const target = await tx.device.findFirst({ where: { id: targetId, ...this.scopeWhere(issuer) } });
      if (!target) throw new NotFoundException('Device not found');
      if (dto.commandType === DeviceCommandType.FORCE_LOGOUT && target.type !== 'KIOSK') throw new ForbiddenException('Restaurant consoles can remotely log out kiosks only');
      if (issuer.type === 'KIOSK_ADMIN' && target.type !== 'KIOSK') {
        throw new ForbiddenException('Kiosk Admin can only manage kiosks');
      }
      if (dto.idempotencyKey) {
        const prior = await tx.deviceCommand.findFirst({ where: { deviceId: target.id, idempotencyKey: dto.idempotencyKey } });
        if (prior) return prior;
      }
      return this.persistCommand(tx, target, dto, { actorType: 'TENANT', id: issuer.id, idempotencyKey: dto.idempotencyKey });
    });
    this.notifyDevice(command);
    return command;
  }

  /** The console's view of the fleet it manages: every device with health, backlog, errors and version. */
  async listFleet(issuer: Device) {
    if (issuer.type !== 'KIOSK_ADMIN' && issuer.type !== 'POS_ADMIN') {
      throw new ForbiddenException('Only an admin console can list the device fleet');
    }
    const rows = await this.prisma.runAsTenant(issuer.restaurantId, (tx) =>
      tx.device.findMany({
        where: { ...this.scopeWhere(issuer), status: { not: 'REVOKED' }, ...(issuer.type === 'KIOSK_ADMIN' ? { type: { in: ['KIOSK', 'KIOSK_ADMIN'] as DeviceType[] } } : {}) },
        select: {
          id: true, type: true, name: true, status: true, lastSeenAt: true, lastSyncAt: true, appVersion: true, isLocked: true,
          lockReason: true, pendingSyncCount: true, syncStatus: true, syncError: true, menuVersion: true, branch: { select: { id: true, name: true } },
          commands: { orderBy: { issuedAt: 'desc' }, take: 1, select: { commandType: true, status: true, errorMessage: true } }
        },
        orderBy: [{ type: 'asc' }, { createdAt: 'asc' }]
      })
    );
    const now = new Date();
    const latestMenu = await this.prisma.runAsTenant(issuer.restaurantId, (tx) =>
      tx.menuPublication.findFirst({ where: { restaurantId: issuer.restaurantId }, orderBy: { version: 'desc' }, select: { version: true } })
    );
    const latestMenuVersion = latestMenu?.version ?? 0;
    const devices = rows.map((d) => ({
      id: d.id, type: d.type, name: d.name, appVersion: d.appVersion, lastSeenAt: d.lastSeenAt, lastSyncAt: d.lastSyncAt,
      health: deviceHealth(d, now), isLocked: d.isLocked, lockReason: d.lockReason,
      pendingSyncCount: d.pendingSyncCount, syncStatus: d.syncStatus, syncError: d.syncError,
      menuVersion: d.menuVersion, latestMenuVersion,
      menuStatus: latestMenuVersion === 0 ? 'none' : (d.menuVersion ?? 0) >= latestMenuVersion ? 'current' : 'behind',
      branch: d.branch, lastCommand: d.commands[0] ?? null
    }));
    return {
      devices,
      summary: {
        total: devices.length,
        online: devices.filter((d) => d.health === 'online').length,
        offline: devices.filter((d) => d.health === 'offline' || d.health === 'degraded').length,
        needsAttention: devices.filter((d) => d.syncError || d.health === 'offline').length,
        pendingChanges: devices.reduce((n, d) => n + (d.pendingSyncCount ?? 0), 0)
      },
      serverTime: now.toISOString()
    };
  }

  private async persistCommand(
    tx: Prisma.TransactionClient,
    device: Device,
    dto: IssueCommandDto,
    issuer: { actorType: 'PLATFORM' | 'TENANT'; id: string; idempotencyKey?: string }
  ) {
    const deviceId = device.id;
    {
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
          issuedById: issuer.id,
          idempotencyKey: issuer.idempotencyKey,
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
          actorType: issuer.actorType,
          actorId: issuer.id,
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
    }
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

      // A command delivered (SENT) but never acknowledged is delivered again after a while, up to
      // MAX_DELIVERIES times, then failed so a dead device never leaves it hanging silently.
      const redeliverBefore = new Date(now.getTime() - REDELIVER_AFTER_MS);
      await tx.deviceCommand.updateMany({
        where: { deviceId: device.id, status: 'SENT', acknowledgedAt: { lt: redeliverBefore }, retryCount: { gte: MAX_REDELIVERIES } },
        data: { status: 'FAILED', errorMessage: `No acknowledgement from the device after ${MAX_REDELIVERIES + 1} deliveries`, executedAt: now }
      });

      const pending = await tx.deviceCommand.findMany({
        where: {
          deviceId: device.id,
          OR: [
            { status: 'PENDING' },
            { status: 'SENT', acknowledgedAt: { lt: redeliverBefore }, retryCount: { lt: MAX_REDELIVERIES } }
          ]
        },
        orderBy: { issuedAt: 'asc' }
      });

      if (pending.length > 0) {
        await tx.deviceCommand.updateMany({
          where: { id: { in: pending.filter((p) => p.status === 'SENT').map((p) => p.id) } },
          data: { retryCount: { increment: 1 } }
        });
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
    const updated = await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      const command = await tx.deviceCommand.findFirst({
        where: { id: commandId, deviceId: device.id }
      });
      if (!command) throw new NotFoundException('Command not found for this device');
      if (!['SUCCEEDED', 'FAILED'].includes(outcome.status)) throw new BadRequestException('Invalid command outcome');

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

      if (command.commandType === DeviceCommandType.FORCE_LOGOUT && outcome.status === 'SUCCEEDED' && device.type === 'KIOSK') {
        await tx.device.update({ where: { id: device.id }, data: { status: 'REVOKED' } });
        await tx.tenantRefreshToken.updateMany({ where: { deviceId: device.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }

      return updated;
    });
    // Invalidate after commit: the successful acknowledgement must not leave a cached ACTIVE verdict.
    if (updated.commandType === DeviceCommandType.FORCE_LOGOUT && outcome.status === 'SUCCEEDED' && device.type === 'KIOSK') this.realtime.publishInvalidation(device.restaurantId);
    return updated;
  }
}
