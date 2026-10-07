import { db } from './db';
import { KeyValueStore } from './key_value_store';
import type { KioskDisplaySettings, WelcomeScreenSettings, ReceiptConfig } from '@jamanvaar/types';

export interface KioskConfiguration {
  branchId?: string;
  updatedAt: string;
  display: KioskDisplaySettings;
  welcome: WelcomeScreenSettings;
  receipt: ReceiptConfig;
}
const VERSION = 'jamanvaar_kiosk_configuration_version';
const DIRTY = 'jamanvaar_kiosk_configuration_dirty';
const scopedKey = (key: string) => `${key}:${JSON.stringify([KeyValueStore.get('jamanvaar_tenant_id'), KeyValueStore.get('jamanvaar_bound_branch_id')])}`;
export class KioskConfigurationRepository {
  /** Reactivating a terminal in another branch must not carry the previous branch's design or pull cursor. */
  static bindBranch(branchId?: string | null): void {
    const next = branchId || undefined;
    const previous = KeyValueStore.get('jamanvaar_bound_branch_id') || undefined;
    if (previous !== next) {
      KeyValueStore.remove(scopedKey(DIRTY));
      db.resetKioskConfiguration();
      const cursor = 'jamanvaar_entity_sync_cursor_KIOSK_CONFIGURATION';
      for (const key of KeyValueStore.keys()) if (key === cursor || key.startsWith(cursor + ':')) KeyValueStore.remove(key);
      KeyValueStore.set('jamanvaar_bound_branch_id', next || '');
      KeyValueStore.remove(scopedKey(VERSION)); KeyValueStore.remove(scopedKey(DIRTY));
    } else KeyValueStore.set('jamanvaar_bound_branch_id', next || '');
  }
  static markChanged(): void {
    const previous = Date.parse(KeyValueStore.get(scopedKey(VERSION)) || '') || 0;
    KeyValueStore.set(scopedKey(VERSION), new Date(Math.max(Date.now(), previous + 1)).toISOString());
    KeyValueStore.set(scopedKey(DIRTY), '1');
  }
  static snapshot(): KioskConfiguration {
    const branchId = KeyValueStore.get('jamanvaar_bound_branch_id') || undefined;
    return structuredClone({ branchId, updatedAt: KeyValueStore.get(scopedKey(VERSION)) || '1970-01-01T00:00:00.000Z', display: db.kioskDisplaySettings, welcome: db.welcomeScreenSettings, receipt: db.receiptConfig });
  }
  static pending(): KioskConfiguration | null { return KeyValueStore.get(scopedKey(DIRTY)) === '1' ? this.snapshot() : null; }
  static acknowledge(version: string): void { if (KeyValueStore.get(scopedKey(VERSION)) === version) KeyValueStore.remove(scopedKey(DIRTY)); }
  static apply(remote: KioskConfiguration): boolean {
    if (remote.branchId !== (KeyValueStore.get('jamanvaar_bound_branch_id') || undefined)) return false;
    if (!remote.display || !remote.welcome || !remote.receipt || !Number.isFinite(Date.parse(remote.updatedAt))) return false;
    if (Date.parse(remote.updatedAt) < (Date.parse(KeyValueStore.get(scopedKey(VERSION)) || '') || 0)) return false;
    db.kioskDisplaySettings = { ...remote.display };
    db.welcomeScreenSettings = structuredClone(remote.welcome);
    db.receiptConfig = { ...remote.receipt };
    KeyValueStore.set(scopedKey(VERSION), remote.updatedAt); KeyValueStore.remove(scopedKey(DIRTY));
    db.notify(); return true;
  }
}
