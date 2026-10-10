import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import { buildReceiptPdfBuffer, ReceiptPdfOrderLine } from './receipt-pdf.util';
import { kioskConfigurationSchema } from '../entity-sync/kiosk-configuration-schema';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ESCAPES[c]);
// Matches receipt-pdf.util.ts's own local rupees() helper (same reason: a trivial paise->rupee
// conversion is not worth a cross-package import, here from @jamanvaar/utils, whose barrel re-exports
// sound.ts, which pulls in @jamanvaar/ui's JSX/import.meta files that this package's build cannot compile).
const rupees = (paise: number): string => `₹${(paise / 100).toFixed(2)}`;

/** Mirrors payments.service.ts's own PAID_STATUSES — kept as a local copy rather than a cross-module import. */
const PAID_STATUSES = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_PENDING'];
const CLOSED_ORDER_STATUSES = ['CANCELLED', 'REFUNDED'];

interface RestaurantBranding {
  name: string;
  legalName: string | null;
  gstin: string | null;
  fssaiNumber: string | null;
  address: string | null;
}

type RawLine = { name: string; quantity: number; unitPrice: number; lineTotal: number };

/**
 * Emails a customer their own order's real bill as a PDF, replacing the old WhatsApp e-bill
 * (WhatsApp only ever forwarded client-supplied display text to a notification API, never looked
 * anything up server-side — fine for a notification, not for a document carrying the restaurant's
 * GSTIN/FSSAI that looks like an official invoice). Everything here is read from the restaurant's
 * own DB rows, scoped by restaurantId from the device's own token, so a kiosk can never email an
 * invoice for an amount nobody actually charged.
 *
 * `orderId` is the local/external order id every kiosk order already carries, online or cash —
 * this tries the online-payment Order/PaymentTransaction tables first (requires a real SUCCESS
 * payment, since that's real traceable money), then falls back to the generic SyncedOrder mirror
 * that a cash-at-counter order lands in instead (no payment-status gate there: the kiosk already
 * hands a cash customer a printed paper receipt at order time, before the cashier later collects
 * payment at the counter — see ThermalReceiptView.tsx's own TAX INVOICE / RECEIPT title, which
 * follows the same rule. This just offers the same document by email.)
 */
