import { BadRequestException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QrOrderingService } from '../qr-ordering/qr-ordering.service';
import { priceCart, PriceValidationError, type MenuSnapshotItemLookup, type ModifierGroupSnapshot } from '../payments/pricing.util';
import { PlaceQrGuestOrderDto, qrGuestTokenSchema } from './dto/qr-guest-ordering.dto';

/**
 * The platform's one shared modifier catalogue (BUG-119). Every restaurant on JAMANVAAR references these same
 * three groups by id from its own dishes (`MenuItem.modifierGroupIds`) - no restaurant has ever been able to
 * add its own modifier groups (there is no create/edit/delete path for one anywhere in the product), so unlike
 * the menu itself this genuinely is one global, static list today, not per-tenant data that needs syncing.
 * Keep this in step BY HAND with `packages/database/src/seed.ts`'s `SEED_MODIFIER_GROUPS` if that ever changes
 * - `MODIFIER_GROUP` is already a syncable entity type for the day a restaurant can edit its own.
 * Prices here are in paise (source is rupees in packages/database/src/seed.ts).
 */
const PLATFORM_MODIFIER_GROUPS: Record<string, ModifierGroupSnapshot> = {
  'mod-spice-level': {
    id: 'mod-spice-level',
    name: 'Spice Level',
    isRequired: true,
    minSelections: 1,
    maxSelections: 1,
    options: [
      { id: 'opt-mild', name: 'Mild', priceDelta: 0 },
      { id: 'opt-med', name: 'Medium (Standard)', priceDelta: 0 },
      { id: 'opt-spicy', name: 'Extra Spicy', priceDelta: 0 }
    ]
  },
  'mod-portion-size': {
    id: 'mod-portion-size',
    name: 'Portion Size',
    isRequired: true,
    minSelections: 1,
    maxSelections: 1,
    options: [
      { id: 'opt-regular', name: 'Regular Portion', priceDelta: 0 },
      { id: 'opt-large', name: 'Large Portion (Feeds 2-3)', priceDelta: 8000 }
    ]
  },
  'mod-addons': {
    id: 'mod-addons',
    name: 'Add-Ons & Sides',
    isRequired: false,
    minSelections: 0,
    maxSelections: 4,
    options: [
      { id: 'opt-cheese', name: 'Extra Amul Cheese', priceDelta: 3500 },
      { id: 'opt-gravy', name: 'Extra Rich Gravy Bowl', priceDelta: 4500 },
      { id: 'opt-raita', name: 'Boondi Raita Bowl', priceDelta: 3000 },
      { id: 'opt-chutney', name: 'Special Mint & Garlic Dip', priceDelta: 2000 }
    ]
  }
};

/** The platform's flat GST rate (BUG-039 established this as the one rate the whole product actually uses). */
const DEFAULT_TAX_RATE_BASIS_POINTS = 500;

const QR_SOURCE_TYPE = 'QR_TABLE';

export interface QrGuestMenuItem {
  externalItemId: string;
  name: string;
  description?: string;
  categoryId: string;
  price: number; // rupees, for display
  imageUrl?: string;
  dietaryType?: string;
  isAvailable: boolean;
  modifierGroupIds: string[];
}

export interface QrGuestSession {
  restaurant: { name: string };
  table: { tableNumber: string; capacity?: number };
  categories: Array<{ id: string; name: string; sortOrder: number }>;
  items: QrGuestMenuItem[];
  modifierGroups: ModifierGroupSnapshot[];
}

export interface QrGuestOrderConfirmation {
  externalOrderId: string;
  tokenNumber: string;
  totalAmount: number; // rupees
  status: string;
}

interface ResolvedTable {
  restaurantId: string;
  branchId: string | null;
  tableId: string;
  tableNumber: string;
}

