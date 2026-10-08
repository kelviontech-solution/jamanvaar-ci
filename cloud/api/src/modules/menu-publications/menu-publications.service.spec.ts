import { describe, expect, it, vi } from 'vitest';
import { MenuPublicationsService } from './menu-publications.service';

function fixture() {
  const rows: Array<{ entityType: string; payload: unknown }> = [];
  const snapshots: any[] = [], publications: any[] = [];
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    syncedEntity: { findMany: vi.fn(async () => rows) },
    menuSnapshot: {
      findFirst: vi.fn(async () => snapshots.at(-1) ?? null),
      findUnique: vi.fn(async ({where}: any) => snapshots.find(s => s.version === where.restaurantId_version.version) ?? null),
      create: vi.fn(async ({data}: any) => { snapshots.push(data); return data; })
    },
    menuPublication: {
      findFirst: vi.fn(async () => publications.at(-1) ?? null),
      create: vi.fn(async ({data}: any) => { publications.push(data); return data; })
    },
    menuImage: { upsert: vi.fn() }
  };
  const service = new MenuPublicationsService({runAsTenant: async (_: string, run: any) => run(tx)} as any, {log: vi.fn()} as any, {publish: vi.fn()} as any);
  const category = {entityType:'MENU_CATEGORY',payload:{id:'mains',name:'Mains',isActive:true}};
  const dish = {entityType:'MENU_ITEM',payload:{id:'dish',name:'New dish',categoryId:'mains',price:100,isAvailable:true}};
  return {service,rows,tx,category,dish,snapshots};
}

describe('first guest menu publication', () => {
  it('does not freeze an empty menu while categories and tax groups arrive ahead of dishes', async () => {
    const f=fixture();f.rows.push(f.category,{entityType:'TAX_GROUP',payload:{id:'gst',isActive:true,igstPercent:5}});
    expect(await f.service.currentSnapshot('restaurant')).toBeNull();expect(f.tx.menuPublication.create).not.toHaveBeenCalled();
    f.rows.push(f.dish);
    const menu=await f.service.currentSnapshot('restaurant');expect(menu?.version).toBe(1);expect(menu?.content.items.map(i=>i.id)).toEqual(['dish']);
  });
  it('keeps an existing publication stable when the draft changes', async () => {
    const f=fixture();f.rows.push(f.category,f.dish);await f.service.currentSnapshot('restaurant');
    f.rows.push({entityType:'MENU_ITEM',payload:{id:'draft-only',name:'Still editing',categoryId:'mains',price:200,isAvailable:true}});
    const menu=await f.service.currentSnapshot('restaurant');expect(menu?.content.items.map(i=>i.id)).toEqual(['dish']);expect(f.tx.menuPublication.create).toHaveBeenCalledOnce();
  });
  it('does not silently replace an explicitly published empty menu', async () => {
    const f=fixture();await f.service.publish({type:'POS_ADMIN',restaurantId:'restaurant',id:'admin'} as any,{});
    f.rows.push(f.category,f.dish);const menu=await f.service.currentSnapshot('restaurant');expect(menu?.content.items).toEqual([]);expect(f.tx.menuPublication.create).toHaveBeenCalledOnce();
  });
  it('does not automatically publish invalid first-menu prices', async () => {
    const f=fixture();f.rows.push(f.category,{...f.dish,payload:{...f.dish.payload,price:-50}});
    expect(await f.service.currentSnapshot('restaurant')).toBeNull();expect(f.tx.menuPublication.create).not.toHaveBeenCalled();
  });
  it('recovers an old automatic empty first publication after the dishes finish uploading', async () => {
    const f=fixture();
    await (f.service as any).publishTx(f.tx,'restaurant',null,'Automatic first publication');
    f.rows.push(f.category,f.dish);
    const menu=await f.service.currentSnapshot('restaurant');expect(menu?.version).toBe(2);expect(menu?.content.items.map(i=>i.id)).toEqual(['dish']);
  });
});
