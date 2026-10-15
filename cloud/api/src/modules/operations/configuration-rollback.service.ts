import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { OperationsService, OpsScope } from './operations.service';
import { MenuPublicationsService } from '../menu-publications/menu-publications.service';
import { buildContent, SnapshotContent } from '../menu-publications/menu-snapshot';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { rememberAppearance } from './appearance-history';
import { stableJson } from './operations-records';
import { WelcomeDesignsService } from '../platform-settings/welcome-designs.service';
export interface RollbackInput {
  kind: 'MENU' | 'APPEARANCE';
  version: string;
  fields: ('price' | 'isAvailable' | 'imageUrl' | 'text' | 'background')[];
  previewHash?: string;
  acknowledge?: boolean;
}
const object = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const textFields = [
  'headingText',
  'subtitleText',
  'startOrderButtonText',
  'supportingText',
  'restaurantName',
  'promoBannerText',
  'showPromoBanner',
  'showHeritageArtwork'
];
const imageFields = [
  'backgroundImageUrl',
  'backgroundLandscapeImageUrl',
  'backgroundId',
  'backgroundFit',
  'backgroundPositionX',
  'backgroundPositionY',
  'backgroundZoom',
  'overlayOpacity',
  'logoUrl'
];
@Injectable()
export class ConfigurationRollbackService {
  constructor(
    private readonly ops: OperationsService,
    private readonly menus: MenuPublicationsService,
    private readonly bus: RealtimeBus,
    private readonly welcome: WelcomeDesignsService,
    private readonly entitlements: ApplicationEntitlementsService
  ) {}
  private owner(s: OpsScope) {
    if (s.role !== 'OWNER') throw new ForbiddenException('Only an owner can restore shared configuration');
  }
  async versions(s: OpsScope) {
    this.owner(s);
    return this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => ({
      menus: await tx.menuSnapshot.findMany({
        where: { restaurantId: s.restaurantId },
        select: { version: true, createdAt: true },
        orderBy: { version: 'desc' },
        take: 30
      }),
      appearances: (
        await tx.syncedEntity.findMany({
          where: {
            restaurantId: s.restaurantId,
            entityType: 'OPS_APPEARANCE_VERSION',
            OR: [{ payload: { path: ['branchId'], equals: s.branchId } }, { payload: { path: ['branchId'], equals: 'restaurant' } }]
          },
          orderBy: { createdAt: 'desc' },
          take: 50
        })
      ).map((r) => ({ id: r.externalId, ...object(r.payload) }))
    }));
  }
  private async review(tx: Prisma.TransactionClient, s: OpsScope, input: RollbackInput) {
    const branches = await tx.branch.findMany({ where: { restaurantId: s.restaurantId, status: 'ACTIVE' }, select: { id: true, name: true } });
    if (input.kind === 'MENU') {
      const version = Number(input.version);
      if (!Number.isInteger(version) || version < 1) throw new BadRequestException('Choose a published menu version');
      const snapshot = await tx.menuSnapshot.findUnique({ where: { restaurantId_version: { restaurantId: s.restaurantId, version } } });
      if (!snapshot) throw new NotFoundException('Menu version not found');
      const draft = await tx.syncedEntity.findMany({
        where: { restaurantId: s.restaurantId, entityType: { in: ['MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'TAX_GROUP', 'BRANCH_MENU_OVERRIDE'] } }
      });
      const built = buildContent(draft),
        old = snapshot.content as unknown as SnapshotContent;
      const changes = draft
        .filter((r) => r.entityType === 'MENU_ITEM')
        .flatMap((r) => {
          const past = old.items.find((i) => i.id === r.externalId),
            current = object(r.payload);
          if (!past || current.deleted) return [];
          const desired = {
            ...(input.fields.includes('price') ? { price: past.pricePaise / 100 } : {}),
            ...(input.fields.includes('isAvailable') ? { isAvailable: past.available } : {}),
            ...(input.fields.includes('imageUrl') ? { imageUrl: past.imageUrl ?? null } : {})
          };
          const fields = Object.entries(desired).filter(([k, v]) => stableJson(current[k] ?? null) !== stableJson(v));
          return fields.length
            ? [
                {
                  id: r.externalId,
                  name: current.name,
                  fields: fields.map(([field, to]) => ({ field, from: current[field] ?? null, to })),
                  version: r.syncVersion
                }
              ]
            : [];
        });
      return { kind: 'MENU' as const, changes, branches, scope: 'Whole restaurant; existing historical orders are unchanged.', fingerprint: built.checksum };
    }
    const record = await tx.syncedEntity.findUnique({
        where: { restaurantId_entityType_externalId: { restaurantId: s.restaurantId, entityType: 'OPS_APPEARANCE_VERSION', externalId: input.version } }
      }),
      past = object(record?.payload);
    if (!record || !['restaurant', s.branchId].includes(past.branchId)) throw new NotFoundException('Appearance version not found in this scope');
    let before: Record<string, any>, desired: Record<string, any>;
    if (past.target === 'QR') {
      const base = await tx.qrBranding.findUnique({ where: { restaurantId: s.restaurantId } }),
        extra = await tx.syncedEntity.findUnique({
          where: { restaurantId_entityType_externalId: { restaurantId: s.restaurantId, entityType: 'QR_BRAND_EXTRAS', externalId: 'restaurant' } }
        });
      before = {
        base: base
          ? Object.fromEntries(
              ['welcomeTitle', 'welcomeMessage', 'footerMessage', 'orderButtonLabel', 'accentColor', 'logoRef'].map((k) => [k, (base as any)[k] ?? null])
            )
          : {},
        extra: object(extra?.payload)
      };
      desired = {
        base: {
          ...before.base,
          ...(input.fields.includes('text')
            ? Object.fromEntries(['welcomeTitle', 'welcomeMessage', 'footerMessage', 'orderButtonLabel'].map((k) => [k, past.presentation.base[k] ?? null]))
            : {}),
          ...(input.fields.includes('background') ? Object.fromEntries(['accentColor', 'logoRef'].map((k) => [k, past.presentation.base[k] ?? null])) : {})
        },
        extra: input.fields.includes('background') ? past.presentation.extra : before.extra
      };
    } else {
      const config = await tx.syncedEntity.findUnique({
        where: { restaurantId_entityType_externalId: { restaurantId: s.restaurantId, entityType: 'KIOSK_CONFIGURATION', externalId: past.key } }
      });
      if (!config) throw new NotFoundException('Kiosk configuration not found');
      before = object(object(config.payload).welcome);
      desired = { ...before };
      for (const field of [...(input.fields.includes('text') ? textFields : []), ...(input.fields.includes('background') ? imageFields : [])]) {
        if (past.presentation[field] === undefined) delete desired[field];
        else desired[field] = past.presentation[field];
      }
    }
    return {
      kind: 'APPEARANCE' as const,
      target: past.target,
      key: past.key,
      before,
      desired,
      changes: [{ id: past.key, name: past.target, fields: [{ field: 'presentation', from: before, to: desired }] }],
      branches: past.branchId === 'restaurant' ? branches : branches.filter((b) => b.id === s.branchId),
      scope: past.branchId === 'restaurant' ? 'Whole restaurant appearance' : 'Selected branch kiosk welcome appearance',
      fingerprint: stableJson(before)
    };
  }
  async preview(s: OpsScope, input: RollbackInput) {
    this.owner(s);
    return this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const review = await this.review(tx, s, input);
      return {
        ...review,
        previewHash: createHash('sha256')
          .update(stableJson({ kind: input.kind, version: input.version, fields: input.fields, review })!)
          .digest('hex')
      };
    });
  }
  async apply(s: OpsScope, input: RollbackInput) {
    this.owner(s);
    const allowedDesigns = await this.welcome.forRestaurant(s.restaurantId);
    const saved = await this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + s.restaurantId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'menu-publish:' + s.restaurantId}))`;
      const review = await this.review(tx, s, input),
        hash = createHash('sha256')
          .update(stableJson({ kind: input.kind, version: input.version, fields: input.fields, review })!)
          .digest('hex');
      if (!input.acknowledge || input.previewHash !== hash)
        throw new ConflictException('The configuration changed. Preview and acknowledge the current changes again.');
      await this.ops.auditAction(
        s,
        'CONFIGURATION_ROLLBACK_REVIEWED',
        {
          kind: input.kind,
          previousVersion: input.version,
          fields: input.fields,
          branchIds: review.branches.map((b) => b.id),
          changedRecordIds: review.changes.map((c) => c.id)
        },
        tx
      );
      if (review.kind === 'MENU') {
        for (const change of review.changes) {
          const where = { restaurantId_entityType_externalId: { restaurantId: s.restaurantId, entityType: 'MENU_ITEM', externalId: change.id } },
            row = await tx.syncedEntity.findUniqueOrThrow({ where });
          await tx.syncedEntity.update({
            where,
            data: {
              payload: { ...object(row.payload), ...Object.fromEntries(change.fields.map((f) => [f.field, f.to])), updatedAt: new Date().toISOString() },
              syncVersion: { increment: 1 }
            }
          });
        }
        return { version: (await this.menus.publishTx(tx, s.restaurantId, null, `Reviewed rollback to menu ${input.version}`)).created.version };
      }
      if (review.target === 'QR') {
        await this.entitlements.assertAppEnabled(tx, s.restaurantId, 'QR_ORDERING');
        if (input.fields.includes('background')) await this.entitlements.assertQrCapability(tx, s.restaurantId, 'QR_BRANDING');
        await rememberAppearance(tx, s.restaurantId, 'QR', 'restaurant', null, review.before);
        await tx.qrBranding.upsert({
          where: { restaurantId: s.restaurantId },
          create: { restaurantId: s.restaurantId, ...review.desired.base },
          update: review.desired.base
        });
        await tx.syncedEntity.upsert({
          where: { restaurantId_entityType_externalId: { restaurantId: s.restaurantId, entityType: 'QR_BRAND_EXTRAS', externalId: 'restaurant' } },
          create: { restaurantId: s.restaurantId, entityType: 'QR_BRAND_EXTRAS', externalId: 'restaurant', payload: review.desired.extra },
          update: { payload: review.desired.extra, syncVersion: { increment: 1 } }
        });
      } else {
        this.ops.require(s, 'KIOSK_ADMIN');
        if (review.desired.backgroundId && !allowedDesigns.designs.some((d) => d.id === review.desired.backgroundId))
          throw new BadRequestException('The previous background is no longer licensed. Restore text only or choose a current background.');
        const where = { restaurantId_entityType_externalId: { restaurantId: s.restaurantId, entityType: 'KIOSK_CONFIGURATION', externalId: review.key } },
          row = await tx.syncedEntity.findUniqueOrThrow({ where });
        await rememberAppearance(tx, s.restaurantId, 'KIOSK', review.key, s.branchId, review.before);
        await tx.syncedEntity.update({
          where,
          data: { payload: { ...object(row.payload), welcome: review.desired, updatedAt: new Date().toISOString() }, syncVersion: { increment: 1 } }
        });
      }
      return { restored: true };
    });
    this.bus.publishInvalidation(s.restaurantId);
    this.bus.publish({ restaurantId: s.restaurantId, branchId: null, kind: 'entities' });
    if ('version' in saved) this.bus.publish({ restaurantId: s.restaurantId, branchId: null, kind: 'menu', seq: saved.version });
    return saved;
  }
}
