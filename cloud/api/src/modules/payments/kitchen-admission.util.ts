interface PaidLine { externalItemId?: string; quantity?: number; unitPrice?: number; modifiers?: Array<{ id: string }> }
interface KitchenLine { menuItemId?: string; quantity?: number; unitPrice?: number; modifiers?: string[]; modifierDetails?: Array<{ optionId?: string }> }

/** Compare the paid basket with durable kitchen lines, allowing quantity splits while preserving option identity. */
export function kitchenMatchesPaidBasket(paid: PaidLine[], kitchen: KitchenLine[]): boolean {
  const expected = new Map<string, number>();
  const actual = new Map<string, number>();
  const add = (map: Map<string, number>, id: string | undefined, price: number | undefined, qty: number | undefined, options: Array<string | undefined>) => {
    if (!id || !Number.isInteger(price) || !Number.isInteger(qty) || (qty ?? 0) <= 0 || options.some(option => !option)) return false;
    const key = JSON.stringify([id, price, [...options].sort()]);
    map.set(key, (map.get(key) ?? 0) + qty!);
    return true;
  };
  if (!paid.length || !kitchen.length) return false;
  for (const line of paid) if (!add(expected, line.externalItemId, line.unitPrice, line.quantity, (line.modifiers ?? []).map(option => option.id))) return false;
  for (const line of kitchen) {
    const options = (line.modifierDetails ?? []).map(option => option.optionId);
    if ((line.modifiers?.length ?? 0) > options.length) return false;
    if (!add(actual, line.menuItemId, line.unitPrice, line.quantity, options)) return false;
  }
  return expected.size === actual.size && [...expected].every(([key, qty]) => actual.get(key) === qty);
}
