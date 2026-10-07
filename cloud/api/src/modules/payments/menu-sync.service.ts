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
  async loadItemsByExternalIds(restaurantId: string, externalItemIds: string[], deviceId?: string) {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const legacy = await tx.menuSnapshotItem.findMany({ where: { restaurantId, externalItemId: { in: externalItemIds } } });
      const rows = await tx.syncedEntity.findMany({ where: { restaurantId, entityType: 'MENU_ITEM', externalId: { in: externalItemIds } } });
      if (!rows.length) return legacy.map(item => ({ ...item, taxInclusive: false, taxGroupId: undefined as string | undefined }));
      const groups = await tx.syncedEntity.findMany({ where: { restaurantId, entityType: { in: ['MODIFIER_GROUP', 'TAX_GROUP', 'BRANCH_MENU_OVERRIDE', 'MENU_CATEGORY'] } } });
      const branchId = deviceId ? (await tx.device.findFirst({ where: { id: deviceId, restaurantId }, select: { branchId: true } }))?.branchId : null;
      const byId = new Map(groups.map((g) => [`${g.entityType}:${g.externalId}`, g.payload as Record<string, any>]));
      const result = new Map<string, (typeof legacy)[number] & { taxInclusive?: boolean; taxGroupId?: string }>(legacy.map((item) => [item.externalItemId, item]));
      // Dishes with no usable tax group take the default group (flagged isDefault, or the only active one), as the POS does.
      const activeTaxGroups = groups.filter((g) => g.entityType === 'TAX_GROUP').map((g) => g.payload as Record<string, any>).filter((t) => t.deleted !== true && t.isActive !== false);
      const defaultTax = activeTaxGroups.find((t) => t.isDefault === true) ?? (activeTaxGroups.length === 1 ? activeTaxGroups[0] : undefined);
      for (const row of rows) {
        const item = row.payload as Record<string, any>;
        if (item.deleted === true) { result.delete(row.externalId); continue; }
        const declaredTax = byId.get(`TAX_GROUP:${item.taxGroupId}`);
        const usableDeclared = declaredTax && declaredTax.deleted !== true && declaredTax.isActive !== false ? declaredTax : undefined;
        const tax = usableDeclared ?? defaultTax;
        const category = byId.get(`MENU_CATEGORY:${item.categoryId}`);
        const override = branchId ? byId.get(`BRANCH_MENU_OVERRIDE:${branchId}:${row.externalId}`) : undefined;
        const modifierGroups = (item.modifierGroups ?? (item.modifierGroupIds ?? []).map((id: string) => byId.get(`MODIFIER_GROUP:${id}`))).filter(Boolean)
          .filter((g: any) => !g.deleted && g.isActive !== false).map((g: any) => ({
            id: g.id, name: g.name, isRequired: g.isRequired === true, minSelections: g.minSelections ?? 0, maxSelections: g.maxSelections ?? 1,
            options: (g.options ?? []).filter((o: any) => o.isActive !== false && o.isAvailable !== false).map((o: any) => ({ id: o.id, name: o.name, priceDelta: Math.round((o.priceDelta ?? 0) * 100) }))
          }));
        result.set(row.externalId, {
          id: row.id, restaurantId, externalItemId: row.externalId, name: item.name, category: item.categoryId ?? null,
          basePrice: Math.round((override?.price ?? item.price ?? item.basePrice ?? 0) * 100),
          modifierGroups, taxRate: tax?.isActive === false ? 0 : Math.round(((tax?.cgstPercent ?? 0) + (tax?.sgstPercent ?? 0)) * 100),
          taxInclusive: tax?.isInclusive === true && tax?.isActive !== false,
          taxGroupId: item.taxGroupId,
          isAvailable: !item.archivedAt && !category?.deleted && category?.isActive !== false && item.isAvailable !== false && item.isKioskEnabled !== false && override?.isAvailable !== false && (!item.salesChannels || item.salesChannels.includes('KIOSK')) && (!item.branchIds?.length || (!!branchId && item.branchIds.includes(branchId))),
          syncedAt: row.updatedAt, createdAt: row.createdAt, updatedAt: row.updatedAt
        });
      }
      return [...result.values()];
    });
  }
}
