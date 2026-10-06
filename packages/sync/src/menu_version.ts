/**
 * Which published menu version this device has actually applied. The Restaurant Admin console
 * publishes numbered versions (POST /menu/publish); a device has applied version N once its menu
 * catch-up cursors (dishes and categories) have moved past the moment N was published. The value is
 * reported in the heartbeat so Kiosk Admin and support can see which device is behind.
 */

import { KeyValueStore } from '@jamanvaar/database';
import { EndpointResolver } from './endpoint_resolver';

const APPLIED_KEY = 'jamanvaar_menu_applied_version';
const CURSOR_PREFIX = 'jamanvaar_entity_sync_cursor_';
const MENU_ENTITIES = ['MENU_CATEGORY', 'MENU_ITEM'];

export interface LatestMenuVersion {
  version: number;
  watermark: string | null;
}

function read(key: string): string | null {
  try {
    return KeyValueStore.get(key);
  } catch {
    return null;
  }
}

export class MenuVersionTracker {
  static applied(): number {
    const n = Number(read(APPLIED_KEY));
    return Number.isInteger(n) && n > 0 ? n : 0;
  }

  /** Compares this device's menu cursors with the latest publication and records the newest version it has applied. */
  static async refresh(fetchLatest: () => Promise<LatestMenuVersion | null>): Promise<void> {
    let latest: LatestMenuVersion | null;
    try {
      latest = await fetchLatest();
    } catch {
      return; // offline: keep the last known value
    }
    if (!latest || latest.version <= 0 || !latest.watermark) return;

    const mark = Date.parse(latest.watermark);
    const caughtUp = MENU_ENTITIES.every((entity) => {
      const key = EndpointResolver.cursorKey(CURSOR_PREFIX + entity, `/api/v1/entity-sync/${entity}`);
      const cursor = read(key + ':caught_up_at') ?? read(key);
      return cursor !== null && Date.parse(cursor) >= mark;
    });
    if (caughtUp && latest.version > this.applied()) {
      try {
        KeyValueStore.set(APPLIED_KEY, String(latest.version));
      } catch {
        // Storage unavailable: it is recomputed on the next refresh.
      }
    }
  }
}
