import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MenuSyncItemDto } from './dto/menu-sync.dto';

@Injectable()
export class MenuSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertItems(restaurantId: string, items: MenuSyncItemDto[]): Promise<{ synced: number }> {
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      for (const item of items) {
        await tx.menuSnapshotItem.upsert({
          where: { restaurantId_externalItemId: { restaurantId, externalItemId: item.externalItemId } },
          create: {
            restaurantId,
            externalItemId: item.externalItemId,
            name: item.name,
            category: item.category,
            basePrice: item.basePrice,
            modifierGroups: item.modifierGroups as unknown as Prisma.InputJsonValue,
            taxRate: item.taxRate,
            isAvailable: item.isAvailable,
            syncedAt: new Date()
          },
          update: {
            name: item.name,
            category: item.category,
            basePrice: item.basePrice,
            modifierGroups: item.modifierGroups as unknown as Prisma.InputJsonValue,
            taxRate: item.taxRate,
            isAvailable: item.isAvailable,
            syncedAt: new Date()
          }
        });
      }
    });
    return { synced: items.length };
  }

  /** Trusted price source for PaymentsService's cart validation. */
  async loadItemsByExternalIds(restaurantId: string, externalItemIds: string[]) {
    return this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.menuSnapshotItem.findMany({ where: { restaurantId, externalItemId: { in: externalItemIds } } })
    );
  }
}
