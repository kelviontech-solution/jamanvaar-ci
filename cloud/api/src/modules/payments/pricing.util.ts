export interface ModifierOptionSnapshot {
  id: string;
  name: string;
  priceDelta: number; // paise
  /** Set when the option is resolved for a dish, so an order can record which group it was chosen from. */
  groupId?: string;
  groupName?: string;
}

export interface ModifierGroupSnapshot {
  id: string;
  name: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOptionSnapshot[];
}

export interface MenuSnapshotItemLookup {
  externalItemId: string;
  name: string;
  basePrice: number; // paise
  taxRate: number; // basis points, e.g. 500 = 5.00%
  /** True when the listed price already contains the tax (the tax is then extracted, not added). */
  taxInclusive?: boolean;
  taxGroupId?: string;
  isAvailable: boolean;
  modifierGroups: ModifierGroupSnapshot[];
  /** Restaurant-set ordering rules, when the menu source has them (QR menu). */
  minQuantity?: number;
  maxQuantity?: number;
  allowInstructions?: boolean;
}

export interface CartLineInput {
  externalItemId: string;
  quantity: number;
  selectedOptionIds: string[];
}

export interface PricedLine {
  externalItemId: string;
  name: string;
  quantity: number;
  /** The dish's own price before options, paise. */
  basePrice: number;
  taxRate: number; // basis points
  taxInclusive: boolean;
  taxGroupId?: string;
  unitPrice: number; // paise, including the chosen options
  lineSubtotal: number; // paise
  lineTax: number; // paise
  lineTotal: number; // paise
  modifiers: ModifierOptionSnapshot[];
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

export class PriceValidationError extends Error {}

/**
 * Backend-computed cart total, ported from packages/business/src/pricing.ts's
 * unit-price/modifier logic but in integer paise (that package is float
 * decimal-rupee, the wrong unit for the paise convention used throughout
 * cloud Postgres, and cloud/api has no existing workspace dependency on
 * packages/business to build one on).
 */
export function priceCart(cartLines: CartLineInput[], menuItems: Map<string, MenuSnapshotItemLookup>): PricedCart {
  if (cartLines.length === 0) {
    throw new PriceValidationError('Cart must contain at least one item');
  }

  const lines: PricedLine[] = cartLines.map((line) => {
    if (line.quantity < 1) {
      throw new PriceValidationError(`Invalid quantity for item ${line.externalItemId}`);
    }
    const menuItem = menuItems.get(line.externalItemId);
    if (!menuItem) {
      throw new PriceValidationError(`Unknown menu item: ${line.externalItemId}`);
    }
    if (!menuItem.isAvailable) {
      throw new PriceValidationError(`Item is not available: ${menuItem.name}`);
    }
    if (menuItem.minQuantity && line.quantity < menuItem.minQuantity) throw new PriceValidationError(`${menuItem.name} must be ordered in a quantity of at least ${menuItem.minQuantity}`);
    if (menuItem.maxQuantity && line.quantity > menuItem.maxQuantity) throw new PriceValidationError(`${menuItem.name} can be ordered in a quantity of at most ${menuItem.maxQuantity}`);


    const selectedOptions = resolveSelectedOptions(menuItem, line.selectedOptionIds);
    const modifierSum = selectedOptions.reduce((sum, opt) => sum + opt.priceDelta, 0);
    const unitPrice = menuItem.basePrice + modifierSum;
    const lineSubtotal = unitPrice * line.quantity;
    // Tax-inclusive prices already contain the tax: it is extracted for the invoice, not added on top.
    const lineTax = menuItem.taxInclusive
      ? Math.round((lineSubtotal * menuItem.taxRate) / (10000 + menuItem.taxRate))
      : Math.round((lineSubtotal * menuItem.taxRate) / 10000);
    const lineTotal = menuItem.taxInclusive ? lineSubtotal : lineSubtotal + lineTax;

    return {
      externalItemId: line.externalItemId,
      name: menuItem.name,
      quantity: line.quantity,
      basePrice: menuItem.basePrice,
      taxRate: menuItem.taxRate,
      taxInclusive: menuItem.taxInclusive === true,
      taxGroupId: menuItem.taxGroupId,
      unitPrice,
      lineSubtotal,
      lineTax,
      lineTotal,
      modifiers: selectedOptions
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
  const taxAmount = lines.reduce((sum, l) => sum + l.lineTax, 0);
  const totalAmount = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return { lines, subtotal, taxAmount, totalAmount };
}

function resolveSelectedOptions(menuItem: MenuSnapshotItemLookup, selectedOptionIds: string[]): ModifierOptionSnapshot[] {
  const resolved: ModifierOptionSnapshot[] = [];

  for (const group of menuItem.modifierGroups) {
    const selectedInGroup = group.options.filter((opt) => selectedOptionIds.includes(opt.id));
    if (group.isRequired && selectedInGroup.length === 0) {
      throw new PriceValidationError(`'${group.name}' requires a selection for ${menuItem.name}`);
    }
    if (group.minSelections > 0 && selectedInGroup.length < group.minSelections) {
      throw new PriceValidationError(`'${group.name}' requires at least ${group.minSelections} selection(s) for ${menuItem.name}`);
    }
    if (group.maxSelections > 0 && selectedInGroup.length > group.maxSelections) {
      throw new PriceValidationError(`'${group.name}' allows at most ${group.maxSelections} selection(s) for ${menuItem.name}`);
    }
    resolved.push(...selectedInGroup.map((o) => ({ ...o, groupId: group.id, groupName: group.name })));
  }

  const knownOptionIds = new Set(menuItem.modifierGroups.flatMap((g) => g.options.map((o) => o.id)));
  for (const id of selectedOptionIds) {
    if (!knownOptionIds.has(id)) {
      throw new PriceValidationError(`Unknown modifier option '${id}' for ${menuItem.name}`);
    }
  }

  return resolved;
}
