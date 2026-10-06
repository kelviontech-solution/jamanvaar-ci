import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, KeyValueStore, KioskConfigurationRepository, TenantIsolation, KioskDisplaySettingsRepository } from '@jamanvaar/database';
import { syncKioskConfiguration, EntitySyncEngine } from '@jamanvaar/sync';
import { kioskConfigurationSchema } from '../cloud/api/src/modules/entity-sync/kiosk-configuration-schema';
import { BranchCore } from '../packages/branch-core/src/core';
import { BranchStore } from '../packages/branch-core/src/store';
import { CloudUplink } from '../packages/branch-core/src/uplink';
const saved = globalThis.localStorage;
beforeEach(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); }, removeItem: k => { store.delete(k); }, key: i => [...store.keys()][i] ?? null, get length() { return store.size; }, clear: () => store.clear() };
  KeyValueStore.reset();
  KeyValueStore.set('jamanvaar_tenant_id', 'rest-A'); KeyValueStore.set('jamanvaar_bound_branch_id', 'br-A');
  db.resetKioskConfiguration();
});
afterEach(() => { EntitySyncEngine.configureTransport(null); vi.restoreAllMocks(); KeyValueStore.reset(); globalThis.localStorage = saved; });
describe('kiosk configuration', () => {
  it('accepts existing default settings without making payment policy editable', () => {
    const config = KioskConfigurationRepository.snapshot();
    expect(kioskConfigurationSchema.safeParse(config).success).toBe(true);
    expect(kioskConfigurationSchema.safeParse({ ...config, commissionRate: 0 }).success).toBe(false);
  });
  it('rejects executable image URLs and invalid idle/default language settings', () => {
    const config = KioskConfigurationRepository.snapshot();
    for (const display of [{ ...config.display, logoUrl: 'javascript:alert(1)' }, { ...config.display, idleWarningAfterSeconds: 0 }, { ...config.display, enabledLanguages: ['en'], defaultLanguage: 'hi' }]) expect(kioskConfigurationSchema.safeParse({ ...config, display }).success).toBe(false);
  });
  it('tracks actual edits and preserves edits made while a previous publication is pending', () => {
    KioskDisplaySettingsRepository.updateSettings({ accentColor: '#112233' });
    const previous = KioskConfigurationRepository.pending()!;
    KioskDisplaySettingsRepository.updateSettings({ accentColor: '#445566' });
    KioskConfigurationRepository.acknowledge(previous.updatedAt);
    expect(KioskConfigurationRepository.pending()?.display.accentColor).toBe('#445566');
    expect(previous.display.accentColor).toBe('#112233');
  });
  it('ignores an older remote value and a different branch', () => {
    KioskDisplaySettingsRepository.updateSettings({ accentColor: '#112233' });
    const pending = KioskConfigurationRepository.pending()!;
    expect(KioskConfigurationRepository.apply({ ...pending, branchId: 'br-B' })).toBe(false);
    expect(KioskConfigurationRepository.apply({ ...pending, updatedAt: '2020-01-01T00:00:00.000Z' })).toBe(false);
    expect(db.kioskDisplaySettings.accentColor).toBe('#112233');
  });
  it('applies wording, appearance and receipt settings together', () => {
    const remote = KioskConfigurationRepository.snapshot(); remote.updatedAt = new Date().toISOString();
    remote.display.texts = { en: { startOrder: 'Order at my cafe' } }; remote.receipt.footerMessage = 'My receipt footer';
    expect(KioskConfigurationRepository.apply(remote)).toBe(true);
    expect(db.kioskDisplaySettings.texts?.en?.startOrder).toBe('Order at my cafe'); expect(db.receiptConfig.footerMessage).toBe('My receipt footer');
  });
  it('keeps dirty versions separate across branches', () => {
    KioskConfigurationRepository.markChanged(); KeyValueStore.set('jamanvaar_bound_branch_id', 'br-B');
    expect(KioskConfigurationRepository.pending()).toBeNull();
    KeyValueStore.set('jamanvaar_bound_branch_id', 'br-A'); expect(KioskConfigurationRepository.pending()).not.toBeNull();
  });
  it('removes presentation, legal receipt details and config cursors on a tenant switch', () => {
    db.receiptConfig.gstin = 'OLD TENANT GSTIN'; db.kioskDisplaySettings.logoUrl = 'https://old.invalid/logo.png';
    KioskConfigurationRepository.markChanged(); KeyValueStore.set('jamanvaar_entity_sync_cursor_KIOSK_CONFIGURATION', 'seq:50');
    TenantIsolation.enter('rest-B');
    expect(db.receiptConfig.gstin).toBe(''); expect(db.kioskDisplaySettings.logoUrl).toBeUndefined();
    expect(KioskConfigurationRepository.pending()).toBeNull(); expect(KeyValueStore.get('jamanvaar_entity_sync_cursor_KIOSK_CONFIGURATION')).toBeNull();
  });
  it('retains unpublished changes when the cloud refuses a save', async () => {
    KioskConfigurationRepository.markChanged(); EntitySyncEngine.configureTransport({ push: async () => { throw Error('offline'); }, pull: async () => ({ entities: [], serverTime: new Date().toISOString() }) });
    await expect(syncKioskConfiguration({ push: true })).rejects.toThrow(/not published/);
    expect(KioskConfigurationRepository.pending()).not.toBeNull();
  });
  it('publishes edits once and keeps customer kiosks pull-only', async () => {
    const push = vi.fn(async () => ({ results: [{ externalId: 'kiosk-config-br-A', status: 'ok' as const }], serverTime: new Date().toISOString() }));
    EntitySyncEngine.configureTransport({ push, pull: async () => ({ entities: [], serverTime: new Date().toISOString(), latestSeq: 0 }) });
    KioskConfigurationRepository.markChanged(); await syncKioskConfiguration(); expect(push).not.toHaveBeenCalled();
    await syncKioskConfiguration({ push: true }); expect(push).toHaveBeenCalledTimes(1); expect(KioskConfigurationRepository.pending()).toBeNull();
  });
  it('enforces configuration authorship and branch scope on Branch Core too', () => {
    const store = new BranchStore(':memory:'); const core = new BranchCore(store, { restaurantId: 'rest-A', branchId: 'br-A', branchCode: 'A' });
    const event = { externalId: 'kiosk-config-br-A', payload: KioskConfigurationRepository.snapshot() };
    try {
      expect(() => core.pushEntities({ id: 'kiosk', type: 'KIOSK' }, 'KIOSK_CONFIGURATION', [event])).toThrow(/console/);
      expect(() => core.pushEntities({ id: 'admin', type: 'POS_ADMIN' }, 'KIOSK_CONFIGURATION', [{ ...event, payload: { ...event.payload, branchId: 'br-B' } }])).toThrow(/branch/);
      expect(core.pushEntities({ id: 'admin', type: 'POS_ADMIN' }, 'KIOSK_CONFIGURATION', [event]).results[0].status).toBe('ok');
      expect(core.pullEntities('KIOSK_CONFIGURATION').entities).toHaveLength(1);
    } finally { store.close(); }
  });
  it('revokes a Branch Core kiosk only after successful logout acknowledgement, preserving its orders', () => {
    const store = new BranchStore(':memory:'); const core = new BranchCore(store, { restaurantId: 'rest-A', branchId: 'br-A', branchCode: 'A' });
    store.run("INSERT INTO devices (id, type, status, updated_at) VALUES ('kiosk', 'KIOSK', 'ACTIVE', 0)");
    const admin = { id: 'admin', type: 'POS_ADMIN', branchId: 'br-A', restaurantId: 'rest-A', name: 'Admin', isLocked: false, lockReason: null };
    try {
      const failed = core.issueCommand(admin, 'kiosk', { commandType: 'FORCE_LOGOUT' });
      core.ackCommand({ id: 'kiosk' }, failed.id, { status: 'FAILED', error: 'Payment active' });
      expect(store.get<{ status: string }>("SELECT status FROM devices WHERE id = 'kiosk'")?.status).toBe('ACTIVE');
      const success = core.issueCommand(admin, 'kiosk', { commandType: 'FORCE_LOGOUT' });
      core.ackCommand({ id: 'kiosk' }, success.id, { status: 'SUCCEEDED' });
      expect(store.get<{ status: string }>("SELECT status FROM devices WHERE id = 'kiosk'")?.status).toBe('REVOKED');
    } finally { store.close(); }
  });
  it('mirrors only its own branch configuration while advancing past other branch records', async () => {
    const store = new BranchStore(':memory:'); const core = new BranchCore(store, { restaurantId: 'rest-A', branchId: 'br-A', branchCode: 'A' });
    const config = KioskConfigurationRepository.snapshot();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      const data = path.endsWith('/roster') ? {
        restaurant: { id: 'rest-A', name: 'Restaurant A', status: 'ACTIVE' }, branches: [], devices: [],
        subscription: { active: true, expiresAt: null, enabledApps: ['POS_ADMIN', 'KIOSK_ADMIN'] }
      } : path.includes('/entity-sync/KIOSK_CONFIGURATION?') ? {
        entities: [
          { externalId: 'kiosk-config-br-B', payload: { ...config, branchId: 'br-B' } },
          { externalId: 'kiosk-config-br-A', payload: config }
        ], latestSeq: 2, hasMore: false
      } : { entities: [], orders: [], movements: [], latestSeq: 0, hasMore: false };
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    try {
      const result = await new CloudUplink(core, { cloudBase: 'https://qa.invalid', deviceToken: 'qa-only', fetchImpl }).syncOnce();
      expect(result.error).toBeUndefined();
      expect(core.pullEntities('KIOSK_CONFIGURATION').entities.map(e => e.externalId)).toEqual(['kiosk-config-br-A']);
      expect(store.getConfig('cloud_seq_KIOSK_CONFIGURATION')).toBe('2');
    } finally { store.close(); }
  });
});
