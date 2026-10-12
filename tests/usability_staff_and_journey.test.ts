import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { db, StaffRepository, OrderRepository, KioskDisplaySettingsRepository, KeyValueStore } from '@jamanvaar/database';
import { useCaptainStore } from '../apps/restaurant-system/captain/src/store/captainStore';
import { nextKioskSelection, kioskOrderingSettings } from '../apps/kiosk-system/kiosk-user/src/kioskJourney';
import { kioskConfigurationSchema } from '../cloud/api/src/modules/entity-sync/kiosk-configuration-schema';
import { KioskConfigurationRepository } from '@jamanvaar/database';
import { DEFAULT_KITCHEN_DISPLAY, validateKitchenDisplay, loadKitchenDisplay, saveKitchenDisplay } from '../apps/restaurant-system/kds/src/displayPreferences';
import { prepMinutes } from '../apps/restaurant-system/kds/src/kdsLogic';
import { translateStaff } from '../packages/ui/src/StaffLanguage';

describe('Shorter guest journeys and safe staff handover', () => {
  beforeEach(() => {const storage = new Map<string,string>();KeyValueStore.attach({getItem:key => storage.get(key) ?? null,setItem:(key,value) => {storage.set(key,value);},removeItem:key => {storage.delete(key);}}, {migrateLegacy:false});db.resetToDefaultSeed();db.orders=[];db.users=[];db.kots=[];useCaptainStore.getState().logout();useCaptainStore.setState({cartItems:[]});});
  afterEach(() => KeyValueStore.reset());
  it('skips single choices but keeps multiple choices and invalid table bindings visible', () => {
    const settings={...KioskDisplaySettingsRepository.getSettings(),enabledLanguages:['gu' as const],defaultLanguage:'gu' as const,allowedOrderTypes:['TAKEAWAY' as const]};
    expect(nextKioskSelection('LANGUAGE_SELECT',settings,db.tables)?.language).toBe('gu');
    expect(nextKioskSelection('ORDER_TYPE',settings,db.tables)).toEqual({step:'MENU',mode:'TAKEAWAY',table:null});
    expect(nextKioskSelection('ORDER_TYPE',{...settings,allowedOrderTypes:['DINE_IN','TAKEAWAY']},db.tables)).toBeNull();
    const table=db.tables[0]; table.status='BLOCKED';
    expect(nextKioskSelection('TABLE_SELECT',{...settings,defaultTableId:table.id},db.tables)).toBeNull();
    expect(() => KioskDisplaySettingsRepository.updateSettings({allowedOrderTypes:[]})).toThrow(/at least one/);
  });
  it('receiving captain accepts real floor tasks using their own PIN without collecting unpaid bills', async () => {
    const outgoing=await StaffRepository.createUser({username:'outgoing',fullName:'Outgoing',roleId:'role-captain'});
    const incoming=await StaffRepository.createUser({username:'incoming',fullName:'Incoming',roleId:'role-captain'});
    await useCaptainStore.getState().login(outgoing.issuedPin!);
    const table=db.tables[0];table.status='OCCUPIED';table.openedById=outgoing.id;
    const order=OrderRepository.createOrder({source_type:'CAPTAIN',tableId:table.id,tableNumber:table.tableNumber,items:[],totalAmount:250,paymentStatus:'PENDING',orderStatus:'PREPARING'});table.currentOrderId=order.id;
    expect(await useCaptainStore.getState().handover('0000','Follow up')).toBe(false);
    expect(table.openedById).toBe(outgoing.id);
    expect(await useCaptainStore.getState().handover(incoming.issuedPin!,'Allergy noted')).toBe(true);
    expect(table.openedById).toBe(incoming.id);expect(useCaptainStore.getState().currentCaptain?.id).toBe(incoming.id);
    expect(order.paymentStatus).toBe('PENDING');expect(order.orderStatus).toBe('PREPARING');
    expect(db.auditLogs.some(a => a.action === 'CAPTAIN_HANDOVER')).toBe(true);
  });
  it('publishes two kiosks with independent ordering modes and preserves branch defaults', () => {
    const table=db.tables.find(t => t.isActive !== false && t.status !== 'BLOCKED')!;
    const settings=KioskDisplaySettingsRepository.updateSettings({allowedOrderTypes:['DINE_IN','TAKEAWAY'],orderingOverrides:{'terminal-a':{allowedOrderTypes:['TAKEAWAY']},'terminal-b':{allowedOrderTypes:['DINE_IN'],defaultTableId:table.id}}});
    expect(kioskConfigurationSchema.safeParse(KioskConfigurationRepository.snapshot()).success).toBe(true);
    expect(nextKioskSelection('ORDER_TYPE',kioskOrderingSettings(settings,'terminal-a'),db.tables)?.step).toBe('MENU');
    expect(nextKioskSelection('TABLE_SELECT',kioskOrderingSettings(settings,'terminal-b'),db.tables)?.table?.id).toBe(table.id);
    expect(nextKioskSelection('ORDER_TYPE',kioskOrderingSettings(settings,'terminal-c'),db.tables)).toBeNull();
    expect(() => KioskDisplaySettingsRepository.updateSettings({orderingOverrides:{'terminal-a':{allowedOrderTypes:[]}}})).toThrow(/each kiosk/);
  });
  it('preserves per-station display preferences and accepts slow-prep kitchens', () => {
    const preferences={...DEFAULT_KITCHEN_DISPLAY,density:'tv' as const,maximumMinutes:180,fallbackMinutes:90};
    saveKitchenDisplay('slow-oven',preferences);
    expect(loadKitchenDisplay('slow-oven')).toEqual(preferences);
    expect(loadKitchenDisplay('different-station').density).toBe('comfortable');
    expect(prepMinutes({items:[]} as never,()=>undefined,preferences)).toBe(90);
    expect(() => validateKitchenDisplay({...preferences,maximumMinutes:20})).toThrow(/minimum/);
  });
  it('translates staff actions and retains a readable fallback', () => {
    expect(translateStaff('Billing','gu')).toBe('બિલિંગ');expect(translateStaff('Ready','hi')).toBe('तैयार');
    expect(translateStaff('Customer-defined station','gu')).toBe('Customer-defined station');
  });
});
