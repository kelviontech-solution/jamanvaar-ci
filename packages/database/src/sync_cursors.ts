import { KeyValueStore } from './key_value_store';

const MENU_APPLIED_VERSION_KEY = 'jamanvaar_menu_applied_version';

/**
 * Makes the next pull of these record types start from the beginning. Call it whenever local copies are wiped
 * (a terminal is activated): a cursor left at "now" would otherwise skip everything the cloud already holds,
 * leaving the terminal with an empty menu or floor until someone edits each record again.
 */
export function resetEntitySyncCursors(entityTypes: readonly string[]): void {
  for (const type of entityTypes) {
    KeyValueStore.remove(`jamanvaar_entity_sync_cursor_${type}`);
    KeyValueStore.remove(`jamanvaar_entity_sync_cursor_${type}:core`);
  }
  if (entityTypes.includes('MENU_ITEM') || entityTypes.includes('MENU_CATEGORY')) KeyValueStore.remove(MENU_APPLIED_VERSION_KEY);
}
