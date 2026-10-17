import { Injectable } from '@nestjs/common';
import { AppCode } from '@prisma/client';
import { z } from 'zod';
import { OperationsService, OpsScope } from './operations.service';
import { ApplicationEntitlementsService, ALL_APP_CODES } from '../application-entitlements/application-entitlements.service';
import { buildContent, explainHidden, publicImageUrl, SnapshotContent, viewForBranch } from '../menu-publications/menu-snapshot';
import { deviceHealth } from '../../common/device-health';
import { applyBranchLicense } from '../../common/security/branch-license';

export const workflowPreferences = z
  .object({ expectedVersion: z.number().int().nonnegative(), tableService: z.boolean(), printedReceipts: z.boolean() })
  .strict();
@Injectable()
export class AdminWorkflowService {
  constructor(
    private readonly ops: OperationsService,
    private readonly entitlements: ApplicationEntitlementsService
  ) {}
  async preferences(s: OpsScope, input: z.infer<typeof workflowPreferences>) {
    return this.ops.write(
      s,
      'OPS_LAUNCH_PREFERENCES',
      s.branchId,
      { tableService: input.tableService, printedReceipts: input.printedReceipts },
      input.expectedVersion,
      'LAUNCH_PREFERENCES_CHANGED'
    );
  }
  async inspect(s: OpsScope) {
    const preferences = await this.ops.read(s, 'OPS_LAUNCH_PREFERENCES');
    const acceptanceState = await this.ops.acceptance(s);
    return this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const [branch, devices, snapshot, rows, handovers, configuration, restaurantGrants] = await Promise.all([
        tx.branch.findFirstOrThrow({ where: { id: s.branchId, restaurantId: s.restaurantId, status: 'ACTIVE' } }),
        tx.device.findMany({
          where: { restaurantId: s.restaurantId, branchId: s.branchId, status: { not: 'REVOKED' } }
        }),
        tx.menuSnapshot.findFirst({ where: { restaurantId: s.restaurantId }, orderBy: { version: 'desc' } }),
        tx.syncedEntity.findMany({
          where: {
            restaurantId: s.restaurantId,
            entityType: { in: ['MENU_ITEM', 'MENU_CATEGORY', 'BRANCH_MENU_OVERRIDE', 'MODIFIER_GROUP', 'TAX_GROUP', 'DINING_TABLE'] }
          }
        }),
        tx.syncedEntity.findMany({
          where: { restaurantId: s.restaurantId, entityType: 'OPS_HANDOVER', payload: { path: ['branchId'], equals: s.branchId } },
          orderBy: { updatedAt: 'desc' },
          take: 5
        }),
        tx.syncedEntity.findUnique({
          where: {
            restaurantId_entityType_externalId: { restaurantId: s.restaurantId, entityType: 'KIOSK_CONFIGURATION', externalId: 'kiosk-config-' + s.branchId }
          }
        }),
        Promise.all(ALL_APP_CODES.map((app) => this.entitlements.resolve(tx, s.restaurantId, app)))
      ]);
      const branchGrants = await Promise.all(restaurantGrants.map((grant) => applyBranchLicense(tx, s.restaurantId, s.branchId, grant.appCode, grant)));
      const flags = { tableService: preferences.data?.tableService !== false, printedReceipts: preferences.data?.printedReceipts !== false };
      const draft = buildContent(rows);
      const published = snapshot?.content as unknown as SnapshotContent | undefined;
      const configuredVersion = (configuration?.payload as any)?.updatedAt as string | undefined;
      const kioskIds = devices.filter((d) => d.type === 'KIOSK').map((d) => d.id);
      const commands =
        configuredVersion && kioskIds.length
          ? await tx.deviceCommand.findMany({
              where: {
                restaurantId: s.restaurantId,
                deviceId: { in: kioskIds },
                commandType: 'REQUEST_SYNC',
                payload: { path: ['configVersion'], equals: configuredVersion }
              },
              orderBy: { issuedAt: 'desc' }
            })
          : [];
      const delivery = devices
        .filter((d) => d.type === 'KIOSK')
        .map((d) => {
          const command = commands.find((c) => c.deviceId === d.id);
          const received =
            !!configuredVersion &&
            commands.some((c) => c.deviceId === d.id && c.status === 'SUCCEEDED' && (c.result as any)?.configVersion === configuredVersion);
          return {
            id: d.id,
            name: d.name || 'Kiosk',
            online: deviceHealth(d) === 'online',
            isLocked: d.isLocked,
            menuVersion: d.menuVersion,
            menuReceived: !!snapshot && d.menuVersion === snapshot.version,
            configurationVersion: configuredVersion ?? null,
            configurationReceived: received,
            configurationStatus: received ? 'RECEIVED' : command?.status === 'FAILED' ? 'FAILED' : command?.status === 'EXPIRED' ? 'EXPIRED' : 'WAITING',
            error: received || !command?.errorMessage ? null : 'Synchronization failed. Open this kiosk to review and retry its command.'
          };
        });
      const products = ALL_APP_CODES.map((appCode, index) => {
        const purchased = restaurantGrants[index].enabled,
          grant = branchGrants[index],
          enabled = grant.enabled;
        const channel = appCode === 'QR_ORDERING' ? 'QR' : appCode;
        const hasMenu = !!published && viewForBranch(published, s.branchId, channel).items.length > 0;
        // The unified owner console also hosts licensed kiosk management. Older
        // installations can still report KIOSK_ADMIN; neither identity grants access.
        const relevant = devices.filter((d) => d.type === appCode || (appCode === 'KIOSK_ADMIN' && d.type === 'POS_ADMIN'));
        const ordering = ['POS', 'KIOSK', 'QR_ORDERING', 'CAPTAIN'].includes(appCode);
        const configured = ordering ? hasMenu : relevant.length > 0;
        const tested = ordering
          ? acceptanceState.records.some((a) => (a as any).source === channel && a.current)
          : relevant.some((d) => !d.isLocked && deviceHealth(d) === 'online');
        const ready = enabled && configured && tested;
        return {
          appCode,
          purchased,
          enabled,
          configured,
          ready,
          reason: !purchased
            ? restaurantGrants[index].reason
            : !enabled
              ? grant.reason
              : !configured
                ? 'SETUP_REQUIRED'
                : !tested
                  ? 'TEST_ORDER_REQUIRED'
                  : 'VERIFIED',
          nextAction: !purchased ? 'LICENSE' : !enabled ? 'LICENSE' : !configured ? (ordering ? 'MENU' : 'SYNC') : ordering ? 'OPERATIONS_HUB' : 'SYNC'
        };
      });
      const channels = ['POS', 'CAPTAIN', 'KIOSK', 'QR'].filter((c) => products.some((p) => p.appCode === (c === 'QR' ? 'QR_ORDERING' : c) && p.enabled));
      return {
        branch: { id: branch.id, name: branch.name },
        preferences: { version: preferences.version, ...flags },
        products,
        channels,
        publishedMenuVersion: snapshot?.version ?? 0,
        unpublishedChanges: !!snapshot && draft.checksum !== snapshot.checksum,
        checks: [
          {
            id: 'menu',
            label: 'Publish a menu customers can order',
            done: !!snapshot && channels.every((c) => viewForBranch(published!, s.branchId, c).items.length > 0),
            page: 'MENU'
          },
          ...(flags.tableService
            ? [
                {
                  id: 'tables',
                  label: 'Set up tables for table service',
                  done: rows.some(
                    (r) => r.entityType === 'DINING_TABLE' && (r.payload as any)?.branchId === s.branchId && (r.payload as any)?.deleted !== true
                  ),
                  page: 'TABLES'
                }
              ]
            : []),
          ...(channels.includes('KIOSK')
            ? [
                {
                  id: 'kiosk',
                  label: 'Connect kiosks and confirm menu / design delivery',
                  done: delivery.length > 0 && delivery.every((d) => d.online && !d.isLocked && d.menuReceived && d.configurationReceived),
                  page: 'KIOSKS'
                }
              ]
            : []),
          ...(flags.printedReceipts
            ? [
                {
                  id: 'printer',
                  label: 'Verify printed receipts during a channel test',
                  done:
                    channels.length > 0 &&
                    channels.every((c) => acceptanceState.records.some((r) => (r as any).source === c && (r as any).receipt === true && r.current)),
                  page: 'OPERATIONS_HUB'
                }
              ]
            : []),
          ...channels.map((c) => ({
            id: 'test-' + c,
            label: 'Verify ' + c + ' order, kitchen, payment and receipt',
            done: acceptanceState.records.some((r) => (r as any).source === c && r.current),
            page: 'OPERATIONS_HUB'
          }))
        ],
        delivery,
        handovers: handovers.map((r) => ({ version: r.syncVersion, ...(r.payload as object) })),
        paymentNote: 'Readiness requires channel acceptance evidence. Online payment return must be verified separately in Operations > Channel acceptance.'
      };
    });
  }
  async menu(s: OpsScope, channel: 'POS' | 'KIOSK' | 'QR') {
    return this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const grant = await this.entitlements.resolve(tx, s.restaurantId, (channel === 'QR' ? 'QR_ORDERING' : channel) as AppCode, s.branchId);
      const snapshot = await tx.menuSnapshot.findFirst({ where: { restaurantId: s.restaurantId }, orderBy: { version: 'desc' } });
      const rows = await tx.syncedEntity.findMany({
        where: { restaurantId: s.restaurantId, entityType: { in: ['MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'TAX_GROUP', 'BRANCH_MENU_OVERRIDE'] } }
      });
      const content = snapshot?.content as unknown as SnapshotContent | undefined;
      if (!content || !grant.enabled)
        return { channel, version: snapshot?.version ?? 0, enabled: grant.enabled, reason: grant.reason, items: [], hidden: [], source: 'PUBLISHED' };
      const view = viewForBranch(content, s.branchId, channel);
      const excluded = new Map(explainHidden(content, s.branchId, channel).map((i) => [i.itemId, i.reason]));
      const live = new Map(rows.filter((r) => r.entityType === 'MENU_ITEM').map((r) => [r.externalId, r.payload as any]));
      const overrides = new Map(
        rows
          .filter((r) => r.entityType === 'BRANCH_MENU_OVERRIDE' && (r.payload as any)?.branchId === s.branchId)
          .map((r) => [(r.payload as any)?.itemId, r.payload as any])
      );
      const cats = new Map(rows.filter((r) => r.entityType === 'MENU_CATEGORY').map((r) => [r.externalId, r.payload as any]));
      const liveReason = (i: (typeof view.items)[number]) => {
        const p = live.get(i.id),
          o = overrides.get(i.id),
          cat = cats.get(i.categoryId),
          stock = o?.stockQuantity ?? p?.stockQuantity;
        if (p?.deleted || p?.archivedAt) return 'Dish removed or archived since publication';
        if (p?.isAvailable === false) return 'Dish marked unavailable';
        if (channel === 'KIOSK' && p?.isKioskEnabled === false) return 'Dish hidden from kiosk ordering';
        if (o?.isAvailable === false || o?.visible === false) return 'Dish switched off for this branch';
        if (cat?.deleted || cat?.isActive === false) return 'Category removed or inactive';
        if (channel === 'QR' && (p?.isQrOrderingEnabled === false || cat?.qrVisible === false)) return 'Dish or category hidden from QR ordering';
        if (Array.isArray(p?.salesChannels) && !p.salesChannels.includes(channel)) return `Dish not sold through ${channel}`;
        if (p?.branchIds?.length && !p.branchIds.includes(s.branchId)) return 'Dish not sold in this branch';
        if (typeof stock === 'number' && stock <= 0) return 'Out of stock in this branch';
        return null;
      };
      const shown = view.items.filter((i) => {
        const reason = liveReason(i);
        if (reason) excluded.set(i.id, reason);
        return !reason;
      });
      return {
        channel,
        version: snapshot!.version,
        enabled: true,
        reason: grant.reason,
        source: 'PUBLISHED_WITH_LIVE_AVAILABILITY',
        note:
          channel === 'POS'
            ? 'Published menu preview. Offline POS may retain its last local menu until synchronization.'
            : 'Published branch menu with current availability exclusions.',
        items: shown.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          price: i.effectivePricePaise / 100,
          imageUrl: publicImageUrl(i.imageUrl)
        })),
        hidden: content.items
          .filter((i) => !shown.some((v) => v.id === i.id))
          .map((i) => ({ id: i.id, name: i.name, reason: excluded.get(i.id) || 'Review branch menu availability' }))
      };
    });
  }
}
