import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser, TenantUserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateOwnerDto } from './dto/owner.dto';
import * as bcrypt from 'bcryptjs';

/** Never selects passwordHash — matches the same shape restaurants.service.ts already uses for owner rows. */
const OWNER_SELECT = {
  id: true,
  restaurantId: true,
  branchId: true,
  email: true,
  phone: true,
  fullName: true,
  role: true,
  status: true,
  invitedAt: true,
  activatedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list() {
    return this.prisma.runAsPlatform((tx) =>
      tx.user.findMany({
        where: { role: 'OWNER' },
        orderBy: { createdAt: 'desc' },
        select: { ...OWNER_SELECT, restaurant: { select: { id: true, name: true, status: true } } }
      })
    );
  }

  async getById(id: string) {
    const owner = await this.prisma.runAsPlatform((tx) =>
      tx.user.findFirst({
        where: { id, role: 'OWNER' },
        select: { ...OWNER_SELECT, restaurant: { select: { id: true, name: true, status: true } } }
      })
    );
    if (!owner) throw new NotFoundException('Owner not found');
    return owner;
  }

  async update(id: string, dto: UpdateOwnerDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.user.findFirst({ where: { id, role: 'OWNER' } });
      if (!existing) throw new NotFoundException('Owner not found');

      const updated = await tx.user.update({ where: { id }, data: dto, select: OWNER_SELECT });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'OWNER_UPDATED',
          category: 'OWNER',
          details: { ownerId: id }
        },
        tx
      );

      return updated;
    });
  }

  async setStatus(id: string, status: TenantUserStatus, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.user.findFirst({ where: { id, role: 'OWNER' } });
      if (!existing) throw new NotFoundException('Owner not found');
      if (existing.status === status) throw new ConflictException(`Owner is already ${status}`);

      const updated = await tx.user.update({ where: { id }, data: { status }, select: OWNER_SELECT });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: `OWNER_${status}`,
          category: 'OWNER',
          details: { ownerId: id, previousStatus: existing.status }
        },
        tx
      );

      return updated;
    });
  }

  async resetPassword(id: string, newPassword: string, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.user.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('User not found');

      const passwordHash = await bcrypt.hash(newPassword, 10);
      const updated = await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          status: TenantUserStatus.ACTIVE,
          activatedAt: existing.activatedAt ?? new Date(),
          activationTokenHash: null,
          activationTokenExpiresAt: null
        },
        select: OWNER_SELECT
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'OWNER_PASSWORD_RESET',
          category: 'AUTH',
          details: { userId: id, email: existing.email }
        },
        tx
      );

      return updated;
    });
  }
}
