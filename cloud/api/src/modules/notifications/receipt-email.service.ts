import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import { buildReceiptPdfBuffer, ReceiptPdfOrderLine } from './receipt-pdf.util';

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

  async sendBillEmail(restaurantId: string, orderId: string, email: string): Promise<{ success: true }> {
    if (!this.email.configured) {
      throw new ServiceUnavailableException('Email is not configured on this server (set SMTP_HOST, SMTP_USER, SMTP_PASSWORD)');
    }

    const built = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const order = await tx.order.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: orderId } },
        include: {
          paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1 },
          restaurant: { select: { name: true, legalName: true, gstin: true, fssaiNumber: true, address: true } }
        }
      });
      if (order) {
        const payment = order.paymentTransactions[0];
        if (!payment || !PAID_STATUSES.includes(payment.status)) {
          throw new BadRequestException(`Cannot email an invoice for an order with no successful payment (status: ${payment?.status ?? 'none'})`);
        }
        return this.buildPdf(order.restaurant, {
          externalOrderId: order.externalOrderId,
          paidAt: payment.paidAt,
          method: payment.method,
          items: order.items as unknown as RawLine[],
          subtotal: order.subtotal,
          taxAmount: order.taxAmount,
          totalAmount: order.totalAmount
        });
      }

      const synced = await tx.syncedOrder.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: orderId } },
        include: { restaurant: { select: { name: true, legalName: true, gstin: true, fssaiNumber: true, address: true } } }
      });
      if (!synced) return null;
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
      });
    });

    if (!built) {
      throw new NotFoundException('Order not found — if you just placed this order, wait a few seconds for it to sync and try again');
    }

    const { pdf, orderNo, restaurantName } = built;
    const html = `
      <p>Hi,</p>
      <p>Thank you for your order at <strong>${restaurantName}</strong>. Your bill for order <strong>${orderNo}</strong> is attached as a PDF.</p>
    `;
    await this.email.send(email, `Your invoice from ${restaurantName} — Order ${orderNo}`, html, [
      { filename: `invoice-${orderNo}.pdf`, content: pdf, contentType: 'application/pdf' }
    ]);

    return { success: true };
  }

  private async buildPdf(
    restaurant: RestaurantBranding,
    order: { externalOrderId: string; paidAt: Date | null; method: string | null; items: RawLine[]; subtotal: number; taxAmount: number; totalAmount: number }
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
      totalAmount: order.totalAmount
    });

    return { pdf, orderNo: order.externalOrderId.slice(-10).toUpperCase(), restaurantName: restaurant.name };
  }
}
