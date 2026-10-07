import { describe, expect, it, vi } from 'vitest';
import { EBillService } from '../packages/api/src/services/ebill';
import { Order, ReceiptConfig } from '../packages/types/src';

const mockReceiptConfig: ReceiptConfig = {
  restaurantName: 'JAMANVAAR Restaurant',
  address: 'Sindhu Bhavan Road, Bodakdev, Ahmedabad',
  phone: '+91 79 4890 1234',
  gstin: '24AAAAA0000A1Z5',
  fssaiNumber: '10722001000452',
  footerMessage: 'Freshly Prepared • Zero Preservatives',
  thankYouMessage: 'Thank you for dining with us!',
  paperSize: '80mm',
  showCustomerPhone: true,
  showTaxBreakup: true,
  showTokenBig: true,
  enableWhatsApp: true,
  enableSms: true,
  enableEmail: true,
  enableQrReceipt: true
};

const mockOrder: Order = {
  id: 'ord-test-1',
  orderNumber: 'ORD-99',
  tokenNumber: '108',
  restaurantId: 'rest-1',
  outletId: 'out-1',
  kioskId: 'KIOSK-01',
  sessionId: 'sess-1',
  idempotencyKey: 'idemp-1',
  orderType: 'DINE_IN',
  tableNumber: '5',
  items: [
    {
      id: 'oi-1',
      orderId: 'ord-test-1',
      menuItemId: 'item-pt',
      name: 'Paneer Tikka (Tandoori)',
      sku: 'PT',
      quantity: 1,
      unitPrice: 240,
      modifiers: [],
      totalPrice: 240
    }
  ],
  subtotal: 240,
  discountAmount: 0,
  cgstAmount: 6,
  sgstAmount: 6,
  taxAmount: 12,
  serviceChargeAmount: 0,
  tipAmount: 0,
  roundOffAmount: 0,
  totalAmount: 252,
  paymentMethod: 'UPI_QR',
  paymentStatus: 'SUCCESS',
  orderStatus: 'CONFIRMED',
  estimatedWaitMinutes: 15,
  createdAt: '2026-08-25T14:30:00.000Z',
  updatedAt: '2026-08-25T14:30:00.000Z',
  isSynced: true
};

describe('EBillService', () => {
  it('should mask Indian phone numbers for customer privacy', () => {
    expect(EBillService.maskRecipient('9876543210')).toBe('******3210');
    expect(EBillService.maskRecipient('+91 9988776655')).toBe('******6655');
  });

  it('should validate standard 10-digit Indian phone numbers', () => {
    expect(EBillService.validateIndianPhone('9876543210')).toBe(true);
    expect(EBillService.validateIndianPhone('7000000001')).toBe(true);
    expect(EBillService.validateIndianPhone('12345')).toBe(false);
    expect(EBillService.validateIndianPhone('abc')).toBe(false);
  });

  it('should format a professional WhatsApp message template with live tracking', () => {
    const msg = EBillService.formatWhatsAppMessage(mockOrder, mockReceiptConfig);
    expect(msg).toContain('JAMANVAAR — Authentic Indian Cuisine');
    expect(msg).toContain('ORDER #ORD-99');
    expect(msg).toContain('TOKEN #108');
    expect(msg).toContain('Paneer Tikka');
    expect(msg).toContain('https://kiosk.jamanvaar.com/track/ORD-99');
  });

  it('sends a real WhatsApp e-bill when the injected send function succeeds', async () => {
    const sendFn = vi.fn().mockResolvedValue({ success: true, providerMessageId: 'wamid.123' });
    const res = await EBillService.sendWhatsAppEBill(mockOrder, '9876543210', mockReceiptConfig, sendFn);
    expect(res.success).toBe(true);
    expect(res.record.deliveryStatus).toBe('SENT');
    expect(res.record.recipient).toBe('******3210');
    // content is still the human-readable formatted text for the admin's
    // receipt history — it is not the literal WhatsApp template payload sent.
    expect(res.record.content).toContain('ORDER #ORD-99');
    expect(sendFn).toHaveBeenCalledWith('WHATSAPP', '9876543210', ['ORD-99', '108', expect.stringContaining('252')]);
  });

  it('reports a real provider failure for WhatsApp e-bill when the injected send function fails', async () => {
    const sendFn = vi.fn().mockResolvedValue({ success: false, errorMessage: 'Template not approved by Meta' });
    const res = await EBillService.sendWhatsAppEBill(mockOrder, '9876543210', mockReceiptConfig, sendFn);
    expect(res.success).toBe(false);
    expect(res.record.deliveryStatus).toBe('FAILED');
    expect(res.record.errorMessage).toBe('Template not approved by Meta');
  });

  it('reports a connectivity failure for WhatsApp e-bill when the injected send function throws', async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error('Network unreachable'));
    const res = await EBillService.sendWhatsAppEBill(mockOrder, '9876543210', mockReceiptConfig, sendFn);
    expect(res.success).toBe(false);
    expect(res.record.deliveryStatus).toBe('FAILED');
    expect(res.record.errorMessage).toBe('Network unreachable');
  });

  it('sends a real SMS e-bill when the injected send function succeeds', async () => {
    const sendFn = vi.fn().mockResolvedValue({ success: true, providerMessageId: 'msg91-req-1' });
    const res = await EBillService.sendSmsEBill(mockOrder, '9876543210', sendFn);
    expect(res.success).toBe(true);
    expect(res.record.deliveryStatus).toBe('SENT');
    expect(sendFn).toHaveBeenCalledWith('SMS', '9876543210', ['ORD-99', '108', expect.stringContaining('252')]);
  });

  it('reports a real provider failure for SMS e-bill when the injected send function fails', async () => {
    const sendFn = vi.fn().mockResolvedValue({ success: false, errorMessage: 'DLT template mismatch' });
    const res = await EBillService.sendSmsEBill(mockOrder, '9876543210', sendFn);
    expect(res.success).toBe(false);
    expect(res.record.deliveryStatus).toBe('FAILED');
    expect(res.record.errorMessage).toBe('DLT template mismatch');
  });
});

