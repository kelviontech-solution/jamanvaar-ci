import { Order, ReceiptConfig, ReceiptDeliveryMethod, ReceiptDeliveryStatus, ReceiptRecord } from '@jamanvaar/types';
import { db } from '@jamanvaar/database';
import { formatDate, formatINR, formatTime } from '@jamanvaar/utils';

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
      `CGST (2.5%): ${formatINR(order.cgstAmount)}\n` +
      `SGST (2.5%): ${formatINR(order.sgstAmount)}\n` +
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
   * Send WhatsApp e-bill (dispatches through secure backend service)
   */
  public static async sendWhatsAppEBill(
    order: Order,
    phoneNumber: string,
    config: ReceiptConfig
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

    const messageContent = this.formatWhatsAppMessage(order, config);
    const masked = this.maskRecipient(phoneNumber);

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

    // Update order state
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
   * Send SMS e-bill
   */
  public static async sendSmsEBill(
    order: Order,
    phoneNumber: string
  ): Promise<{ success: boolean; record: ReceiptRecord; message: string }> {
    const masked = this.maskRecipient(phoneNumber);
    const smsText = `JAMANVAAR: Thank you for Order #${order.orderNumber} (Token #${order.tokenNumber}). Total: ${formatINR(order.totalAmount)}. Track live: https://kiosk.jamanvaar.com/track/${order.orderNumber}`;

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
