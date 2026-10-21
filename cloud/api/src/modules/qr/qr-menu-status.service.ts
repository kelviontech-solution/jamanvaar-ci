import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Device } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { MenuPublicationsService } from '../menu-publications/menu-publications.service';
import { buildContent, explainHidden, SnapshotContent, viewForBranch } from '../menu-publications/menu-snapshot';
import { QrAdminService } from './qr-admin.service';
import { QrMenuService } from './qr-menu.service';
import { qrLiveRestriction } from './qr-live-availability';

@Injectable()
export class QrMenuStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: QrAdminService,
    private readonly publications: MenuPublicationsService,
    private readonly menus: QrMenuService
  ) {}

  async status(device: Device, requested?: string) {
    if (requested && !z.string().uuid().safeParse(requested).success) throw new BadRequestException('Choose a valid branch.');
    let branchId = this.admin.scopedBranch(device, requested);
    const data = await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      const branches = await tx.branch.findMany({ where: { restaurantId: device.restaurantId, status: 'ACTIVE' }, select: { id: true, name: true } });
      branchId ??= branches.length === 1 ? branches[0].id : undefined;
      if (!branchId) throw new BadRequestException('Choose a branch to check the live QR menu.');
      const branch = branches.find((row) => row.id === branchId);
      if (!branch) throw new NotFoundException('Active branch not found.');
      const [rows, published] = await Promise.all([
        tx.syncedEntity.findMany({
          where: {
            restaurantId: device.restaurantId,
            entityType: { in: ['MENU_CATEGORY', 'MENU_ITEM', 'MODIFIER_GROUP', 'TAX_GROUP', 'BRANCH_MENU_OVERRIDE'] }
          },
          select: { externalId: true, entityType: true, payload: true }
        }),
        tx.menuSnapshot.findFirst({
          where: { restaurantId: device.restaurantId },
          orderBy: { version: 'desc' },
          select: { version: true, content: true, createdAt: true }
        })
      ]);
      return { rows, published, branch };
    });
    const entitlement = await this.admin.entitlement(device.restaurantId, branchId);
    if (!entitlement.enabled) throw new ForbiddenException(entitlement.lockedMessage || 'QR ordering is not available.');
    const review = await this.publications.draftStatus(device);
    const settings = await this.admin.getSettings(device.restaurantId, branchId);
    const channelReason = !settings.orderingEnabled
      ? 'QR ordering is switched off in QR Settings.'
      : !settings.tableOrderingEnabled && !settings.menuOnlyEnabled
        ? 'Both table and menu QR modes are switched off in QR Settings.'
        : entitlement.limits.qrDigitalMenu === false
          ? 'Digital menu access is disabled by this license.'
          : null;
    const notices = channelReason
      ? [channelReason]
      : !settings.tableOrderingEnabled
        ? ['Table ordering QR codes are switched off. Menu QR mode is still enabled.']
        : [];
    const live = data.published ? await this.menus.build(device.restaurantId, branchId!, data.published.version, true) : null;
    const built = buildContent(data.rows),
      draftView = viewForBranch(built.content, branchId!);
    if (review.checksum !== built.checksum || review.publishedVersion !== (data.published?.version ?? 0))
      throw new ConflictException('The menu changed while checking visibility. Refresh the live status.');
    const published = data.published?.content as unknown as SnapshotContent | undefined;
    const publishedItems = new Map(published?.items.map((item) => [item.id, item]) ?? []);
    const liveItems = new Map(!channelReason ? (live?.items.map((item) => [item.id, item]) ?? []) : []);
    const draftVisible = new Set(draftView.items.map((item) => item.id));
    const draftHidden = new Map(explainHidden(built.content, branchId!).map((item) => [item.itemId, item.reason]));
    const publishedHidden = new Map(published ? explainHidden(published, branchId!).map((item) => [item.itemId, item.reason]) : []);
    const raw = data.rows.map((row) => ({ ...row, p: row.payload as Record<string, any> }));
    const hiddenCategories = new Set(
      raw
        .filter((row) => row.entityType === 'MENU_CATEGORY' && (row.p.deleted === true || row.p.isActive === false || row.p.qrVisible === false))
        .map((row) => row.externalId)
    );
    const overrides = new Map(
      raw
        .filter((row) => row.entityType === 'BRANCH_MENU_OVERRIDE' && row.p.branchId === branchId && row.p.deleted !== true)
        .map((row) => [row.p.itemId, row.p])
    );
    const changedIds = new Set([...review.changes.added, ...review.changes.updated].map((item) => item.id));
    const changedGroups = new Set(review.changes.optionGroups.map((group) => group.id));
    const rows = raw
      .filter((row) => row.entityType === 'MENU_ITEM' && row.p.deleted !== true)
      .map(({ externalId: id, p }) => {
        const restriction = qrLiveRestriction(p, overrides.get(id), hiddenCategories, branchId!);
        const isLive = liveItems.has(id),
          isPublished = publishedItems.has(id);
        const hasChanges = changedIds.has(id) || (Array.isArray(p.modifierGroupIds) && p.modifierGroupIds.some((group: string) => changedGroups.has(group)));
        const afterPublish = draftVisible.has(id) && !restriction && !channelReason;
        return {
          id,
          name: String(p.name ?? ''),
          categoryId: String(p.categoryId ?? ''),
          livePrice: liveItems.get(id)?.price ?? null,
          state: isLive ? (hasChanges ? 'LIVE_WITH_CHANGES' : 'LIVE') : !isPublished ? 'DRAFT_ONLY' : 'HIDDEN',
          live: isLive,
          afterPublishVisible: afterPublish,
          reason: isLive
            ? hasChanges
              ? 'Customers still see the published version. Review and publish these changes.'
              : 'Visible on the live QR menu.'
            : !isPublished
              ? 'Not published yet.'
              : channelReason || restriction || publishedHidden.get(id) || 'Hidden in the published menu. Publish the updated draft to restore it.',
          canRestoreBranchPause: overrides.get(id)?.isAvailable === false,
          afterPublishReason: afterPublish
            ? 'Visible after publishing.'
            : channelReason || restriction || draftHidden.get(id) || 'Check the dish price, category, tax and required choices.'
        };
      });
    return {
      branchId,
      branchName: data.branch.name,
      checkedAt: new Date().toISOString(),
      publishedAt: data.published?.createdAt.toISOString() ?? null,
      publishedVersion: data.published?.version ?? 0,
      review,
      notices,
      counts: { draft: rows.length, live: liveItems.size, afterPublish: rows.filter((row) => row.afterPublishVisible).length },
      rows,
      liveItems: [...liveItems.values()].map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
        categoryId: item.categoryId
      })),
      removedSinceDraft: (published?.items ?? []).filter((item) => !rows.some((row) => row.id === item.id)).map((item) => ({ id: item.id, name: item.name }))
    };
  }
}
