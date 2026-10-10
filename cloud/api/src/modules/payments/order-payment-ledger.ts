import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma, SyncedOrder } from "@prisma/client";
import { reconcileQrLoyalty } from "./qr-loyalty-ledger";
import { nextSyncSequence } from "../../common/sync-sequence";
import { reconcileQrDishStock } from "./qr-dish-stock";

type Tx = Prisma.TransactionClient;
export const COLLECTED_ORDER_STATUSES = new Set([
  "SUCCESS",
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUND_PENDING",
  "REFUNDED",
]);

export function paymentBalance(
  total: number,
  entries: Array<{ kind: string; amount: number }>,
) {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new BadRequestException("Invalid order amount");
  const collected = entries
    .filter((e) => e.kind === "COLLECTION")
    .reduce((n, e) => n + e.amount, 0);
  const refunded = entries
    .filter((e) => e.kind === "REFUND")
    .reduce((n, e) => n + e.amount, 0);
  if (collected > total || refunded > collected)
    throw new ConflictException("Payment ledger requires reconciliation");
  return {
    totalPaise: total,
    collectedPaise: collected,
    refundedPaise: refunded,
    netCollectedPaise: collected - refunded,
    outstandingPaise: total - collected,
    settlement:
      collected === total ? "SETTLED" : collected ? "PARTIAL" : "UNPAID",
  };
}

/** Caller must hold the canonical order lock. A replay returns its immutable entry, never changes money. */
export async function allocateOrderPayment(
  tx: Tx,
  order: SyncedOrder,
  input: {
    kind: "COLLECTION" | "REFUND";
    amount: number;
    method: string;
    reference: string;
    actorId?: string;
    evidence?: Prisma.InputJsonValue;
  },
) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    throw new BadRequestException(
      "Collection amount must be positive integer paise",
    );
  const prior = await tx.orderPaymentEntry.findUnique({
    where: { reference: input.reference },
  });
  if (prior) {
    if (
      prior.restaurantId !== order.restaurantId ||
      prior.orderId !== order.id ||
      prior.kind !== input.kind ||
      prior.amount !== input.amount ||
      prior.method !== input.method
    )
      throw new ConflictException(
        "This payment reference has already been allocated differently",
      );
    return prior;
  }
  const entries = await tx.orderPaymentEntry.findMany({
    where: { restaurantId: order.restaurantId, orderId: order.id },
  });
  const balance = paymentBalance(order.totalAmount, entries);
  if (input.kind === "COLLECTION" && input.amount > balance.outstandingPaise)
    throw new ConflictException("Collection exceeds the outstanding balance");
  if (input.kind === "REFUND" && input.amount > balance.netCollectedPaise)
    throw new ConflictException("Refund exceeds the collected balance");
  const meta = (order.meta ?? {}) as Record<string, unknown>;
  return tx.orderPaymentEntry.create({
    data: {
      restaurantId: order.restaurantId,
      orderId: order.id,
      branchId: order.branchId,
      currency: typeof meta.currency === "string" ? meta.currency : "INR",
      ...input,
    },
  });
}

