import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { parseInlineImage, publicImageUrl } from '../menu-publications/menu-snapshot';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QR_AUDIT } from './qr.support';
import { DEFAULT_QR_RULES, qrRulesSchema, type QrRules } from './qr-rules';

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
    requireCustomerPhone: z.boolean(),
    rules: qrRulesSchema
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
    logo: z.string().max(2_000_000).nullable(),
    cover:z.string().max(2_000_000).nullable(),
    backgroundColor:z.string().regex(/^#[0-9a-fA-F]{6}$/),
    layout:z.enum(['CARDS','COMPACT']),
    contactMessage:text(160),
    reset:z.boolean()
  })
  .partial()
  .strict();
export type QrBrandingUpdate = z.infer<typeof qrBrandingSchema>;
export const qrPrintDesignSchema = z.object({ template: z.enum(['minimal', 'premium', 'colorful', 'cafe', 'fine-dining', 'family', 'casual', 'takeaway', 'table']), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/), instruction: z.string().trim().min(1).max(70), footer: z.string().trim().max(100), showLogo: z.boolean(), layout: z.enum(['CARD', 'TENT', 'LABEL']) }).strict();

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
  rules?: QrRules;
}

const FIELDS: Array<Exclude<keyof QrSettingsView, 'rules'>> = ['orderingEnabled', 'tableOrderingEnabled', 'menuOnlyEnabled', 'allowCustomerNotes', 'allowModifiers', 'allowCash', 'allowOnlinePayment', 'showOrderStatus', 'autoAccept', 'requireCustomerName', 'requireCustomerPhone'];

