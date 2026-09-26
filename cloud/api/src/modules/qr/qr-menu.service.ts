import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { MenuPublicationsService } from '../menu-publications/menu-publications.service';
import { publicImageUrl, viewForBranch } from '../menu-publications/menu-snapshot';
import type { MenuSnapshotItemLookup, ModifierGroupSnapshot } from '../payments/pricing.util';

export interface QrMenuCategory {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
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
  sortOrder: number;
  minQuantity: number;
  maxQuantity: number;
  allowInstructions: boolean;
}
export interface QrMenuGroup {
  id: string;
  name: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  description?: string;
  options: Array<{ id: string; name: string; description?: string; imageUrl?: string; priceDelta: number; isDefault: boolean }>; // rupees, for display
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
  /** Kitchen station of each dish, so the order splits into the right tickets on every device. Never sent to the customer. */
  stations: Map<string, string>;
}

/**
 * The customer's menu is the restaurant's PUBLISHED menu: a frozen, versioned snapshot made when the restaurant pressed
 * Publish. Guests never read the live draft, so a half-edited price is never charged. Visibility (channel, availability,
 * branch list, branch overrides) is decided by the snapshot's data, and every price the guest pays comes from it in paise.
 */
@Injectable()
export class QrMenuService {
  constructor(private readonly publications: MenuPublicationsService) {}

  /** menu:{restaurantId}:{branchId}:{version}. A published version is immutable, so an entry is never stale; the key holds the tenant. */
  private readonly built = new Map<string, BuiltQrMenu>();

  /** The menu of the newest published version, or of `version` when a guest's older page is being checked. */
  async build(restaurantId: string, branchId: string | null, version?: number): Promise<BuiltQrMenu> {
    const latest = version ?? (await this.publications.latestVersion(restaurantId)) ?? 0;
    const key = `menu:${restaurantId}:${branchId ?? ''}:${latest}`;
    const hit = latest > 0 ? this.built.get(key) : undefined;
    if (hit) return hit;
    const menu = await this.compute(restaurantId, branchId, version);
    if (menu.menuVersion > 0) {
      this.built.set(`menu:${restaurantId}:${branchId ?? ''}:${menu.menuVersion}`, menu);
      if (this.built.size > 500) this.built.delete(this.built.keys().next().value as string);
    }
    return menu;
  }

  private async compute(restaurantId: string, branchId: string | null, version?: number): Promise<BuiltQrMenu> {
    const snap = version ? await this.publications.snapshotAt(restaurantId, version) : await this.publications.currentSnapshot(restaurantId);
    if (!snap) return { menuVersion: 0, etag: 'empty', ready: false, categories: [], items: [], modifierGroups: [], lookup: new Map(), stations: new Map() };

    const view = viewForBranch(snap.content, branchId);
    const groupsById = new Map(view.groups.map((g) => [g.id, g]));

    const lookup = new Map<string, MenuSnapshotItemLookup>();
    const stations = new Map<string, string>();
    const items: QrMenuItem[] = view.items.map((i) => {
      const tax = i.taxGroupId ? view.taxGroups[i.taxGroupId] : { rateBp: 0, inclusive: false };
      const groups: ModifierGroupSnapshot[] = i.modifierGroupIds
        .map((g) => groupsById.get(g))
        .filter((g): g is NonNullable<typeof g> => !!g)
        .map((g) => ({ id: g.id, name: g.name, isRequired: g.isRequired, minSelections: g.minSelections, maxSelections: g.maxSelections, options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta })) }));
      if (i.kitchenStation) stations.set(i.id, i.kitchenStation);
      lookup.set(i.id, {
        externalItemId: i.id, name: i.name, basePrice: i.effectivePricePaise, taxRate: tax.rateBp, taxInclusive: tax.inclusive, taxGroupId: i.taxGroupId,
        isAvailable: true, modifierGroups: groups, minQuantity: i.minQuantity, maxQuantity: i.maxQuantity, allowInstructions: i.allowInstructions
      });
      return {
        id: i.id, name: i.name, description: i.description, categoryId: i.categoryId, price: i.effectivePricePaise / 100, imageUrl: publicImageUrl(i.imageUrl), dietaryType: i.dietaryType,
        modifierGroupIds: groups.map((g) => g.id), sortOrder: i.sortOrder, minQuantity: i.minQuantity, maxQuantity: i.maxQuantity, allowInstructions: i.allowInstructions
      };
    });

    const usedGroups = new Set(items.flatMap((i) => i.modifierGroupIds));
    const modifierGroups: QrMenuGroup[] = view.groups
      .filter((g) => usedGroups.has(g.id))
      .map((g) => ({
        id: g.id, name: g.name, description: g.description, isRequired: g.isRequired, minSelections: g.minSelections, maxSelections: g.maxSelections,
        options: g.options.map((o) => ({ id: o.id, name: o.name, description: o.description, imageUrl: publicImageUrl(o.imageUrl), priceDelta: o.priceDelta / 100, isDefault: o.isDefault }))
      }));
    const categories: QrMenuCategory[] = view.categories.map((c) => ({ id: c.id, name: c.name, description: c.description, imageUrl: publicImageUrl(c.imageUrl), sortOrder: c.sortOrder }));

    const body = { menuVersion: snap.version, categories, items, modifierGroups };
    const etag = createHash('sha1').update(`${snap.checksum}:${branchId ?? ''}`).digest('hex').slice(0, 16);
    return { ...body, etag, ready: items.length > 0, lookup, stations };
  }
}
