import { Order, ReceiptConfig, ReceiptDeliveryMethod, ReceiptDeliveryStatus, ReceiptRecord } from '@jamanvaar/types';
import { db } from '@jamanvaar/database';
import { formatDate, formatINR, formatTime, restaurantGstRate, taxLabels } from '@jamanvaar/utils';

export type SendReceiptFn = (
  channel: 'WHATSAPP' | 'SMS',
  phoneNumber: string,
  templateParams: string[]
) => Promise<{ success: boolean; providerMessageId?: string; errorMessage?: string }>;

/**
 * A fresh order's cloud copy can still be a few seconds behind its printed receipt (the push happens in the
 * background, after the receipt already printed) — the server's own "Order not found" message says so
 * explicitly (see cloud/api's ReceiptEmailService.sendBillEmail). A caller should retry through that window
 * rather than failing the guest's first tap; any other failure (bad email, no payment, email not configured)
 * is real and should not be retried.
 */
export function isOrderStillSyncingMessage(message: string): boolean {
  return /wait a few seconds|sync and try again/i.test(message);
}

export class EBillService {
  /**
   * Mask sensitive phone numbers for customer privacy (e.g. +91 9876543210 -> ******3210)
   */
  public static maskRecipient(recipient: string): string {
    if (!recipient) return '';
    const clean = recipient.replace(/\D/g, '');
    if (clean.length >= 4) {
      return `******${clean.slice(-4)}`;
    }
    return recipient;
  }

  /**
   * Validate standard 10-digit Indian mobile number
   */
  public static validateIndianPhone(phone: string): boolean {
    const clean = phone.replace(/\D/g, '');
    // Support 10-digit or 91 + 10-digit
    if (clean.length === 10) return /^[6-9]\d{9}$/.test(clean);
    if (clean.length === 12 && clean.startsWith('91')) return /^[6-9]\d{9}$/.test(clean.slice(2));
    return false;
  }

  /** A simple, permissive check — the server validates for real before sending anything. */
  public static validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  /** Mask an email for display, e.g. priya.sharma@gmail.com -> p***a@gmail.com */
  public static maskEmail(email: string): string {
    const [local, domain] = email.trim().split('@');
    if (!local || !domain) return email;
    const masked = local.length <= 2 ? `${local[0]}***` : `${local[0]}***${local[local.length - 1]}`;
    return `${masked}@${domain}`;
  }

  /**
   * Build professional WhatsApp receipt text template
   */
  public static formatWhatsAppMessage(order: Order, config: ReceiptConfig): string {
    const itemsList = order.items
      .map((it) => `• ${it.quantity}x ${it.name} — ${formatINR(it.totalPrice)}`)
      .join('\n');

    return (
      `🍽️ *JAMANVAAR — Authentic Indian Cuisine*\n` +
      `*${config.restaurantName.toUpperCase()}*\n` +
      `${config.address}\n` +
      `GSTIN: ${config.gstin} | FSSAI: ${config.fssaiNumber}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `*ORDER #${order.orderNumber}* • *TOKEN #${order.tokenNumber}*\n` +
      `Date: ${formatDate(order.createdAt)} at ${formatTime(order.createdAt)}\n` +
      `Type: ${order.orderType}${order.tableNumber ? ` (Table ${order.tableNumber})` : ''}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*ITEMS ORDERED:*\n` +
      `${itemsList}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Subtotal: ${formatINR(order.subtotal)}\n` +
      (order.discountAmount > 0 ? `Discount: -${formatINR(order.discountAmount)}\n` : '') +
      `${taxLabels(restaurantGstRate(db.taxGroups)).cgst}: ${formatINR(order.cgstAmount)}\n` +
      `${taxLabels(restaurantGstRate(db.taxGroups)).sgst}: ${formatINR(order.sgstAmount)}\n` +
      `*TOTAL PAYABLE: ${formatINR(order.totalAmount)}*\n` +
      `Payment: ${order.paymentMethod} (${order.paymentStatus})\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⏳ *Estimated Prep Time:* ${order.estimatedWaitMinutes} Minutes\n` +
      `📍 *Pickup Counter:* ${order.pickupCounter || 'Counter 1'}\n\n` +
      `🔗 *Track Your Live Order:* https://kiosk.jamanvaar.com/track/${order.orderNumber}\n\n` +
      `${config.thankYouMessage}\n` +
      `_Powered by JAMANVAAR Kiosk Systems_`
    );
  }

