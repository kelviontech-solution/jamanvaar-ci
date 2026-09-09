import { randomBytes } from 'crypto';
import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { AppCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GenerateActivationKeyDto, RedeemActivationKeyDto } from './dto/activation-key.dto';
import { generateOpaqueToken, hashOpaqueToken } from '../../common/security/token.util';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';

/** JMV-XXXX-XXXX-XXXX — human-relayable but drawn from a cryptographically random 96-bit value, not a counter or a guessable pattern. */
function generateCode(): string {
  const raw = randomBytes(12).toString('hex').toUpperCase(); // 24 hex chars
  const groups = raw.match(/.{1,4}/g) ?? [];
  return `JMV-${groups.slice(0, 3).join('-')}`;
}

@Injectable()
export class ActivationKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appEntitlements: ApplicationEntitlementsService
  ) {}

  list(restaurantId?: string) {
    return this.prisma.runAsPlatform((tx) =>
      tx.activationKey.findMany({
        where: restaurantId ? { restaurantId } : undefined,
        orderBy: { createdAt: 'desc' },
        include: { restaurant: { select: { id: true, name: true } } }
      })
    );
  }

  async getById(id: string) {
    const key = await this.prisma.runAsPlatform((tx) =>
      tx.activationKey.findUnique({
        where: { id },
        include: { restaurant: { select: { id: true, name: true } } }
      })
    );
    if (!key) throw new NotFoundException('Activation key not found');
    return key;
  }

  async generate(dto: GenerateActivationKeyDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const restaurant = await tx.restaurant.findFirst({ where: { id: dto.restaurantId, deletedAt: null } });
      if (!restaurant) throw new NotFoundException('Restaurant not found');

      if (dto.subscriptionId) {
        const sub = await tx.subscription.findFirst({
          where: { id: dto.subscriptionId, restaurantId: dto.restaurantId }
        });
        if (!sub) throw new NotFoundException('Subscription not found for this restaurant');
      }

      // 'ANY' isn't scoped to one application yet — the meaningful gate for
      // it is at redeem() below, once the redeeming device says what it
      // actually is. A key generated for a specific app, though, should
      // fail here rather than mint a code nobody can ever legitimately use.
      if (dto.allowedDeviceType !== 'ANY') {
        await this.appEntitlements.assertAppEnabled(tx, dto.restaurantId, dto.allowedDeviceType as AppCode);
      }

      // Retry on the astronomically unlikely code collision rather than trusting uniqueness blindly.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        try {
          const key = await tx.activationKey.create({
            data: {
              code,
              restaurantId: dto.restaurantId,
              subscriptionId: dto.subscriptionId,
              allowedDeviceType: dto.allowedDeviceType,
              expiresAt: dto.expiresAt
            },
            include: { restaurant: { select: { id: true, name: true } } }
          });

          await this.audit.log(
            {
              actorType: 'PLATFORM',
              actorId: actor.id,
              restaurantId: dto.restaurantId,
              action: 'ACTIVATION_KEY_GENERATED',
              category: 'ACTIVATION',
              details: { activationKeyId: key.id, allowedDeviceType: key.allowedDeviceType }
            },
            tx
          );

          return key;
        } catch (err) {
          if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002') continue;
          throw err;
        }
      }
      throw new ConflictException('Could not generate a unique activation code — please retry');
    });
  }

  /**
   * The other half of the flow `generate` starts (see
   * docs/architecture/super-admin-architecture.md §I.2). Deliberately not
   * behind PlatformAuthGuard or TenantAuthGuard — a device presenting this
   * call has neither kind of session yet; the code itself is the credential.
   * Creates the Device row and marks the key REDEEMED in one transaction.
   */
  async redeem(dto: RedeemActivationKeyDto) {
    return this.prisma.runAsPlatform(async (tx) => {
      const key = await tx.activationKey.findUnique({ where: { code: dto.code } });
      if (!key) throw new NotFoundException('Invalid activation code');

      if (key.status === 'REVOKED') throw new GoneException('Activation code has been revoked');
      if (key.status === 'REDEEMED') throw new ConflictException('Activation code has already been redeemed');
      if (key.status === 'EXPIRED' || key.expiresAt < new Date()) {
        throw new GoneException('Activation code has expired');
      }
      if (key.allowedDeviceType !== 'ANY' && key.allowedDeviceType !== dto.deviceType) {
        throw new BadRequestException(
          `This activation code is only valid for ${key.allowedDeviceType} devices, not ${dto.deviceType}`
        );
      }

      // The real gate: whatever the key allowed, this restaurant's current
      // subscription must still actually include the app the device claims
      // to be — closes the window where a key was generated while entitled
      // but the plan was downgraded before it got redeemed (an 'ANY' key
      // reaches this check for the first time here, since generate() above
      // has nothing to check it against yet).
      await this.appEntitlements.assertAppEnabled(tx, key.restaurantId, dto.deviceType as AppCode);

      // The device's long-lived credential for everything it calls after this
      // point (e.g. PATCH /api/v1/devices/me/heartbeat) — returned once, here,
      // exactly like ActivationKey.code and User.activationToken. Only the
      // hash is ever persisted.
      const deviceToken = generateOpaqueToken();

      const device = await tx.device.create({
        data: {
          restaurantId: key.restaurantId,
          type: dto.deviceType,
          appVersion: dto.appVersion,
          status: 'ACTIVE',
          activatedAt: new Date(),
          lastSeenAt: new Date(),
          deviceTokenHash: hashOpaqueToken(deviceToken)
        }
      });

      await tx.activationKey.update({
        where: { id: key.id },
        data: { status: 'REDEEMED', redeemedAt: new Date(), redeemedByDeviceId: device.id }
      });

      await this.audit.log(
        {
          actorType: 'SYSTEM',
          restaurantId: key.restaurantId,
          action: 'ACTIVATION_KEY_REDEEMED',
          category: 'ACTIVATION',
          details: { activationKeyId: key.id, deviceId: device.id, deviceType: device.type }
        },
        tx
      );

      return { device, restaurantId: key.restaurantId, deviceToken };
    });
  }

  async revoke(id: string, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.activationKey.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Activation key not found');
      if (existing.status === 'REVOKED') throw new ConflictException('Activation key is already revoked');

      const updated = await tx.activationKey.update({
        where: { id },
        data: { status: 'REVOKED' },
        include: { restaurant: { select: { id: true, name: true } } }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'ACTIVATION_KEY_REVOKED',
          category: 'ACTIVATION',
          details: { activationKeyId: id, previousStatus: existing.status }
        },
        tx
      );

      return updated;
    });
  }
}
