import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { QrCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationEntitlementsService, ResolvedEntitlement } from '../application-entitlements/application-entitlements.service';
import { OrderSyncService } from '../order-sync/order-sync.service';
import { priceCart, PriceValidationError } from '../payments/pricing.util';
import { QrMenuService } from './qr-menu.service';
import { QrAdmission } from './qr-resilience';
import { QrResolutionCache } from './qr-resolution-cache';
import { PaymentsService } from '../payments/payments.service';
import { QrSettingsService, QrSettingsView } from './qr-settings.service';
import {
  businessDateIn, customerStatusFor, newPublicOrderId, PUBLIC_ORDER_ID_PATTERN, QR_APP_CODE, QR_EVENT, QR_MODE, QR_STATUS, QR_TOKEN_PATTERN,
  QrUnavailableCode, QrUnavailableException, startOfDayIn
} from './qr.support';

export const qrOrderLineSchema = z
  .object({
    itemId: z.string().min(1).max(128),
    quantity: z.number().int().min(1).max(50),
    optionIds: z.array(z.string().max(128)).max(30).default([]),
    note: z.string().max(200).optional()
  })
  .strict();

/**
 * Restaurant, branch, table and every price come from the QR token and the server's own data. A body that names
 * any of them is rejected, not ignored, so an attempt to steer an order to another restaurant is a visible error.
 */
export const placeQrOrderSchema = z
  .object({
    items: z.array(qrOrderLineSchema).min(1).max(50),
    paymentMethod: z.enum(['CASH_AT_COUNTER', 'ONLINE']).default('CASH_AT_COUNTER'),
    customerName: z.string().trim().max(120).optional(),
    customerPhone: z.string().trim().regex(/^[0-9+\-\s]{6,20}$/).optional(),
    orderNotes: z.string().max(500).optional(),
    /** Only for a MENU_ONLY code, where the guest says where they are sitting or that they are collecting. */
    orderType: z.enum(['DINE_IN', 'TAKEAWAY']).optional(),
    tableNumber: z.string().trim().max(20).optional(),
    /** The menu version the guest was looking at. If the restaurant published since and the price would differ, the order is refused with MENU_CHANGED. */
    menuVersion: z.number().int().min(0).optional(),
    idempotencyKey: z.string().trim().min(8).max(80)
  })
  .strict();
export type PlaceQrOrder = z.infer<typeof placeQrOrderSchema>;

/** A price check for the checkout screen: the same lines, no order created. */
export const quoteQrOrderSchema = z.object({ items: z.array(qrOrderLineSchema).min(1).max(50) }).strict();
export type QuoteQrOrder = z.infer<typeof quoteQrOrderSchema>;

export interface QrContext {
  code: QrCode;
  restaurant: { id: string; name: string; address: string | null; city: string | null; timezone: string; currency: string };
  branch: { id: string; name: string };
  settings: QrSettingsView;
  entitlement: ResolvedEntitlement;
  /** For TABLE_ORDER: the table as the restaurant's own synced record describes it. */
  table: { id: string; number: string; capacity?: number } | null;
}

const SCAN_TOUCH_MS = 60_000;

