import { KeyValueStore, getTerminalId } from '@jamanvaar/database';
export interface KitchenDisplayPreferences { density: 'compact' | 'comfortable' | 'tv'; fallbackMinutes: number; minimumMinutes: number; maximumMinutes: number; }
export const DEFAULT_KITCHEN_DISPLAY: KitchenDisplayPreferences = {density:'comfortable',fallbackMinutes:10,minimumMinutes:4,maximumMinutes:60};
function key(station: string) {return `kds_display:${getTerminalId('KDS')}:${station}`;}
export function loadKitchenDisplay(station: string): KitchenDisplayPreferences {
  try {return validateKitchenDisplay({...DEFAULT_KITCHEN_DISPLAY,...JSON.parse(KeyValueStore.get(key(station)) ?? '{}')});} catch {return {...DEFAULT_KITCHEN_DISPLAY};}
}
export function validateKitchenDisplay(value: KitchenDisplayPreferences): KitchenDisplayPreferences {
  if (!['compact','comfortable','tv'].includes(value.density) || ![value.fallbackMinutes,value.minimumMinutes,value.maximumMinutes].every(n => Number.isFinite(n) && n > 0 && n <= 240) || value.minimumMinutes > value.maximumMinutes || value.fallbackMinutes < value.minimumMinutes || value.fallbackMinutes > value.maximumMinutes) throw new Error('Use positive prep times up to 240 minutes, with minimum ≤ fallback ≤ maximum.');
  return value;
}
export function saveKitchenDisplay(station: string, value: KitchenDisplayPreferences) {KeyValueStore.set(key(station),JSON.stringify(validateKitchenDisplay(value)));}
