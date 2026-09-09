import { describe, expect, it } from 'vitest';
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

  it('reports an honest failure for WhatsApp e-bill since no real gateway is configured, instead of a fabricated SENT status', async () => {
    const res = await EBillService.sendWhatsAppEBill(mockOrder, '9876543210', mockReceiptConfig);
    expect(res.success).toBe(false);
    expect(res.record.deliveryStatus).toBe('FAILED');
    expect(res.record.recipient).toBe('******3210');
    expect(res.record.errorMessage).toMatch(/gateway/i);
    // The message content is still built for real, ready for a future
    // gateway integration — only the "was it actually delivered" claim changed.
    expect(res.record.content).toContain('ORDER #ORD-99');
  });

  it('reports an honest failure for SMS e-bill since no real gateway is configured, instead of a fabricated SENT status', async () => {
    const res = await EBillService.sendSmsEBill(mockOrder, '9876543210');
    expect(res.success).toBe(false);
    expect(res.record.deliveryStatus).toBe('FAILED');
    expect(res.record.errorMessage).toMatch(/gateway/i);
  });
});