describe('EBillService WhatsApp bill (server-built)', () => {
  it('sanitizePhoneInput keeps digits only, max 10, and drops a pasted +91 prefix', () => {
    expect(EBillService.sanitizePhoneInput('kje5465')).toBe('5465');
    expect(EBillService.sanitizePhoneInput('98a76-54 32 10x')).toBe('9876543210');
    expect(EBillService.sanitizePhoneInput('+91 98765 43210')).toBe('9876543210');
    expect(EBillService.sanitizePhoneInput('98765432109999')).toBe('9876543210');
  });

  it('sends the order id and clean number, and records a SENT bill', async () => {
    const order = { ...mockOrder };
    const sendFn = vi.fn().mockResolvedValue({ success: true });
    const res = await EBillService.sendWhatsAppBill(order, '+91 98765 43210', sendFn);
    expect(sendFn).toHaveBeenCalledWith('ord-test-1', '9876543210');
    expect(res.success).toBe(true);
    expect(res.record.deliveryStatus).toBe('SENT');
    expect(res.record.recipient).toBe('******3210');
    expect(order.eBillStatus).toBe('SENT');
  });

  it('never calls the server for a letters-only or non-mobile number', async () => {
    const sendFn = vi.fn();
    for (const bad of ['kje5465', '12345', '5876543210', '']) {
      const res = await EBillService.sendWhatsAppBill({ ...mockOrder }, bad, sendFn);
      expect(res.success).toBe(false);
    }
    expect(sendFn).not.toHaveBeenCalled();
  });

  it('waits for an order that has not synced yet (404) and then succeeds, without bothering the customer', async () => {
    const notSynced = Object.assign(new Error('Order not found'), { status: 404 });
    const sendFn = vi.fn().mockRejectedValueOnce(notSynced).mockRejectedValueOnce(notSynced).mockResolvedValue({ success: true });
    const res = await EBillService.sendWhatsAppBill({ ...mockOrder }, '9876543210', sendFn, 1);
    expect(sendFn).toHaveBeenCalledTimes(3);
    expect(res.success).toBe(true);
  });

  it('gives up after a few tries if the order never syncs, and does not retry other errors', async () => {
    const notSynced = Object.assign(new Error('Order not found'), { status: 404 });
    const never = vi.fn().mockRejectedValue(notSynced);
    expect((await EBillService.sendWhatsAppBill({ ...mockOrder }, '9876543210', never, 1)).success).toBe(false);
    expect(never).toHaveBeenCalledTimes(4);
    const serverError = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { status: 503 }));
    await EBillService.sendWhatsAppBill({ ...mockOrder }, '9876543210', serverError, 1);
    expect(serverError).toHaveBeenCalledTimes(1);
  });

  it('surfaces the WhatsApp service failure reason, and a thrown network error', async () => {
    const refused = await EBillService.sendWhatsAppBill({ ...mockOrder }, '9876543210', vi.fn().mockResolvedValue({ success: false, errorMessage: 'no template' }));
    expect(refused.success).toBe(false);
    expect(refused.message).toContain('no template');
    const thrown = await EBillService.sendWhatsAppBill({ ...mockOrder }, '9876543210', vi.fn().mockRejectedValue(new Error('offline')));
    expect(thrown.success).toBe(false);
    expect(thrown.record.deliveryStatus).toBe('FAILED');
    expect(thrown.message).toContain('offline');
  });
});
