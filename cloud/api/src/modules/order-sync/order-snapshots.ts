import type { Prisma } from '@prisma/client';

type Line = Record<string, any>;
const object = (v: unknown): Line => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Line) : {});
const key = (line: Line) => String(line.id ?? line.externalItemId ?? line.menuItemId ?? '');
/** Only the server can freeze costs/declarations. A client cannot replace an existing snapshot. */
export async function snapshotOrderLines(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  incoming: unknown[],
  previous: unknown = [],
  menuVersion?: number | null
) {
  const rows = await tx.syncedEntity.findMany({
    where: { restaurantId, entityType: { in: ['MENU_ITEM', 'RECIPE', 'INVENTORY_ITEM'] } },
    select: { externalId: true, entityType: true, payload: true }
  });
  const menu = new Map(rows.filter((r) => r.entityType === 'MENU_ITEM').map((r) => [r.externalId, object(r.payload)]));
  if (menuVersion) {
    const published = await tx.menuSnapshot.findUnique({ where: { restaurantId_version: { restaurantId, version: menuVersion } } });
    const items = object(published?.content).items;
    if (Array.isArray(items)) {
      menu.clear();
      for (const item of items) menu.set(item.id, item);
    }
  }
  const stocks = new Map(rows.filter((r) => r.entityType === 'INVENTORY_ITEM').map((r) => [r.externalId, object(r.payload)]));
  const recipes = rows.filter((r) => r.entityType === 'RECIPE').map((r) => object(r.payload));
  const prior = new Map(
    (Array.isArray(previous) ? previous : []).map((raw) => {
      const line = object(raw);
      return [key(line), line];
    })
  );
  return incoming.map((raw) => {
    const line = object(raw),
      old = prior.get(key(line)),
      declaredId = String(line.menuItemId ?? line.externalItemId ?? ''),
      itemId = menu.has(declaredId) ? declaredId : declaredId.split(':')[0],
      dish = menu.get(itemId);
    const recipe = recipes.find((r) => r.menuItemId === itemId && r.isActive !== false),
      ingredients: Array<Line> = recipe?.ingredients ?? [];
    let complete = ingredients.length > 0,
      unitCostPaise = 0;
    const costs = ingredients.map((i) => {
      const stock = stocks.get(String(i.inventoryItemId ?? i.itemId)),
        cost = stock?.costPerUnit ?? stock?.costPrice ?? stock?.unitCost,
        qty = i.quantityPerPortion;
      const valid =
        typeof cost === 'number' &&
        Number.isFinite(cost) &&
        cost >= 0 &&
        typeof qty === 'number' &&
        Number.isFinite(qty) &&
        qty >= 0 &&
        (!i.unit || !stock?.unit || i.unit === stock.unit);
      if (!valid) complete = false;
      const allocated = valid ? Math.round(cost * qty * 100) : null;
      if (allocated !== null) unitCostPaise += allocated;
      return {
        inventoryItemId: String(i.inventoryItemId ?? i.itemId ?? ''),
        name: typeof stock?.name === 'string' ? stock.name : null,
        quantity: qty ?? null,
        unit: i.unit ?? stock?.unit ?? null,
        unitCostPaise: typeof cost === 'number' ? Math.round(cost * 100) : null,
        allocatedCostPaise: allocated
      };
    });
    const allergens =
      old?.declaredAllergens ?? (Array.isArray(dish?.allergens) ? dish.allergens.filter((v: unknown) => typeof v === 'string').slice(0, 30) : []);
    const declaration = `Declared allergens: ${allergens.join(', ')}`;
    return {
      ...line,
      declaredAllergens: allergens,
      foodCostSnapshot: old?.foodCostSnapshot ?? {
        capturedAt: new Date().toISOString(),
        basis: 'SERVER_FIRST_OBSERVED',
        complete,
        unitCostPaise: complete ? unitCostPaise : null,
        ingredients: costs
      },
      ...(allergens.length
        ? {
            specialInstructions: [line.specialInstructions, String(line.specialInstructions ?? '').includes(declaration) ? null : declaration]
              .filter(Boolean)
              .filter((v, i, a) => a.indexOf(v) === i)
              .join(' · ')
          }
        : {})
    };
  });
}
