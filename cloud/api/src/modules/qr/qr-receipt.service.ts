import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, SyncedOrder } from '@prisma/client';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { join } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QrAdminService } from './qr-admin.service';
import { paymentBalance } from '../payments/order-payment-ledger';

export const receiptDesignSchema = z
  .object({
    heading: z.string().trim().min(1).max(60),
    thankYou: z.string().trim().max(200),
    footer: z.string().trim().max(300),
    contact: z.string().trim().max(120),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    showTaxBreakup: z.boolean(),
    showCustomer: z.boolean(),
    showNotes: z.boolean()
  })
  .strict();
export type QrReceiptDesign = z.infer<typeof receiptDesignSchema>;
export const DEFAULT_QR_RECEIPT: QrReceiptDesign = {
  heading: 'Order bill',
  thankYou: 'Thank you for dining with us!',
  footer: '',
  contact: '',
  accent: '#0B253A',
  showTaxBreakup: true,
  showCustomer: true,
  showNotes: true
};
const TYPE = 'QR_RECEIPT_SETTINGS';

@Injectable()
export class QrReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly admin: QrAdminService
  ) {}
  async settings(restaurantId: string, branchId: string | null) {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const rows = await tx.syncedEntity.findMany({
        where: { restaurantId, entityType: TYPE, externalId: { in: ['restaurant', ...(branchId ? [branchId] : [])] } }
      });
      let design = { ...DEFAULT_QR_RECEIPT };
      for (const key of ['restaurant', branchId]) {
        const row = rows.find((r) => r.externalId === key);
        const parsed = receiptDesignSchema.safeParse((row?.payload as any)?.design);
        if (parsed.success) design = parsed.data;
      }
      const own = rows.find((row) => row.externalId === (branchId || 'restaurant'));
      return { design, version: own?.syncVersion ?? 0, scope: branchId || 'restaurant' };
    });
  }
  async read(device: Device) {
    this.admin.assertConsole(device);
    const access = await this.admin.entitlement(device.restaurantId, device.branchId);
    if (!access.enabled) throw new ForbiddenException(access.lockedMessage || 'QR ordering is unavailable for this branch.');
    return this.settings(device.restaurantId, device.branchId);
  }
  async save(device: Device, input: { design: QrReceiptDesign; version: number }) {
    await this.read(device);
    const key = device.branchId || 'restaurant';
    return this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${device.restaurantId + ':' + TYPE + ':' + key}))`;
      const where = { restaurantId_entityType_externalId: { restaurantId: device.restaurantId, entityType: TYPE, externalId: key } };
      const previous = await tx.syncedEntity.findUnique({ where });
      if ((previous?.syncVersion ?? 0) !== input.version) throw new ConflictException('Receipt settings changed. Reload and review before saving.');
      const payload = { design: input.design, branchId: device.branchId };
      const row = await tx.syncedEntity.upsert({
        where,
        create: { restaurantId: device.restaurantId, entityType: TYPE, externalId: key, payload },
        update: { payload, syncVersion: { increment: 1 } }
      });
      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: (device as any).adminActorId || device.id,
          restaurantId: device.restaurantId,
          action: 'QR_RECEIPT_SETTINGS_UPDATED',
          category: 'QR_ORDERING',
          details: { scope: key, version: row.syncVersion }
        },
        tx
      );
      return { design: input.design, version: row.syncVersion, scope: key };
    });
  }
  async adminPdf(device: Device, id: string) {
    await this.read(device);
    const order = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
      tx.syncedOrder.findFirst({
        where: { restaurantId: device.restaurantId, externalOrderId: id, source: 'QR', ...(device.branchId ? { branchId: device.branchId } : {}) }
      })
    );
    if (!order) throw new NotFoundException('Order not found');
    return this.pdf(order);
  }
  /** Call only after guest-session ownership or admin branch access has been checked. */
  async pdf(order: SyncedOrder) {
    const [{ design }, data] = await Promise.all([
      this.settings(order.restaurantId, order.branchId),
      this.prisma.runAsTenant(order.restaurantId, async (tx) => ({
        restaurant: await tx.restaurant.findUniqueOrThrow({ where: { id: order.restaurantId } }),
        branch: order.branchId ? await tx.branch.findFirst({ where: { id: order.branchId, restaurantId: order.restaurantId } }) : null,
        entries: await tx.orderPaymentEntry.findMany({ where: { restaurantId: order.restaurantId, orderId: order.id }, select: { kind: true, amount: true } })
      }))
    ]);
    const meta = (order.meta ?? {}) as Record<string, any>,
      balance = paymentBalance(order.totalAmount, data.entries);
    const collected = data.entries.length ? balance.collectedPaise : order.paymentStatus === 'SUCCESS' ? order.totalAmount : 0;
    const outstanding = data.entries.length ? balance.outstandingPaise : Math.max(0, order.totalAmount - collected);
    const number = String(meta.tokenNumber || order.externalOrderId),
      currency = String(meta.currency || data.restaurant.currency || 'INR'),
      money = (n: number) => `${currency} ${(n / 100).toFixed(2)}`;
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${data.restaurant.name} - ${number}` } }),
      chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    // Bundled fonts support the restaurant's Gujarati/Hindi dish names; no remote assets are fetched.
    const fontRoot = join(__dirname, '../../assets/receipt-fonts');
    doc.registerFont('Latin', join(fontRoot, 'NotoSans-Regular.ttf'));
    doc.registerFont('Gujarati', join(fontRoot, 'NotoSansGujarati-Regular.ttf'));
    doc.registerFont('Hindi', join(fontRoot, 'NotoSansDevanagari-Regular.ttf'));
    const text = (value: string, size = 10, options: PDFKit.Mixins.TextOptions = {}) => {
      // These fonts have separate script coverage. Keep Latin quantities, English names and
      // Gujarati/Hindi words in their own font runs, including when a dish mixes languages.
      const runs = value.match(/[\u0A80-\u0AFF]+|[\u0900-\u097F]+|[^\u0A80-\u0AFF\u0900-\u097F]+/gu) || [''];
      runs.forEach((run,index)=>doc.font(/[\u0A80-\u0AFF]/.test(run)?'Gujarati':/[\u0900-\u097F]/.test(run)?'Hindi':'Latin').fontSize(size).text(run,{...options,continued:index<runs.length-1}));
    };
    const line = () => {
      doc.moveDown(0.5);
      doc.strokeColor('#dedbd4').moveTo(48, doc.y).lineTo(547, doc.y).stroke();
      doc.moveDown(0.7);
    };
    doc.fillColor(design.accent);
    text(data.restaurant.name, 21, { align: 'center' });
    doc.fillColor('#263642');
    if (data.branch) text(data.branch.name, 11, { align: 'center' });
    const address = [data.branch?.address || data.restaurant.address, data.restaurant.city, data.restaurant.state].filter(Boolean).join(', ');
    if (address) text(address, 9, { align: 'center' });
    if (data.restaurant.gstin) text(`GSTIN: ${data.restaurant.gstin}`, 9, { align: 'center' });
    if (data.restaurant.fssaiNumber) text(`FSSAI: ${data.restaurant.fssaiNumber}`, 9, { align: 'center' });
    if (design.contact) text(design.contact, 9, { align: 'center' });
    line();
    text(order.status === 'CANCELLED' ? 'Cancelled order' : design.heading, 15, { align: 'center' });
    text(`Order: ${number} | Table: ${order.tableLabel || 'Takeaway'}`);
    text(`Date: ${order.createdAt.toLocaleString('en-IN', { timeZone: data.branch?.timezone || data.restaurant.timezone })}`);
    text(`Reference: ${order.publicOrderId || order.externalOrderId}`, 8);
    if (design.showCustomer) {
      if (meta.customerName) text(`Guest: ${meta.customerName}`);
      if (meta.customerPhone) text(`Mobile: ${meta.customerPhone}`);
      if (meta.customerEmail) text(`Email: ${meta.customerEmail}`);
    }
    if (meta.pickupAt) text(`Pickup: ${new Date(meta.pickupAt).toLocaleString('en-IN', { timeZone: meta.pickupTimezone || data.restaurant.timezone })}`);
    line();
    for (const item of Array.isArray(order.items) ? (order.items as any[]) : []) {
      if (doc.y > 680) {
        doc.addPage();
        doc.fillColor('#263642');
      }
      text(`${item.quantity} x ${item.name}`, 11);
      text(`Unit ${money(item.unitPrice)} | Amount ${money(item.lineTotal)}`, 9);
      if (Array.isArray(item.modifiers) && item.modifiers.length) text(item.modifiers.join(', '), 9);
      if (design.showNotes && item.specialInstructions) text(`Note: ${item.specialInstructions}`, 9);
      doc.moveDown(0.5);
    }
    line();
    text(`Subtotal: ${money(order.subtotal)}`);
    if (order.discountAmount) text(`Discount: -${money(order.discountAmount)}`);
    const cgst = Number.isInteger(meta.cgstPaise) ? meta.cgstPaise : Math.floor(order.taxAmount / 2);
    if (design.showTaxBreakup) {
      text(`CGST: ${money(cgst)}`);
      text(`SGST: ${money(order.taxAmount - cgst)}`);
    } else text(`Tax: ${money(order.taxAmount)}`);
    text(`Total: ${money(order.totalAmount)}`, 14);
    text(`Collected: ${money(collected)}`);
    text(`Balance due: ${money(outstanding)}`);
    if (balance.refundedPaise) text(`Refunded: ${money(balance.refundedPaise)}`);
    text(order.status === 'CANCELLED' ? 'ORDER CANCELLED' : outstanding > 0 ? 'PAYMENT DUE' : 'PAYMENT RECEIVED', 11);
    if (order.paymentMethod) text(`Payment method: ${order.paymentMethod.replace(/_/g, ' ')}`, 9);
    if (design.showNotes && order.notes) {
      line();
      text(`Kitchen / guest notes: ${order.notes}`, 9);
    }
    line();
    if (design.thankYou) text(design.thankYou, 10, { align: 'center' });
    if (design.footer) text(design.footer, 9, { align: 'center' });
    text('Generated by JAMANVAAR', 8, { align: 'center' });
    doc.end();
    return { pdf: await finished, filename: `bill-${number.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || 'qr-order'}.pdf` };
  }
}
