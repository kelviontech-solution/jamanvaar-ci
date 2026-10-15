import { createHash, createHmac } from 'crypto';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { kioskConfigurationSchema } from '../entity-sync/kiosk-configuration-schema';
import { readSavedBillNumber } from './whatsapp-bill-settings.service';
import { paymentBalance, COLLECTED_ORDER_STATUSES } from '../payments/order-payment-ledger';

const SEND_BILL_PATH = '/api/v1/webhooks/jamanvaar/send-bill';
const PAID_STATUSES = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_PENDING'];
const CLOSED_ORDER_STATUSES = ['CANCELLED', 'REFUNDED'];

type RawLine = { name: string; quantity: number; unitPrice: number; lineTotal: number };

interface BillSource {
  restaurantName: string;
  gstin: string | null;
  address: string | null;
  externalOrderId: string;
  method: string | null;
  items: RawLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
}

/** Order rows store money in paise. */
function inr(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

/** The customer's 10-digit Indian mobile, from whatever the cashier typed (spaces, +91, 91 prefix). */
export function normalizeIndianMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/**
 * Sends a customer their real bill on WhatsApp. The bill text is built here from the
 * restaurant's own order rows (scoped by the device's restaurantId) -- never from client-supplied
 * text -- then handed to product/whatsapp, which owns the restaurant's Meta number and token and
 * does the actual send. Signed the same way as the order webhooks (HMAC over METHOD/PATH/TS/body hash).
 */
@Injectable()
export class ReceiptWhatsAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  /**
   * `requestingDevice` closes a receipt-redirection gap (security-audit): a self-service KIOSK is
   * operated directly by whichever guest is standing at it, so it may only WhatsApp the bill for an
   * order IT placed -- never any other order at the restaurant by orderId alone. A POS/POS_ADMIN
   * console keeps its existing restaurant/branch-only scope (a normal staff counter task).
   */
  async sendBillWhatsApp(restaurantId: string, orderId: string, phone: string, branchId: string | null | undefined, requestingDevice: { id: string; type: string }): Promise<{ success: boolean; errorMessage?: string }> {
    const normalized = normalizeIndianMobile(phone);
    if (!normalized) throw new BadRequestException('Enter a valid 10-digit Indian mobile number');

    const baseUrl = this.config.get<string>('WHATSAPP_CONNECTOR_BASE_URL');
    const secret = this.config.get<string>('JAMANVAAR_SERVICE_SECRET');
    if (!baseUrl || !secret) throw new ServiceUnavailableException('WhatsApp billing is not configured on this server');

    const bill = await this.loadBill(restaurantId, orderId, branchId, requestingDevice);
    // The number the admin chose in Receipt settings; empty = the restaurant's default connected number.
    const fromNumber = await readSavedBillNumber(this.prisma, restaurantId);
    const orderNo = bill.externalOrderId.slice(-10).toUpperCase();

    const rawBody = JSON.stringify({
      restaurantId,
      phone: normalized,
      ...(fromNumber ? { fromNumber } : {}),
      billText: this.formatBill(bill, orderNo),
      // Template fallback (customer outside the 24h window): {{1}} order, {{2}} reference, {{3}} total.
      templateParams: [orderNo, orderNo, inr(bill.totalAmount)]
    });
    const timestamp = String(Date.now());
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    const signature = createHmac('sha256', secret).update(`POST\n${SEND_BILL_PATH}\n${timestamp}\n${bodyHash}`).digest('hex');

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${SEND_BILL_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': signature, 'X-Timestamp': timestamp },
        body: rawBody,
        signal: AbortSignal.timeout(20_000)
      });
    } catch {
      throw new ServiceUnavailableException('Could not reach the WhatsApp service — try again in a moment');
    }
    if (!res.ok) throw new ServiceUnavailableException(`WhatsApp service refused the request (${res.status})`);
    const data = (await res.json().catch(() => null)) as { success?: boolean; errorMessage?: string } | null;
    return data?.success ? { success: true } : { success: false, errorMessage: data?.errorMessage ?? 'WhatsApp send failed' };
  }

  /** Minimal plain-text layout (WhatsApp _italic_ and dashed rules). Keep in step with the WhatsApp
   *  service's bill_sender.format_bill_text, which renders the test sample. */
  private formatBill(b: BillSource, orderNo: string, when: Date = new Date()): string {
    const rule = Array(12).fill('-').join(' ');
    const date = when.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    const lines = [
      `_${b.restaurantName}_`,
      b.address,
      b.gstin ? `GSTIN ${b.gstin}` : null,
      rule,
      `Order  ${orderNo}`,
      date,
      rule,
      ...b.items.map((it) => `${it.name} x${it.quantity}  -  ${inr(it.lineTotal)}`),
      rule,
      `Subtotal  -  ${inr(b.subtotal)}`,
      `Tax  -  ${inr(b.taxAmount)}`,
      `_Total  -  ${inr(b.totalAmount)}_`,
      rule,
      `Collected  -  ${inr(b.collectedAmount)}`,
      `Balance due  -  ${inr(b.outstandingAmount)}`,
      b.outstandingAmount > 0 ? (b.method === 'CASH_AT_COUNTER' || b.method === 'CASH' ? 'Payment due at counter' : 'Payment pending') : b.method ? `Paid via ${b.method.replace(/_/g, ' ')}` : 'Payment settled',
      '_Thank you, visit again_'
    ];
    return lines.filter((l): l is string => l !== null && l !== undefined && l !== '').join('\n');
  }

  /** Online-paid order first (needs a real SUCCESS payment), then the cash-at-counter SyncedOrder
   *  mirror -- identical resolution rules to ReceiptEmailService. */
  private async loadBill(restaurantId: string, orderId: string, branchId: string | null | undefined, requestingDevice: { id: string; type: string }): Promise<BillSource> {
    // An order with no recorded device owner (e.g. one seeded outside the normal device-authenticated
    // flow) stays reachable the way it always has -- there is nothing to bind it to. In production,
    // order-sync always stamps deviceId/kioskId, so this exception never weakens the real check.
    const assertOwnKioskOrder = (ownerDeviceId: string | null) => {
      if (requestingDevice.type === 'KIOSK' && ownerDeviceId !== null && ownerDeviceId !== requestingDevice.id) throw new NotFoundException('Order not found');
    };
    const built = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const restaurantSelect = { name: true, legalName: true, gstin: true, address: true } as const;
      // Honour the restaurant's own "WhatsApp receipts" switch (same lookup the email route uses). No saved
      // configuration at all means the default (enabled), exactly like email.
      const assertEnabled = async (orderBranchId?: string | null) => {
        const scope = orderBranchId || branchId;
        const row = await tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'KIOSK_CONFIGURATION', externalId: `kiosk-config-${scope || 'restaurant'}` } } });
        const parsed = kioskConfigurationSchema.safeParse(row?.payload);
        if (parsed.success && parsed.data.branchId === (scope || undefined) && !parsed.data.receipt.enableWhatsApp) {
          throw new BadRequestException('WhatsApp bills are turned off by this restaurant');
        }
      };
      const order = await tx.order.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: orderId } },
        include: { paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1 }, restaurant: { select: restaurantSelect } }
      });
      // A kiosk cash order leaves TWO records: the online-payment attempt (Order, stuck at PENDING because the
      // guest chose to pay at the counter instead) and the real, confirmed cash order (SyncedOrder). An unpaid
      // Order must therefore not end the search -- only refuse when no confirmed order exists either.
      let unpaid: string | null = null;
      if (order) {
        if (branchId && order.branchId && branchId !== order.branchId) throw new NotFoundException('Order not found');
        assertOwnKioskOrder(order.kioskId);
        const payment = order.paymentTransactions[0];
        if (payment && PAID_STATUSES.includes(payment.status)) {
          await assertEnabled(order.branchId);
          return this.toSource(order.restaurant, order.externalOrderId, payment.method, order, order.totalAmount, 0);
        }
        unpaid = `Cannot send a bill for an order with no successful payment (status: ${payment?.status ?? 'none'})`;
      }
      const synced = await tx.syncedOrder.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: orderId } },
        include: { restaurant: { select: restaurantSelect } }
      });
      if (!synced) {
        if (unpaid) throw new BadRequestException(unpaid);
        return null;
      }
      if (branchId && synced.branchId && branchId !== synced.branchId) throw new NotFoundException('Order not found');
      assertOwnKioskOrder(synced.deviceId);
      if (CLOSED_ORDER_STATUSES.includes(synced.status)) {
        throw new BadRequestException(`Cannot send a bill for an order with status ${synced.status}`);
      }
      await assertEnabled(synced.branchId);
      const entries = await tx.orderPaymentEntry.findMany({where:{restaurantId,orderId:synced.id},select:{kind:true,amount:true}});
      const balance = paymentBalance(synced.totalAmount, entries.length ? entries : COLLECTED_ORDER_STATUSES.has(synced.paymentStatus || '') ? [{kind:'COLLECTION',amount:synced.totalAmount}] : []);
      return this.toSource(synced.restaurant, synced.externalOrderId, synced.paymentMethod, synced, balance.collectedPaise, balance.outstandingPaise);
    });
    if (!built) {
      throw new NotFoundException('Order not found — if you just placed this order, wait a few seconds for it to sync and try again');
    }
    return built;
  }

  private toSource(
    restaurant: { name: string; legalName: string | null; gstin: string | null; address: string | null },
    externalOrderId: string,
    method: string | null,
    o: { items: unknown; subtotal: number; taxAmount: number; totalAmount: number },
    collectedAmount: number,
    outstandingAmount: number
  ): BillSource {
    return {
      restaurantName: restaurant.legalName || restaurant.name,
      gstin: restaurant.gstin,
      address: restaurant.address,
      externalOrderId,
      method,
      items: (o.items as RawLine[]) ?? [],
      subtotal: o.subtotal,
      taxAmount: o.taxAmount,
      totalAmount: o.totalAmount,
      collectedAmount, outstandingAmount
    };
  }
}