/** New restaurants offer online checkout when gateway readiness permits it; explicit opt-outs remain authoritative. */
export const DEFAULT_QR_SETTINGS: QrSettingsView = {
  orderingEnabled: true,
  tableOrderingEnabled: true,
  menuOnlyEnabled: false,
  allowCustomerNotes: true,
  allowModifiers: true,
  allowCash: true,
  allowOnlinePayment: true,
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
    private readonly entitlements:ApplicationEntitlementsService,
    private readonly bus: RealtimeBus
  ) {}

  /** Restaurant-wide settings, overlaid by the branch's own row when it has one. */
  async effective(restaurantId: string, branchId: string | null): Promise<QrSettingsView> {
    const rows = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.qrSettings.findMany({ where: { restaurantId, OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] } })
    );
    const base = rows.find((r) => r.branchId === null);
    const branch = branchId ? rows.find((r) => r.branchId === branchId) : undefined;
    const merged: QrSettingsView = { ...DEFAULT_QR_SETTINGS, rules: { ...DEFAULT_QR_RULES } };
    for (const row of [base, branch]) {
      if (!row) continue;
      const overrides = row.overrides as string[] | null;
      for (const f of FIELDS) if (!row.branchId || !overrides || overrides.includes(f)) merged[f] = row[f] as boolean;
      merged.rules = { ...merged.rules!, ...(row.rules as Partial<QrRules> ?? {}) };
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'qr-settings:' + restaurantId}))`;
      if (branchId) {
        const branch = await tx.branch.findFirst({ where: { id: branchId, restaurantId } });
        if (!branch) throw new BadRequestException('Unknown branch');
      }
      const existing = await tx.qrSettings.findFirst({ where: { restaurantId, branchId } });
      const { rules, ...flags } = changes;
      const keys = existing?.overrides as string[] | null;
      const overrides = branchId ? [...new Set([...(existing && !keys ? FIELDS : keys ?? []), ...Object.keys(flags)])] : [];
      const data = { ...flags, overrides, ...(rules ? { rules: { ...(existing?.rules as object ?? {}), ...rules } } : {}) };
      if (existing) await tx.qrSettings.update({ where: { id: existing.id }, data });
      else {
        const { rules: _rules, ...baseFlags } = before;
        await tx.qrSettings.create({ data: { restaurantId, branchId, ...baseFlags, ...data } });
      }
      await this.audit.log(
        { actorType: 'TENANT', actorId: actor.id, restaurantId, action: QR_AUDIT.SETTINGS_CHANGED, category: 'QR_ORDERING', details: { branchId, changes, actorKind: actor.type } },
        tx
      );
    });
    this.bus.publishInvalidation(restaurantId);
    return { ...before, ...(await this.effective(restaurantId, branchId)) };
  }

  async inherit(restaurantId: string, actorId: string, branchId: string) {
    await this.prisma.runAsTenant(restaurantId, async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'qr-settings:' + restaurantId}))`;
      if (!await tx.branch.findFirst({ where: { id: branchId, restaurantId } })) throw new BadRequestException('Unknown branch');
      await tx.qrSettings.deleteMany({ where: { restaurantId, branchId } });
      await this.audit.log({ actorType: 'TENANT', actorId, restaurantId, action: QR_AUDIT.SETTINGS_CHANGED, category: 'QR_ORDERING', details: { branchId, inherit: true } }, tx);
    });
    this.bus.publishInvalidation(restaurantId);
    return this.effective(restaurantId, branchId);
  }

  async printDesign(restaurantId: string) {
    const row = await this.prisma.runAsTenant(restaurantId, tx => tx.qrBranding.findUnique({ where: { restaurantId } }));
    return row?.printDesign ?? { template: 'premium', accent: '#0B253A', instruction: 'Scan to Order', footer: 'Freshly prepared. Thoughtfully served.', showLogo: true, layout: 'CARD' };
  }

  async savePrintDesign(restaurantId: string, actorId: string, body: z.infer<typeof qrPrintDesignSchema>) {
    await this.prisma.runAsTenant(restaurantId, async tx => {
      await tx.qrBranding.upsert({ where: { restaurantId }, create: { restaurantId, printDesign: body }, update: { printDesign: body } });
      await this.audit.log({ actorType: 'TENANT', actorId, restaurantId, action: 'QR_PRINT_DESIGN_CHANGED', category: 'QR_ORDERING', details: { template: body.template, layout: body.layout } }, tx);
    });
    return body;
  }

  // ---------------------------------------------------------------- branding (the restaurant's own words, colour and logo)

  async branding(restaurantId: string) {
    const [row,extra]=await this.prisma.runAsTenant(restaurantId,async tx=>[await tx.qrBranding.findUnique({where:{restaurantId}}), (await this.entitlements.resolveQrCapability(tx,restaurantId,'QR_BRANDING')).enabled ? (await tx.syncedEntity.findUnique({where:{restaurantId_entityType_externalId:{restaurantId,entityType:'QR_BRAND_EXTRAS',externalId:'restaurant'}}}))?.payload as any : null]);
    return {
      ...(extra?{coverUrl:publicImageUrl(extra.coverRef)??null,backgroundColor:extra.backgroundColor??'#FAF8F3',layout:extra.layout??'CARDS',contactMessage:extra.contactMessage??''}:{}),
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
    if(dto.reset){for(const k of ['welcomeTitle','welcomeMessage','footerMessage','orderButtonLabel','accentColor','logoRef'])data[k]=null;}
    let cover:ReturnType<typeof parseInlineImage>|null=null;
    if(dto.cover){cover=parseInlineImage(dto.cover);if('error' in cover)throw new BadRequestException('Cover: '+cover.error);}
    if(dto.backgroundColor&&Number.parseInt(dto.backgroundColor.slice(1,3),16)*.299+Number.parseInt(dto.backgroundColor.slice(3,5),16)*.587+Number.parseInt(dto.backgroundColor.slice(5,7),16)*.114<190)throw new BadRequestException('Choose a light background to keep the menu readable.');
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
    if (Object.keys(data).length === 0 && !['cover','backgroundColor','layout','contactMessage'].some(k=>k in dto)) throw new BadRequestException('No changes supplied');
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      if(['cover','backgroundColor','layout','contactMessage'].some(k=>k in dto)||dto.reset){
        await this.entitlements.assertQrCapability(tx,restaurantId,'QR_BRANDING');
        const where={restaurantId_entityType_externalId:{restaurantId,entityType:'QR_BRAND_EXTRAS',externalId:'restaurant'}};
        const old=(await tx.syncedEntity.findUnique({where}))?.payload as any??{};
        const next=dto.reset?{}:{...old,...(dto.cover!==undefined?{coverRef:cover&&'image' in cover?'img:'+cover.image.hash:null}:{}),...(dto.backgroundColor?{backgroundColor:dto.backgroundColor}:{}),...(dto.layout?{layout:dto.layout}:{}),...(dto.contactMessage!==undefined?{contactMessage:dto.contactMessage}: {})};
        if(cover&&'image' in cover)await tx.menuImage.upsert({where:{restaurantId_hash:{restaurantId,hash:cover.image.hash}},create:{restaurantId,hash:cover.image.hash,contentType:cover.image.contentType,size:cover.image.data.length,data:cover.image.data},update:{}});
        await tx.syncedEntity.upsert({where,create:{restaurantId,entityType:'QR_BRAND_EXTRAS',externalId:'restaurant',payload:next},update:{payload:next,syncVersion:{increment:1}}});
      }
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
