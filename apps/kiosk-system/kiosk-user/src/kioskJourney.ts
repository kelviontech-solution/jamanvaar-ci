import type { DiningTable, DisplayLanguage, KioskDisplaySettings } from '@jamanvaar/types';
export function kioskOrderingSettings(settings: KioskDisplaySettings,terminalId:string): KioskDisplaySettings {
  return {...settings,...settings.orderingOverrides?.[terminalId]};
}
export function availableKioskModes(settings: KioskDisplaySettings): Array<'DINE_IN'|'TAKEAWAY'> {
  return settings.allowedOrderTypes ?? ['DINE_IN','TAKEAWAY'];
}
export function nextKioskSelection(step:string, settings:KioskDisplaySettings, tables:DiningTable[]): {step:'ORDER_TYPE'|'TABLE_SELECT'|'MENU';language?:DisplayLanguage;mode?:'DINE_IN'|'TAKEAWAY';table?:DiningTable|null} | null {
  if (step === 'LANGUAGE_SELECT' && settings.enabledLanguages.length === 1) return {step:'ORDER_TYPE',language:settings.enabledLanguages[0]};
  const modes=availableKioskModes(settings);
  if (step === 'ORDER_TYPE' && modes.length === 1) return {step:modes[0] === 'DINE_IN' ? 'TABLE_SELECT':'MENU',mode:modes[0],...(modes[0] === 'TAKEAWAY' ? {table:null}:{})};
  if (step === 'TABLE_SELECT' && settings.defaultTableId) {
    const table=tables.find(t => t.id === settings.defaultTableId && t.isActive !== false && t.status !== 'BLOCKED');
    if (table) return {step:'MENU',table};
  }
  return null;
}
