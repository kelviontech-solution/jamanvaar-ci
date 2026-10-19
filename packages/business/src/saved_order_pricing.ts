import type { CartItem, MenuItem, Order, TaxGroup } from '@jamanvaar/types';
import { calculateRoundOff, roundToTwoDecimals } from '@jamanvaar/utils';
import { calculateCart } from './pricing';

/** Reprice accepted, unpaid lines without replacing their saved unit prices with today's menu prices. */
export function priceSavedUnpaidOrder(order: Order, menuItems: MenuItem[], taxGroups: TaxGroup[]) {
  if (['SUCCESS', 'PAID', 'REFUNDED', 'REFUND_PENDING', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)
      || order.orderStatus === 'REFUNDED'
      || (order.paymentAllocationSummary?.collectedPaise ?? 0) > 0) throw new Error('Review collected payments before changing this bill.');
  const savedTaxGroups: TaxGroup[] = [];
  const lines: CartItem[] = order.items.filter(line => line.kitchenStatus !== 'CANCELLED').map(line => {
    const dish = menuItems.find(dish => dish.id === line.menuItemId);
    let taxGroupId = dish?.taxGroupId;
    if (line.snapshot && typeof line.snapshot.taxRateBp === 'number') {
      taxGroupId = `saved-line:${line.id}`;
      const originalGroup = taxGroups.find(group => group.id === line.snapshot!.taxGroupId);
      const originalRate = (originalGroup?.cgstPercent ?? 0) + (originalGroup?.sgstPercent ?? 0);
      const rate = line.snapshot.taxRateBp / 100;
      const cgst = originalRate > 0 ? rate * originalGroup!.cgstPercent / originalRate : rate / 2;
      savedTaxGroups.push({ id: taxGroupId, name: 'Accepted tax rate', cgstPercent: cgst,
        sgstPercent: rate - cgst, igstPercent: rate, isInclusive: line.snapshot.taxInclusive ?? originalGroup?.isInclusive ?? false, isActive: true });
    }
    const modifiers = line.modifiers ?? [];
    return { cartItemId: line.id, orderItemId: line.id, menuItemId: line.menuItemId,
      item: { ...dish, id: line.menuItemId, name: line.name, sku: line.sku, taxGroupId,
        price: roundToTwoDecimals(line.unitPrice - modifiers.reduce((sum, modifier) => sum + (modifier.priceDelta ?? 0), 0)) } as MenuItem,
      quantity: line.quantity, unitPrice: line.unitPrice, itemTotal: line.totalPrice, selectedModifiers: modifiers,
      itemDiscountPercent: line.itemDiscountPercent, itemDiscountAmount: line.itemDiscountAmount, taxSnapshot: line.snapshot };
  });
  const type = order.discountType || (order.discountAmount > 0 ? 'FIXED' : 'NONE');
  const cart = calculateCart({ items: lines, taxGroups: [...savedTaxGroups, ...taxGroups],
    discountType: type === 'COUPON' ? 'FIXED' : type,
    discountValue: type === 'COUPON' ? order.discountAmount : order.discountValue ?? order.discountAmount ?? 0,
    discountScope: order.discountScope ?? 'BILL', discountReason: order.discountReason, discountCode: order.discountCode,
    tipAmount: lines.length ? order.tipAmount ?? 0 : 0, roundToRupee: false });
  // The record contains a fixed charge, not its original percentage. Keep that
  // accepted charge; do not substitute the current restaurant-wide setting.
  const serviceChargeAmount = lines.length ? order.serviceChargeAmount ?? 0 : 0;
  const { roundedTotal, roundOff } = calculateRoundOff(cart.totalPayable + serviceChargeAmount);
  const pricedLines = new Map(cart.items.map(line => [line.orderItemId, line]));
  return { subtotal: cart.subtotal, discountAmount: cart.discountAmount, cgstAmount: cart.cgstAmount,
    sgstAmount: cart.sgstAmount, taxAmount: cart.taxAmount, totalAmount: roundedTotal, roundOffAmount: roundOff,
    serviceChargeAmount, tipAmount: cart.tipAmount,
    items: order.items.map(line => {
      const priced = pricedLines.get(line.id);
      return priced?.taxSnapshot ? { ...line, snapshot: { ...priced.taxSnapshot,
        taxGroupId: line.snapshot?.taxGroupId ?? menuItems.find(item => item.id === line.menuItemId)?.taxGroupId } } : line;
    }) };
}
