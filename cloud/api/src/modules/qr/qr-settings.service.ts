import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { parseInlineImage, publicImageUrl } from '../menu-publications/menu-snapshot';
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

const text = (max: number) => z.string().trim().max(max);
export const qrBrandingSchema = z
  .object({
    welcomeTitle: text(80),
    welcomeMessage: text(300),
    footerMessage: text(300),
    orderButtonLabel: text(30),
    accentColor: z.string().regex(/^(#[0-9a-fA-F]{6})?$/, 'Use a colour like #E4572E'),
    logo: z.string().max(2_000_000).nullable()
  })
  .partial()
  .strict();
export type QrBrandingUpdate = z.infer<typeof qrBrandingSchema>;

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
    private readonly audit: AuditService,
    private readonly bus: RealtimeBus
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
    this.bus.publishInvalidation(restaurantId);
    return { ...before, ...(await this.effective(restaurantId, branchId)) };
  }

  // ---------------------------------------------------------------- branding (the restaurant's own words, colour and logo)

  async branding(restaurantId: string) {
    const row = await this.prisma.runAsTenant(restaurantId, (tx) => tx.qrBranding.findUnique({ where: { restaurantId } }));
    return {
      welcomeTitle: row?.welcomeTitle ?? null,
      welcomeMessage: row?.welcomeMessage ?? null,
      footerMessage: row?.footerMessage ?? null,
      orderButtonLabel: row?.orderButtonLabel ?? null,
      accentColor: row?.accentColor ?? null,
      logoUrl: publicImageUrl(row?.logoRef ?? undefined) ?? null
    };
  }

  async updateBranding(restaurantId: string, actor: { id: string; type: string }, dto: QrBrandingUpdate) {
    const data: Record<string, string | null> = {};
    for (const k of ['welcomeTitle', 'welcomeMessage', 'footerMessage', 'orderButtonLabel', 'accentColor'] as const) if (dto[k] !== undefined) data[k] = dto[k] === '' ? null : (dto[k] as string);
    let image: ReturnType<typeof parseInlineImage> | null = null;
    if (dto.logo !== undefined) {
      if (dto.logo === '' || dto.logo === null) data.logoRef = null;
      else {
        image = parseInlineImage(dto.logo);
        if ('error' in image) throw new BadRequestException(`Logo: ${image.error}.`);
        data.logoRef = `img:${image.image.hash}`;
      }
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('No changes supplied');
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      if (image && 'image' in image) {
        await tx.menuImage.upsert({
          where: { restaurantId_hash: { restaurantId, hash: image.image.hash } },
          create: { restaurantId, hash: image.image.hash, contentType: image.image.contentType, size: image.image.data.length, data: image.image.data },
          update: {}
        });
      }
      await tx.qrBranding.upsert({ where: { restaurantId }, create: { restaurantId, ...data }, update: data });
      await this.audit.log({ actorType: 'TENANT', actorId: actor.id, restaurantId, action: QR_AUDIT.SETTINGS_CHANGED, category: 'QR_ORDERING', details: { branding: Object.keys(data) } }, tx);
    });
    this.bus.publishInvalidation(restaurantId);
    return this.branding(restaurantId);
  }
}
