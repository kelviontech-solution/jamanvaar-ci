/** Monetary allocations stay in integer paise. Refunds are apportioned by item value,
 * with the rounding remainder assigned to the last line. These are net collections,
 * not a claim about profit or the restaurant's cash accounting period. */
export function qrItemPerformance(
  orders: any[],
  entries: any[],
  events: any[],
) {
  const ledger = new Map<string, { collected: number; refunded: number }>();
  for (const e of entries) {
    const balance = ledger.get(e.orderId) ?? { collected: 0, refunded: 0 };
    if (e.kind === "COLLECTION") balance.collected += e.amount;
    else balance.refunded += e.amount;
    ledger.set(e.orderId, balance);
  }
  const items = new Map<string, any>();
  const item = (id: string, name: string, category: string) => {
    if (!items.has(id))
      items.set(id, {
        id,
        name,
        category,
        orderedQuantity: 0,
        orderedValuePaise: 0,
        discountPaise: 0,
        netOrderedValuePaise: 0,
        orderCount: 0,
        collectedPaise: 0,
        refundedPaise: 0,
        views: 0,
        adds: 0,
      });
    return items.get(id);
  };
  for (const o of orders) {
    if (["DRAFT", "CANCELLED", "VOID", "VOIDED"].includes(o.status)) continue;
    const lines = Array.isArray(o.items)
      ? o.items.filter(
          (i: any) =>
            i.kitchenStatus !== "CANCELLED" &&
            i.kdsStatus !== "CANCELLED" &&
            i.quantity > 0,
        )
      : [];
    const value = lines.reduce(
      (n: number, i: any) => n + Number(i.lineTotal || 0),
      0,
    );
    const balance = ledger.get(o.id) ?? {
      collected: [
        "SUCCESS",
        "PAID",
        "PARTIALLY_REFUNDED",
        "REFUND_PENDING",
        "REFUNDED",
      ].includes(o.paymentStatus)
        ? o.totalAmount
        : Number(o.meta?.paymentAllocationSummary?.collectedPaise || 0),
      refunded:
        o.paymentStatus === "REFUNDED"
          ? o.totalAmount
          : Number(o.meta?.refundAmountPaise || 0),
    };
    let collected = balance.collected,
      refunded = balance.refunded,
      discount = Math.min(value, Math.max(0, o.discountAmount || 0));
    const seenItems = new Set<string>();
    lines.forEach((i: any, index: number) => {
      const row = item(
        String(i.menuItemId ?? i.itemId ?? i.name),
        String(i.name),
        String(i.snapshot?.categoryName ?? i.categoryName ?? "Unclassified"),
      );
      row.orderedQuantity += Number(i.quantity);
      row.orderedValuePaise += Number(i.lineTotal || 0);
      if (!seenItems.has(row.id)) {
        row.orderCount++;
        seenItems.add(row.id);
      }
      const d =
        index === lines.length - 1
          ? discount
          : value
            ? Math.floor(
                (Math.min(value, Math.max(0, o.discountAmount || 0)) *
                  i.lineTotal) /
                  value,
              )
            : 0;
      row.discountPaise += d;
      row.netOrderedValuePaise += Number(i.lineTotal || 0) - d;
      discount -= d;
      const c =
        index === lines.length - 1
          ? collected
          : value
            ? Math.floor((balance.collected * i.lineTotal) / value)
            : 0;
      const r =
        index === lines.length - 1
          ? refunded
          : value
            ? Math.floor((balance.refunded * i.lineTotal) / value)
            : 0;
      row.collectedPaise += c;
      row.refundedPaise += r;
      collected -= c;
      refunded -= r;
    });
  }
  for (const e of events) {
    const p = e.metadata ?? {};
    if (!p.itemId) continue;
    const row = item(
      p.itemId,
      p.name ?? "Archived dish",
      p.category ?? "Unclassified",
    );
    if (e.type === "QR_ITEM_VIEWED") row.views++;
    if (e.type === "QR_ITEM_ADDED") row.adds++;
  }
  return [...items.values()]
    .map((i) => ({
      ...i,
      netCollectedPaise: i.collectedPaise - i.refundedPaise,
      costPaise: null,
      profitPaise: null,
    }))
    .sort((a, b) => b.orderedQuantity - a.orderedQuantity);
}
