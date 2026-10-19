import { AuditRepository, CouponRepository, CustomerRepository, db, financialRequestFingerprint,
  KOTRepository, OrderRepository, ReceiptRepository } from '@jamanvaar/database';
import { PrinterService } from '@jamanvaar/api';
import type { Order } from '@jamanvaar/types';
import { clampItemQuantity, resolveModifierGroups, validateModifiers } from '@jamanvaar/business';

export async function commitKioskDraft(request: Partial<Order>) {
  request = structuredClone(request);
  // IDs/tokens are allocated only inside preparation. The command retains them
  // through an unknown outcome; a new attempt must not invent another order.
  const { sessionId: _sessionId, idempotencyKey: _key, tokenNumber: _token, ...businessRequest } = request;
  const fingerprint = await financialRequestFingerprint(JSON.stringify({ operation: 'KIOSK_DRAFT_V1',
    restaurant: db.restaurant.id, branch: db.outlet.id,
    request: { ...businessRequest, items: request.items?.map(({ id: _id, orderId: _orderId, ...line }) => line) } }));
  return db.commitFinancialMutation(fingerprint, () => {
    if (!request.items?.length) throw new Error('Add at least one dish before continuing.');
    for (const line of request.items) {
      const item = db.menuItems.find(item => item.id === line.menuItemId);
      if (!item || !item.isAvailable || !Number.isInteger(line.quantity) || clampItemQuantity(item, line.quantity) !== line.quantity) throw new Error(`Review availability and quantity for ${line.name}.`);
      const choices = validateModifiers(resolveModifierGroups(item, db.modifierGroups), line.modifiers || []);
      if (!choices.isValid) throw new Error(`${line.name}: ${choices.errors.join(' ')}`);
    }
    const order = OrderRepository.createOrder({ ...request, tokenNumber: OrderRepository.nextTokenNumber('K'),
      source_type: 'KIOSK', paymentStatus: 'PENDING', orderStatus: 'DRAFT' });
    return { orderId: order.id };
  });
}

/** Persist the gateway-priced quote before displaying a payable QR. This does not verify payment. */
export async function commitKioskQuote(orderId: string, paymentId: string, changes: Partial<Order>) {
  const frozen = structuredClone(changes);
  const fingerprint = await financialRequestFingerprint(JSON.stringify({ operation: 'KIOSK_QUOTE_V1', restaurant: db.restaurant.id,
    branch: db.outlet.id, orderId, paymentId, quote: frozen }));
  return db.commitFinancialMutation(fingerprint, () => {
    const current = OrderRepository.getOrderById(orderId);
    if (!current || current.source_type !== 'KIOSK' || current.paymentStatus !== 'PENDING' || current.orderStatus !== 'DRAFT') throw new Error('This checkout has changed. Check its original payment status before paying.');
    if (!paymentId.trim()) throw new Error('The payment reference is missing. Do not display or pay this quote.');
    for (const field of ['subtotal', 'taxAmount', 'cgstAmount', 'sgstAmount', 'totalAmount', 'discountAmount'] as const) {
      if (frozen[field] !== undefined && (!Number.isFinite(frozen[field]) || frozen[field]! < 0)) throw new Error('The payment quote contains an invalid amount. Ask the counter to review it.');
    }
    if (frozen.items && (frozen.items.length !== current.items.length || frozen.items.some((line, index) => {
      const original = current.items[index];
      return line.id !== original.id || line.menuItemId !== original.menuItemId || line.quantity !== original.quantity
        || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isFinite(line.totalPrice) || line.totalPrice < 0;
    }))) throw new Error('The payment quote no longer matches this cart. Review it before paying.');
    // A quote is pricing evidence only; it cannot change ownership or promote payment/fulfilment.
    if (frozen.roundOffAmount !== undefined && !Number.isFinite(frozen.roundOffAmount)) throw new Error('The payment quote contains an invalid round-off.');
    const allowed = ['subtotal', 'taxAmount', 'cgstAmount', 'sgstAmount', 'totalAmount', 'discountAmount', 'couponCode', 'roundOffAmount', 'items', 'loyaltyRedemption'] as const;
    // Omitted fields retain their saved values; explicitly clearing a coupon or
    // reservation remains possible when the server quote does not include it.
    const patch = Object.fromEntries(allowed.filter(field => Object.hasOwn(frozen, field)).map(field => [field, frozen[field]]));
    OrderRepository.updateOrder(orderId, patch);
    return { orderId, paymentId };
  });
}

