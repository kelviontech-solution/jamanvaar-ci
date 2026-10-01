import { randomBytes, createHash } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashOpaqueToken } from '../../common/security/token.util';
import { ChannelCheckoutDto, ChannelQuoteDto, UpdateChannelSettingsDto } from './dto/whatsapp-channel.dto';
import { QrMenuService, type BuiltQrMenu } from '../qr/qr-menu.service';
import { PaymentsService } from '../payments/payments.service';
import { priceCart, PriceValidationError } from '../payments/pricing.util';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';

const KEY_PREFIX = 'jmn_live_';
const DEFAULT_PERMISSIONS = ['MENU_READ', 'ORDER_CREATE', 'ORDER_READ', 'ORDER_STATUS_READ'];
const WHATSAPP_APP_CODE = 'WHATSAPP_ORDERING' as const;

function generateKey(): { raw: string; prefix: string } {
  const raw = KEY_PREFIX + randomBytes(24).toString('base64url');
  // Shown in Restaurant Admin so the owner can recognise which key is connected without
  // ever seeing the rest of it again — same redaction shape as an activation key's
  // codeLast4 (B2-051/B2-053), just prefix instead of suffix since this key has no fixed length.
  const prefix = raw.slice(0, KEY_PREFIX.length + 4);
  return { raw, prefix };
}

/** Same shape/wording convention as qr-admin.service.ts's own lockMessage — a restaurant
 *  admin reading this and QR's equivalent message side by side should recognise the pattern. */
function lockMessage(reason: string): string {
  switch (reason) {
    case 'NOT_INCLUDED':
      return 'WhatsApp Ordering is not included in your current plan.';
    case 'DISABLED':
      return "WhatsApp Ordering is disabled because this restaurant's current plan does not include it.";
    case 'SUBSCRIPTION_EXPIRED':
      return 'WhatsApp Ordering is unavailable because the subscription has expired.';
    case 'NO_SUBSCRIPTION':
      return 'WhatsApp Ordering is unavailable because there is no active subscription.';
    case 'RESTAURANT_INACTIVE':
      return 'WhatsApp Ordering is unavailable because this restaurant is not active.';
    default:
      return 'WhatsApp Ordering is available on an eligible plan.';
  }
}

/**
 * Key lifecycle (Phase 1), validate-key (Phase 2), the read-only menu pull (Phase 3),
 * quote/checkout/order-status (Phase 4) and the outbound status back-channel (Phase 5) are
 * all real. Phase 6 gates all of it behind a real, plan-checked entitlement (WHATSAPP_ORDERING)
 * — mirrors QR ordering's own entitlement treatment (qr-admin.service.ts) closely enough that
 * anyone who already knows that pattern recognises this one. See
 * docs/integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md.
 */
