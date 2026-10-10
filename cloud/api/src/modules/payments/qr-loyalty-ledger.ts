import { Prisma, SyncedOrder } from "@prisma/client";
import {
  CustomerAccount,
  refreshLoyaltyBalance,
} from "../entity-sync/customer-loyalty-merge";

/** Same canonical CRM event ledger as POS. Called under the order and entity locks, only from trusted settlement. */
export async function reconcileQrLoyalty(
  tx: Prisma.TransactionClient,
  order: SyncedOrder,
  balance: {
    collectedPaise: number;
    refundedPaise: number;
    netCollectedPaise: number;
  },
) {
  const meta = (order.meta as Record<string, any>) ?? {};
  if (order.source !== "QR" || typeof meta.verifiedCustomerId !== "string")
    return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"entity:" + order.restaurantId}))`;
  const row = await tx.syncedEntity.findUnique({
    where: {
      restaurantId_entityType_externalId: {
        restaurantId: order.restaurantId,
        entityType: "CUSTOMER",
        externalId: meta.verifiedCustomerId,
      },
    },
  });
  if (!row) return;
  const account = row.payload as unknown as CustomerAccount;
  refreshLoyaltyBalance(account);
  const ledger = account.loyaltyLedger!,
    at = new Date().toISOString();
  let changed = false;
  const earnKey = "earn:" + order.externalOrderId,
    redeemKey = "redeem:" + order.externalOrderId;
  const rate = meta.qrLoyaltyRate;
  const paid =
    balance.collectedPaise === order.totalAmount &&
    !["CANCELLED", "VOID", "VOIDED"].includes(order.status);
  if (paid && rate?.enabled && rate.perRupeesSpent > 0 && !ledger[earnKey]) {
    const points = Math.max(
      0,
      Math.floor(
        Math.floor(order.totalAmount / (rate.perRupeesSpent * 100)) *
          rate.earnPoints *
          (rate.multiplier ?? 1),
      ),
    );
    ledger[earnKey] = { points, spend: order.totalAmount / 100, visits: 1, at };
    account.recentOrderIds = [
      order.externalOrderId,
      ...(account.recentOrderIds ?? []).filter(
        (id) => id !== order.externalOrderId,
      ),
    ].slice(0, 20);
    account.lastVisitAt = at;
    changed = true;
  }
  const original = ledger[earnKey];
  if (original && balance.refundedPaise > 0) {
    const prefix = "qr-refund-earned:" + order.externalOrderId + ":";
    const reversed = Object.entries(ledger)
      .filter(([key]) => key.startsWith(prefix))
      .reduce((n, [, e]) => n - e.points, 0);
    const target = Math.floor(
      original.points *
        Math.min(1, balance.refundedPaise / Math.max(1, order.totalAmount)),
    );
    const previousSpend = Object.entries(ledger)
        .filter(([key]) => key.startsWith(prefix))
        .reduce((n, [, e]) => n - e.spend, 0),
      spendTarget = balance.refundedPaise / 100;
    const key = prefix + balance.refundedPaise;
    if (!ledger[key] && (target > reversed || spendTarget > previousSpend)) {
      ledger[key] = {
        points: -(target - reversed),
        spend: -(spendTarget - previousSpend),
        visits: balance.refundedPaise === order.totalAmount ? -1 : 0,
        at,
      };
      changed = true;
    }
  }
  const redemption = ledger[redeemKey];
  if (
    redemption &&
    (balance.refundedPaise > 0 ||
      ["CANCELLED", "VOID", "VOIDED"].includes(order.status))
  ) {
    const prefix = "qr-refund-redeem:" + order.externalOrderId + ":";
    const returned = Object.entries(ledger)
      .filter(([key]) => key.startsWith(prefix))
      .reduce((n, [, e]) => n + e.points, 0);
    const target = ["CANCELLED", "VOID", "VOIDED", "REFUNDED"].includes(order.status)
      ? -redemption.points
      : Math.floor(
          -redemption.points *
            Math.min(1, balance.refundedPaise / Math.max(1, order.totalAmount)),
        );
    if (target > returned) {
      ledger[prefix + target] = {
        points: target - returned,
        spend: 0,
        visits: 0,
        at,
      };
      changed = true;
    }
  }
  if (changed) {
    refreshLoyaltyBalance(account);
    account.updatedAt = at;
    await tx.syncedEntity.update({
      where: { id: row.id },
      data: {
        payload: account as unknown as Prisma.InputJsonValue,
        syncVersion: { increment: 1 },
      },
    });
  }
}