  /**
   * Send WhatsApp e-bill. `sendFn` is the app-specific device-authed call to
   * cloud/api's POST /api/v1/receipts/send — packages/api has no fetch/API
   * base URL of its own, so the actual network call is always injected by
   * the calling Tauri app's own cloudClient.ts.
   */
  public static async sendWhatsAppEBill(
    order: Order,
    phoneNumber: string,
    config: ReceiptConfig,
    sendFn: SendReceiptFn
  ): Promise<{ success: boolean; record: ReceiptRecord; message: string }> {
    const isVal = this.validateIndianPhone(phoneNumber);
    if (!isVal) {
      return {
        success: false,
        record: {
          id: `rec-err-${Date.now()}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          tokenNumber: order.tokenNumber,
          deliveryMethod: 'WHATSAPP',
          deliveryStatus: 'FAILED',
          recipient: phoneNumber,
          content: '',
          createdAt: new Date().toISOString(),
          errorMessage: 'Invalid 10-digit Indian phone number'
        },
        message: 'Invalid 10-digit Indian phone number'
      };
    }

    // content is the human-readable audit copy shown in receipt history —
    // NOT the literal wire payload. The real WhatsApp send is a pre-approved
    // template (see templateParams below); free text cannot be sent to a
    // customer who hasn't messaged the business first.
    const messageContent = this.formatWhatsAppMessage(order, config);
    const masked = this.maskRecipient(phoneNumber);
    // Fixed external contract: the restaurant's approved WhatsApp template
    // must accept these three values, in this order, as {{1}}, {{2}}, {{3}}.
    const templateParams = [order.orderNumber, order.tokenNumber, formatINR(order.totalAmount)];

    let sendResult: { success: boolean; providerMessageId?: string; errorMessage?: string };
    try {
      sendResult = await sendFn('WHATSAPP', phoneNumber, templateParams);
    } catch (err: any) {
      sendResult = { success: false, errorMessage: err?.message || 'Failed to reach the notification service' };
    }

    if (!sendResult.success) {
      const record: ReceiptRecord = {
        id: `rec-err-${Date.now()}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        tokenNumber: order.tokenNumber,
        deliveryMethod: 'WHATSAPP',
        deliveryStatus: 'FAILED',
        recipient: masked,
        content: messageContent,
        createdAt: new Date().toISOString(),
        errorMessage: sendResult.errorMessage || 'WhatsApp send failed'
      };
      order.eBillMethod = 'WHATSAPP';
      order.eBillStatus = 'FAILED';
      order.eBillRecipient = masked;
      db.notify();
      return {
        success: false,
        record,
        message: `WhatsApp e-bill not sent — ${sendResult.errorMessage || 'send failed'}`
      };
    }

    const record: ReceiptRecord = {
      id: `rec-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      deliveryMethod: 'WHATSAPP',
      deliveryStatus: 'SENT',
      recipient: masked,
      content: messageContent,
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString()
    };

    order.eBillMethod = 'WHATSAPP';
    order.eBillStatus = 'SENT';
    order.eBillRecipient = masked;
    db.notify();

    return {
      success: true,
      record,
      message: `WhatsApp e-bill dispatched to ${masked}`
    };
  }

  /**
   * Email the real bill as a PDF, generated and sent entirely server-side from the restaurant's
   * own order/payment rows — `sendFn` is the app's device-authed call to cloud/api's POST
   * /api/v1/receipts/email (see receipt-email.service.ts). Works for a cash-at-counter order just
   * as well as an online one: the server resolves `order.id` (the same local order id every kiosk
   * order already has) to whichever of its own tables actually has that order.
   */
  public static async sendEmailEBill(
    order: Order,
    email: string,
    sendFn: (orderId: string, email: string) => Promise<{ success: boolean }>
  ): Promise<{ success: boolean; record: ReceiptRecord; message: string }> {
    if (!this.validateEmail(email)) {
      return {
        success: false,
        record: {
          id: `rec-err-${Date.now()}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          tokenNumber: order.tokenNumber,
          deliveryMethod: 'EMAIL',
          deliveryStatus: 'FAILED',
          recipient: email,
          content: '',
          createdAt: new Date().toISOString(),
          errorMessage: 'Invalid email address'
        },
        message: 'Please enter a valid email address'
      };
    }

