import { randomBytes } from 'crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GenerateActivationKeyDto } from './dto/activation-key.dto';

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
    private readonly audit: AuditService
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
