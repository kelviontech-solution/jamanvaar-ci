import { BadRequestException, ConflictException, NotFoundException, Injectable } from '@nestjs/common';
import { mergeKitchenPriority } from './kitchen-priority';
import { randomUUID } from 'node:crypto';
import { Device, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { nextSyncSequence } from '../../common/sync-sequence';
import { mergeOrderItems } from './order-merge';
import { decideStatus, integrityFlags, validateQrOrderAction } from './order-rules';
import { allocateOrderPayment, paymentBalance, reconcileOrderPayments } from '../payments/order-payment-ledger';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { StaffSessionService } from '../entity-sync/staff-session.service';
import { MANAGER_ROLES } from '../entity-sync/entity-authority';
import { WhatsAppOutboundWebhookService } from '../whatsapp-outbound/whatsapp-outbound-webhook.service';
import { OrderSyncEventDto, orderSyncEventSchema } from './dto/push-order-sync.dto';

const CATCH_UP_DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24h
const CATCH_UP_MAX_ROWS = 500;

/**
 * security-audit HIGH-05: once an order's payment has actually settled or been refunded,
 * that fact must not be silently reversible by a stale or malicious push from a
 * kitchen/floor device — see the guard in `pushEvents` below.
 */
const TERMINAL_PAID_STATUSES: ReadonlySet<string> = new Set(['SUCCESS', 'REFUNDED']);
/** Device types with real payment/refund authority — the only ones allowed to change a terminal payment status. */
const PAYMENT_AUTHORITATIVE_DEVICE_TYPES: ReadonlySet<string> = new Set(['POS', 'POS_ADMIN']);
/** The owner-level consoles sign in with an account, not a terminal PIN, so the staff-proof rule below does not apply to them. */
const STAFF_PROOF_EXEMPT_DEVICE_TYPES: ReadonlySet<string> = new Set(['POS_ADMIN', 'KIOSK_ADMIN']);


/** The channel an order came from, recorded once at creation and never changed by later pushes. */
export function orderSourceFor(deviceType: string, meta: unknown): string {
  const declared = meta && typeof meta === 'object' ? (meta as { sourceType?: unknown }).sourceType : undefined;
  if (declared === 'QR_TABLE') return 'QR';
  if (declared === 'KIOSK' || declared === 'CAPTAIN' || declared === 'POS' || declared === 'ONLINE') return declared;
  if (deviceType === 'KIOSK' || deviceType === 'CAPTAIN') return deviceType;
  return 'POS';
}

export interface ServerOrderInput {
  restaurantId: string;
  branchId: string | null;
  externalOrderId: string;
  source: string;
  publicOrderId?: string;
  qrCodeId?: string;
  /** The published menu version the order was priced from. */
  menuVersion?: number;
  orderType: string;
  status: string;
  tableId?: string | null;
  tableLabel?: string | null;
  items: unknown[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  notes?: string | null;
  paymentStatus: string;
  paymentMethod: string;
  meta: Record<string, unknown>;
  /** Runs inside the same transaction, after the order is locked and known not to exist yet; throw to refuse. */
  beforeCreate?: (tx: TxClient) => Promise<Record<string, unknown> | void>;
  /** Take the restaurant-wide QR lock so a daily limit cannot be overshot by concurrent submits. */
  serializeRestaurantLimit?: boolean;
}

export interface OrderSyncPushResult {
  externalOrderId: string;
  status: 'ok' | 'error';
  syncVersion?: number;
  /** True when this eventId was already applied: nothing changed, the original outcome is returned. */
  duplicate?: boolean;
  error?: string;
}

type TxClient = Prisma.TransactionClient;


function transactionIdOf(meta: unknown): string | undefined {
  const id = meta && typeof meta === 'object' ? (meta as { paymentTransactionId?: unknown }).paymentTransactionId : undefined;
  return typeof id === 'string' && id ? id : undefined;
}

/** The single place that decides whether a push may change an order's payment state. Null means allowed. */
function paymentViolation(
  existing: { paymentStatus: string | null; deviceId: string | null; meta: unknown },
  evt: OrderSyncEventDto,
  device: Device
): { code: string; message: string } | null {
  if (!existing.paymentStatus || !TERMINAL_PAID_STATUSES.has(existing.paymentStatus)) return null;
  if (evt.paymentStatus === undefined || evt.paymentStatus === existing.paymentStatus) {
    const paidWith = transactionIdOf(existing.meta);
    const incoming = transactionIdOf(evt.meta);
    if (existing.paymentStatus === 'SUCCESS' && paidWith && incoming && paidWith !== incoming) {
      return { code: 'ORDER_ALREADY_PAID', message: 'This order was already paid by another transaction' };
    }
    return null;
  }
  if (existing.paymentStatus === 'SUCCESS' && evt.paymentStatus === 'REFUNDED') {
    const mayRefund = PAYMENT_AUTHORITATIVE_DEVICE_TYPES.has(device.type) || existing.deviceId === device.id;
    return mayRefund ? null : { code: 'REFUND_NOT_AUTHORIZED', message: 'This device cannot refund a payment it did not record' };
  }
  return { code: 'PAYMENT_STATUS_FINAL', message: 'A settled order cannot go back to an unpaid state' };
}

@Injectable()
export class OrderSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeBus,
    private readonly audit: AuditService,
    private readonly sessions: StaffSessionService,
    private readonly config: ConfigService,
    private readonly whatsappOutbound: WhatsAppOutboundWebhookService
  ) {}

  /**
   * Upserts each event by (restaurantId, externalOrderId) — the local app's
   * own order id is the idempotency key, so a retried push after a dropped
   * response (the exact failure mode BUG-009 traced to) never double-creates
   * a row, it just re-applies the same state.
   */
  async pushEvents(device: Device, rawEvents: unknown[]): Promise<{ results: OrderSyncPushResult[]; serverTime: string }> {
    const results: OrderSyncPushResult[] = [];
    let latestSeq: number | undefined;
    // Collected during the transaction below, dispatched only after it commits — see the
    // collection point inside the loop for why.
    const whatsappStatusChanges: Array<{ paymentId: string; orderId: string; publicOrderId: string | null; status: string; previousStatus: string }> = [];

    await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      // Serialise writers of the same order. Two devices creating or updating one order at once used to
      // race (both see "no such order", one create then fails and aborts the whole transaction). Locks are
      // taken up front in sorted order, before the sequence counter is touched, so two batches can never
      // wait on each other in a cycle.
      const orderIds = new Set<string>();
      for (const raw of rawEvents) {
        const id = raw && typeof raw === 'object' ? (raw as { externalOrderId?: unknown }).externalOrderId : undefined;
        if (typeof id === 'string' && id) orderIds.add(id);
      }
      for (const id of [...orderIds].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + device.restaurantId + ':' + id}))`;
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + device.restaurantId}))`;
      for (const raw of rawEvents) {
        const startedAt = Date.now();
        const parsed = orderSyncEventSchema.safeParse(raw);
        if (!parsed.success) {
          const id =
            raw && typeof raw === 'object' && typeof (raw as { externalOrderId?: unknown }).externalOrderId === 'string'
              ? (raw as { externalOrderId: string }).externalOrderId
              : 'unknown';
          const problem = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 500);
          await tx.syncEventLog.create({
            data: {
              restaurantId: device.restaurantId,
              deviceId: device.id,
              entityType: 'ORDER',
              action: 'UPDATE',
              status: 'FAILED',
              latencyMs: Date.now() - startedAt,
              payloadSize: JSON.stringify(raw ?? null).length,
              errorMessage: `Invalid order payload: ${problem}`
            }
          });
          results.push({ externalOrderId: id, status: 'error', error: `Invalid order payload: ${problem}` });
          continue;
        }
        const evt: OrderSyncEventDto = parsed.data;
        let claimed = false;
        // A database error inside one event must not poison the transaction for the rest of the batch.
        await tx.$executeRaw`SAVEPOINT order_event`;
        try {
          // Exactly-once: claim the eventId first. If it was already claimed, answer from the recorded
          // outcome and change nothing, so a retry after a lost response (or a delayed replay of an
          // older event) can never re-apply.
          if (evt.eventId) {
            const claim = await tx.$executeRaw`
              INSERT INTO "ProcessedSyncEvent" ("id", "restaurantId", "eventId", "deviceId", "entityType", "entityId", "result")
              VALUES (${randomUUID()}, ${device.restaurantId}, ${evt.eventId}, ${device.id}, 'ORDER', ${evt.externalOrderId}, '{}'::jsonb)
              ON CONFLICT ("restaurantId", "eventId") DO NOTHING`;
            if (claim === 0) {
              const prior = await tx.processedSyncEvent.findUnique({
                where: { restaurantId_eventId: { restaurantId: device.restaurantId, eventId: evt.eventId } }
              });
              const priorResult = (prior?.result ?? {}) as { syncVersion?: number };
              results.push({ externalOrderId: evt.externalOrderId, status: 'ok', syncVersion: priorResult.syncVersion, duplicate: true });
              continue;
            }
            claimed = true;
          }
          const existing = await tx.syncedOrder.findUnique({
            where: { restaurantId_externalOrderId: { restaurantId: device.restaurantId, externalOrderId: evt.externalOrderId } }
          });
          if (existing && device.branchId && existing.branchId !== device.branchId) {
            throw new Error('BRANCH_FORBIDDEN: This order is outside this device branch');
          }

          if (existing?.source === 'QR' && existing.paymentStatus === 'PARTIALLY_PAID' && evt.paymentStatus === 'SUCCESS') {
            const entries = await tx.orderPaymentEntry.findMany({ where: { restaurantId: device.restaurantId, orderId: existing.id } });
            const due = paymentBalance(existing.totalAmount, entries).outstandingPaise;
            if ((evt.meta as any)?.counterSettlementAmountPaise !== due) throw new Error('PAYMENT_BALANCE_CHANGED: Refresh the counter balance before collecting money');
          }

          // A settled payment is a business invariant, not an ordinary sync conflict: one order is paid
          // once, a paid order can be refunded but never silently reopened, and only a device with
          // payment authority may refund. Violations are refused and recorded, never applied.
          const violation = existing ? paymentViolation(existing, evt, device) : null;
          if (existing?.source === 'QR' && existing.paymentMethod === 'ONLINE') {
            throw new Error('PAYMENT_VERIFICATION_REQUIRED: Online QR orders are released only by verified gateway payment');
          }
          if (existing?.source === 'QR' && existing.paymentMethod === 'RAZORPAY') {
            const frozen = new Map((Array.isArray(existing.items) ? existing.items : []).map((item: any) => [item.externalItemId, item]));
            if (evt.items.some(item => {
              const original: any = frozen.get(item.externalItemId);
              return !original || item.quantity !== original.quantity || item.unitPrice !== original.unitPrice || item.lineTotal !== original.lineTotal;
            }) || evt.totalAmount !== existing.totalAmount || evt.subtotal !== existing.subtotal || evt.taxAmount !== existing.taxAmount || (evt.discountAmount ?? 0) !== existing.discountAmount) {
              throw new Error('PAID_QR_ORDER_FROZEN: Paid QR quantities and prices cannot be rewritten by device sync');
            }
          }
          if (existing && violation) {
            await tx.syncConflict.create({
              data: {
                restaurantId: device.restaurantId,
                branchId: device.branchId,
                deviceId: device.id,
                entityType: 'ORDER',
                entityId: evt.externalOrderId,
                localVersion: evt as any,
                cloudVersion: { paymentStatus: existing.paymentStatus, totalAmount: existing.totalAmount, status: existing.status, meta: existing.meta } as any,
                reason: `${violation.code}: ${device.type} device sent paymentStatus ${evt.paymentStatus} on an order already ${existing.paymentStatus}`
              }
            });
            if (claimed) await this.releaseClaim(tx, device.restaurantId, evt.eventId!);
            results.push({ externalOrderId: evt.externalOrderId, status: 'error', error: `${violation.code}: ${violation.message}` });
            continue;
          }

          // Items are merged per originating device so POS and Captain adding to one order never erase
          // each other, and kitchen progress never regresses. Totals stay as the pushing device computed
          // them (money is never silently recomputed); if other devices' items were kept, flag for review.
          const merge = mergeOrderItems((existing?.items as any[] | undefined) ?? undefined, evt.items as any[], device.id);
          // Meta is merged key by key: a push that omits a key (a KDS status update has no payment reference)
          // must never erase what another device recorded, such as the payment transaction id.
          const priorMeta = (existing?.meta as Record<string, unknown> | null) ?? {};
          const incomingMeta = (evt.meta as Record<string, unknown> | undefined) ?? {};
          const mergedMeta: Record<string, unknown> | undefined =
            existing || evt.meta || merge.foreignItemsKept
              ? { ...priorMeta, ...incomingMeta, ...(merge.foreignItemsKept ? { needsTotalsReview: true } : {}) }
              : undefined;
          if (existing?.source === 'QR' && mergedMeta) {
            // Kitchen/counter sync cannot invent a verified guest identity, earn rate, redemption or browser membership.
            for (const key of ['verifiedCustomerId','qrLoyaltyRate','loyaltyRedemption','qrBrowserSession','promotion','qrAutoAccept','serverDishStockConsumed','paymentAllocationSummary','sharedGuests']) {
              if (Object.prototype.hasOwnProperty.call(priorMeta,key)) mergedMeta[key]=priorMeta[key];
              else delete mergedMeta[key];
            }
          }
          // Accepting an order is a claim: the first device to record it owns it, and a later claim cannot take it over.
          if (mergedMeta && typeof priorMeta.acceptedBy === 'string') mergedMeta.acceptedBy = priorMeta.acceptedBy;
          if (mergedMeta) mergeKitchenPriority(priorMeta, incomingMeta, mergedMeta, device.type);

          // The order's state follows rules, not arrival order: no going backwards, no leaving a terminal state, and a device
          // type only sets the states it has authority over. A refused change is recorded; the rest of the push still merges.
          const decision = decideStatus(existing?.status, evt.status, device.type, evt.meta as { statusCorrection?: unknown } | undefined);
          if (!decision.apply) {
            await tx.syncConflict.create({
              data: {
                restaurantId: device.restaurantId, branchId: device.branchId, deviceId: device.id, entityType: 'ORDER', entityId: evt.externalOrderId,
                localVersion: { status: evt.status, updatedAt: evt.updatedAt } as any, cloudVersion: { status: existing?.status } as any,
                reason: `${decision.reason}: ${decision.message}`
              }
            });
          }

          // A push based on an older version of the order must not overwrite header fields another device has since changed.
          const staleHeader = !!existing && evt.baseSyncVersion !== undefined && evt.baseSyncVersion < existing.syncVersion;
          if (staleHeader) {
            await tx.syncConflict.create({
              data: {
                restaurantId: device.restaurantId, branchId: device.branchId, deviceId: device.id, entityType: 'ORDER', entityId: evt.externalOrderId,
                localVersion: { baseSyncVersion: evt.baseSyncVersion, totalAmount: evt.totalAmount, tableId: evt.tableId } as any,
                cloudVersion: { syncVersion: existing!.syncVersion, totalAmount: existing!.totalAmount, tableId: existing!.tableId } as any,
                reason: `STALE_HEADER: ${device.type} pushed against version ${evt.baseSyncVersion}, the order is at ${existing!.syncVersion}; its totals, table and notes were kept as they were`
              }
            });
          }
          const header = staleHeader && existing
            ? { orderType: existing.orderType, tableId: existing.tableId, tableLabel: existing.tableLabel, subtotal: existing.subtotal, taxAmount: existing.taxAmount, discountAmount: existing.discountAmount, totalAmount: existing.totalAmount, notes: existing.notes }
            : { orderType: evt.orderType, tableId: evt.tableId, tableLabel: evt.tableLabel, subtotal: evt.subtotal, taxAmount: evt.taxAmount, discountAmount: evt.discountAmount, totalAmount: evt.totalAmount, notes: evt.notes };
          // A captured kiosk payment owns its financial snapshot. A stale terminal cannot rewrite the receipt/tax later.
          const capturedKiosk = (device.type === 'KIOSK' || existing?.source === 'KIOSK')
            ? await tx.order.findFirst({ where: { restaurantId: device.restaurantId, externalOrderId: evt.externalOrderId, source: 'KIOSK', status: 'PAID' }, select: { subtotal: true, taxAmount: true, discountAmount: true, totalAmount: true } })
            : null;
          if (capturedKiosk) Object.assign(header, capturedKiosk);

          // Device-priced orders are believed (devices work offline on an older menu) but checked; problems are flagged, never rejected.
          let reviewFlags: string[] = [];
          if (!existing) {
            const ids = evt.items.map((i) => i.menuItemId || i.externalItemId);
            const menuRows = await tx.syncedEntity.findMany({ where: { restaurantId: device.restaurantId, entityType: 'MENU_ITEM', externalId: { in: ids } }, select: { externalId: true, payload: true } });
            const base = new Map<string, number>();
            for (const r of menuRows) {
              const p = r.payload as { price?: unknown; deleted?: unknown } | null;
              if (p && p.deleted !== true && typeof p.price === 'number') base.set(r.externalId, Math.round(p.price * 100));
            }
            reviewFlags = integrityFlags(evt.items as any[], evt.subtotal, base);
            if (reviewFlags.length > 0) {
              await tx.syncConflict.create({
                data: {
                  restaurantId: device.restaurantId, branchId: device.branchId, deviceId: device.id, entityType: 'ORDER', entityId: evt.externalOrderId,
                  localVersion: { subtotal: evt.subtotal, totalAmount: evt.totalAmount } as any, cloudVersion: {} as any,
                  reason: `PRICE_REVIEW: ${reviewFlags.slice(0, 6).join('; ')}`
                }
              });
            }
          }
          // Server-owned facts about the order live in meta and cannot be set by a device: who created it, and what needs review.
          const serverMeta: Record<string, unknown> = {
            originDeviceId: (priorMeta.originDeviceId as string | undefined) ?? device.id,
            ...(reviewFlags.length > 0 ? { reviewFlags } : {}),
            ...(staleHeader ? { needsTotalsReview: true } : {})
          };
          const finalMeta = { ...(mergedMeta ?? {}), ...serverMeta, ...(existing && Array.isArray(priorMeta.reviewFlags) && reviewFlags.length === 0 ? { reviewFlags: priorMeta.reviewFlags } : {}) };
          if (capturedKiosk) Object.assign(finalMeta, {
            cgstPaise: Math.round(capturedKiosk.taxAmount / 2), sgstPaise: capturedKiosk.taxAmount - Math.round(capturedKiosk.taxAmount / 2),
            roundOffPaise: 0, serviceChargePaise: 0, tipPaise: 0
          });
          delete (finalMeta as Record<string, unknown>).statusCorrection;

          // Only the counter (POS, POS Admin) may declare an order paid or refunded. Any other terminal may report a payment only when it
          // points at a settled gateway transaction of this restaurant that covers the total; otherwise the order keeps its payment
          // state (or starts unpaid) and the attempt is recorded. This is what stops a kiosk, kitchen screen or Captain from inserting
          // "paid" sales that no money stands behind.
          let payStatus = evt.paymentStatus;
          if (existing) {
            const allocations = await tx.orderPaymentEntry.findMany({ where: { restaurantId: device.restaurantId, orderId: existing.id } });
            if (allocations.length) {
              const balance = paymentBalance(header.totalAmount, allocations);
              if (existing.source === 'QR' && balance.collectedPaise > 0 && header.totalAmount !== existing.totalAmount) throw new Error('COLLECTED_QR_ORDER_FROZEN: Collected QR totals cannot be rewritten');
              if (existing.paymentStatus === 'PARTIALLY_PAID' && !payStatus?.includes('REFUND') && payStatus !== 'SUCCESS') payStatus = 'PARTIALLY_PAID';
              if (existing.source === 'QR' && balance.collectedPaise > 0 && ['CANCELLED','VOID','VOIDED'].includes(decision.status)) throw new Error('COLLECTED_ORDER_REFUND_REQUIRED: Use the authorized refund workflow');
            }
          }
          if (payStatus && !PAYMENT_AUTHORITATIVE_DEVICE_TYPES.has(device.type) && payStatus !== existing?.paymentStatus && TERMINAL_PAID_STATUSES.has(payStatus)) {
            const ref = (evt.meta as { paymentTransactionId?: string } | undefined)?.paymentTransactionId;
            const settled = payStatus === 'SUCCESS' && ref
              ? await tx.paymentTransaction.findFirst({
                  where: { restaurantId: device.restaurantId, status: 'SUCCESS', order: { externalOrderId: evt.externalOrderId, ...(device.branchId ? { OR: [{ branchId: device.branchId }, { branchId: null, kiosk: { branchId: device.branchId } }] } : {}) }, OR: [{ id: ref }, { providerOrderId: ref }, { providerPaymentId: ref }] },
                  select: { amount: true }
                })
              : null;
            if (!settled || settled.amount !== evt.totalAmount) {
              await tx.syncConflict.create({
                data: {
                  restaurantId: device.restaurantId, branchId: device.branchId, deviceId: device.id, entityType: 'ORDER', entityId: evt.externalOrderId,
                  localVersion: { paymentStatus: payStatus, totalAmount: evt.totalAmount, paymentTransactionId: ref ?? null } as any,
                  cloudVersion: { paymentStatus: existing?.paymentStatus ?? null } as any,
                  reason: `PAYMENT_UNVERIFIED: a ${device.type} device reported the order as ${payStatus} without a settled gateway payment covering it`
                }
              });
              payStatus = existing?.paymentStatus ?? 'PENDING';
            }
          }

          // Taking an order or money back must be done by someone the server can name. The terminal stamps the signed session of the
          // person signed in (and, for an override, the manager's approval); the server reads the ROLE from that proof. A cashier's own
          // session without a manager approval is refused; no proof at all (an offline sign-in) is accepted but flagged, or refused when
          // the deployment sets REQUIRE_STAFF_SESSION=true. The tokens themselves are never stored.
          const staffFinalMeta = finalMeta as Record<string, unknown>;
          if (evt.meta?.refundAmountPaise !== undefined) {
            if (!PAYMENT_AUTHORITATIVE_DEVICE_TYPES.has(device.type)) {
              if (typeof priorMeta.refundAmountPaise === 'number') staffFinalMeta.refundAmountPaise = priorMeta.refundAmountPaise;
              else delete staffFinalMeta.refundAmountPaise;
            } else if (evt.meta.refundAmountPaise > header.totalAmount || !existing || decision.status !== 'REFUNDED') {
              throw new Error('Refund amount requires an existing refunded order and cannot exceed its total');
            }
          }
          delete staffFinalMeta.staffSession;
          delete staffFinalMeta.approvalSession;
          const takesBack = !!existing && (['CANCELLED', 'VOID', 'VOIDED', 'REFUNDED'].includes(decision.status) && existing.status !== decision.status
            || (payStatus === 'REFUNDED' && existing.paymentStatus !== 'REFUNDED')
              || (typeof evt.meta?.refundAmountPaise === 'number' && evt.meta.refundAmountPaise !== priorMeta.refundAmountPaise && PAYMENT_AUTHORITATIVE_DEVICE_TYPES.has(device.type))
            || ((evt.meta as { statusCorrection?: boolean } | undefined)?.statusCorrection === true && existing.status !== decision.status));
          if (takesBack && !STAFF_PROOF_EXEMPT_DEVICE_TYPES.has(device.type)) {
            const at = Date.parse(evt.updatedAt) || Date.now();
            const rawSession = (evt.meta as { staffSession?: string } | undefined)?.staffSession;
            const rawApproval = (evt.meta as { approvalSession?: string } | undefined)?.approvalSession;
            const session = this.sessions.verify(rawSession, device.restaurantId, device.id, 'session', at);
            const approval = this.sessions.verify(rawApproval, device.restaurantId, device.id, 'approval', at);
            const stillActive = async (sid: string) => {
              const row = await tx.syncedEntity.findFirst({ where: { restaurantId: device.restaurantId, entityType: 'STAFF_USER', externalId: sid }, select: { payload: true } });
              const p = row?.payload as { deleted?: unknown; isActive?: unknown } | null;
              return !p || (p.deleted !== true && p.isActive !== false);
            };
            const managerEvidence = [approval, session].find((c) => c && MANAGER_ROLES.includes(c.role)) ?? null;
            const evidence = managerEvidence && (await stillActive(managerEvidence.sid)) ? managerEvidence : null;
            if (evidence) {
              staffFinalMeta.verifiedStaff = { id: evidence.sid, name: evidence.name, role: evidence.role };
            } else {
              const refusal = session
                ? 'STAFF_NOT_AUTHORIZED: this action needs a manager; the person signed in on the terminal is not one and no manager approval came with it'
                : this.config.get<string>('REQUIRE_STAFF_SESSION') === 'true'
                  ? 'STAFF_UNVERIFIED: this action needs a signed-in staff member and none was proven'
                  : null;
              await tx.syncConflict.create({
                data: {
                  restaurantId: device.restaurantId, branchId: device.branchId, deviceId: device.id, entityType: 'ORDER', entityId: evt.externalOrderId,
                  localVersion: { status: evt.status, paymentStatus: evt.paymentStatus, totalAmount: evt.totalAmount } as any,
                  cloudVersion: { status: existing!.status, paymentStatus: existing!.paymentStatus } as any,
                  reason: refusal ?? `STAFF_UNVERIFIED: ${device.type} took an order or money back without proof of who did it (accepted: offline sign-in)`
                }
              });
              if (refusal) {
                if (claimed) await this.releaseClaim(tx, device.restaurantId, evt.eventId!);
                results.push({ externalOrderId: evt.externalOrderId, status: 'error', error: refusal });
                continue;
              }
              staffFinalMeta.actorVerified = false;
            }
          }

          const data = {
            restaurantId: device.restaurantId,
            deviceId: device.id,
            externalOrderId: evt.externalOrderId,
            status: decision.status,
            ...header,
            items: merge.items as any,
            paymentStatus: payStatus,
            paymentMethod: evt.paymentMethod,
            meta: finalMeta as any
          };
          const source = orderSourceFor(device.type, evt.meta);

          const seq = await nextSyncSequence(tx, device.restaurantId);
          latestSeq = seq;
          const saved = existing
            ? await tx.syncedOrder.update({
                where: { id: existing.id },
                data: { ...data, syncVersion: existing.syncVersion + 1, seq }
              })
            // The order belongs to the branch of the terminal that first pushed it (BUG-048).
            : await tx.syncedOrder.create({ data: { ...data, branchId: device.branchId, source, syncVersion: 1, seq } });
          if (existing?.paymentStatus === 'PARTIALLY_PAID' && payStatus === 'SUCCESS' && PAYMENT_AUTHORITATIVE_DEVICE_TYPES.has(device.type)) {
            const entries = await tx.orderPaymentEntry.findMany({ where: { restaurantId: device.restaurantId, orderId: saved.id } });
            const balance = paymentBalance(saved.totalAmount, entries);
            if (balance.outstandingPaise) await allocateOrderPayment(tx, saved, { kind: 'COLLECTION', amount: balance.outstandingPaise, method: evt.paymentMethod ?? existing.paymentMethod ?? 'UNKNOWN', reference: 'pos-completion:' + saved.id, actorId: device.id, evidence: { provenance: 'AUTHORIZED_COUNTER_SETTLEMENT' } });
          }
          const reconciled = await reconcileOrderPayments(tx, saved, device.id);
          if (existing?.source === 'QR' && (existing.paymentStatus === 'PARTIALLY_PAID' || (existing.meta as any)?.paymentAllocationSummary)) {
            await tx.syncedOrder.update({ where: { id: saved.id }, data: { meta: { ...(saved.meta as object ?? {}), paymentAllocationSummary: { collectedPaise: reconciled.collectedPaise, outstandingPaise: reconciled.outstandingPaise } } } });
          }

          // Phase 5 of the Jamanvaar<->WhatsApp connector: staff moving a WhatsApp order
          // through its lifecycle on POS/KDS (accepted/preparing/ready/completed/...) is
          // exactly what the customer needs to hear about. Only for an existing order
          // (ingestServerOrder creates a WhatsApp order — see PaymentsService.
          // ingestWhatsAppOrderIfNeeded — pushEvents only ever updates it afterward) whose
          // status actually changed, and only collected here for dispatch AFTER the whole
          // transaction commits (see below), same discipline as this method's own
          // realtime.publish. paymentTransactionId (stashed in meta at ingestion time) is
          // the correlator product/whatsapp already has from checkout()'s own response —
          // see ingestWhatsAppOrderIfNeeded's identical reasoning for order.confirmed.
          if (existing && existing.source === 'WHATSAPP' && existing.status !== saved.status) {
            const existingMeta = existing.meta as Record<string, unknown> | null;
            const paymentId = existingMeta && typeof existingMeta === 'object' ? existingMeta.paymentTransactionId : undefined;
            if (typeof paymentId === 'string' && paymentId) {
              whatsappStatusChanges.push({
                paymentId,
                orderId: saved.id,
                publicOrderId: saved.publicOrderId,
                status: saved.status,
                previousStatus: existing.status
              });
            }
          }

          await tx.syncEventLog.create({
            data: {
              restaurantId: device.restaurantId,
              deviceId: device.id,
              entityType: 'ORDER',
              entityId: evt.externalOrderId,
              traceId: evt.traceId ?? evt.externalOrderId,
              eventId: evt.eventId,
              action: existing ? 'UPDATE' : 'CREATE',
              status: 'SUCCESS',
              latencyMs: Date.now() - startedAt,
              payloadSize: JSON.stringify(evt).length
            }
          });

          if (claimed) {
            await tx.processedSyncEvent.update({
              where: { restaurantId_eventId: { restaurantId: device.restaurantId, eventId: evt.eventId! } },
              data: { result: { syncVersion: saved.syncVersion, seq } }
            });
          }
          // Actions that take money or an order back are attributed to the terminal that did them and the name it declared. The name is
          // what the terminal says, not proof of who stood there; the device id and type are what the server knows.
          const voided = ['CANCELLED', 'VOID', 'VOIDED', 'REFUNDED'].includes(decision.status) && existing?.status !== decision.status;
          const refunded = payStatus === 'REFUNDED' && existing?.paymentStatus !== 'REFUNDED';
          const corrected = (evt.meta as { statusCorrection?: boolean } | undefined)?.statusCorrection === true && existing?.status !== decision.status;
          if (existing && (voided || refunded || corrected)) {
            await this.audit.log(
              {
                actorType: 'TENANT', actorId: device.id, restaurantId: device.restaurantId,
                action: refunded ? 'ORDER_REFUNDED' : corrected ? 'ORDER_STATUS_CORRECTED' : 'ORDER_VOIDED', category: 'ORDER',
                details: { orderId: evt.externalOrderId, from: existing.status, to: decision.status, totalAmount: evt.totalAmount, deviceType: device.type, verifiedStaff: (finalMeta as Record<string, unknown>).verifiedStaff ?? null, declaredBy: (evt.meta as { cashierName?: string; captainName?: string } | undefined)?.cashierName ?? (evt.meta as { captainName?: string } | undefined)?.captainName ?? null }
              },
              tx
            );
          }
          results.push({ externalOrderId: evt.externalOrderId, status: 'ok', syncVersion: saved.syncVersion });
        } catch (err: any) {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT order_event`;
          // The savepoint rollback also undid the event claim, so the event stays retryable.
          await tx.syncEventLog.create({
            data: {
              restaurantId: device.restaurantId,
              deviceId: device.id,
              entityType: 'ORDER',
              entityId: evt.externalOrderId,
              traceId: evt.traceId ?? evt.externalOrderId,
              eventId: evt.eventId,
              action: 'UPDATE',
              status: 'FAILED',
              latencyMs: Date.now() - startedAt,
              payloadSize: JSON.stringify(evt).length,
              errorMessage: err?.message?.slice(0, 500) ?? 'Unknown error'
            }
          });
          results.push({ externalOrderId: evt.externalOrderId, status: 'error', error: err?.message ?? 'Unknown error' });
        }
      }
    });

    // Wake the branch only after the transaction has committed, so a woken device's pull always sees the change.
    if (results.some((r) => r.status === 'ok' && !r.duplicate)) {
      this.realtime.publish({ restaurantId: device.restaurantId, branchId: device.branchId, kind: 'orders', seq: latestSeq, originDeviceId: device.id });
    }
    for (const change of whatsappStatusChanges) {
      // enqueue() durably records the delivery itself and retries on its own — a failure
      // here is a bug worth logging, not a reason to fail the device's own push response
      // (which has already succeeded at its actual job: recording the status change).
      await this.whatsappOutbound.enqueue(device.restaurantId, 'order.status', change).catch(() => undefined);
    }
    return { results, serverTime: new Date().toISOString() };
  }


  /**
   * Creates an order that originates on the server (a guest's QR order) through the SAME path every device order
   * takes: per-order lock, sequence number, sync event log, realtime wake-up. It is therefore delivered by cursor,
   * by realtime and through the Branch Core exactly like a POS order. There is no second order pipeline.
   * Idempotent on (restaurantId, externalOrderId): a repeat returns the original order and creates nothing.
   */
  /** Only a verified shared payment may release an online QR draft to the kitchen. */
  async confirmPaidQrOrder(restaurantId: string, externalOrderId: string, paymentId: string) {
    const result = await this.prisma.runAsTenant(restaurantId, async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + restaurantId + ':' + externalOrderId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + restaurantId}))`;
      const payment = await tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId, status: 'SUCCESS' }, include: { order: true } });
      const order = await tx.syncedOrder.findUnique({ where: { restaurantId_externalOrderId: { restaurantId, externalOrderId } } });
      if (!payment || payment.order.source !== 'QR' || payment.order.externalOrderId !== externalOrderId || !order || order.source !== 'QR' || order.totalAmount !== payment.amount) throw new BadRequestException('Verified QR payment does not match the order');
      if (order.status !== 'DRAFT') return { order, changed: false };
      await reconcileOrderPayments(tx, order);
      const meta = (order.meta ?? {}) as Record<string, unknown>;
      const seq = await nextSyncSequence(tx, restaurantId);
      const saved = await tx.syncedOrder.update({ where: { id: order.id }, data: {
        status: meta.qrAutoAccept ? 'PREPARING' : 'NEW', paymentStatus: 'SUCCESS', paymentMethod: 'RAZORPAY',
        meta: { ...meta, paymentTransactionId: paymentId } as Prisma.InputJsonValue, syncVersion: { increment: 1 }, seq
      } });
      // The existing operational order is now durably admitted; gateway success alone did not count as delivery.
      await tx.paymentTransaction.updateMany({ where: { id: paymentId, fulfilledAt: null }, data: { fulfilledAt: new Date() } });
      await tx.syncEventLog.create({ data: { restaurantId, branchId: saved.branchId, entityType: 'ORDER', entityId: externalOrderId, action: 'UPDATE', status: 'SUCCESS', traceId: externalOrderId } });
      return { order: saved, changed: true };
    });
    if (result.changed) this.realtime.publish({ restaurantId, branchId: result.order.branchId, kind: 'orders', seq: result.order.seq ?? undefined });
    return result.order;
  }

  /** QR-only management uses the same row/lock/sequence as POS and kitchen devices. */
  async orderPaymentLedger(device: Device, externalOrderId: string) {
    return this.prisma.runAsTenant(device.restaurantId, async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + device.restaurantId + ':' + externalOrderId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + device.restaurantId}))`;
      const order = await tx.syncedOrder.findUnique({ where: { restaurantId_externalOrderId: { restaurantId: device.restaurantId, externalOrderId } } });
      if (!order || (device.branchId && device.branchId !== order.branchId)) throw new NotFoundException('Order not found');
      const ledger = await reconcileOrderPayments(tx, order, device.id);
      const attempts = await tx.paymentTransaction.findMany({ where: { restaurantId: device.restaurantId, order: { externalOrderId } }, orderBy: { createdAt: 'asc' }, select: { id: true, amount: true, status: true, method: true, createdAt: true, paidAt: true } });
      return { ...ledger, attempts };
    });
  }

  async recordQrPartialCash(device: Device, externalOrderId: string, input: { amountPaise: number; version: number; idempotencyKey: string }) {
    const result = await this.prisma.runAsTenant(device.restaurantId, async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + device.restaurantId + ':' + externalOrderId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + device.restaurantId}))`;
      const order = await tx.syncedOrder.findUnique({ where: { restaurantId_externalOrderId: { restaurantId: device.restaurantId, externalOrderId } } });
      if (!order || order.source !== 'QR' || (device.branchId && device.branchId !== order.branchId)) throw new NotFoundException('Order not found');
      const reference = 'cash:' + device.restaurantId + ':' + input.idempotencyKey;
      const previous = await tx.orderPaymentEntry.findUnique({ where: { reference } });
      if (previous && previous.orderId === order.id && previous.amount === input.amountPaise) return { order, ledger: await reconcileOrderPayments(tx, order), duplicate: true };
      if (order.syncVersion !== input.version) throw new ConflictException('This order changed. Refresh before collecting payment.');
      if (order.paymentMethod !== 'CASH_AT_COUNTER' || ['DRAFT', 'CANCELLED', 'VOIDED', 'REFUNDED'].includes(order.status)) throw new BadRequestException('Only an accepted counter-payment order can receive a cash collection');
      await reconcileOrderPayments(tx, order);
      await allocateOrderPayment(tx, order, { kind: 'COLLECTION', amount: input.amountPaise, method: 'CASH', reference, actorId: (device as Device & { adminActorId?: string }).adminActorId ?? device.id, evidence: { deviceId: device.id } });
      const ledger = await reconcileOrderPayments(tx, order);
      const seq = await nextSyncSequence(tx, device.restaurantId);
      const saved = await tx.syncedOrder.update({ where: { id: order.id }, data: { paymentStatus: ledger.outstandingPaise === 0 ? 'SUCCESS' : 'PARTIALLY_PAID', syncVersion: { increment: 1 }, seq, meta: { ...(order.meta as object ?? {}), paymentAllocationSummary: { collectedPaise: ledger.collectedPaise, outstandingPaise: ledger.outstandingPaise } } } });
      await tx.syncEventLog.create({ data: { restaurantId: device.restaurantId, branchId: order.branchId, deviceId: device.id, entityType: 'ORDER', entityId: externalOrderId, action: 'UPDATE', status: 'SUCCESS' } });
      await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId: device.restaurantId, action: 'QR_PARTIAL_CASH_COLLECTED', category: 'PAYMENTS', details: { externalOrderId, amountPaise: input.amountPaise, reference } }, tx);
      await reconcileOrderPayments(tx, saved);
      return { order: saved, ledger, duplicate: false };
    });
    if (!result.duplicate) this.realtime.publish({ restaurantId: device.restaurantId, branchId: result.order.branchId, kind: 'orders', seq: result.order.seq ?? undefined });
    return { ...result.ledger, version: result.order.syncVersion, paymentStatus: result.order.paymentStatus, duplicate: result.duplicate };
  }

  async reconcilePaymentLedger(restaurantId: string, externalOrderId: string) {
    return this.prisma.runAsTenant(restaurantId, async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + restaurantId + ':' + externalOrderId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + restaurantId}))`;
      const order = await tx.syncedOrder.findUnique({ where: { restaurantId_externalOrderId: { restaurantId, externalOrderId } } });
      return order ? reconcileOrderPayments(tx, order) : null;
    });
  }

  async refundQrCash(device: Device, externalOrderId: string, input: { amountPaise:number; version:number; idempotencyKey:string; reason:string }) {
    const result = await this.prisma.runAsTenant(device.restaurantId,async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:'+device.restaurantId+':'+externalOrderId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:'+device.restaurantId}))`;
      const order=await tx.syncedOrder.findUnique({where:{restaurantId_externalOrderId:{restaurantId:device.restaurantId,externalOrderId}}});
      if(!order||order.source!=='QR'||(device.branchId&&device.branchId!==order.branchId))throw new NotFoundException('Order not found');
      if(order.paymentMethod!=='CASH_AT_COUNTER')throw new BadRequestException('Online refunds must use the existing verified-payment refund workflow');
      const reference='cash-refund:'+device.restaurantId+':'+input.idempotencyKey,previous=await tx.orderPaymentEntry.findUnique({where:{reference}});
      if(previous&&previous.orderId===order.id&&previous.amount===input.amountPaise)return {order,duplicate:true,ledger:await reconcileOrderPayments(tx,order)};
      if(order.syncVersion!==input.version)throw new ConflictException('This order changed. Refresh before recording a refund');
      await reconcileOrderPayments(tx,order);
      await allocateOrderPayment(tx,order,{kind:'REFUND',amount:input.amountPaise,method:'CASH',reference,actorId:(device as Device&{adminActorId?:string}).adminActorId??device.id,evidence:{reason:input.reason,deviceId:device.id}});
      const ledger=await reconcileOrderPayments(tx,order),seq=await nextSyncSequence(tx,device.restaurantId);
      const fullyReturned=ledger.netCollectedPaise===0;
      const saved=await tx.syncedOrder.update({where:{id:order.id},data:{paymentStatus:fullyReturned?'REFUNDED':'PARTIALLY_REFUNDED',...(fullyReturned?{status:'REFUNDED'}:{}),seq,syncVersion:{increment:1},meta:{...(order.meta as object??{}),refundAmountPaise:ledger.refundedPaise,lastRefundReason:input.reason}}});
      await reconcileOrderPayments(tx,saved);
      await this.audit.log({actorType:'TENANT',actorId:(device as Device&{adminActorId?:string}).adminActorId??device.id,restaurantId:device.restaurantId,action:'QR_CASH_REFUND_RECORDED',category:'REFUNDS',details:{externalOrderId,amountPaise:input.amountPaise,reason:input.reason,reference}},tx);
      await tx.syncEventLog.create({data:{restaurantId:device.restaurantId,branchId:order.branchId,deviceId:device.id,entityType:'ORDER',entityId:externalOrderId,action:'UPDATE',status:'SUCCESS'}});
      return {order:saved,duplicate:false,ledger};
    });
    if(!result.duplicate)this.realtime.publish({restaurantId:device.restaurantId,branchId:result.order.branchId,kind:'orders',seq:result.order.seq??undefined});
    return {...result.ledger,version:result.order.syncVersion,duplicate:result.duplicate};
  }

  async manageQrOrder(device: Device, externalOrderId: string, action: string, expectedVersion: number, reason?: string) {
    const saved = await this.prisma.runAsTenant(device.restaurantId, async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + device.restaurantId + ':' + externalOrderId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + device.restaurantId}))`;
      const order = await tx.syncedOrder.findUnique({ where: { restaurantId_externalOrderId: { restaurantId: device.restaurantId, externalOrderId } } });
      if (!order || order.source !== 'QR' || (device.branchId && order.branchId !== device.branchId)) throw new NotFoundException('QR order not found');
      if (order.syncVersion !== expectedVersion) throw new ConflictException('This order changed on another screen. Refresh before continuing.');
      if (['CANCELLED', 'REFUNDED', 'VOIDED'].includes(order.status)) throw new BadRequestException('This order is already closed');
      const meta = (order.meta ?? {}) as Record<string, any>;
      const collected = action === 'COLLECT';
      if (collected) {
        if (order.paymentMethod !== 'CASH_AT_COUNTER' || order.paymentStatus === 'SUCCESS' || order.status === 'DRAFT') throw new BadRequestException('This order has no counter payment due');
        meta.counterCollection = { deviceId: device.id, staffId: (device as Device & { adminActorId?: string }).adminActorId ?? device.id, at: new Date().toISOString(), amountPaise: order.totalAmount };
        const ledger = await reconcileOrderPayments(tx, order, device.id);
        if (ledger.outstandingPaise) await allocateOrderPayment(tx, order, { kind: 'COLLECTION', amount: ledger.outstandingPaise, method: 'CASH', reference: 'counter:' + order.id, actorId: meta.counterCollection.staffId, evidence: { deviceId: device.id } });
        meta.paymentAllocationSummary = { collectedPaise: order.totalAmount, outstandingPaise: 0 };
      } else {
        const ledger = await reconcileOrderPayments(tx, order);
        const refusal = validateQrOrderAction(order.status, action, action === 'CANCELLED' ? ledger.collectedPaise > 0 : order.paymentStatus === 'SUCCESS', reason);
        if (refusal) throw new BadRequestException(refusal);
        if (action === 'PREPARING') { meta.acceptedBy = device.id; meta.acceptedAt = new Date().toISOString(); }
      }
      const history = Array.isArray(meta.qrStatusHistory) ? meta.qrStatusHistory.slice(-99) : [];
      meta.qrStatusHistory = [...history, { action, deviceId: device.id, at: new Date().toISOString(), ...(reason ? { reason } : {}) }];
      const kitchen = ({ PREPARING: 'COOKING', READY: 'READY', COMPLETED: 'SERVED', CANCELLED: 'CANCELLED' } as Record<string, string>)[action];
      const items = Array.isArray(order.items) ? order.items.map((item: any) => kitchen && item.kitchenStatus !== 'CANCELLED' ? { ...item, kitchenStatus: kitchen, ...(action === 'CANCELLED' ? { statusRev: (item.statusRev ?? 0) + 1 } : {}) } : item) : order.items;
      const seq = await nextSyncSequence(tx, device.restaurantId);
      const result = await tx.syncedOrder.update({ where: { id: order.id }, data: { status: collected ? order.status : action, paymentStatus: collected ? 'SUCCESS' : order.paymentStatus, items: items as Prisma.InputJsonValue, meta: meta as Prisma.InputJsonValue, seq, syncVersion: { increment: 1 } } });
      await tx.syncEventLog.create({ data: { restaurantId: device.restaurantId, branchId: order.branchId, deviceId: device.id, entityType: 'ORDER', entityId: externalOrderId, action: 'UPDATE', status: 'SUCCESS' } });
      await reconcileOrderPayments(tx, result, device.id);
      await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId: device.restaurantId, action: collected ? 'QR_COUNTER_COLLECTED' : 'QR_ORDER_STATUS_CHANGED', category: 'QR_ORDERING', details: { externalOrderId, action, reason: reason ?? null, amountPaise: collected ? order.totalAmount : null, branchId: order.branchId } }, tx);
      return result;
    });
    this.realtime.publish({ restaurantId: device.restaurantId, branchId: saved.branchId, kind: 'orders', seq: saved.seq ?? undefined, originDeviceId: device.id });
    return { version: saved.syncVersion, status: saved.status, paymentStatus: saved.paymentStatus };
  }

  async admitCounterQrOrder(restaurantId: string, externalOrderId: string, paymentId: string | null, switchToken: string) {
    const result = await this.prisma.runAsTenant(restaurantId, async tx => {
      if (paymentId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'payment-settle:' + paymentId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + restaurantId + ':' + externalOrderId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + restaurantId}))`;
      const order = await tx.syncedOrder.findUniqueOrThrow({ where: { restaurantId_externalOrderId: { restaurantId, externalOrderId } } });
      if (order.paymentStatus === 'SUCCESS' || order.paymentMethod === 'CASH_AT_COUNTER') return { order, changed: false };
      const meta = (order.meta ?? {}) as Record<string, any>;
      if (order.source !== 'QR' || order.status !== 'DRAFT' || meta.qrCounterSwitchToken !== switchToken) throw new BadRequestException('Payment method change is no longer valid');
      if (paymentId) {
        const payment = await tx.paymentTransaction.findFirstOrThrow({ where: { id: paymentId, restaurantId } });
        if (['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_PENDING'].includes(payment.status)) throw new BadRequestException('Online payment has already been received. Check order status.');
        await tx.paymentTransaction.update({ where: { id: paymentId }, data: { status: 'FAILED', failureReason: 'Payment link cancelled', providerResponse: { ...(payment.providerResponse as Record<string, any> ?? {}), switchedToCounter: true } } });
        await tx.order.update({ where: { id: payment.orderId }, data: { status: 'CANCELLED' } });
      }
      delete meta.qrCounterSwitchAt; delete meta.qrCounterSwitchToken;
      const seq = await nextSyncSequence(tx, restaurantId);
      const saved = await tx.syncedOrder.update({ where: { id: order.id }, data: { paymentMethod: 'CASH_AT_COUNTER', paymentStatus: 'PENDING', status: meta.qrAutoAccept ? 'PREPARING' : 'NEW', meta, seq, syncVersion: { increment: 1 } } });
      await tx.syncEventLog.create({ data: { restaurantId, branchId: saved.branchId, entityType: 'ORDER', entityId: externalOrderId, action: 'UPDATE', status: 'SUCCESS', traceId: externalOrderId } });
      return { order: saved, changed: true };
    });
    if (result.changed) this.realtime.publish({ restaurantId, branchId: result.order.branchId, kind: 'orders', seq: result.order.seq ?? undefined });
    return result.order;
  }

  async ingestServerOrder(input: ServerOrderInput) {
    const startedAt = Date.now();
    const result = await this.prisma.runAsTenant(input.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + input.restaurantId + ':' + input.externalOrderId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + input.restaurantId}))`;
      const existing = await tx.syncedOrder.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId: input.restaurantId, externalOrderId: input.externalOrderId } }
      });
      if (existing) return { order: existing, duplicate: true, seq: existing.seq ?? undefined };

      if (input.serializeRestaurantLimit) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'qr-limit:' + input.restaurantId}))`;
      }
      const extraMeta = input.beforeCreate ? await input.beforeCreate(tx) : undefined;

      const seq = await nextSyncSequence(tx, input.restaurantId);
      const order = await tx.syncedOrder.create({
        data: {
          restaurantId: input.restaurantId,
          branchId: input.branchId,
          deviceId: null,
          externalOrderId: input.externalOrderId,
          source: input.source,
          publicOrderId: input.publicOrderId,
          qrCodeId: input.qrCodeId,
          menuVersion: input.menuVersion,
          orderType: input.orderType,
          status: input.status,
          tableId: input.tableId ?? undefined,
          tableLabel: input.tableLabel ?? undefined,
          items: input.items as any,
          subtotal: input.subtotal,
          taxAmount: input.taxAmount,
          discountAmount: input.discountAmount,
          totalAmount: input.totalAmount,
          notes: input.notes ?? undefined,
          paymentStatus: input.paymentStatus,
          paymentMethod: input.paymentMethod,
          meta: { ...input.meta, ...(extraMeta ?? {}) } as any,
          syncVersion: 1,
          seq
        }
      });
      await reconcileOrderPayments(tx, order);
      await tx.syncEventLog.create({
        data: {
          restaurantId: input.restaurantId,
          branchId: input.branchId,
          entityType: 'ORDER',
          entityId: input.externalOrderId,
          traceId: input.externalOrderId,
          action: 'CREATE',
          status: 'SUCCESS',
          latencyMs: Date.now() - startedAt,
          payloadSize: JSON.stringify(input.items).length
        }
      });
      return { order, duplicate: false, seq };
    });

    // After commit, so a woken device's pull always sees the order.
    if (!result.duplicate) {
      this.realtime.publish({ restaurantId: input.restaurantId, branchId: input.branchId, kind: 'orders', seq: result.seq });
    }
    return { order: result.order, duplicate: result.duplicate };
  }

  /** A failed event must stay retryable, so its claim is dropped rather than recorded as applied. */
  private async releaseClaim(tx: TxClient, restaurantId: string, eventId: string) {
    await tx.processedSyncEvent.deleteMany({ where: { restaurantId, eventId } }).catch(() => undefined);
  }

  /**
   * Catch-up/replay pull for a (re)connecting device — not just a live push
   * target. `since` is the cursor the device persisted from a prior call's
   * `serverTime`, so a device that was offline for hours gets everything it
   * missed in one shot rather than only future pushes.
   */
  async catchUp(device: Device, since?: string, afterSeq?: number) {
    const singleBranch = device.branchId && (await this.prisma.runAsTenant(device.restaurantId, tx => tx.branch.count({ where: { restaurantId: device.restaurantId } }))) === 1;
    const branchFilter = device.branchId ? singleBranch ? { OR: [{ branchId: device.branchId }, { branchId: null }] } : { branchId: device.branchId } : {};

    // Sequence cursor (preferred): strictly increasing, gapless, independent of any clock.
    if (afterSeq !== undefined) {
      const rows = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
        tx.syncedOrder.findMany({
          where: { restaurantId: device.restaurantId, seq: { gt: afterSeq }, ...branchFilter },
          orderBy: { seq: 'asc' },
          take: CATCH_UP_MAX_ROWS + 1
        })
      );
      const hasMore = rows.length > CATCH_UP_MAX_ROWS;
      const orders = hasMore ? rows.slice(0, CATCH_UP_MAX_ROWS) : rows;
      const latestSeq = orders.length > 0 ? (orders[orders.length - 1].seq as number) : afterSeq;
      return { orders, latestSeq, hasMore, serverTime: new Date().toISOString() };
    }

    // Legacy timestamp cursor, kept for app versions that predate the sequence.
    const sinceDate = since ? new Date(since) : new Date(Date.now() - CATCH_UP_DEFAULT_LOOKBACK_MS);
    const orders = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
      tx.syncedOrder.findMany({
        where: { restaurantId: device.restaurantId, updatedAt: { gt: sinceDate }, ...branchFilter },
        orderBy: { updatedAt: 'asc' },
        take: CATCH_UP_MAX_ROWS
      })
    );
    const latestSeq = orders.reduce((max, o) => Math.max(max, o.seq ?? 0), 0);
    return { orders, latestSeq, serverTime: new Date().toISOString() };
  }
}
