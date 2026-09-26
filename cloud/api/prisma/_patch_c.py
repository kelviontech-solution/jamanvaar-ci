import re, shutil, os

# 1. admin service: settings write goes through the entitlement check
p = 'src/modules/qr/qr-admin.service.ts'
s = open(p, encoding='utf-8').read()
s = s.replace("import { QrSettingsService } from './qr-settings.service';", "import { QrSettingsService, QrSettingsUpdate } from './qr-settings.service';", 1)
s = s.replace("  getSettings(restaurantId: string, branchId?: string) {", "  async updateSettings(device: Device, changes: QrSettingsUpdate, branchId?: string) {\n    await this.requireEnabled(device.restaurantId);\n    return this.settings.update(device.restaurantId, { id: device.id, type: 'DEVICE' }, changes, branchId ?? null);\n  }\n\n  getSettings(restaurantId: string, branchId?: string) {", 1)
open(p, 'w', encoding='utf-8', newline='').write(s)

# 2. entity sync: tokens are minted by the server. A terminal can only mirror an old client-minted token for its own table.
p = 'src/modules/entity-sync/entity-sync.service.ts'
s = open(p, encoding='utf-8').read()
a = s.index("  /**\n   * BUG-119: keeps QrTableLink's own indexed row")
b = s.index("  async catchUp(device: Device, entityType: SyncableEntityType")
new = '''  /**
   * QR codes are cloud-authoritative: the server mints, versions, disables and revokes them (see the qr module), and a
   * terminal can no longer create or change one. The single thing kept here is a compatibility mirror for codes
   * printed before that change: an older Restaurant Admin still pushes the token it minted in the browser
   * (`jv_qr_tbl_...`) with its table, and that token is recorded as an ACTIVE legacy code for THAT restaurant only.
   * INSERT .. ON CONFLICT DO NOTHING means it can never overwrite or re-point an existing token, whichever
   * restaurant owns it. Whether a table is still active is answered at scan time from the table's own record, so
   * nothing here mirrors table state. Removed with the old clients (plan P12).
   */
  private async syncQrTableLink(tx: Prisma.TransactionClient, restaurantId: string, evt: EntitySyncEventDto, branchId: string | null): Promise<void> {
    const payload = evt.payload as Record<string, unknown>;
    if (payload?.deleted === true) return;
    const qrToken = typeof payload.qrToken === 'string' ? payload.qrToken : null;
    if (!qrToken || !/^jv_qr_tbl_[A-Za-z0-9_]{10,150}$/.test(qrToken)) return;
    if (payload.qrStatus === 'DISABLED' || payload.isActive === false) return;

    const tableNumber = typeof payload.tableNumber === 'string' ? payload.tableNumber : evt.externalId;
    let branch = typeof payload.branchId === 'string' ? (payload.branchId as string) : branchId;
    if (!branch) {
      const branches = await tx.branch.findMany({ where: { restaurantId }, select: { id: true }, take: 2 });
      branch = branches.length === 1 ? branches[0].id : null;
    }
    await tx.$executeRaw`
      INSERT INTO "QrCode" ("id", "publicToken", "restaurantId", "branchId", "tableId", "tableNumber", "status", "mode", "version", "metadata", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${qrToken}, ${restaurantId}, ${branch}, ${evt.externalId}, ${tableNumber}, 'ACTIVE', 'TABLE_ORDER', 1, '{"legacy": true}'::jsonb, NOW(), NOW())
      ON CONFLICT DO NOTHING`;
  }

'''
s = s[:a] + new + s[b:]
s = s.replace("await this.syncQrTableLink(tx, restaurantId, evt);", "await this.syncQrTableLink(tx, restaurantId, evt, deviceBranchId ?? null);", 1)
if "randomUUID" not in s.split("export class")[0]:
    s = "import { randomUUID } from 'node:crypto';\n" + s
open(p, 'w', encoding='utf-8', newline='').write(s)

# 3. app module: the old guest module goes; the qr module replaces it
p = 'src/app.module.ts'
s = open(p, encoding='utf-8').read()
s = s.replace("import { QrGuestOrderingModule } from './modules/qr-guest-ordering/qr-guest-ordering.module';", "import { QrModule } from './modules/qr/qr.module';", 1)
s = s.replace("    QrGuestOrderingModule,", "    QrModule,", 1)
open(p, 'w', encoding='utf-8', newline='').write(s)
shutil.rmtree('src/modules/qr-guest-ordering')
print('ok')
