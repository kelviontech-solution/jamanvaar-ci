import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {DurableStorage} from '../../../packages/database/src/durable/durable_storage';
import {db} from '@jamanvaar/database';
import type {MenuItem,ModifierGroup} from '@jamanvaar/types';
import {useCaptainStore} from '../../../apps/restaurant-system/captain/src/store/captainStore';
import {PrinterService} from '@jamanvaar/api';

// These probes document observed defects. Passing here means the defect was reproduced,
// not that its desired regression acceptance condition is satisfied.
describe('Ecosystem audit observations',()=>{
 it('documents the interval between accepted memory writes and durable commit',async()=>{
  const persisted=new Map<string,string>();
  const s=await DurableStorage.open({load:async()=>({}),write:async ops=>{for(const o of ops)if(o.op==='set')persisted.set(o.key,o.value);},close(){}});
  s.setItem('sale','paid');const before={accepted:s.getItem('sale'),health:s.health(),persisted:persisted.has('sale')};
  s.close();await new Promise(r=>setTimeout(r,0));
  const observed={before,persistedAfterClose:persisted.has('sale')};
  console.log('AUDIT_DURABILITY',JSON.stringify(observed));
  expect(before.accepted).toBe('paid');expect(before.health.ok).toBe(true);expect(observed.persistedAfterClose).toBe(false);
 });
 it('documents same-timestamp sync fingerprint collision for a modifier-only change',()=>{
  const source=readFileSync('packages/sync/src/outbox.ts','utf8');
  const start=source.indexOf('function contentFingerprint('),end=source.indexOf('\nfunction toPushEvent',start);
  const js=ts.transpileModule(source.slice(start,end)+'\nexports.f=contentFingerprint;',{compilerOptions:{target:ts.ScriptTarget.ES2021,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports:Record<string,any>={};new Function('exports',js)(exports);
  const order={id:'audit-order',updatedAt:'2026-10-17T10:00:00.000Z',orderStatus:'NEW',paymentStatus:'PENDING',totalAmount:100,items:[{id:'line',quantity:1,unitPrice:100,kitchenStatus:'PENDING',modifiers:[{optionId:'roti',optionName:'Roti',priceDelta:0}]}]};
  const second={...order,items:order.items.map(i=>({...i,modifiers:[{optionId:'naan',optionName:'Plain naan',priceDelta:0}]}))};
  const firstId=order.id+'@'+order.updatedAt+'#'+exports.f(order),secondId=second.id+'@'+second.updatedAt+'#'+exports.f(second);
  console.log('AUDIT_EVENT_ID',JSON.stringify({payloadChanged:JSON.stringify(order.items)!==JSON.stringify(second.items),sameEventId:firstId===secondId}));
  expect(firstId).toBe(secondId);
 });
 it('documents Captain add path bypassing required choices and configured minimum',()=>{
  const oldItems=db.menuItems,oldGroups=db.modifierGroups,oldCart=useCaptainStore.getState().cartItems;
  try{
   const item={id:'audit-dish',categoryId:'audit-category',name:'Audit Thali',price:100,isAvailable:true,modifierGroupIds:['audit-bread'],minQuantity:2,maxQuantity:3} as MenuItem;
   db.menuItems=[item];db.modifierGroups=[{id:'audit-bread',name:'Bread',isRequired:true,minSelections:1,maxSelections:1,options:[{id:'roti',name:'Roti',priceDelta:0,isAvailable:true}]} as ModifierGroup];
   useCaptainStore.setState({cartItems:[]});useCaptainStore.getState().addItemToCart(item,[],'','COURSE_1',1);
   const line=useCaptainStore.getState().cartItems[0];console.log('AUDIT_CAPTAIN',JSON.stringify({quantity:line.quantity,requiredChoices:line.selectedModifiers.length,minQuantity:item.minQuantity}));
   expect(line.quantity).toBe(1);expect(line.selectedModifiers).toHaveLength(0);
  }finally{db.menuItems=oldItems;db.modifierGroups=oldGroups;useCaptainStore.setState({cartItems:oldCart});}
 });
 it('documents automatic printer configuration marking an offline printer ready without a probe',()=>{
  const before=db.configuredPrinters;
  try{
   db.configuredPrinters=[{id:'audit-printer',name:'Disconnected audit printer',paperSize:'80mm',interfaceType:'NETWORK_LAN',status:'OFFLINE'} as any];
   const result=PrinterService.autoConfigureKioskPrinter();
   console.log('AUDIT_PRINTER_HEALTH',JSON.stringify({reportedSuccess:result.success,status:db.configuredPrinters[0].status}));
   expect(result.success).toBe(true);expect(db.configuredPrinters[0].status).toBe('READY');
  }finally{db.configuredPrinters=before;}
 });
});
