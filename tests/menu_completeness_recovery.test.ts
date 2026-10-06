import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, KeyValueStore, MenuItemSync, CategorySync, MenuRepository } from '@jamanvaar/database';
import { EntitySyncEngine, EndpointResolver, syncMenuCatalog } from '@jamanvaar/sync';
import { buildStandardMenu } from '../apps/kiosk-system/kiosk-user/src/standardMenu';

const saved = globalThis.localStorage;
const now = '2026-10-06T10:00:00.000Z';
const categories = Array.from({ length: 8 }, (_, i) => ({id:`cat-${i}`,name:`Category ${i}`,slug:`cat-${i}`,sortOrder:i,isActive:true,updatedAt:now}));
const items = Array.from({ length: 20 }, (_, i) => ({id:`dish-${i}`,name:`Dish ${i}`,categoryId:`cat-${i%8}`,sku:`SKU-${i}`,price:100+i,description:'',isAvailable:true,isKioskEnabled:true,dietaryType:'VEG',sortOrder:i,updatedAt:now}));
let pulls: Array<{type: string; since?: string}>;
let writes: string[];
beforeEach(() => {
  const values=new Map<string,string>();
  globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);},clear:()=>values.clear(),key:i=>[...values.keys()][i]??null,get length(){return values.size;}};
  KeyValueStore.reset(); EndpointResolver.configure({cloudBase:'https://qa.invalid',coreUrl:null}); MenuRepository.startFreshMenu();
  pulls=[];writes=[];
  EntitySyncEngine.configureTransport({
    push:async(type,events)=>{writes.push(type);return {results:events.map(e=>({externalId:e.externalId,status:'ok'})),serverTime:now};},
    pull:async(type,since)=>{
      pulls.push({type,since});const rows=type==='MENU_ITEM'?items:type==='MENU_CATEGORY'?categories:[];
      const after=Number(since?.replace('seq:',''))||0;
      return {entities:after===0?rows.map(p=>({externalId:p.id,payload:structuredClone(p),updatedAt:now})):[],latestSeq:100,hasMore:false,serverTime:now,serverKey:'cloud'};
    }
  });
});
afterEach(()=>{vi.restoreAllMocks();EntitySyncEngine.configureTransport(null);KeyValueStore.reset();globalThis.localStorage=saved;});

describe('complete menu recovery without replacing the restaurant menu',()=>{
  it('reproduces a partial four-dish cache with a caught-up cursor and restores all 20 dishes',async()=>{
    db.menuItems=structuredClone(items.slice(0,4)) as never;db.categories=structuredClone(categories.slice(0,4)) as never;
    for(const type of ['MENU_ITEM','MENU_CATEGORY'])KeyValueStore.set(`jamanvaar_entity_sync_cursor_${type}`,'seq:100');
    const oldBehaviour=vi.spyOn(EntitySyncEngine,'ensureCatalogIntegrity').mockImplementation(()=>{});
    await syncMenuCatalog({push:false});
    expect(buildStandardMenu(db.categories,db.menuItems).items).toHaveLength(4);
    oldBehaviour.mockRestore(); pulls=[];
    await syncMenuCatalog({push:false});
    expect(buildStandardMenu(db.categories,db.menuItems).items).toHaveLength(20);
    expect(db.categories).toHaveLength(8);expect(writes).toEqual([]);
    expect(pulls.filter(p=>p.type==='MENU_ITEM')[0].since).toBe('seq:0');
    pulls=[];await syncMenuCatalog({push:false});
    expect(pulls.find(p=>p.type==='MENU_ITEM')?.since).toBe('seq:100');
  });

  it('recovers a partially lost cache again without resetting intact catalogues on every tick',async()=>{
    await syncMenuCatalog({push:false});db.menuItems.splice(4);pulls=[];
    await syncMenuCatalog({push:false});
    expect(db.menuItems).toHaveLength(20);
    expect(pulls.find(p=>p.type==='MENU_ITEM')?.since).toBe('seq:0');
    expect(pulls.find(p=>p.type==='MENU_CATEGORY')?.since).toBe('seq:100');
  });

  it('repairs timestamps stamped by the old read-only sync bug without writing from a customer kiosk',async()=>{
    db.menuItems=[{...items[0],name:'Stale tablet name',updatedAt:'2099-01-01T00:00:00.000Z'}] as never;
    await syncMenuCatalog({push:false});expect(db.menuItems[0].name).toBe('Dish 0');expect(writes).toEqual([]);
  });

  it('preserves real unpublished owner edits while filling missing records',async()=>{
    db.menuItems=[{...items[0],price:250,updatedAt:'2026-10-06T11:00:00.000Z'}] as never;MenuItemSync.reset();CategorySync.reset();
    await syncMenuCatalog({push:true});expect(db.menuItems).toHaveLength(20);expect(db.menuItems[0].price).toBe(250);expect(writes).toContain('MENU_ITEM');
  });

  it('does not expose sold-out, disabled, another branch or POS-only dishes during recovery',async()=>{
    await syncMenuCatalog({push:false});
    db.menuItems[0].isAvailable=false;db.menuItems[1].isKioskEnabled=false;
    db.menuItems[2].salesChannels=['POS'];db.menuItems[3].branchIds=['other-branch'];
    expect(buildStandardMenu(db.categories,db.menuItems,'current-branch').items).toHaveLength(16);
  });
});