/** The payment ID is supplied only after the existing server status endpoint confirms SUCCESS. */
export async function commitKioskAdmission(orderId: string, verifiedPaymentId?: string) {
  const fingerprint = await financialRequestFingerprint(JSON.stringify({ operation: 'KIOSK_ADMISSION_V1',
    restaurant: db.restaurant.id, branch: db.outlet.id, orderId, verifiedPaymentId: verifiedPaymentId || null }));
  return db.commitFinancialMutation(fingerprint, () => {
    let order = OrderRepository.getOrderById(orderId);
    if (!order || order.source_type !== 'KIOSK') throw new Error('The original kiosk order is unavailable. Keep its payment reference and ask the counter for help.');
    if (['CANCELLED', 'REFUNDED'].includes(order.orderStatus) || ['CANCELLED', 'REFUNDED'].includes(order.paymentStatus)) throw new Error('This order was closed. A later payment needs counter reconciliation; do not place or collect it again.');
    const existing = KOTRepository.getKOTsForOrder(orderId);
    if (verifiedPaymentId) {
      if (order.paymentStatus === 'SUCCESS' && order.paymentTransactionId && order.paymentTransactionId !== verifiedPaymentId) throw new Error('This order already has another collection reference. Ask the counter to reconcile it.');
      if (order.paymentStatus !== 'SUCCESS') order = OrderRepository.updateOrder(orderId, {
        paymentMethod: 'UPI', paymentStatus: 'SUCCESS', paymentTransactionId: verifiedPaymentId,
        orderStatus: existing.length ? order.orderStatus : 'CONFIRMED'
      })!;
    } else {
      if (order.paymentStatus !== 'PENDING' || !['DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'].includes(order.orderStatus)) throw new Error('This order has a payment in progress or a completed collection. Ask the counter to check it.');
      if (!existing.length) {
        OrderRepository.choosePaymentMethod(orderId, 'CASH_AT_COUNTER');
        order = OrderRepository.updateOrder(orderId, { orderStatus: 'CONFIRMED' })!;
      }
    }
    const firstAdmission = existing.length === 0;
    let kots = existing;
    if (firstAdmission) {
      // A prepaid guest spends points before earning on this bill, using the
      // saved customer's identity rather than whoever is now at this terminal.
      if (order.paymentStatus === 'SUCCESS' && !order.serverQrLoyalty) {
        if (order.loyaltyRedemption) CustomerRepository.commitOrderRedemption(order);
        if (order.customerPhone && order.loyaltyPointsEarned === undefined) {
          CustomerRepository.getOrCreateAccount(order.customerPhone, order.customerName);
          order.loyaltyPointsEarned = CustomerRepository.earnPointsForOrder(order.customerPhone, order.totalAmount, order.id);
        }
      }
      if (order.couponCode && order.discountAmount > 0) CouponRepository.incrementUsage(order.couponCode);
      const label = String(order.orderNumber || order.tokenNumber || order.id).replace(/[^A-Za-z0-9-]/g, '');
      kots = KOTRepository.generateKOT({ orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber,
        tableNumber: order.tableNumber, orderType: order.orderType, cashierName: 'Kiosk Self-Order',
        idBase: `kot-${order.id}-r1`, numberBase: `KOT-${label}`,
        items: order.items.map(line => ({ id: `koti-${line.id}`, orderItemId: line.id, menuItemId: line.menuItemId,
          name: line.name, quantity: line.quantity, modifiers: line.modifiers, specialInstructions: line.specialInstructions,
          kitchenStation: db.menuItems.find(item => item.id === line.menuItemId)?.kitchenStation || 'Main Kitchen', status: 'PREPARING' as const })) });
      AuditRepository.log({ kioskId: order.kioskId, action: 'ORDER_PLACED', category: 'ORDER',
        details: `Customer submitted Order ${order.orderNumber} (Token #${order.tokenNumber}, Total ${order.totalAmount}, ${verifiedPaymentId ? 'SERVER_PAYMENT_CONFIRMED' : 'PAY_AT_COUNTER'})` });
    }
    const receiptId = `kiosk-admission-receipt-${order.id}`;
    if (!db.receiptRecords.some(record => record.id === receiptId)) ReceiptRepository.addRecord({
      id: receiptId, orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber,
      deliveryMethod: 'PRINT', deliveryStatus: 'QUEUED', recipient: order.customerPhone || 'Kiosk guest',
      paperSize: ReceiptRepository.getConfig().paperSize, content: PrinterService.generateReceiptText(order), createdAt: new Date().toISOString()
    });
    db.notify();
    return { orderId: order.id, kotIds: kots.map(kot => kot.id), receiptId, firstAdmission };
  });
}
