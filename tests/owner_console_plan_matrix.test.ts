import { describe, expect, it } from 'vitest';
import { availableAdminProducts, canAccessAdminPage, ownerEntryPath, parseAdminRoute, resolveAdminRoute, PRODUCT_PAGES } from '../apps/restaurant-system/pos-admin/src/adminProducts';
import { productNavSections } from '../apps/restaurant-system/pos-admin/src/navSections';
import { filterNavSections } from '../apps/restaurant-system/pos-admin/src/hooks/useEntitlements';
import type { AppCode } from '../apps/restaurant-system/pos-admin/src/cloud/cloudClient';
import type { PosAdminTab } from '../apps/restaurant-system/pos-admin/src/App';

const codes: AppCode[] = ['POS_ADMIN','KIOSK_ADMIN','QR_ORDERING','POS','CAPTAIN','KDS','KIOSK'];
const combinations = Array.from({length:128},(_,mask)=>codes.filter((_,i)=>mask & (1<<i)));
describe('owner console: every licensed application combination',()=>{
  it.each(combinations.map((apps,i)=>[i,apps] as const))('combination %i selects an entry and gates every displayed page',(i,apps)=>{
    const entry=ownerEntryPath(apps), hosts=availableAdminProducts(apps);
    expect(entry).toBe(apps.includes('POS_ADMIN')?'/restaurant-admin/dashboard':apps.includes('KIOSK_ADMIN')?'/kiosk-admin/dashboard':apps.includes('QR_ORDERING')?'/qr/admin/':null);
    if(hosts.length){
      const resolved=resolveAdminRoute(parseAdminRoute('/pos-admin/'),hosts,{});
      expect(resolved.product).toBe(apps.includes('POS_ADMIN')?'POS_ADMIN':'KIOSK_ADMIN');
      const nav=filterNavSections(productNavSections(resolved.product!),app=>apps.includes(app)).flatMap(g=>g.items.map(i=>i.id));
      expect(new Set(nav).size).toBe(nav.length);
      for(const page of nav)expect(canAccessAdminPage(apps,resolved.product!,page as PosAdminTab),page).toBe(true);
      expect(nav.includes('QR_ORDERING')).toBe(apps.includes('QR_ORDERING'));
      expect(nav.includes('KIOSKS')).toBe(apps.includes('KIOSK_ADMIN'));
      for(const page of ['KIOSKS','KIOSK_WELCOME','KIOSK_DESIGN','KIOSK_COMBOS','KIOSK_PAYMENTS','FEEDBACK'] as PosAdminTab[])expect(canAccessAdminPage(apps,resolved.product!,page)).toBe(apps.includes('KIOSK_ADMIN'));
    }
  });
  it('canonicalizes old kiosk links for a full-suite owner without losing the requested task',()=>{
    expect(resolveAdminRoute(parseAdminRoute('/kiosk-admin/welcome-screen'),['POS_ADMIN','KIOSK_ADMIN'],{})).toEqual({product:'POS_ADMIN',page:'KIOSK_WELCOME',invalid:false});
  });
  it('does not trust saved pages or app preferences as a feature grant',()=>{
    for(const page of Object.keys(PRODUCT_PAGES.POS_ADMIN) as PosAdminTab[]){
      if(['KIOSKS','KIOSK_DESIGN','KIOSK_WELCOME','KIOSK_COMBOS','KIOSK_PAYMENTS','FEEDBACK','QR_ORDERING'].includes(page))expect(canAccessAdminPage(['POS_ADMIN'],'POS_ADMIN',page)).toBe(false);
    }
    expect(canAccessAdminPage(['KIOSK_ADMIN','QR_ORDERING'],'KIOSK_ADMIN','INVENTORY')).toBe(false);
    expect(canAccessAdminPage(['QR_ORDERING'],'POS_ADMIN','CUSTOMERS')).toBe(false);
  });
});