@Injectable()
export class WhatsAppChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly qrMenu: QrMenuService,
    private readonly payments: PaymentsService,
    private readonly entitlements: ApplicationEntitlementsService
  ) {}

  /** Read-only: what pos-admin polls to decide whether to grey out the connector panel and
   *  what message to show — same shape as QrAdminService.entitlement(). */
  async entitlement(restaurantId: string) {
    const result = await this.prisma.runAsPlatform((tx) => this.entitlements.resolve(tx, restaurantId, WHATSAPP_APP_CODE));
    return { ...result, lockedMessage: result.enabled ? null : lockMessage(result.reason) };
  }

  /** Throws a clear 403 (same code/shape QrAdminService's own requireEnabled throws) instead
   *  of a bare boolean when the caller wants to fail the request outright. */
  private async requireEntitled(restaurantId: string): Promise<void> {
    const result = await this.prisma.runAsPlatform((tx) => this.entitlements.resolve(tx, restaurantId, WHATSAPP_APP_CODE));
    if (!result.enabled) {
      throw new ForbiddenException({ statusCode: 403, code: 'ENTITLEMENT_REQUIRED', feature: WHATSAPP_APP_CODE, reason: result.reason, message: lockMessage(result.reason) });
    }
  }

  /** True only for a restaurant that has actually completed validate-key and hasn't been
   *  revoked/disconnected — the same connection-status check the tenant screens show,
   *  reused here so a channel call can't read a restaurant that was never (or is no
   *  longer) really connected. Also re-checks the entitlement on every call (not just at
   *  connect time): a plan downgrade must lock an already-connected restaurant out
   *  immediately, the same B2-055 regression QR ordering's own entitlement re-checked for. */
  private async requireConnected(restaurantId: string): Promise<void> {
    // A missing/blank restaurantId is a caller bug (every service route reads it off the
    // query string — see whatsapp-channel.service.controller.ts), not "restaurant not found";
    // it must still fail closed as a clean 404 rather than reaching Prisma with `undefined`
    // and surfacing as an unhandled 500 (that's genuinely what running it without one did
    // before this check existed — see whatsapp-channel.e2e.spec.ts).
    if (!restaurantId) throw new NotFoundException('This restaurant is not connected to the WhatsApp channel');
    const connection = await this.prisma.runAsPlatform((tx) => tx.whatsAppChannelConnection.findUnique({ where: { restaurantId }, select: { status: true } }));
    if (!connection || connection.status !== 'CONNECTED') throw new NotFoundException('This restaurant is not connected to the WhatsApp channel');
    await this.requireEntitled(restaurantId);
  }

  /** Same as requireConnected, but also refuses new orders while the restaurant has paused the
   *  channel from pos-admin (WhatsAppChannelPanel's "Pause orders" toggle) — a pause is meant to
   *  stop new orders immediately without revoking the key (browsing/menu pulls stay unaffected). */
  private async requireOrderable(restaurantId: string): Promise<void> {
    await this.requireConnected(restaurantId);
    const connection = await this.prisma.runAsPlatform((tx) => tx.whatsAppChannelConnection.findUnique({ where: { restaurantId }, select: { pausedAt: true } }));
    if (connection?.pausedAt) throw new ForbiddenException('This restaurant is not accepting WhatsApp orders right now');
  }

  async generateKey(restaurantId: string, actorId: string) {
    await this.requireEntitled(restaurantId);
    const { raw, prefix } = generateKey();
    const keyHash = hashOpaqueToken(raw);

    // One connection row per restaurant (schema @@unique([restaurantId])) — generating a
    // new key replaces (not appends to) any existing one, same as regenerating an
    // activation key doesn't leave the old one usable.
    await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.whatsAppChannelConnection.upsert({
        where: { restaurantId },
        create: { restaurantId, keyPrefix: prefix, keyHash, status: 'PENDING', permissions: DEFAULT_PERMISSIONS },
        update: { keyPrefix: prefix, keyHash, status: 'PENDING', connectedAt: null, revokedAt: null }
      })
    );
    await this.audit.log({ restaurantId, actorId, actorType: 'TENANT', category: 'WHATSAPP_CHANNEL', action: 'WHATSAPP_CHANNEL_KEY_GENERATED', details: { keyPrefix: prefix } });

    // The raw key is returned exactly once, here, and never again — nothing else in this
    // service (or any response anywhere) ever includes it.
    return { key: raw, keyPrefix: prefix };
  }

  async revokeKey(restaurantId: string, actorId: string) {
    const connection = await this.prisma.runAsTenant(restaurantId, (tx) => tx.whatsAppChannelConnection.findUnique({ where: { restaurantId } }));
    if (!connection) throw new NotFoundException('No WhatsApp channel connection for this restaurant');
    await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.whatsAppChannelConnection.update({ where: { restaurantId }, data: { status: 'REVOKED', revokedAt: new Date() } })
    );
    await this.audit.log({ restaurantId, actorId, actorType: 'TENANT', category: 'WHATSAPP_CHANNEL', action: 'WHATSAPP_CHANNEL_KEY_REVOKED', details: {} });
    return { ok: true };
  }

  async getStatus(restaurantId: string) {
    const connection = await this.prisma.runAsTenant(restaurantId, (tx) => tx.whatsAppChannelConnection.findUnique({ where: { restaurantId } }));
    if (!connection) return { status: 'NOT_CONNECTED' as const };
    // The hash is never returned to the browser — only what a Restaurant Admin screen needs to show.
    const { keyHash: _keyHash, ...safe } = connection;
    return safe;
  }

  async updateSettings(restaurantId: string, actorId: string, dto: UpdateChannelSettingsDto) {
    await this.requireEntitled(restaurantId);
    const connection = await this.prisma.runAsTenant(restaurantId, (tx) => tx.whatsAppChannelConnection.findUnique({ where: { restaurantId } }));
    if (!connection) throw new NotFoundException('No WhatsApp channel connection for this restaurant');
    const updated = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.whatsAppChannelConnection.update({
        where: { restaurantId },
        data: {
          ...(dto.autoAccept !== undefined ? { autoAccept: dto.autoAccept } : {}),
          ...(dto.prepTimeMinutes !== undefined ? { prepTimeMinutes: dto.prepTimeMinutes } : {}),
          ...(dto.paused !== undefined ? { pausedAt: dto.paused ? new Date() : null } : {})
        }
      })
    );
    await this.audit.log({ restaurantId, actorId, actorType: 'TENANT', category: 'WHATSAPP_CHANNEL', action: 'WHATSAPP_CHANNEL_SETTINGS_UPDATED', details: dto });
    const { keyHash: _keyHash, ...safe } = updated;
    return safe;
  }

  /**
   * The published menu (same snapshot, live sold-out overlay and ETag machinery QR
   * ordering already uses — see QrMenuService's own docstring) minus the server-only
   * pricing/kitchen-routing fields (`lookup`/`stations`), same redaction
   * qr-public.service.ts's own `menu()` already applies. `branchId` is optional: a
   * single-branch restaurant (the common case today) needs none; a multi-branch
   * restaurant not yet explicit about which branch a WhatsApp order belongs to gets
   * that restaurant's branch-agnostic base menu, which is a real, if imprecise,
   * behavior worth revisiting once the connector needs true multi-branch routing.
   */
  async getMenu(restaurantId: string, branchId: string | null): Promise<Omit<BuiltQrMenu, 'lookup' | 'stations'>> {
    await this.requireConnected(restaurantId);
    const menu = await this.qrMenu.build(restaurantId, branchId);
    const { lookup: _lookup, stations: _stations, ...publicMenu } = menu;
    return publicMenu;
  }

  /**
   * product/whatsapp has no concept of a Jamanvaar branch id (see the DTO's own comment) — a
   * single-branch restaurant, the common case, never sends one, so it's resolved here to that
   * restaurant's one (oldest) branch. Shared by quote() and checkout() so both ever route an
   * order to the same branch a menu pull for the same restaurant would have shown.
   */
  private async resolveBranchId(restaurantId: string, branchId: string | undefined): Promise<string> {
    if (branchId) return branchId;
    const branch = await this.prisma.runAsTenant(restaurantId, (tx) => tx.branch.findFirst({ where: { restaurantId }, orderBy: { createdAt: 'asc' } }));
    if (!branch) throw new NotFoundException('This restaurant has no branch to route the order to');
    return branch.id;
  }

  /**
   * Exact server prices for a cart, before the customer confirms — same priceCart() reusing the
   * same QrMenuService lookup channels/menu already serves from, so what a WhatsApp customer sees
   * quoted here is guaranteed consistent with what checkout() below will actually charge. Never
   * trusts a client-sent total; creates nothing.
   */
  async quote(restaurantId: string, dto: ChannelQuoteDto) {
    await this.requireConnected(restaurantId);
    const branchId = await this.resolveBranchId(restaurantId, dto.branchId);
    const menu = await this.qrMenu.build(restaurantId, branchId);
    const cart = dto.cart.map((c) => ({ externalItemId: c.itemId, quantity: c.quantity, selectedOptionIds: c.optionIds }));
    try {
      const priced = priceCart(cart, menu.lookup);
      return {
        branchId, // echoed back so the bot can pass it into checkout() and stay pinned to this same branch
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

  /**
   * Creates a Cashfree payment session for this cart and returns a link the WhatsApp bot sends
   * straight to the customer's chat — but creates NO order the restaurant can see yet. That only
   * happens once Cashfree's webhook reports the payment as SUCCESS (see
   * PaymentsService.ingestWhatsAppOrderIfNeeded), by design: a WhatsApp order must reach the
   * kitchen only after it's actually been paid for, never before.
   */
  async checkout(restaurantId: string, dto: ChannelCheckoutDto) {
    await this.requireOrderable(restaurantId);
    const branchId = await this.resolveBranchId(restaurantId, dto.branchId);
    const menu = await this.qrMenu.build(restaurantId, branchId);
    const cart = dto.cart.map((c) => ({ externalItemId: c.itemId, quantity: c.quantity, selectedOptionIds: c.optionIds }));
    let priced;
    try {
      priced = priceCart(cart, menu.lookup);
    } catch (err) {
      if (err instanceof PriceValidationError) throw new BadRequestException(err.message);
      throw err;
    }

    // 'PICKUP' is product/whatsapp's own vocabulary; the rest of this platform (POS/Captain/KDS)
    // calls the same thing 'TAKEAWAY' — see apps/restaurant-system/pos's own order-type handling.
    const orderType = dto.orderType === 'PICKUP' ? 'TAKEAWAY' : dto.orderType;
    if (orderType === 'DINE_IN' && !dto.tableNumber) throw new BadRequestException('A table number is required for a dine-in order.');

    // The connector's own externalOrderId, namespaced by restaurant so two restaurants'
    // WhatsApp-side idempotency keys can never collide on this platform's single Order table —
    // same reasoning as QR's own `qr_${hash(...)}` derivation in qr-public.service.ts.
    const externalOrderId = `wa_${createHash('sha256').update(`${restaurantId}:${dto.externalOrderId}`).digest('hex').slice(0, 40)}`;

    const result = await this.payments.createChannelOrder(restaurantId, {
      externalOrderId,
      source: 'WHATSAPP',
      branchId,
      orderType,
      tableLabel: orderType === 'DINE_IN' ? (dto.tableNumber ?? null) : null,
      customerName: dto.customer.name,
      customerPhone: dto.customer.phone,
      items: priced.lines.map((line) => ({
        externalItemId: line.externalItemId,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        modifiers: line.modifiers.map((m) => m.name),
        modifierDetails: line.modifiers.map((m) => ({ optionName: m.name, priceDelta: m.priceDelta, optionId: m.id, groupId: m.groupId, groupName: m.groupName })),
        snapshot: { menuVersion: menu.menuVersion, basePrice: line.basePrice, taxGroupId: line.taxGroupId, taxRateBp: line.taxRate, taxInclusive: line.taxInclusive, lineTax: line.lineTax },
        kitchenStatus: 'PENDING',
        ...(menu.stations.get(line.externalItemId) ? { kitchenStation: menu.stations.get(line.externalItemId) } : {}),
        lineTotal: line.lineTotal
      })),
      subtotal: priced.subtotal,
      taxAmount: priced.taxAmount,
      totalAmount: priced.totalAmount
    });

    return {
      orderId: result.orderId,
      paymentId: result.paymentId,
      // What the WhatsApp bot actually sends to the customer's chat right after they confirm —
      // a plain link (Cashfree's hosted checkout), not a QR image, so it needs no media upload
      // through WhatsApp's API. Never null once a Cashfree session exists.
      paymentLink: result.paymentLink,
      amount: result.amount / 100,
      currency: result.currency,
      status: result.status
    };
  }

  /**
   * Read-only status poll for a checkout() response's orderId — whether the payment settled yet
   * and, once it has, how the kitchen sees the order. Nothing here creates or changes anything.
   */
  async getOrderStatus(restaurantId: string, orderId: string) {
    await this.requireConnected(restaurantId);
    const order = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.findFirst({
        where: { id: orderId, restaurantId, source: 'WHATSAPP' },
        include: { paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1 } }
      })
    );
    if (!order) throw new NotFoundException('Order not found');
    const payment = order.paymentTransactions[0];
    const synced = order.status === 'PAID'
      ? await this.prisma.runAsTenant(restaurantId, (tx) =>
          tx.syncedOrder.findUnique({ where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: order.externalOrderId } }, select: { status: true, publicOrderId: true } })
        )
      : null;
    return {
      orderId: order.id,
      paymentStatus: payment?.status ?? 'CREATED',
      paid: order.status === 'PAID',
      kitchenStatus: synced?.status ?? null,
      publicOrderId: synced?.publicOrderId ?? null
    };
  }

  /**
   * Called by product/whatsapp (behind ServiceSignatureGuard, not a login) when a
   * restaurant owner pastes a key into its own dashboard.
   */
  async validateKey(rawKey: string) {
    if (!rawKey.startsWith(KEY_PREFIX)) throw new NotFoundException('Unknown key');
    const keyHash = hashOpaqueToken(rawKey);
    const connection = await this.prisma.runAsPlatform((tx) =>
      tx.whatsAppChannelConnection.findUnique({ where: { keyHash }, include: { restaurant: { select: { id: true, name: true } } } })
    );
    if (!connection || connection.status === 'REVOKED') throw new NotFoundException('Unknown or revoked key');
    await this.requireEntitled(connection.restaurant.id);
    if (connection.status === 'PENDING') {
      await this.prisma.runAsPlatform((tx) => tx.whatsAppChannelConnection.update({ where: { id: connection.id }, data: { status: 'CONNECTED', connectedAt: new Date() } }));
    }
    await this.prisma.runAsPlatform((tx) => tx.whatsAppChannelConnection.update({ where: { id: connection.id }, data: { lastUsedAt: new Date() } }));
    return {
      restaurantId: connection.restaurant.id,
      restaurantName: connection.restaurant.name,
      permissions: connection.permissions as string[]
    };
  }
}