/** Build ledger evidence from existing trusted workflows without inventing another gateway attempt. */
export async function reconcileOrderPayments(
  tx: Tx,
  order: SyncedOrder,
  actorId?: string,
) {
  const attempts = await tx.paymentTransaction.findMany({
    where: {
      restaurantId: order.restaurantId,
      order: { externalOrderId: order.externalOrderId },
      status: {
        in: ["SUCCESS", "PARTIALLY_REFUNDED", "REFUND_PENDING", "REFUNDED"],
      },
    },
    include: { refunds: { where: { status: "SUCCESS" } } },
  });
  for (const attempt of attempts) {
    await allocateOrderPayment(tx, order, {
      kind: "COLLECTION",
      amount: attempt.amount,
      method: "RAZORPAY",
      reference: "gateway:" + attempt.id,
      evidence: {
        paymentTransactionId: attempt.id,
        providerPaymentId: attempt.providerPaymentId,
      },
    });
    for (const refund of attempt.refunds)
      await allocateOrderPayment(tx, order, {
        kind: "REFUND",
        amount: refund.amount,
        method: refund.method ?? "UNKNOWN",
        reference: "refund:" + refund.id,
        actorId,
        evidence: { refundId: refund.id },
      });
  }
  if (
    !attempts.length &&
    COLLECTED_ORDER_STATUSES.has(order.paymentStatus ?? "")
  ) {
    const entries = await tx.orderPaymentEntry.findMany({
      where: { restaurantId: order.restaurantId, orderId: order.id },
    });
    const remaining = paymentBalance(
      order.totalAmount,
      entries,
    ).outstandingPaise;
    if (!entries.length && remaining)
      await allocateOrderPayment(tx, order, {
        kind: "COLLECTION",
        amount: remaining,
        method: order.paymentMethod ?? "UNKNOWN",
        reference: "settlement:" + order.id,
        actorId,
        evidence: {
          provenance: actorId
            ? "AUTHORIZED_ORDER_SYNC"
            : "EXISTING_ORDER_SETTLEMENT",
        },
      });
  }
  let entries = await tx.orderPaymentEntry.findMany({
    where: { restaurantId: order.restaurantId, orderId: order.id },
    orderBy: { createdAt: "asc" },
  });
  if (!attempts.length) {
    const meta = (order.meta ?? {}) as Record<string, unknown>;
    const balance = paymentBalance(order.totalAmount, entries);
    const refunded = order.status === "REFUNDED" || order.paymentStatus === "REFUNDED";
    const target = typeof meta.refundAmountPaise === "number" && Number.isSafeInteger(meta.refundAmountPaise)
      ? meta.refundAmountPaise : refunded ? balance.collectedPaise : balance.refundedPaise;
    if (target > balance.refundedPaise) {
      await allocateOrderPayment(tx, order, { kind: "REFUND", amount: target - balance.refundedPaise, method: order.paymentMethod ?? "UNKNOWN", reference: "order-refund:" + order.id + ":" + target, actorId, evidence: { provenance: "AUTHORIZED_ORDER_REFUND", refundAmountPaise: target } });
      entries = await tx.orderPaymentEntry.findMany({ where: { restaurantId: order.restaurantId, orderId: order.id }, orderBy: { createdAt: "asc" } });
    }
  }
  const balance = paymentBalance(order.totalAmount, entries);
  await reconcileQrLoyalty(tx, order, balance);
  await reconcileQrDishStock(tx, order);
  return { ...balance, entries };
}

/** Called in the transaction that confirms a gateway outcome or refund. */
export async function syncConfirmedPaymentLedger(
  tx: Tx,
  restaurantId: string,
  paymentId: string,
) {
  const payment = await tx.paymentTransaction.findFirst({
    where: { id: paymentId, restaurantId },
    select: { order: { select: { externalOrderId: true } } },
  });
  if (!payment) return;
  const externalOrderId = payment.order.externalOrderId;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"order:" + restaurantId + ":" + externalOrderId}))`;
  const order = await tx.syncedOrder.findUnique({
    where: { restaurantId_externalOrderId: { restaurantId, externalOrderId } },
  });
  if (order) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"entity:" + restaurantId}))`;
    const balance = await reconcileOrderPayments(tx, order);
    if (order.source === "QR" && balance.refundedPaise > 0) {
      const full = balance.refundedPaise === order.totalAmount;
      const paymentStatus = full ? "REFUNDED" : "PARTIALLY_REFUNDED";
      if (order.paymentStatus !== paymentStatus || (order.meta as any)?.refundAmountPaise !== balance.refundedPaise) {
        const seq = await nextSyncSequence(tx, restaurantId);
        const updated = await tx.syncedOrder.update({ where: { id: order.id }, data: { paymentStatus, ...(full ? { status: "REFUNDED", items: Array.isArray(order.items) ? order.items.map((line:any)=>({...line,kitchenStatus:"CANCELLED",statusRev:(line.statusRev??0)+1})) : [] } : {}), syncVersion: { increment: 1 }, seq, meta: { ...(order.meta as object??{}), refundAmountPaise: balance.refundedPaise, paymentAllocationSummary: { collectedPaise: balance.collectedPaise, outstandingPaise: balance.outstandingPaise } } } });
        await reconcileOrderPayments(tx, updated);
        return updated;
      }
    }
  }
}

/** Acquire before gateway/refund row writes, matching kitchen confirmation lock order. */
export async function lockCanonicalPaymentOrder(tx: Tx, restaurantId: string, paymentId: string) {
  const payment = await tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId }, select: { order: { select: { externalOrderId: true } } } });
  if (payment) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"order:" + restaurantId + ":" + payment.order.externalOrderId}))`;
}
