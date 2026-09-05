import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser, RestaurantStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Creates Restaurant -> default Branch -> pending Owner User atomically, all
   * inside one platform-context transaction, with the audit row in the same
   * transaction so a partial failure never leaves an unaudited restaurant.
   */
  async createRestaurant(dto: CreateRestaurantDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: dto.name,
          legalName: dto.legalName,
          gstin: dto.gstin,
          address: dto.address,
          city: dto.city,
          state: dto.state,
          country: dto.country,
          timezone: dto.timezone,
          currency: dto.currency,
          defaultLanguage: dto.defaultLanguage
        }
      });

      const branch = await tx.branch.create({
        data: {
          restaurantId: restaurant.id,
          name: `${dto.name} — Main Branch`,
          code: 'MAIN',
          address: dto.address,
          timezone: dto.timezone
        }
      });

      const owner = await tx.user.create({
        data: {
          restaurantId: restaurant.id,
          branchId: branch.id,
          email: dto.ownerEmail,
          phone: dto.ownerPhone,
          fullName: dto.ownerName,
          role: 'OWNER',
          status: 'PENDING_ACTIVATION',
          invitedAt: new Date()
        },
        // passwordHash is always null at creation, but excluding it by
        // shape (not just value) keeps the response safe even after a
        // future phase lets an owner set one.
        select: {
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
        }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: restaurant.id,
          action: 'RESTAURANT_CREATED',
          category: 'RESTAURANT',
          details: { name: restaurant.name, ownerEmail: owner.email, branchId: branch.id }
        },
        tx
      );

      return { restaurant, branch, owner };
    });
  }

  async listRestaurants() {
    return this.prisma.runAsPlatform((tx) =>
      tx.restaurant.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { branches: true, devices: true } },
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { plan: true }
          }
        }
      })
    );
  }

  async getRestaurantById(id: string) {
    const restaurant = await this.prisma.runAsPlatform((tx) =>
      tx.restaurant.findFirst({
        where: { id, deletedAt: null },
        include: {
          branches: true,
          users: {
            where: { role: 'OWNER' },
            select: {
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
            }
          },
          devices: true,
          subscriptions: { orderBy: { createdAt: 'desc' }, include: { plan: true } },
          activationKeys: { orderBy: { createdAt: 'desc' } }
        }
      })
    );

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    return restaurant;
  }

  async update(id: string, dto: UpdateRestaurantDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.restaurant.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException('Restaurant not found');

      const updated = await tx.restaurant.update({ where: { id }, data: dto });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: id,
          action: 'RESTAURANT_UPDATED',
          category: 'RESTAURANT',
          details: { fields: Object.keys(dto) }
        },
        tx
      );

      return updated;
    });
  }

  async setStatus(id: string, status: RestaurantStatus, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.restaurant.findFirst({ where: { id, deletedAt: null } });
      if (!existing) {
        throw new NotFoundException('Restaurant not found');
      }
      if (existing.status === status) {
        throw new ConflictException(`Restaurant is already ${status}`);
      }

      const updated = await tx.restaurant.update({ where: { id }, data: { status } });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: id,
          action: `RESTAURANT_${status}`,
          category: 'RESTAURANT',
          details: { previousStatus: existing.status }
        },
        tx
      );

      return updated;
    });
  }
}
