import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import { buildReceiptPdfBuffer, ReceiptPdfOrderLine } from './receipt-pdf.util';

/** Mirrors payments.service.ts's own PAID_STATUSES — kept as a local copy rather than a cross-module import. */
const PAID_STATUSES = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_PENDING'];

/**
 * Emails a customer their own order's real tax invoice as a PDF, replacing the old WhatsApp
 * e-bill (WhatsApp only ever forwarded client-supplied display text to a notification API, never
 * looked anything up server-side — fine for a notification, not for a document carrying the
 * restaurant's GSTIN/FSSAI that looks like an official invoice). Everything here is read from the
 * restaurant's own DB rows, scoped by restaurantId from the device's own token, so a kiosk can
 * never email an invoice for an amount nobody actually paid.
 */
@Injectable()
export class ReceiptEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService
  ) {}

  async sendBillEmail(restaurantId: string, paymentId: string, email: string): Promise<{ success: true }> {
    if (!this.email.configured) {
      throw new ServiceUnavailableException('Email is not configured on this server (set SMTP_HOST, SMTP_USER, SMTP_PASSWORD)');
    }

    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.findFirst({
        where: { id: paymentId, restaurantId },
        include: { order: true, restaurant: { select: { name: true, legalName: true, gstin: true, fssaiNumber: true, address: true } } }
      })
    );
    if (!payment) throw new NotFoundException('Payment not found');
    if (!PAID_STATUSES.includes(payment.status)) {
      throw new BadRequestException(`Cannot email an invoice for a payment in status ${payment.status}`);
    }

    const items = (payment.order.items as unknown as Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>) ?? [];
    const lines: ReceiptPdfOrderLine[] = items.map((it) => ({ name: it.name, quantity: it.quantity, unitPrice: it.unitPrice, lineTotal: it.lineTotal }));

    const pdf = await buildReceiptPdfBuffer({
      restaurantName: payment.restaurant.name,
      legalName: payment.restaurant.legalName,
      gstin: payment.restaurant.gstin,
      fssaiNumber: payment.restaurant.fssaiNumber,
      address: payment.restaurant.address,
      externalOrderId: payment.order.externalOrderId,
      paidAt: payment.paidAt,
      method: payment.method,
      lines,
      subtotal: payment.order.subtotal,
      taxAmount: payment.order.taxAmount,
      totalAmount: payment.order.totalAmount
    });

    const orderNo = payment.order.externalOrderId.slice(-10).toUpperCase();
    const html = `
      <p>Hi,</p>
      <p>Thank you for your order at <strong>${payment.restaurant.name}</strong>. Your tax invoice for order <strong>${orderNo}</strong> is attached as a PDF.</p>
    `;
    await this.email.send(email, `Your invoice from ${payment.restaurant.name} — Order ${orderNo}`, html, [
      { filename: `invoice-${orderNo}.pdf`, content: pdf, contentType: 'application/pdf' }
    ]);

    return { success: true };
  }
}