@Injectable()
export class QrPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ApplicationEntitlementsService,
    private readonly menus: QrMenuService,
    private readonly settingsService: QrSettingsService,
    private readonly orders: OrderSyncService,
    private readonly admission: QrAdmission,
    private readonly cache: QrResolutionCache<QrContext>,
    private readonly payments: PaymentsService
  ) {}

  // ------------------------------------------------------------------ resolution (spec 13, 14)

  /**
   * The one place a scan is resolved and authorized. Order of checks is fixed by the specification: the code
   * exists and is active; the restaurant and branch exist and are active; the subscription is valid and QR_ORDERING
   * is enabled (asked of the central entitlement service, never inferred from a plan); the code's mode is on; the
   * table is active. Runs on every request, so a downgrade or a revoke takes effect immediately.
   */
  async resolve(rawToken: string): Promise<QrContext> {
    if (typeof rawToken !== 'string' || !QR_TOKEN_PATTERN.test(rawToken)) throw new QrUnavailableException('INVALID_QR');
    const cached = this.cache.get(rawToken);
    if (cached) return cached;
    const ctx = await this.resolveFresh(rawToken);
    this.cache.set(rawToken, ctx);
    return ctx;
  }

  private async resolveFresh(rawToken: string): Promise<QrContext> {

    const code = await this.prisma.runAsPlatform((tx) => tx.qrCode.findUnique({ where: { publicToken: rawToken } }));
    if (!code) throw new QrUnavailableException('QR_NOT_FOUND');
    if (code.status === QR_STATUS.REVOKED) throw new QrUnavailableException('QR_REVOKED');
    if (code.status !== QR_STATUS.ACTIVE) throw new QrUnavailableException('QR_DISABLED');
    if (!code.branchId) throw new QrUnavailableException('QR_BRANCH_MISSING');

    const [restaurant, branch, entitlement] = await this.prisma.runAsPlatform(async (tx) =>
      Promise.all([
        tx.restaurant.findFirst({ where: { id: code.restaurantId, deletedAt: null }, select: { id: true, name: true, address: true, city: true, timezone: true, currency: true, status: true } }),
        tx.branch.findFirst({ where: { id: code.branchId!, restaurantId: code.restaurantId }, select: { id: true, name: true, status: true } }),
        this.entitlements.resolve(tx, code.restaurantId, QR_APP_CODE)
      ])
    );
    if (!restaurant || restaurant.status !== 'ACTIVE') throw new QrUnavailableException('RESTAURANT_INACTIVE');
    if (!branch || branch.status !== 'ACTIVE') throw new QrUnavailableException('BRANCH_INACTIVE');
    if (!entitlement.enabled) throw new QrUnavailableException('ENTITLEMENT_REQUIRED');

    const settings = await this.settingsService.effective(code.restaurantId, code.branchId);
    if (!settings.orderingEnabled) throw new QrUnavailableException('ORDERING_OFF');
    if (code.mode === QR_MODE.TABLE_ORDER && !settings.tableOrderingEnabled) throw new QrUnavailableException('MODE_OFF');
    if (code.mode === QR_MODE.MENU_ONLY && !settings.menuOnlyEnabled) throw new QrUnavailableException('MODE_OFF');

    let table: QrContext['table'] = null;
    if (code.mode === QR_MODE.TABLE_ORDER) {
      if (!code.tableId) throw new QrUnavailableException('TABLE_INACTIVE');
      const row = await this.prisma.runAsTenant(code.restaurantId, (tx) =>
        tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId: code.restaurantId, entityType: 'DINING_TABLE', externalId: code.tableId! } } })
      );
      const payload = (row?.payload ?? null) as Record<string, unknown> | null;
      if (!payload || payload.deleted === true || payload.isActive === false || payload.status === 'BLOCKED') throw new QrUnavailableException('TABLE_INACTIVE');
      // A table that names a branch must be in this code's branch: a code can never open another branch's table.
      if (typeof payload.branchId === 'string' && payload.branchId !== code.branchId) throw new QrUnavailableException('TABLE_INACTIVE');
      table = { id: code.tableId, number: String(payload.tableNumber ?? code.tableNumber ?? ''), capacity: typeof payload.capacity === 'number' ? payload.capacity : undefined };
    }

    return { code, restaurant, branch: { id: branch.id, name: branch.name }, settings, entitlement, table };
  }

  /** `GET /public/qr/:token`: only what a customer may know. No ids, no internal configuration. */
  async describe(rawToken: string, sessionId?: string) {
    const ctx = await this.resolve(rawToken);
    const menu = await this.menus.build(ctx.restaurant.id, ctx.branch.id);
    const branding = await this.settingsService.branding(ctx.restaurant.id);
    const onlineAvailable = ctx.settings.allowOnlinePayment && await this.payments.qrOnlineAvailable(ctx.restaurant.id);
    await this.touchScan(ctx, sessionId);
    return {
      currency: ctx.restaurant.currency,
      branding,
      restaurant: { name: ctx.restaurant.name, address: ctx.restaurant.address ?? undefined, city: ctx.restaurant.city ?? undefined },
      branch: { name: ctx.branch.name },
      mode: ctx.code.mode,
      table: ctx.table ? { displayNumber: ctx.table.number, capacity: ctx.table.capacity } : null,
      ordering: {
        enabled: true,
        menuReady: menu.ready,
        menuVersion: menu.menuVersion,
        settings: { ...this.publicSettings(ctx.settings), allowOnlinePayment: onlineAvailable },
        onlinePayment: { available: onlineAvailable, message: onlineAvailable ? 'Secure Razorpay checkout with UPI and supported payment methods.' : 'Online payment is currently unavailable. Please pay at the counter or ask a team member.' }
      }
    };
  }

  async menu(rawToken: string, sessionId?: string) {
    const ctx = await this.resolve(rawToken);
    const menu = await this.menus.build(ctx.restaurant.id, ctx.branch.id);
    if (!menu.ready) throw new QrUnavailableException('MENU_NOT_PUBLISHED');
    await this.track(ctx, QR_EVENT.MENU_VIEWED, sessionId);
    const { lookup: _serverOnly, stations: _stations, ...publicMenu } = menu;
    return publicMenu;
  }

  private publicSettings(s: QrSettingsView) {
    return {
      allowCustomerNotes: s.allowCustomerNotes,
      allowModifiers: s.allowModifiers,
      allowCash: s.allowCash,
      allowOnlinePayment: s.allowOnlinePayment,
      showOrderStatus: s.showOrderStatus,
      requireCustomerName: s.requireCustomerName,
      requireCustomerPhone: s.requireCustomerPhone
    };
  }

  // ------------------------------------------------------------------ ordering (spec 18-21, 44, 45, 56, 58)

  /** Exact server prices for a cart, so the guest sees the real subtotal, tax and total BEFORE placing the order. Creates nothing. */
  async quote(rawToken: string, dto: QuoteQrOrder) {
    const ctx = await this.resolve(rawToken);
    if (!ctx.settings.allowModifiers && dto.items.some((i) => i.optionIds.length > 0)) throw new BadRequestException('Customisations are turned off for QR orders.');
    if (!ctx.settings.allowCustomerNotes && dto.items.some((i) => i.note)) throw new BadRequestException('This restaurant does not accept item notes.');
    const menu = await this.menus.build(ctx.restaurant.id, ctx.branch.id, undefined, true);
    try {
      const priced = priceCart(dto.items.map((i) => ({ externalItemId: i.itemId, quantity: i.quantity, selectedOptionIds: i.optionIds })), menu.lookup);
      return {
        menuVersion: menu.menuVersion,
        lines: priced.lines.map((l) => ({ itemId: l.externalItemId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice / 100, lineTotal: l.lineTotal / 100, options: l.modifiers.map((m) => m.name) })),
        subtotal: priced.subtotal / 100,
        tax: priced.taxAmount / 100,
        total: priced.totalAmount / 100
      };
    } catch (err) {
      if (err instanceof PriceValidationError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  async placeOrder(rawToken: string, dto: PlaceQrOrder, sessionId?: string) {
    // A code that cannot be resolved has nothing to record against; the refusal itself is the answer.
    const ctx = await this.resolve(rawToken);
    try {
      return await this.admission.run(() => this.createOrder(ctx, dto, sessionId));
    } catch (e) {
      await this.track(ctx, QR_EVENT.ORDER_FAILED, sessionId, { reason: e instanceof Error ? e.constructor.name : 'ERROR' });
      throw e;
    }
  }

  private async createOrder(ctx: QrContext, dto: PlaceQrOrder, sessionId?: string) {
    const { settings } = ctx;
    const externalOrderId = `qr_${createHash('sha256').update(`${ctx.restaurant.id}:${ctx.code.id}:${dto.idempotencyKey}`).digest('hex').slice(0, 40)}`;
    const prior = await this.prisma.runAsTenant(ctx.restaurant.id, tx => tx.syncedOrder.findUnique({where:{restaurantId_externalOrderId:{restaurantId:ctx.restaurant.id,externalOrderId}}}));
    if(prior){
      if(prior.status==='DRAFT' && prior.paymentMethod==='ONLINE' && settings.allowOnlinePayment){
        try { await this.payments.createQrPayment(ctx.restaurant.id,prior.publicOrderId!); } catch { /* Status exposes the failed attempt and its explicit retry action. */ }
      }
      return this.orderStatus(prior.publicOrderId!);
    }
    const online = dto.paymentMethod === 'ONLINE';
    if (online ? !settings.allowOnlinePayment || !await this.payments.qrOnlineAvailable(ctx.restaurant.id) : !settings.allowCash) throw new BadRequestException('This payment method is not available for QR orders.');
    if (dto.orderNotes && !settings.allowCustomerNotes) throw new BadRequestException('This restaurant does not accept order notes.');
    if (dto.items.some((i) => i.note) && !settings.allowCustomerNotes) throw new BadRequestException('This restaurant does not accept item notes.');
    if (!settings.allowModifiers && dto.items.some((i) => i.optionIds.length > 0)) throw new BadRequestException('Customisations are turned off for QR orders.');
    if (settings.requireCustomerName && !dto.customerName) throw new BadRequestException('Please enter your name.');
    if (settings.requireCustomerPhone && !dto.customerPhone) throw new BadRequestException('Please enter your mobile number.');

    // Where the order goes. A table code fixes the table; a menu-only code needs the guest to say.
    let orderType: 'DINE_IN' | 'TAKEAWAY';
    let tableId: string | null = null;
    let tableLabel: string | null = null;
    if (ctx.code.mode === QR_MODE.TABLE_ORDER) {
      if (dto.orderType === 'TAKEAWAY' || dto.tableNumber) throw new BadRequestException('This QR code is for a table; it cannot be changed.');
      orderType = 'DINE_IN';
      tableId = ctx.table!.id;
      tableLabel = ctx.table!.number;
    } else {
      if (!dto.orderType) throw new BadRequestException('Please choose dine-in or takeaway.');
      orderType = dto.orderType;
      if (orderType === 'DINE_IN') {
        if (!dto.tableNumber) throw new BadRequestException('Please enter your table number.');
        tableLabel = dto.tableNumber;
      }
    }

    await this.track(ctx, QR_EVENT.ORDER_STARTED, sessionId);

    const menu = await this.menus.build(ctx.restaurant.id, ctx.branch.id, undefined, true);
    const cart = dto.items.map((i) => ({ externalItemId: i.itemId, quantity: i.quantity, selectedOptionIds: i.optionIds }));
    let priced;
    try {
      priced = priceCart(cart, menu.lookup);
    } catch (err) {
      if (err instanceof PriceValidationError) {
        if (await this.menuMovedOn(ctx, dto, menu.menuVersion)) throw this.menuChanged(menu.menuVersion);
        throw new BadRequestException(err.message);
      }
      throw err;
    }
    // The guest was looking at an older menu: if what they would pay is not what they saw, they must confirm the new price first.
    if (dto.menuVersion !== undefined && dto.menuVersion !== menu.menuVersion) {
      const seen = await this.menus.build(ctx.restaurant.id, ctx.branch.id, dto.menuVersion).catch(() => null);
      let seenTotal: number | null = null;
      try { seenTotal = seen && seen.menuVersion === dto.menuVersion ? priceCart(cart, seen.lookup).totalAmount : null; } catch { seenTotal = null; }
      if (seenTotal !== priced.totalAmount) throw this.menuChanged(menu.menuVersion);
    }

    // The client's key becomes a per-restaurant, per-code identifier: a repeat is the same order, and one guest can
    // never collide with (or probe) another guest's key.
    const maxOrdersPerDay = typeof ctx.entitlement.limits.qrMaxOrdersPerDay === 'number' ? (ctx.entitlement.limits.qrMaxOrdersPerDay as number) : typeof ctx.entitlement.limits.maxOrdersPerDay === 'number' ? (ctx.entitlement.limits.maxOrdersPerDay as number) : null;
    const businessDate = businessDateIn(ctx.restaurant.timezone);
    const dayStart = startOfDayIn(ctx.restaurant.timezone);

    const publicOrderId = newPublicOrderId();
    const { order, duplicate } = await this.orders.ingestServerOrder({
      restaurantId: ctx.restaurant.id,
      branchId: ctx.branch.id,
      externalOrderId,
      source: 'QR',
      publicOrderId,
      qrCodeId: ctx.code.id,
      menuVersion: menu.menuVersion,
      orderType,
      status: online ? 'DRAFT' : settings.autoAccept ? 'PREPARING' : 'NEW',
      tableId,
      tableLabel,
      items: priced.lines.map((line, index) => ({
        externalItemId: `${line.externalItemId}:${index}`,
        menuItemId: line.externalItemId,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        modifiers: line.modifiers.map((m) => m.name),
        modifierDetails: line.modifiers.map((m) => ({ optionName: m.name, priceDelta: m.priceDelta, optionId: m.id, groupId: m.groupId, groupName: m.groupName })),
        snapshot: { menuVersion: menu.menuVersion, basePrice: line.basePrice, taxGroupId: line.taxGroupId, taxRateBp: line.taxRate, taxInclusive: line.taxInclusive, lineTax: line.lineTax },
        kitchenStatus: 'PENDING',
        ...(menu.stations.get(line.externalItemId) ? { kitchenStation: menu.stations.get(line.externalItemId) } : {}),
        lineTotal: line.lineTotal,
        ...(dto.items[index]?.note ? { specialInstructions: dto.items[index].note } : {})
      })),
      subtotal: priced.subtotal,
      taxAmount: priced.taxAmount,
      discountAmount: 0,
      totalAmount: priced.totalAmount,
      notes: dto.orderNotes ?? null,
      // Never a sale until the counter (or a verified gateway payment) settles it: the same rule as any open order.
      paymentStatus: 'PENDING',
      paymentMethod: dto.paymentMethod,
      serializeRestaurantLimit: maxOrdersPerDay !== null,
      beforeCreate: async (tx) => {
        if (maxOrdersPerDay !== null) {
          const today = await tx.syncedOrder.count({ where: { restaurantId: ctx.restaurant.id, source: 'QR', createdAt: { gte: dayStart } } });
          if (today >= maxOrdersPerDay) throw new GoneException('This restaurant has reached its QR ordering limit for today. Please order at the counter.');
        }
        // Collision-safe, per branch per business day, from the same numbering table devices lease from.
        const rows = await tx.$queryRaw<Array<{ next: number }>>`
          INSERT INTO "NumberSequence" ("restaurantId", "scope", "kind", "businessDate", "next")
          VALUES (${ctx.restaurant.id}, ${ctx.branch.id}, 'QR', ${businessDate}, 2)
          ON CONFLICT ("restaurantId", "scope", "kind", "businessDate") DO UPDATE SET "next" = "NumberSequence"."next" + 1
          RETURNING "next"`;
        const number = `QR-${Number(rows[0].next) - 1}`;
        return { tokenNumber: number, orderNumber: number };
      },
      meta: {
        sourceType: 'QR_TABLE',
        restaurantName: ctx.restaurant.name,
        branchName: ctx.branch.name,
        currency: ctx.restaurant.currency,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        qrMode: ctx.code.mode,
        qrCodeVersion: ctx.code.version,
        qrAutoAccept: settings.autoAccept,
        cgstPaise: Math.round(priced.taxAmount / 2),
        sgstPaise: priced.taxAmount - Math.round(priced.taxAmount / 2)
      }
    });

    if (!duplicate) await this.track(ctx, QR_EVENT.ORDER_PLACED, sessionId, { totalPaise: order.totalAmount });
    if (online && order.status === 'DRAFT') {
      try { await this.payments.createQrPayment(ctx.restaurant.id, order.publicOrderId!); return this.orderStatus(order.publicOrderId!); }
      catch {
        // The provider may have delivered a signed success while its create response timed out.
        try { return await this.orderStatus(order.publicOrderId!); }
        catch { return { ...this.confirmation(order), payment: { status: 'FAILED', url: null, expiresAt: null } }; }
      }
    }
    return this.orderStatus(order.publicOrderId!);
  }

  private async menuMovedOn(_ctx: QrContext, dto: PlaceQrOrder, currentVersion: number): Promise<boolean> {
    return dto.menuVersion !== undefined && dto.menuVersion !== currentVersion;
  }

  private menuChanged(menuVersion: number) {
    return new ConflictException({ statusCode: 409, code: 'MENU_CHANGED', message: 'The menu was updated. Please review your order and confirm the new prices.', menuVersion });
  }

  private confirmation(order: { publicOrderId: string | null; totalAmount: number; status: string; createdAt: Date; tableLabel: string | null; meta: unknown; paymentStatus?: string | null; paymentMethod?: string | null; subtotal?: number; taxAmount?: number; discountAmount?: number; items?: unknown; notes?: string | null }) {
    const meta = (order.meta ?? {}) as Record<string, unknown>;
    return {
      publicOrderId: order.publicOrderId,
      orderNumber: typeof meta.tokenNumber === 'string' ? meta.tokenNumber : null,
      restaurantName: typeof meta.restaurantName === 'string' ? meta.restaurantName : undefined,
      branchName: typeof meta.branchName === 'string' ? meta.branchName : undefined,
      currency: typeof meta.currency === 'string' ? meta.currency : undefined,
      status: order.status === 'DRAFT' ? 'PENDING_PAYMENT' : customerStatusFor(order.status),
      paymentStatus: order.paymentStatus ?? 'PENDING',
      paymentMethod: order.paymentMethod,
      subtotal: (order.subtotal ?? 0) / 100, tax: (order.taxAmount ?? 0) / 100, discount: (order.discountAmount ?? 0) / 100,
      items: Array.isArray(order.items) ? order.items.map((line: any) => ({ name: line.name, quantity: line.quantity, unitPrice: line.unitPrice / 100, lineTotal: line.lineTotal / 100, options: Array.isArray(line.modifiers) ? line.modifiers : [], note: line.specialInstructions })) : [],
      total: order.totalAmount / 100,
      table: order.tableLabel,
      placedAt: order.createdAt.toISOString()
    };
  }

  // ------------------------------------------------------------------ status (spec 35, 56)

  /** The public reference is the capability: unguessable, random, and it reveals only this order's customer-safe state. */
  async orderStatus(publicOrderId: string) {
    if (!PUBLIC_ORDER_ID_PATTERN.test(publicOrderId ?? '')) throw new NotFoundException('Order not found.');
    let order = await this.prisma.runAsPlatform((tx) => tx.syncedOrder.findUnique({ where: { publicOrderId } }));
    if (!order || order.source !== 'QR') throw new NotFoundException('Order not found.');
    const payment = order.paymentMethod === 'ONLINE' || order.paymentMethod === 'RAZORPAY' ? await this.payments.qrPaymentStatus(order.restaurantId, order.externalOrderId) : null;
    if (payment?.status === 'SUCCESS') order = await this.prisma.runAsPlatform(tx => tx.syncedOrder.findUniqueOrThrow({ where: { publicOrderId } }));
    const settings = await this.settingsService.effective(order.restaurantId, order.branchId);
    const view = this.confirmation(order);
    return { ...(settings.showOrderStatus || order.status === 'DRAFT' ? view : { ...view, status: 'RECEIVED' as const }), payment };
  }

  async retryPayment(publicOrderId: string) {
    if (!PUBLIC_ORDER_ID_PATTERN.test(publicOrderId)) throw new NotFoundException('Order not found');
    const order = await this.prisma.runAsPlatform(tx => tx.syncedOrder.findUnique({ where: { publicOrderId } }));
    if (!order || order.source !== 'QR' || !['ONLINE', 'RAZORPAY'].includes(order.paymentMethod ?? '') || !order.qrCodeId) throw new NotFoundException('Online order not found');
    if (order.paymentStatus === 'SUCCESS') return this.orderStatus(publicOrderId);
    const code = await this.prisma.runAsTenant(order.restaurantId, tx => tx.qrCode.findUniqueOrThrow({ where: { id: order.qrCodeId! } }));
    const ctx = await this.resolve(code.publicToken);
    if (!ctx.settings.allowOnlinePayment) throw new ForbiddenException('Online payments are currently unavailable');
    const payment = await this.payments.qrPaymentStatus(order.restaurantId, order.externalOrderId);
    if (payment.status === 'SUCCESS') return this.orderStatus(publicOrderId);
    await this.payments.createQrPayment(order.restaurantId, publicOrderId);
    return this.orderStatus(publicOrderId);
  }

  // ------------------------------------------------------------------ events (spec 47)

  private async touchScan(ctx: QrContext, sessionId?: string): Promise<void> {
    await this.track(ctx, QR_EVENT.SCANNED, sessionId);
    const last = ctx.code.lastScannedAt?.getTime() ?? 0;
    if (Date.now() - last > SCAN_TOUCH_MS) {
      await this.prisma.runAsPlatform((tx) => tx.qrCode.update({ where: { id: ctx.code.id }, data: { lastScannedAt: new Date() } })).catch(() => undefined);
    }
  }

  /** Records only what the restaurant needs to see: what happened, where, when. No IP, no device fingerprint, no personal data. */
  async track(ctx: QrContext, type: string, sessionId?: string, metadata?: Record<string, unknown>): Promise<void> {
    const safeSession = sessionId && /^[A-Za-z0-9_-]{8,64}$/.test(sessionId) ? sessionId : null;
    await this.prisma
      .runAsTenant(ctx.restaurant.id, (tx) => tx.qrEvent.create({ data: { restaurantId: ctx.restaurant.id, branchId: ctx.branch.id, qrCodeId: ctx.code.id, sessionId: safeSession, type, metadata: (metadata ?? undefined) as never } }))
      .catch(() => undefined);
  }

  /** Used by the legacy alias: the same resolver, mapped to its old 410 for the states it reported before. */
  static readonly LEGACY_UNAVAILABLE: QrUnavailableCode[] = ['QR_REVOKED', 'QR_DISABLED'];
}
