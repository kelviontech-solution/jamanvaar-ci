export * from '/docs/reports/qr-experience-2026-10-22/mock-cloud.js';
import {qrApi as fallback} from '/docs/reports/qr-experience-2026-10-22/mock-cloud.js';
export async function pushEntitySync(type,entities){const f=window.__experience;if(f.failMenuSave)throw Error('Menu connection interrupted. Draft retained.');if(type==='MENU_ITEM'){for(const row of entities){f.items=f.items.filter(item=>item.id!==row.externalId);f.items.push({...row.payload,id:row.externalId});}f.menuDirty=true;}f.menuWrites++;return{results:entities.map(row=>({externalId:row.externalId,status:'success'}))};}
export async function qrApi(url,init={}){
 const f=window.__experience,u=new URL(url,location.origin),p=u.pathname,body=typeof init.body==='string'?JSON.parse(init.body):init.body;
 f.requests.push({url,method:init.method||'GET',body});
 if(p.endsWith('/qr-page')){const data=await fallback(url,init);data.scope=u.searchParams.get('scope');data.branchName=data.scope==='branch-b'?'Uptown':'Main Dining';return data;}
 if(p.endsWith('/order-list'))return{rows:structuredClone(f.orders),total:f.orders.length,nextCursor:null};
 if(p.endsWith('/operations/attention')){if(f.failAttention)throw Error('Live connection interrupted');return{scope:u.searchParams.get('branchId')||null,checkedAt:new Date().toISOString(),serviceAvailable:true,total:f.attention.length,urgent:f.attention.filter(item=>item.priority==='URGENT').length,servicePending:f.attention.filter(item=>item.kind==='SERVICE').length,items:structuredClone(f.attention)};}
 if(p.endsWith('/requests/request-one/action')){if(f.failAcknowledge)throw Error('Request could not be acknowledged');f.attention=f.attention.filter(item=>item.id!=='request-one');f.acknowledged=true;return{status:'ACKNOWLEDGED'};}
 if(p.endsWith('/crm/program')){if(init.method==='PUT'){if(f.failProgram)throw Error('Program connection interrupted');f.program={...body,version:f.program.version+1};}return{canManageProgram:true,qrChannelEnabled:true,phoneVerificationReady:true,program:structuredClone(f.program),rewards:structuredClone(f.rewards)};}
 if(p.endsWith('/crm/rewards')){if(f.failReward)throw Error('Reward could not be saved');f.rewards.push({...body,id:'reward-'+(f.rewards.length+1),version:1,discountKind:'FIXED'});return{canManageProgram:true,qrChannelEnabled:true,phoneVerificationReady:true,program:f.program,rewards:structuredClone(f.rewards)};}
 if(p.endsWith('/settings')&&init.method==='PUT'){if(f.failRules)throw Error('Settings connection interrupted');f.ruleWrites.push(body);f.ruleSettings={...(f.ruleSettings||{}),...body.rules};return{};}
 if(p.endsWith('/settings')){const data=await fallback(url,init);data.rules={...data.rules,...f.ruleSettings};return data;}
 if(p.endsWith('/menu/branch-overrides')){if(body.isAvailable===false)f.paused.push(body.itemId);else f.paused=f.paused.filter(id=>id!==body.itemId);f.menuDirty=true;return{};}
 if(p.endsWith('/menu/publish')){if(f.failMenuPublish)throw Error('Menu publication interrupted');f.liveIds=f.items.map(item=>item.id);f.menuDirty=false;f.menuVersion++;return{version:f.menuVersion,warnings:[]};}
 if(p.endsWith('/menu-status')){
  const data=await fallback(url,init),branch=u.searchParams.get('branchId')||'branch-a';
  data.branchId=branch;data.branchName=branch==='branch-b'?'Uptown':'Main Dining';data.publishedVersion=f.menuVersion;
  data.review.hasUnpublishedChanges=f.menuDirty;data.review.publishedVersion=f.menuVersion;data.review.changes.added=f.items.filter(item=>!f.liveIds.includes(item.id)).map(item=>({id:item.id,name:item.name}));
  data.rows=f.items.map(item=>({...item,livePrice:f.liveIds.includes(item.id)?item.price:null,state:f.paused.includes(item.id)?'HIDDEN':f.liveIds.includes(item.id)?'LIVE':'DRAFT_ONLY',live:f.liveIds.includes(item.id)&&!f.paused.includes(item.id),afterPublishVisible:!f.paused.includes(item.id),reason:f.paused.includes(item.id)?'Switched off for this branch':f.liveIds.includes(item.id)?'Customers see this published dish.':'Not published yet',afterPublishReason:f.paused.includes(item.id)?'Switched off for this branch':'',canRestoreBranchPause:f.paused.includes(item.id)}));
  data.liveItems=f.items.filter(item=>f.liveIds.includes(item.id)&&!f.paused.includes(item.id));data.counts={draft:f.items.length,live:data.liveItems.length,afterPublish:f.items.filter(item=>!f.paused.includes(item.id)).length};return data;
 }
 return fallback(url,init);
}
export const request=qrApi;