    const masked = this.maskEmail(email);
    let sendResult: { success: boolean; errorMessage?: string };
    try {
      sendResult = await sendFn(order.id, email);
    } catch (err: any) {
      sendResult = { success: false, errorMessage: err?.message || 'Failed to reach the notification service' };
    }

    if (!sendResult.success) {
      const record: ReceiptRecord = {
        id: `rec-err-${Date.now()}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        tokenNumber: order.tokenNumber,
        deliveryMethod: 'EMAIL',
        deliveryStatus: 'FAILED',
        recipient: masked,
        content: '',
        createdAt: new Date().toISOString(),
        errorMessage: sendResult.errorMessage || 'Email send failed'
      };
      order.eBillMethod = 'EMAIL';
      order.eBillStatus = 'FAILED';
      order.eBillRecipient = masked;
      db.notify();
      return {
        success: false,
        record,
        message: `Invoice email not sent — ${sendResult.errorMessage || 'send failed'}`
      };
    }

    const record: ReceiptRecord = {
      id: `rec-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      deliveryMethod: 'EMAIL',
      deliveryStatus: 'SENT',
      recipient: masked,
      content: '',
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString()
    };

    order.eBillMethod = 'EMAIL';
    order.eBillStatus = 'SENT';
    order.eBillRecipient = masked;
    db.notify();

    return {
      success: true,
      record,
      message: `Invoice emailed to ${masked}`
    };
  }

  /**
   * Send SMS e-bill via the same injected sendFn as WhatsApp.
   */
  public static async sendSmsEBill(
    order: Order,
    phoneNumber: string,
    sendFn: SendReceiptFn
  ): Promise<{ success: boolean; record: ReceiptRecord; message: string }> {
    const masked = this.maskRecipient(phoneNumber);
    const smsText = `JAMANVAAR: Thank you for Order #${order.orderNumber} (Token #${order.tokenNumber}). Total: ${formatINR(order.totalAmount)}. Track live: https://kiosk.jamanvaar.com/track/${order.orderNumber}`;
    const templateParams = [order.orderNumber, order.tokenNumber, formatINR(order.totalAmount)];

    let sendResult: { success: boolean; providerMessageId?: string; errorMessage?: string };
    try {
      sendResult = await sendFn('SMS', phoneNumber, templateParams);
    } catch (err: any) {
      sendResult = { success: false, errorMessage: err?.message || 'Failed to reach the notification service' };
    }

    if (!sendResult.success) {
      const record: ReceiptRecord = {
        id: `rec-sms-err-${Date.now()}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        tokenNumber: order.tokenNumber,
        deliveryMethod: 'SMS',
        deliveryStatus: 'FAILED',
        recipient: masked,
        content: smsText,
        createdAt: new Date().toISOString(),
        errorMessage: sendResult.errorMessage || 'SMS send failed'
      };
      order.eBillMethod = 'SMS';
      order.eBillStatus = 'FAILED';
      order.eBillRecipient = masked;
      db.notify();
      return {
        success: false,
        record,
        message: `SMS e-bill not sent — ${sendResult.errorMessage || 'send failed'}`
      };
    }

    const record: ReceiptRecord = {
      id: `rec-sms-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      deliveryMethod: 'SMS',
      deliveryStatus: 'SENT',
      recipient: masked,
      content: smsText,
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString()
    };

    order.eBillMethod = 'SMS';
    order.eBillStatus = 'SENT';
    order.eBillRecipient = masked;
    db.notify();

    return {
      success: true,
      record,
      message: `SMS e-bill dispatched to ${masked}`
    };
  }
}
