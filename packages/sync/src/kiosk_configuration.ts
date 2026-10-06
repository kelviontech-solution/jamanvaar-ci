import { KioskConfigurationRepository, type KioskConfiguration } from '@jamanvaar/database';
import { EntitySyncEngine } from './entity_sync';

/** A public kiosk pulls only; edits are pushed by its restaurant console. */
export async function syncKioskConfiguration({ push = false } = {}): Promise<void> {
  if (push) {
    const pending = KioskConfigurationRepository.pending();
    if (pending) {
      const result = await EntitySyncEngine.pushSnapshot('KIOSK_CONFIGURATION', [{ externalId: `kiosk-config-${pending.branchId || 'restaurant'}`, payload: pending as unknown as Record<string, unknown> }]);
      if (result.failed || !result.processed) throw new Error('Kiosk settings are saved on this device but not published. Check the connection and retry.');
      KioskConfigurationRepository.acknowledge(pending.updatedAt);
    }
  }
  await EntitySyncEngine.catchUp('KIOSK_CONFIGURATION', entity => KioskConfigurationRepository.apply(entity.payload as unknown as KioskConfiguration));
}