@Injectable()
export class ReceiptEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService
  ) {}

  async sendBillEmail(restaurantId: string, orderId: string, email: string, branchId?: string | null): Promise<{ success: true }> {
    if (!this.email.configured) {
      throw new ServiceUnavailableException('Email is not configured on this server (set SMTP_HOST, SMTP_USER, SMTP_PASSWORD)');
    }

    const built = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const presentation = async (orderBranchId?: string | null) => {
        if (branchId && orderBranchId && branchId !== orderBranchId) throw new NotFoundException('Order not found');
        const scope = orderBranchId || branchId;
        const row = await tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'KIOSK_CONFIGURATION', externalId: `kiosk-config-${scope || 'restaurant'}` } } });
        const parsed = kioskConfigurationSchema.safeParse(row?.payload);
        if (!parsed.success || parsed.data.branchId !== (scope || undefined)) return undefined;
        if (!parsed.data.receipt.enableEmail) throw new BadRequestException('Email receipts are disabled by this restaurant');
        return parsed.data.receipt;
      };
      const order = await tx.order.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: orderId } },
        include: {
          paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1 },
          kiosk: { select: { branchId: true } },
          restaurant: { select: { name: true, legalName: true, gstin: true, fssaiNumber: true, address: true } }
        }
      });
      // A kiosk cash order leaves TWO records: the online-payment attempt (Order, stuck at PENDING because the
      // guest chose to pay at the counter instead) and the real, confirmed cash order (SyncedOrder). An unpaid
      // Order must therefore not end the search -- only refuse when no confirmed order exists either.
      let unpaid: string | null = null;
      if (order) {
        const payment = order.paymentTransactions[0];
        if (payment && PAID_STATUSES.includes(payment.status)) {
        return this.buildPdf(order.restaurant, {
          externalOrderId: order.externalOrderId,
          paidAt: payment.paidAt,
          method: payment.method,
          items: order.items as unknown as RawLine[],
          subtotal: order.subtotal,
          taxAmount: order.taxAmount,
          totalAmount: order.totalAmount
        }, await presentation(order.branchId || order.kiosk?.branchId));
        }
        unpaid = `Cannot email an invoice for an order with no successful payment (status: ${payment?.status ?? 'none'})`;
      }

      const synced = await tx.syncedOrder.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: orderId } },
        include: { restaurant: { select: { name: true, legalName: true, gstin: true, fssaiNumber: true, address: true } } }
      });
      if (!synced) {
        if (unpaid) throw new BadRequestException(unpaid);
        return null;
      }
      if (CLOSED_ORDER_STATUSES.includes(synced.status)) {
        throw new BadRequestException(`Cannot email an invoice for an order with status ${synced.status}`);
      }
      return this.buildPdf(synced.restaurant, {
        externalOrderId: synced.externalOrderId,
        paidAt: synced.createdAt,
        method: synced.paymentMethod,
        items: synced.items as unknown as RawLine[],
        subtotal: synced.subtotal,
        taxAmount: synced.taxAmount,
        totalAmount: synced.totalAmount
      }, await presentation(synced.branchId));
    });

    if (!built) {
      throw new NotFoundException('Order not found — if you just placed this order, wait a few seconds for it to sync and try again');
    }

    const { pdf, orderNo, restaurantName, lines, totalAmount, thankYouMessage } = built;
    const html = this.buildEmailBody(restaurantName, orderNo, lines, totalAmount, thankYouMessage);
    await this.email.send(email, `Your invoice from ${restaurantName} — Order ${orderNo}`, html, [
      { filename: `invoice-${orderNo}.pdf`, content: pdf, contentType: 'application/pdf' }
    ]);

    return { success: true };
  }

  private async buildPdf(
    restaurant: RestaurantBranding,
    order: { externalOrderId: string; paidAt: Date | null; method: string | null; items: RawLine[]; subtotal: number; taxAmount: number; totalAmount: number },
    presentation?: { thankYouMessage: string; footerMessage: string; logoUrl?: string; showTaxBreakup: boolean }
  ) {
    const items = order.items ?? [];
    const lines: ReceiptPdfOrderLine[] = items.map((it) => ({ name: it.name, quantity: it.quantity, unitPrice: it.unitPrice, lineTotal: it.lineTotal }));

    const pdf = await buildReceiptPdfBuffer({
      restaurantName: restaurant.name,
      legalName: restaurant.legalName,
      gstin: restaurant.gstin,
      fssaiNumber: restaurant.fssaiNumber,
      address: restaurant.address,
      externalOrderId: order.externalOrderId,
      paidAt: order.paidAt,
      method: order.method,
      lines,
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      totalAmount: order.totalAmount,
      thankYouMessage: presentation?.thankYouMessage, footerMessage: presentation?.footerMessage, logoDataUrl: presentation?.logoUrl, showTaxBreakup: presentation?.showTaxBreakup
    });

    return {
      pdf,
      orderNo: order.externalOrderId.slice(-10).toUpperCase(),
      restaurantName: restaurant.name,
      lines,
      totalAmount: order.totalAmount,
      thankYouMessage: presentation?.thankYouMessage
    };
  }

  /**
   * The email a guest actually reads before they ever open the PDF: what they ordered and what it came
   * to, not just "see attached". Table-based layout (not flexbox) so it renders the same in Outlook as
   * everywhere else — this is still read inside real inboxes, not just a modern browser.
   */
  private buildEmailBody(restaurantName: string, orderNo: string, lines: ReceiptPdfOrderLine[], totalAmountPaise: number, thankYouMessage?: string): string {
    // lineTotal/totalAmount are paise throughout this service (see ReceiptPdfOrderLine and the PDF's own
    // rupees() helper); formatINR takes rupees, so every amount here is divided by 100 before formatting.
    const rows = lines
      .map(
        (l) =>
          `<tr><td style="padding:5px 0;color:#334155;">${esc(l.name)} <span style="color:#94a3b8;">× ${l.quantity}</span></td><td style="padding:5px 0;text-align:right;color:#0B253A;font-weight:600;white-space:nowrap;">${esc(rupees(l.lineTotal))}</td></tr>`
      )
      .join('');
    const intro = thankYouMessage ? esc(thankYouMessage) : 'We hope you enjoyed your meal. Here is your bill for order';
    return `
      <div style="font-family:'Segoe UI', Arial, sans-serif; max-width:480px; margin:0 auto; color:#0B253A;">
        <h2 style="margin:0 0 6px; font-size:20px;">Thank you for dining with ${esc(restaurantName)}! 🙏</h2>
        <p style="margin:0 0 18px; color:#475569; font-size:14px; line-height:1.5;">${intro} <strong>${esc(orderNo)}</strong>.</p>
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          ${rows}
          <tr><td style="padding-top:12px; border-top:2px solid #0B253A; font-size:16px; font-weight:800;">Total Paid</td><td style="padding-top:12px; border-top:2px solid #0B253A; font-size:16px; font-weight:800; text-align:right; white-space:nowrap;">${esc(rupees(totalAmountPaise))}</td></tr>
        </table>
        <p style="margin-top:20px; font-size:13px; color:#64748b;">Your official tax invoice is attached to this email as a PDF, for your records.</p>
        <p style="margin-top:18px; font-size:14px; color:#0B253A; font-weight:700;">We hope to serve you again soon! ✨</p>
      </div>
    `;
  }
}
