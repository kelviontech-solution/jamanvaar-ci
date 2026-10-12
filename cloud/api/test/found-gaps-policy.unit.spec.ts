import {describe,expect,it,vi} from 'vitest';
import {serviceRequestProgress} from '../src/modules/entity-sync/service-request-progress';
import {validateRefundJournal} from '../src/modules/order-sync/refund-journal-policy';
import {activeProfile,scheduleProfile} from '../src/modules/devices/profile-policy';
import {DevicesService} from '../src/modules/devices/devices.service';
import {TenantAuthService} from '../src/modules/tenant-auth/tenant-auth.service';
describe('Return, recovery and guest-progress policies',()=>{
 const request={id:'svc-a',kind:'CALL_STAFF',recipient:'COUNTER',senderName:'Kiosk',presetText:'Help',createdAt:'2026-10-12T10:00:00.000Z',branchId:'branch-a'};
 it('only service staff can acknowledge, and duplicate guest delivery preserves progress',()=>{
  const sent=serviceRequestProgress(request,null,'svc-a','kiosk-a','KIOSK');
  expect(()=>serviceRequestProgress({...request,status:'ACCEPTED'},sent,'svc-a','kiosk-a','KIOSK')).toThrow();
  expect(()=>serviceRequestProgress({...request,status:'RESOLVED'},sent,'svc-a','pos-a','POS')).toThrow();
  const accepted=serviceRequestProgress({...request,status:'ACCEPTED'},sent,'svc-a','captain-a','CAPTAIN');
  expect(serviceRequestProgress(request,accepted,'svc-a','kiosk-a','KIOSK')).toEqual(accepted);
  expect(serviceRequestProgress({...request,status:'RESOLVED'},accepted,'svc-a','pos-a','POS').status).toBe('RESOLVED');
 });
 it('guest progress lookup refuses another kiosk or branch and returns no staff-private contents',async()=>{
  const service=Object.create(DevicesService.prototype) as DevicesService;
  const payload={...request,status:'ACCEPTED',requesterDeviceId:'kiosk-a',acceptedByDeviceId:'private-staff-device'};
  Object.assign(service,{prisma:{runAsTenant:async(_id:string,fn:(tx:unknown)=>unknown)=>fn({syncedEntity:{findFirst:async()=>({payload})}})}});
  const device={id:'kiosk-a',type:'KIOSK',restaurantId:'restaurant-a',branchId:'branch-a'};
  expect(await service.guestRequestProgress(device as never,'svc-a')).toEqual({status:'ACCEPTED',updatedAt:undefined});
  await expect(service.guestRequestProgress({...device,id:'kiosk-b'} as never,'svc-a')).rejects.toThrow();
  await expect(service.guestRequestProgress({...device,branchId:'branch-b'} as never,'svc-a')).rejects.toThrow();
 });
 it('return journals are append-only, unique, and cannot exceed the collection',()=>{
  const row={idempotencyKey:'r1',amountPaise:5000,method:'CASH' as const,payingShiftId:'till',businessDayId:'day',at:'2026-10-12T10:00:00.000Z',actor:'Manager',reason:'Return'};
  expect(()=>validateRefundJournal([row],[],5000,10000)).not.toThrow();
  expect(()=>validateRefundJournal([{...row,actor:'Cached manager name'}],[{...row,actor:'Verified manager name'}],5000,10000)).not.toThrow();
  for(const rows of [[row,row],[],[{...row,amountPaise:6000}]]) expect(()=>validateRefundJournal(rows,[row],5000,10000)).toThrow();
 });
 it('future profiles preserve the old rule, inheritance follows current restaurant defaults',()=>{
  const current={timezone:'Asia/Kolkata',cutoffHour:5};const at=new Date('2026-10-12T10:00:00Z');
  const profile=scheduleProfile(current,{cutoffHour:3},at);
  expect(profile.effectiveFrom).toBe('2026-10-13');expect(activeProfile(profile,current,at)).toEqual(current);
  expect(()=>scheduleProfile(current,{effectiveFrom:'2026-10-12'},at)).toThrow();
  expect(()=>scheduleProfile(current,{effectiveFrom:'2026-99-99'},at)).toThrow(/future restaurant calendar date/);
  expect(activeProfile({...profile,inherit:true},{...current,cutoffHour:8},new Date('2026-10-14T10:00:00Z')).cutoffHour).toBe(8);
 });
 it('restaurant discovery reveals no account existence or IDs in the HTTP response',async()=>{
  const service=Object.create(TenantAuthService.prototype) as TenantAuthService;const send=vi.fn().mockResolvedValue(undefined);const findMany=vi.fn().mockResolvedValue([{email:'registered@example.com',restaurant:{name:'A < B',restaurantCode:'JM123',status:'ACTIVE'}}]);
  Object.assign(service,{prisma:{runAsPlatform:async(fn:(tx:unknown)=>unknown)=>fn({user:{findMany}})},email:{send}});
  const known=await service.recoverRestaurantId('registered@example.com');expect(send.mock.calls[0][0]).toBe('registered@example.com');expect(send.mock.calls[0][2]).toContain('A &lt; B');
  findMany.mockResolvedValue([]);const unknown=await service.recoverRestaurantId('unknown@example.com');expect(unknown).toEqual(known);expect(send).toHaveBeenCalledTimes(1);expect(JSON.stringify(known)).not.toContain('JM123');
 });
});
