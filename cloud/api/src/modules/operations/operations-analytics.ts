export interface PrepOrder {
  createdAt: Date;
  status: string;
  items: unknown;
}
type Entity = { externalId: string; entityType: string; payload: unknown };
const object = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

/** Current recipe cost is an estimate, never represented as historical net profit. */
export function dishMargins(
  rows: Entity[],
  orders: { items: unknown; totalAmount: number; discountAmount: number; status: string }[],
) {
  const stocks = new Map(
    rows.filter((r) => r.entityType === 'INVENTORY_ITEM').map((r) => [r.externalId, object(r.payload)]),
  );
  const recipes = rows.filter((r) => r.entityType === 'RECIPE').map((r) => object(r.payload));
  return rows
    .filter((r) => r.entityType === 'MENU_ITEM')
    .map((row) => {
      const item = object(row.payload),
        recipe = recipes.find((r) => r.menuItemId === row.externalId && r.isActive !== false),
        ingredients = recipe?.ingredients as any[] | undefined;
      let cost = 0,
        missing = 0;
      for (const ingredient of ingredients ?? []) {
        const stock = stocks.get(ingredient.inventoryItemId ?? ingredient.itemId),
          unitCost = stock?.costPerUnit ?? stock?.costPrice ?? stock?.unitCost;
        const qty = ingredient.quantityPerPortion;
        if (
          typeof unitCost !== 'number' ||
          !Number.isFinite(unitCost) ||
          unitCost < 0 ||
          typeof qty !== 'number' ||
          !Number.isFinite(qty) ||
          qty < 0
        )
          missing++;
        else cost += unitCost * qty;
      }
      let units = 0,
        netSalesPaise = 0;
      for (const order of orders) {
        if (['CANCELLED', 'VOID', 'DRAFT', 'REFUNDED'].includes(order.status)) continue;
        for (const raw of Array.isArray(order.items) ? order.items : []) {
          const line = object(raw);
          if (
            (line.menuItemId ?? line.externalItemId) !== row.externalId ||
            line.kitchenStatus === 'CANCELLED'
          )
            continue;
          const quantity = Number(line.quantity) || 0;
          const gross = Number(line.lineTotal ?? line.totalPrice) || 0;
          const denominator = order.totalAmount + order.discountAmount;
          units += quantity;
          netSalesPaise += Math.round(gross * (denominator ? order.totalAmount / denominator : 1));
        }
      }
      const complete = !!ingredients?.length && missing === 0,
        price = typeof item.price === 'number' ? item.price : null;
      return {
        id: row.externalId,
        name: item.name ?? 'Unnamed dish',
        price,
        estimatedFoodCost: complete ? Math.round(cost * 100) / 100 : null,
        estimatedFoodMargin: complete && price !== null ? Math.round((price - cost) * 100) / 100 : null,
        marginPercent: complete && price ? Math.round(((price - cost) / price) * 1000) / 10 : null,
        units,
        allocatedSales: netSalesPaise / 100,
        missingCosts: missing,
        hasRecipe: !!ingredients?.length,
      };
    });
}
export function prepPlan(orders: PrepOrder[], timezone: string, days: number, bufferPercent: number) {
  const hourFormat = new Intl.DateTimeFormat('en', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }),
    totals = new Map<string, { id: string; name: string; units: number; byHour: Record<string, number> }>();
  for (const order of orders) {
    if (['CANCELLED', 'VOID', 'DRAFT', 'REFUNDED'].includes(order.status)) continue;
    const hour = hourFormat.format(order.createdAt);
    for (const raw of Array.isArray(order.items) ? order.items : []) {
      const line = object(raw),
        id = String(line.menuItemId ?? line.externalItemId ?? line.name ?? '');
      if (!id || line.kitchenStatus === 'CANCELLED') continue;
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const row = totals.get(id) ?? { id, name: String(line.name ?? id), units: 0, byHour: {} };
      row.units += quantity;
      row.byHour[hour] = (row.byHour[hour] ?? 0) + quantity;
      totals.set(id, row);
    }
  }
  return [...totals.values()]
    .map((row) => ({
      ...row,
      averageDaily: Math.round((row.units / days) * 10) / 10,
      suggestedPortions: Math.ceil((row.units / days) * (1 + bufferPercent / 100)),
      peakHour: Object.entries(row.byHour).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    }))
    .sort((a, b) => b.units - a.units);
}
