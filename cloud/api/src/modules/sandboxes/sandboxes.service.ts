import { randomBytes } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface CreateSandboxDto {
  sourceRestaurantId: string;
  name: string;
  durationDays?: number;
}

@Injectable()
export class SandboxesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list() {
    return this.prisma.runAsPlatform(async (tx) => {
      return tx.restaurantSandbox.findMany({
        include: {
          sourceRestaurant: { select: { id: true, name: true, city: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
    });
  }

  async getById(id: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const sbx = await tx.restaurantSandbox.findUnique({
        where: { id },
        include: { sourceRestaurant: true }
      });
      if (!sbx) throw new NotFoundException('Sandbox not found');
      return sbx;
    });
  }

  async create(dto: CreateSandboxDto, actor: PlatformUser) {
    const source = await this.prisma.runAsPlatform(async (tx) => {
      return tx.restaurant.findUnique({
        where: { id: dto.sourceRestaurantId },
        include: {
          branches: { select: { name: true, code: true, address: true, timezone: true } }
        }
      });
    });
    if (!source) throw new NotFoundException('Source restaurant not found');

    const durationDays = dto.durationDays || 14;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    const environmentKey = `sbx_${randomBytes(8).toString('hex')}`;

    // Clone configuration safely (NO passwords, NO customer records, NO real payment credentials)
    const clonedConfig = {
      isSandbox: true,
      environmentBanner: 'SANDBOX / TEST ENVIRONMENT - NO REAL CHARGES OR ORDERS',
      sourceRestaurant: {
        id: source.id,
        name: source.name,
        legalName: source.legalName,
        city: source.city,
        state: source.state,
        currency: source.currency,
        timezone: source.timezone
      },
      branches: source.branches,
      demoFeatures: {
        posBilling: true,
        captainOrdering: true,
        kdsRouting: true,
        kioskSelfOrder: true,
        simulatedPayments: ['CASH', 'SIMULATED_UPI', 'SIMULATED_CARD']
      }
    };

    const sandbox = await this.prisma.runAsPlatform(async (tx) => {
      return tx.restaurantSandbox.create({
        data: {
          sourceRestaurantId: dto.sourceRestaurantId,
          name: dto.name,
          environmentKey,
          status: 'ACTIVE',
          config: clonedConfig as any,
          expiresAt
        },
        include: {
          sourceRestaurant: { select: { id: true, name: true } }
        }
      });
    });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: source.id,
      action: 'RESTAURANT_SANDBOX_CLONED',
      category: 'SANDBOX',
      details: {
        sandboxId: sandbox.id,
        name: sandbox.name,
        environmentKey,
        expiresAt: expiresAt.toISOString()
      }
    });

    return sandbox;
  }

  async delete(id: string, actor: PlatformUser) {
    const existing = await this.prisma.restaurantSandbox.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sandbox not found');

    await this.prisma.restaurantSandbox.delete({ where: { id } });

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      restaurantId: existing.sourceRestaurantId,
      action: 'RESTAURANT_SANDBOX_DELETED',
      category: 'SANDBOX',
      details: { sandboxId: id, name: existing.name }
    });

    return { success: true };
  }
}
