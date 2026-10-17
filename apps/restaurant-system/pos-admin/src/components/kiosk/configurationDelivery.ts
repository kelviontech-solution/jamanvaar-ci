import { KeyValueStore, KioskConfigurationRepository } from '@jamanvaar/database';
import { fetchCloudKiosks, sendKioskCommand } from '../../cloud/cloudClient';

/** Publishing and terminal receipt are separate. Reuse the customer's existing versioned sync acknowledgement. */
export async function requestConfigurationReceipts(): Promise<string> {
  try {
    const branchId = KeyValueStore.get('jamanvaar_bound_branch_id');
    if (!branchId) return 'Published. Choose a branch to request kiosk acknowledgements.';
    const version = KioskConfigurationRepository.snapshot().updatedAt;
    const kiosks = (await fetchCloudKiosks()).filter((k) => k.branchId === branchId);
    const results = await Promise.allSettled(kiosks.map((k) => sendKioskCommand(k.id, 'REQUEST_SYNC', { scope: 'WELCOME', configVersion: version })));
    return results.some((r) => r.status === 'rejected')
      ? 'Published. Some kiosk receipt checks could not be queued. Open Devices to retry.'
      : kiosks.length
        ? 'Published. Receipt checks queued; offline kiosks catch up after reconnecting.'
        : 'Published. No kiosks connected to this branch yet.';
  } catch {
    return 'Published. Could not request kiosk receipt checks. Open Devices and retry sync.';
  }
}
