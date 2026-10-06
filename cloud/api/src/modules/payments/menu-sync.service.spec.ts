import { describe, it, expect, vi } from 'vitest';
import { MenuSyncService } from './menu-sync.service';
import { priceCart } from './pricing.util';
import type { PrismaService } from '../../prisma/prisma.service';
const now = new Date();
function fixture(item: Record<string, unknown> = {}, optionUnavailable = false, categoryInactive = false) {
  const rows = [{ id:'row1', restaurantId:'A', entityType:'MENU_ITEM', externalId:'pizza', createdAt:now, updatedAt:now, payload:{ id:'pizza', name:'Pizza', categoryId:'pizzas', price:149, isAvailable:true, modifierGroupIds:['size','addons'], ...item } }];
  const groups = [{ entityType:'MODIFIER_GROUP', externalId:'size', payload:{ id:'size', name:'Size', isRequired:true, minSelections:1,maxSelections:1,options:[{id:'regular',name:'Regular',priceDelta:0},{id:'medium',name:'Medium',priceDelta:100}] } },{entityType:'MODIFIER_GROUP',externalId:'addons',payload:{id:'addons',name:'Add-ons',minSelections:0,maxSelections:2,options:[{id:'cheese',name:'Extra Cheese',priceDelta:40,isAvailable:!optionUnavailable}]}}];
  groups.push({entityType:'MENU_CATEGORY',externalId:'pizzas',payload:{id:'pizzas',name:'Pizzas',isActive:!categoryInactive}} as any);
  const tx = { menuSnapshotItem:{findMany:vi.fn(async()=>[])}, syncedEntity:{findMany:vi.fn(async(args:any)=>args.where.entityType==='MENU_ITEM'?rows:groups)},device:{findFirst:vi.fn(async(_args:any)=>({branchId:'branch-A'}))} };
  const service = new MenuSyncService({runAsTenant:async(_id:string,work:any)=>work(tx)} as unknown as PrismaService);
  return {service,tx};
}
describe('server pricing from imported restaurant menu',()=>{
 it('prices selected size and add-on from synced groups, requiring the variant',async()=>{
  const {service}=fixture();const records=await service.loadItemsByExternalIds('A',['pizza'],'kiosk');const item=records[0];
  const lookup = new Map(records.map(r=>[r.externalItemId,{externalItemId:r.externalItemId,name:r.name,basePrice:r.basePrice,taxRate:r.taxRate,isAvailable:r.isAvailable,modifierGroups:r.modifierGroups as any}]));
  expect(item.basePrice).toBe(14900);expect(priceCart([{externalItemId:'pizza',quantity:1,selectedOptionIds:['medium','cheese']}],lookup).totalAmount).toBe(28900);
  expect(()=>priceCart([{externalItemId:'pizza',quantity:1,selectedOptionIds:[]}],lookup)).toThrow(/requires/);
 });
 it('refuses archived items, non-kiosk channels and foreign branches even if client still has a cached item',async()=>{
  for(const payload of [{archivedAt:now.toISOString()},{salesChannels:['POS']},{branchIds:['branch-B']}]) expect((await fixture(payload).service.loadItemsByExternalIds('A',['pizza'],'kiosk'))[0].isAvailable).toBe(false);
 });
 it('refuses checkout from an inactive restaurant category',async()=>{expect((await fixture({},false,true).service.loadItemsByExternalIds('A',['pizza'],'kiosk'))[0].isAvailable).toBe(false);});
 it('does not accept an unavailable add-on',async()=>{
  const records=await fixture({},true).service.loadItemsByExternalIds('A',['pizza'],'kiosk');const lookup=new Map(records.map(r=>[r.externalItemId,{externalItemId:r.externalItemId,name:r.name,basePrice:r.basePrice,taxRate:r.taxRate,isAvailable:r.isAvailable,modifierGroups:r.modifierGroups as any}]));
  expect(()=>priceCart([{externalItemId:'pizza',quantity:1,selectedOptionIds:['medium','cheese']}],lookup)).toThrow(/Unknown modifier/);
 });
 it('keeps all menu and group queries scoped to the caller restaurant',async()=>{
  const {service,tx}=fixture();await service.loadItemsByExternalIds('restaurant-B',['pizza'],'kiosk');for(const [args]of tx.syncedEntity.findMany.mock.calls) expect(args.where.restaurantId).toBe('restaurant-B');expect(tx.device.findFirst.mock.calls[0][0].where.restaurantId).toBe('restaurant-B');
 });
});
