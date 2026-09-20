import { createPrivateKey, createSign } from 'crypto';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GrantOfflineExtensionDto } from './dto/grant-offline-extension.dto';
import { OFFLINE_GRACE_DAYS, OFFLINE_WARN_AFTER_DAYS } from '../../common/device-health';


@Injectable()
export class OfflinePolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService
  ) {}

  private getPrivateKey() {
    const b64 = this.config.get<string>('LICENSE_SIGNING_PRIVATE_KEY_B64');
    if (!b64) {
      throw new ServiceUnavailableException('Offline signing key not configured (LICENSE_SIGNING_PRIVATE_KEY_B64)');
    }
    const pem = Buffer.from(b64, 'base64').toString('utf8');
    return createPrivateKey({ key: pem, format: 'pem' });
  }

  /** Lets the page say up front whether extensions can be signed. Never returns key material. */
  signingStatus(): { configured: true } | { configured: false; reason: string } {
    if (!this.config.get<string>('LICENSE_SIGNING_PRIVATE_KEY_B64')) {
      return { configured: false, reason: 'LICENSE_SIGNING_PRIVATE_KEY_B64 is not set on the API server.' };
    }
    try {
      this.getPrivateKey();
      return { configured: true };
    } catch {
      return { configured: false, reason: 'LICENSE_SIGNING_PRIVATE_KEY_B64 is set but is not a valid base64-encoded PEM private key.' };
    }
  }

  private sign(payloadJson: string): string {
    const signer = createSign('SHA256');
    signer.update(payloadJson);
    signer.end();
    return signer.sign({ key: this.getPrivateKey(), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  }

  async listExtensions(restaurantId?: string) {
    const rows = await this.prisma.runAsPlatform(async (tx) => {
      return tx.offlineExtension.findMany({
        where: restaurantId ? { restaurantId } : undefined,
        include: {
          restaurant: { select: { id: true, name: true, city: true } },
          device: { select: { id: true, type: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
    });
    // Nothing flips the stored status when an extension runs out, so derive it here rather than
    // counting a finished extension as active.
    const now = new Date();
    return rows.map((row) => (row.status === 'ACTIVE' && row.validUntil < now ? { ...row, status: 'EXPIRED' } : row));
  }

  /** The offline rule terminals actually enforce, so the page and the apps agree. */
  policy() {
    return { offlineGraceDays: OFFLINE_GRACE_DAYS, warnAfterDays: OFFLINE_WARN_AFTER_DAYS };
  }

  /**
   * Terminals measured against the real rule (BUG-077): "approaching" is silent for at least
   * OFFLINE_WARN_AFTER_DAYS but not yet past the limit; "locked" is past OFFLINE_GRACE_DAYS however long,
   * unless an active emergency extension covers the terminal.
   */
  async getDevicesApproachingExpiry(state: 'approaching' | 'locked' = 'approaching') {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const limit = new Date(now - OFFLINE_GRACE_DAYS * day);
    const warn = new Date(now - OFFLINE_WARN_AFTER_DAYS * day);

    return this.prisma.runAsPlatform(async (tx) => {
      const devices = await tx.device.findMany({
        where: { status: 'ACTIVE', lastSeenAt: state === 'locked' ? { lte: limit } : { gt: limit, lte: warn } },
        include: {
          restaurant: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } }
        },
        orderBy: { lastSeenAt: 'asc' },
        take: 500
      });
      if (state !== 'locked' || devices.length === 0) return devices;

      const extensions = await tx.offlineExtension.findMany({
        where: { status: 'ACTIVE', validUntil: { gt: new Date() }, restaurantId: { in: [...new Set(devices.map((d) => d.restaurantId))] } }
      });
      return devices.filter(
        (d) => !extensions.some((e) => e.restaurantId === d.restaurantId && (!e.deviceId || e.deviceId === d.id) && (!e.branchId || e.branchId === d.branchId))
      );
    });
  }

  async grantExtension(dto: GrantOfflineExtensionDto, actor: PlatformUser) {
    const { restaurant, branch, device, overlapping } = await this.prisma.runAsPlatform(async (tx) => ({
      restaurant: await tx.restaurant.findUnique({ where: { id: dto.restaurantId } }),
      branch: dto.branchId ? await tx.branch.findFirst({ where: { id: dto.branchId, restaurantId: dto.restaurantId } }) : null,
      device: dto.deviceId ? await tx.device.findFirst({ where: { id: dto.deviceId, restaurantId: dto.restaurantId } }) : null,
      overlapping: await tx.offlineExtension.count({
        where: { restaurantId: dto.restaurantId, status: 'ACTIVE', validUntil: { gt: new Date() } }
      })
    }));
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (dto.branchId && !branch) throw new NotFoundException('Branch not found for this restaurant');
    if (dto.deviceId && !device) throw new NotFoundException('Device not found for this restaurant');

    const validFrom = new Date();
    const validUntil = new Date(validFrom.getTime() + dto.extensionDays * 24 * 60 * 60 * 1000);

    // Cryptographically signed authorization payload
    const tokenPayload = {
      type: 'EMERGENCY_OFFLINE_EXTENSION',
      restaurantId: dto.restaurantId,
      branchId: dto.branchId || null,
      deviceId: dto.deviceId || null,
      extensionDays: dto.extensionDays,
      validFrom: validFrom.toISOString(),
      validUntil: validUntil.toISOString(),
      approvedBy: actor.email,
      reason: dto.reason,
      ticketRef: dto.ticketRef || null,
      kid: this.config.get<string>('LICENSE_SIGNING_KEY_ID') || 'k1'
    };

    const payloadJson = JSON.stringify(tokenPayload);
    const certificatePayload = Buffer.from(payloadJson).toString('base64url');
    const certificateSignature = this.sign(payloadJson);

    const extension = await this.prisma.runAsPlatform((tx) =>
      tx.offlineExtension.create({
        data: {
          restaurantId: dto.restaurantId,
          branchId: dto.branchId,
          deviceId: dto.deviceId,
          extensionDays: dto.extensionDays,
          reason: dto.reason,
          requestedBy: dto.requestedBy,
          ticketRef: dto.ticketRef || null,
          approvedById: actor.id,
          status: 'ACTIVE',
          certificatePayload,
          certificateSignature,
          validFrom,
          validUntil
        }
      })
    );

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: dto.restaurantId,
      action: 'OFFLINE_EXTENSION_GRANTED',
      category: 'SECURITY',
      details: {
        extensionId: extension.id,
        extensionDays: dto.extensionDays,
        branchId: dto.branchId,
        deviceId: dto.deviceId,
        validUntil: validUntil.toISOString(),
        reason: dto.reason,
        requestedBy: dto.requestedBy,
        ticketRef: dto.ticketRef
      }
    });

    const warnings =
      overlapping > 0
        ? [`This restaurant already has ${overlapping} active extension${overlapping === 1 ? '' : 's'}. Revoke the earlier one if this replaces it.`]
        : [];
    return { ...extension, warnings };
  }

  /** Extensions past their end date become EXPIRED. Run by the scheduler; safe to repeat. */
  async expireDueExtensions() {
    return this.prisma.runAsPlatform(async (tx) => {
      const res = await tx.offlineExtension.updateMany({ where: { status: 'ACTIVE', validUntil: { lte: new Date() } }, data: { status: 'EXPIRED' } });
      return { expired: res.count };
    });
  }

  async revokeExtension(id: string, actor: PlatformUser) {
    const existing = await this.prisma.runAsPlatform((tx) => tx.offlineExtension.findUnique({ where: { id } }));
    if (!existing) throw new NotFoundException('Extension record not found');
    if (existing.status === 'REVOKED') throw new BadRequestException('This extension has already been revoked');

    const updated = await this.prisma.runAsPlatform((tx) =>
      tx.offlineExtension.update({ where: { id }, data: { status: 'REVOKED' } })
    );

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: existing.restaurantId,
      action: 'OFFLINE_EXTENSION_REVOKED',
      category: 'SECURITY',
      details: { extensionId: id, previousStatus: existing.status }
    });

    return updated;
  }
}