@Injectable()
export class QrGuestOrderingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrOrdering: QrOrderingService
  ) {}

  /** The one lookup a request with no tenant context is allowed to make: which restaurant owns this token. */
  private async resolveToken(rawToken: string): Promise<ResolvedTable> {
    const token = qrGuestTokenSchema.safeParse(rawToken);
    if (!token.success) throw new BadRequestException('This QR code is not in a format JAMANVAAR recognises.');

    const link = await this.prisma.runAsPlatform((tx) => tx.qrTableLink.findUnique({ where: { qrToken: token.data } }));
    if (!link) throw new NotFoundException('This QR code is not recognised. Ask a team member for a fresh one.');
    if (!link.isActive) throw new GoneException('Ordering from this table is currently switched off. Please ask a team member.');

    return { restaurantId: link.restaurantId, branchId: link.branchId, tableId: link.tableId, tableNumber: link.tableNumber };
  }

  private async assertOrderingAllowed(restaurantId: string): Promise<void> {
    const entitlement = await this.qrOrdering.getEntitlementForRestaurant(restaurantId);
    if (!entitlement.qrEntitled || !entitlement.qrOrderingEnabled) {
      throw new GoneException('Table ordering is not available for this restaurant right now.');
    }
  }

  private async loadMenu(restaurantId: string): Promise<{ categories: QrGuestSession['categories']; items: QrGuestMenuItem[]; lookup: Map<string, MenuSnapshotItemLookup> }> {
    const [categoryRows, itemRows] = await Promise.all([
      this.prisma.runAsTenant(restaurantId, (tx) => tx.syncedEntity.findMany({ where: { entityType: 'MENU_CATEGORY' } })),
      this.prisma.runAsTenant(restaurantId, (tx) => tx.syncedEntity.findMany({ where: { entityType: 'MENU_ITEM' } }))
    ]);

    const categories = categoryRows
      .map((r) => r.payload as Record<string, unknown>)
      .filter((p) => p.deleted !== true && p.isActive !== false)
      .map((p) => ({ id: String(p.id), name: String(p.name ?? ''), sortOrder: typeof p.sortOrder === 'number' ? p.sortOrder : 0 }))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const rawItems = itemRows.map((r) => r.payload as Record<string, unknown>).filter((p) => p.deleted !== true);

    const items: QrGuestMenuItem[] = rawItems
      // Same opt-out flag the item's own edit screen already exposes ("QR Ordering" toggle) - unset means enabled.
      .filter((p) => p.isAvailable !== false && p.isQrOrderingEnabled !== false)
      .map((p) => ({
        externalItemId: String(p.id),
        name: String(p.name ?? ''),
        description: typeof p.description === 'string' ? p.description : undefined,
        categoryId: String(p.categoryId ?? ''),
        price: typeof p.price === 'number' ? p.price : 0,
        imageUrl: typeof p.imageUrl === 'string' ? p.imageUrl : undefined,
        dietaryType: typeof p.dietaryType === 'string' ? p.dietaryType : undefined,
        isAvailable: true,
        modifierGroupIds: Array.isArray(p.modifierGroupIds) ? (p.modifierGroupIds as string[]) : []
      }));

    const lookup = new Map<string, MenuSnapshotItemLookup>(
      items.map((item) => [
        item.externalItemId,
        {
          externalItemId: item.externalItemId,
          name: item.name,
          basePrice: Math.round(item.price * 100),
          taxRate: DEFAULT_TAX_RATE_BASIS_POINTS,
          isAvailable: item.isAvailable,
          modifierGroups: item.modifierGroupIds.map((id) => PLATFORM_MODIFIER_GROUPS[id]).filter((g): g is ModifierGroupSnapshot => !!g)
        }
      ])
    );

    return { categories, items, lookup };
  }

  async getSession(rawToken: string): Promise<QrGuestSession> {
    const table = await this.resolveToken(rawToken);
    await this.assertOrderingAllowed(table.restaurantId);

    const [restaurant, tableRow, { categories, items }] = await Promise.all([
      this.prisma.runAsTenant(table.restaurantId, (tx) => tx.restaurant.findUniqueOrThrow({ where: { id: table.restaurantId }, select: { name: true } })),
      this.prisma.runAsTenant(table.restaurantId, (tx) =>
        tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId: table.restaurantId, entityType: 'DINING_TABLE', externalId: table.tableId } } })
      ),
      this.loadMenu(table.restaurantId)
    ]);

    const tablePayload = (tableRow?.payload as Record<string, unknown>) ?? {};
    return {
      restaurant: { name: restaurant.name },
      table: { tableNumber: table.tableNumber, capacity: typeof tablePayload.capacity === 'number' ? tablePayload.capacity : undefined },
      categories,
      items,
      modifierGroups: Object.values(PLATFORM_MODIFIER_GROUPS)
    };
  }

  async placeOrder(dto: PlaceQrGuestOrderDto): Promise<QrGuestOrderConfirmation> {
    const table = await this.resolveToken(dto.token);
    await this.assertOrderingAllowed(table.restaurantId);

    const entitlement = await this.qrOrdering.getEntitlementForRestaurant(table.restaurantId);
    const externalOrderId = `qr-${dto.idempotencyKey}`.slice(0, 64);

    return this.prisma.runAsTenant(table.restaurantId, async (tx) => {
      // A retried submit (flaky mobile network, not a mistake) must be a no-op, not a second order.
      const existing = await tx.syncedOrder.findUnique({ where: { restaurantId_externalOrderId: { restaurantId: table.restaurantId, externalOrderId } } });
      if (existing) return this.toConfirmation(existing);

      if (entitlement.maxOrdersPerDay !== null) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const todaysQrOrders = await tx.syncedOrder.count({
          where: { restaurantId: table.restaurantId, createdAt: { gte: startOfDay }, meta: { path: ['sourceType'], equals: QR_SOURCE_TYPE } }
        });
        if (todaysQrOrders >= entitlement.maxOrdersPerDay) {
          throw new GoneException('This restaurant has reached its QR ordering limit for today. Please order at the counter.');
        }
      }

      const { lookup } = await this.loadMenu(table.restaurantId);
      let priced;
      try {
        priced = priceCart(
          dto.items.map((i) => ({ externalItemId: i.externalItemId, quantity: i.quantity, selectedOptionIds: i.selectedOptionIds })),
          lookup
        );
      } catch (err) {
        if (err instanceof PriceValidationError) throw new BadRequestException(err.message);
        throw err;
      }

      const tokenNumber = await this.nextQrTokenNumber(tx, table.restaurantId);

      const saved = await tx.syncedOrder.create({
        data: {
          restaurantId: table.restaurantId,
          branchId: table.branchId,
          externalOrderId,
          orderType: 'DINE_IN',
          // Placing a QR order sends it straight to the kitchen - there is no separate "send KOT" step for a
          // guest, unlike a cashier building a cart on POS.
          status: 'PREPARING',
          tableId: table.tableId,
          tableLabel: table.tableNumber,
          items: priced.lines.map((line) => ({
            externalItemId: line.externalItemId,
            name: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            modifiers: line.modifiers.map((m) => m.name),
            kitchenStatus: 'PENDING',
            lineTotal: line.lineTotal
          })) as any,
          subtotal: priced.subtotal,
          taxAmount: priced.taxAmount,
          discountAmount: 0,
          totalAmount: priced.totalAmount,
          notes: dto.orderNotes,
          // Not counted as a sale until the counter actually settles it (BUG-151/161) - exactly the same rule
          // an in-house order sent to the kitchen already follows.
          paymentStatus: 'PENDING',
          paymentMethod: dto.paymentMethod,
          meta: {
            tokenNumber,
            sourceType: QR_SOURCE_TYPE,
            customerName: dto.customerName,
            customerPhone: dto.customerPhone,
            cgstPaise: Math.round(priced.taxAmount / 2),
            sgstPaise: priced.taxAmount - Math.round(priced.taxAmount / 2)
          } as any,
          syncVersion: 1
        }
      });

      return this.toConfirmation(saved);
    });
  }

  async getOrderStatus(externalOrderId: string, rawToken: string): Promise<{ status: string; tokenNumber: string | null }> {
    const table = await this.resolveToken(rawToken);
    const order = await this.prisma.runAsTenant(table.restaurantId, (tx) =>
      tx.syncedOrder.findUnique({ where: { restaurantId_externalOrderId: { restaurantId: table.restaurantId, externalOrderId } } })
    );
    if (!order || order.tableId !== table.tableId) throw new NotFoundException('Order not found for this table.');
    const meta = (order.meta as Record<string, unknown>) ?? {};
    return { status: order.status, tokenNumber: typeof meta.tokenNumber === 'string' ? meta.tokenNumber : null };
  }

  /** One token sequence per restaurant per day for QR orders, prefixed so it can never equal the counter's own (BUG-160's same fix, applied here). */
  private async nextQrTokenNumber(tx: Parameters<Parameters<PrismaService['runAsTenant']>[1]>[0], restaurantId: string): Promise<string> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const rows = await tx.syncedOrder.findMany({
      where: { restaurantId, createdAt: { gte: startOfDay }, meta: { path: ['sourceType'], equals: QR_SOURCE_TYPE } },
      select: { meta: true }
    });
    let highest = 100;
    for (const row of rows) {
      const meta = (row.meta as Record<string, unknown>) ?? {};
      const raw = typeof meta.tokenNumber === 'string' ? meta.tokenNumber : '';
      const match = /^QR-(\d+)$/.exec(raw);
      if (match) highest = Math.max(highest, parseInt(match[1], 10));
    }
    return `QR-${highest + 1}`;
  }

  private toConfirmation(order: { externalOrderId: string; totalAmount: number; status: string; meta: unknown }): QrGuestOrderConfirmation {
    const meta = (order.meta as Record<string, unknown>) ?? {};
    return {
      externalOrderId: order.externalOrderId,
      tokenNumber: typeof meta.tokenNumber === 'string' ? meta.tokenNumber : '',
      totalAmount: order.totalAmount / 100,
      status: order.status
    };
  }
}
