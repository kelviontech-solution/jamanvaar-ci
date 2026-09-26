import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { MenuSnapshotItemLookup, ModifierGroupSnapshot } from '../payments/pricing.util';

export interface QrMenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}
export interface QrMenuItem {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  /** Rupees, for display only. The server prices from paise in `lookup`, never from what a client sends back. */
  price: number;
  imageUrl?: string;
  dietaryType?: string;
  modifierGroupIds: string[];
}
export interface QrMenuGroup {
  id: string;
  name: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: Array<{ id: string; name: string; priceDelta: number }>; // rupees, for display
}
export interface QrMenu {
  menuVersion: number;
  etag: string;
  ready: boolean;
  categories: QrMenuCategory[];
  items: QrMenuItem[];
  modifierGroups: QrMenuGroup[];
}
export interface BuiltQrMenu extends QrMenu {
  /** Server-side pricing table (paise, tax basis points). Never sent to the customer. */
  lookup: Map<string, MenuSnapshotItemLookup>;
}

type Payload = Record<string, unknown>;
const isObject = (v: unknown): v is Payload => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

/**
 * The customer's menu is the restaurant's own canonical menu, the same synced catalogue POS, Kiosk and Captain use:
 * categories, dishes, modifier groups and tax groups, all read from that restaurant's rows and nothing else.
 * Visibility is decided by data (sales channels, availability, branch list), never by a hardcoded rule, and every
 * price the guest pays comes from here in paise.
 */
@Injectable()
export class QrMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async build(restaurantId: string, branchId: string | null): Promise<BuiltQrMenu> {
    const { rows, version } = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const all = await tx.syncedEntity.findMany({
        where: { restaurantId, entityType: { in: ['MENU_CATEGORY', 'MENU_ITEM', 'MODIFIER_GROUP', 'TAX_GROUP'] } },
        select: { entityType: true, payload: true, updatedAt: true }
      });
      const latest = await tx.menuPublication.findFirst({ where: { restaurantId }, orderBy: { version: 'desc' }, select: { version: true } });
      return { rows: all, version: latest?.version ?? 0 };
    });

    const live = (type: string) => rows.filter((r) => r.entityType === type && isObject(r.payload) && r.payload.deleted !== true);
    const payloads = (type: string) => live(type).map((r) => r.payload as Payload);

    const groupsById = new Map<string, ModifierGroupSnapshot>();
    for (const g of payloads('MODIFIER_GROUP')) {
      const id = str(g.id);
      if (!id || g.isActive === false) continue;
      const options = (Array.isArray(g.options) ? g.options : [])
        .filter((o): o is Payload => isObject(o) && o.isAvailable !== false && !!str(o.id))
        .map((o) => ({ id: String(o.id), name: String(o.name ?? ''), priceDelta: Math.round((typeof o.priceDelta === 'number' ? o.priceDelta : 0) * 100) }));
      groupsById.set(id, {
        id,
        name: String(g.name ?? ''),
        isRequired: g.isRequired === true,
        minSelections: typeof g.minSelections === 'number' ? g.minSelections : 0,
        maxSelections: typeof g.maxSelections === 'number' ? g.maxSelections : 0,
        options
      });
    }

    const taxById = new Map<string, { rateBp: number; inclusive: boolean }>();
    for (const t of payloads('TAX_GROUP')) {
      const id = str(t.id);
      if (!id || t.isActive === false) continue;
      const percent = typeof t.igstPercent === 'number' && t.igstPercent > 0 ? t.igstPercent : (Number(t.cgstPercent) || 0) + (Number(t.sgstPercent) || 0);
      taxById.set(id, { rateBp: Math.round(percent * 100), inclusive: t.isInclusive === true });
    }

    const categories: QrMenuCategory[] = payloads('MENU_CATEGORY')
      .filter((c) => c.isActive !== false && !!str(c.id))
      .map((c) => ({ id: String(c.id), name: String(c.name ?? ''), sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : 0 }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const categoryIds = new Set(categories.map((c) => c.id));

    const items: QrMenuItem[] = [];
    const lookup = new Map<string, MenuSnapshotItemLookup>();
    const usedGroups = new Set<string>();
    for (const p of payloads('MENU_ITEM')) {
      const id = str(p.id);
      if (!id || p.isAvailable === false) continue;
      // Channel availability: an explicit list must include QR; otherwise the legacy per-dish QR switch applies.
      const channels = Array.isArray(p.salesChannels) ? (p.salesChannels as unknown[]) : null;
      if (channels ? !channels.includes('QR') : p.isQrOrderingEnabled === false) continue;
      // Optional branch restriction on a dish.
      const branchIds = Array.isArray(p.branchIds) ? (p.branchIds as unknown[]).filter((b): b is string => typeof b === 'string') : [];
      if (branchIds.length > 0 && (!branchId || !branchIds.includes(branchId))) continue;
      const categoryId = String(p.categoryId ?? '');
      if (!categoryIds.has(categoryId)) continue;

      // A dish that names a tax group the restaurant has not published cannot be priced honestly, so it is not offered.
      const taxGroupId = str(p.taxGroupId);
      const tax = taxGroupId ? taxById.get(taxGroupId) : { rateBp: 0, inclusive: false };
      if (!tax) continue;

      const groupIds = Array.isArray(p.modifierGroupIds) ? (p.modifierGroupIds as unknown[]).filter((g): g is string => typeof g === 'string') : [];
      const groups = groupIds.map((g) => groupsById.get(g)).filter((g): g is ModifierGroupSnapshot => !!g);
      groups.forEach((g) => usedGroups.add(g.id));

      const price = typeof p.price === 'number' && p.price >= 0 ? p.price : 0;
      items.push({
        id,
        name: String(p.name ?? ''),
        description: str(p.description),
        categoryId,
        price,
        imageUrl: str(p.imageUrl),
        dietaryType: str(p.dietaryType),
        modifierGroupIds: groups.map((g) => g.id)
      });
      lookup.set(id, { externalItemId: id, name: String(p.name ?? ''), basePrice: Math.round(price * 100), taxRate: tax.rateBp, taxInclusive: tax.inclusive, isAvailable: true, modifierGroups: groups });
    }

    const modifierGroups: QrMenuGroup[] = [...usedGroups].map((id) => {
      const g = groupsById.get(id)!;
      return { id: g.id, name: g.name, isRequired: g.isRequired, minSelections: g.minSelections, maxSelections: g.maxSelections, options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta / 100 })) };
    });

    const usedCategoryIds = new Set(items.map((i) => i.categoryId));
    const shownCategories = categories.filter((c) => usedCategoryIds.has(c.id));
    const body = { menuVersion: version, categories: shownCategories, items, modifierGroups };
    const etag = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 16);
    return { ...body, etag, ready: items.length > 0, lookup };
  }
}
