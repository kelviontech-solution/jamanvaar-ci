import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QR_AUDIT } from './qr.support';

export const qrSettingsSchema = z
  .object({
    orderingEnabled: z.boolean(),
    tableOrderingEnabled: z.boolean(),
    menuOnlyEnabled: z.boolean(),
    allowCustomerNotes: z.boolean(),
    allowModifiers: z.boolean(),
    allowCash: z.boolean(),
    allowOnlinePayment: z.boolean(),
    showOrderStatus: z.boolean(),
    autoAccept: z.boolean(),
    requireCustomerName: z.boolean(),
    requireCustomerPhone: z.boolean()
  })
  .partial()
  .strict();
export type QrSettingsUpdate = z.infer<typeof qrSettingsSchema>;

export interface QrSettingsView {
  orderingEnabled: boolean;
  tableOrderingEnabled: boolean;
  menuOnlyEnabled: boolean;
  allowCustomerNotes: boolean;
  allowModifiers: boolean;
  allowCash: boolean;
  allowOnlinePayment: boolean;
  showOrderStatus: boolean;
  autoAccept: boolean;
  requireCustomerName: boolean;
  requireCustomerPhone: boolean;
}

const FIELDS: Array<keyof QrSettingsView> = ['orderingEnabled', 'tableOrderingEnabled', 'menuOnlyEnabled', 'allowCustomerNotes', 'allowModifiers', 'allowCash', 'allowOnlinePayment', 'showOrderStatus', 'autoAccept', 'requireCustomerName', 'requireCustomerPhone'];

/** What a restaurant gets before it has changed anything. These are the column defaults, not business rules elsewhere. */
export const DEFAULT_QR_SETTINGS: QrSettingsView = {
  orderingEnabled: true,
  tableOrderingEnabled: true,
  menuOnlyEnabled: false,
  allowCustomerNotes: true,
  allowModifiers: true,
  allowCash: true,
  allowOnlinePayment: false,
  showOrderStatus: true,
  autoAccept: false,
  requireCustomerName: false,
  requireCustomerPhone: false
};

@Injectable()
export class QrSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /** Restaurant-wide settings, overlaid by the branch's own row when it has one. */
  async effective(restaurantId: string, branchId: string | null): Promise<QrSettingsView> {
    const rows = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.qrSettings.findMany({ where: { restaurantId, OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] } })
    );
    const base = rows.find((r) => r.branchId === null);
    const branch = branchId ? rows.find((r) => r.branchId === branchId) : undefined;
    const merged: QrSettingsView = { ...DEFAULT_QR_SETTINGS };
    for (const row of [base, branch]) {
      if (!row) continue;
      for (const f of FIELDS) merged[f] = row[f] as boolean;
    }
    return merged;
  }

  async get(restaurantId: string, branchId: string | null = null): Promise<QrSettingsView> {
    return this.effective(restaurantId, branchId);
  }

  async update(restaurantId: string, actor: { id: string; type: string }, changes: QrSettingsUpdate, branchId: string | null = null): Promise<QrSettingsView> {
    if (Object.keys(changes).length === 0) throw new BadRequestException('No settings supplied');
    // Online payment for QR orders needs a verified gateway path that does not exist yet; it is never switched on
    // in a way that could let an order be treated as paid without the gateway confirming it.
    if (changes.allowOnlinePayment === true) {
      throw new ConflictException('Online payment for QR ordering is not available yet. Guests pay at the counter.');
    }
    const before = await this.effective(restaurantId, branchId);
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      if (branchId) {
        const branch = await tx.branch.findFirst({ where: { id: branchId, restaurantId } });
        if (!branch) throw new BadRequestException('Unknown branch');
      }
      const existing = await tx.qrSettings.findFirst({ where: { restaurantId, branchId } });
      if (existing) await tx.qrSettings.update({ where: { id: existing.id }, data: changes });
      else await tx.qrSettings.create({ data: { restaurantId, branchId, ...changes } });
      await this.audit.log(
        { actorType: 'TENANT', actorId: actor.id, restaurantId, action: QR_AUDIT.SETTINGS_CHANGED, category: 'QR_ORDERING', details: { branchId, changes, actorKind: actor.type } },
        tx
      );
    });
    return { ...before, ...(await this.effective(restaurantId, branchId)) };
  }
}
