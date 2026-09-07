import { createPrivateKey, createSign } from 'crypto';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface GrantOfflineExtensionDto {
  restaurantId: string;
  branchId?: string;
  deviceId?: string;
  extensionDays: number;
  reason: string;
  requestedBy: string;
}

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

  private sign(payloadJson: string): string {
    const signer = createSign('SHA256');
    signer.update(payloadJson);
    signer.end();
    return signer.sign({ key: this.getPrivateKey(), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  }

  async listExtensions(restaurantId?: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      return tx.offlineExtension.findMany({
        where: restaurantId ? { restaurantId } : undefined,
        include: {
          restaurant: { select: { id: true, name: true, city: true } },
          device: { select: { id: true, type: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
    });
  }

  async getDevicesApproachingExpiry() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return this.prisma.runAsPlatform(async (tx) => {
      return tx.device.findMany({
        where: {
          status: 'ACTIVE',
          lastSeenAt: { lt: sevenDaysAgo, gt: thirtyDaysAgo }
        },
        include: {
          restaurant: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } }
        },
        orderBy: { lastSeenAt: 'asc' }
      });
    });
  }

  async grantExtension(dto: GrantOfflineExtensionDto, actor: PlatformUser) {
    if (dto.extensionDays <= 0 || dto.extensionDays > 90) {
      throw new BadRequestException('Extension duration must be between 1 and 90 days');
    }

    const restaurant = await this.prisma.runAsPlatform(async (tx) => {
      return tx.restaurant.findUnique({ where: { id: dto.restaurantId } });
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');

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
      reason: dto.reason
    };

    const payloadJson = JSON.stringify(tokenPayload);
    const certificatePayload = Buffer.from(payloadJson).toString('base64url');
    const certificateSignature = this.sign(payloadJson);

    const extension = await this.prisma.offlineExtension.create({
      data: {
        restaurantId: dto.restaurantId,
        branchId: dto.branchId,
        deviceId: dto.deviceId,
        extensionDays: dto.extensionDays,
        reason: dto.reason,
        requestedBy: dto.requestedBy,
        approvedById: actor.id,
        status: 'ACTIVE',
        certificatePayload,
        certificateSignature,
        validFrom,
        validUntil
      }
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: dto.restaurantId,
      action: 'OFFLINE_EXTENSION_GRANTED',
      category: 'SECURITY',
      details: {
        extensionId: extension.id,
        extensionDays: dto.extensionDays,
        deviceId: dto.deviceId,
        validUntil: validUntil.toISOString(),
        reason: dto.reason
      }
    });

    return extension;
  }

  async revokeExtension(id: string, actor: PlatformUser) {
    const existing = await this.prisma.offlineExtension.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Extension record not found');

    const updated = await this.prisma.offlineExtension.update({
      where: { id },
      data: { status: 'REVOKED' }
    });

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
