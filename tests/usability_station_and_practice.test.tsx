// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {act} from 'react';
import {db,KeyValueStore,KitchenStationRepository,ServiceMessages,KioskConfigurationRepository} from '@jamanvaar/database';
import {StaffPracticePanel,translateStaff} from '@jamanvaar/ui';
import {ticketsForStation} from '../apps/restaurant-system/kds/src/kdsLogic';
import type {KOTRecord} from '@jamanvaar/types';
beforeEach(() => {Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});db.resetToDefaultSeed();localStorage.clear();KeyValueStore.set('jamanvaar_tenant_id','tenant-a');KioskConfigurationRepository.bindBranch('branch-a');KitchenStationRepository.apply([]);ServiceMessages.resetForTests();});
afterEach(() => vi.restoreAllMocks());
describe('Station identity and isolated training',() => {
  it('renames a station without losing explicitly aliased legacy tickets; refuses ambiguous aliases',() => {
    const station=KitchenStationRepository.ensure('Main Kitchen');
    const old={id:'old',station:'Main Kitchen',items:[]} as unknown as KOTRecord;
    db.kots=[old];KitchenStationRepository.rename(station.id,'Hot Kitchen',[]);
    expect(old.stationId).toBe(station.id);expect(ticketsForStation([old],station.id)).toHaveLength(1);
    expect(ticketsForStation([old],'Main')).toHaveLength(0);expect(ticketsForStation([old],'Main Kitchen')).toHaveLength(1);
    const other=KitchenStationRepository.ensure('Cold Kitchen');
    expect(() => KitchenStationRepository.rename(other.id,'Cold Kitchen',['Main Kitchen'])).toThrow(/unique/);
  });
  it('a different branch never inherits the previous station registry',() => {
    KitchenStationRepository.ensure('Branch A Kitchen');KioskConfigurationRepository.bindBranch('branch-b');expect(KitchenStationRepository.list()).toEqual([]);
    KioskConfigurationRepository.bindBranch('branch-a');expect(KitchenStationRepository.list()[0].name).toBe('Branch A Kitchen');
  });
  it('round-trips stations through the scoped configuration and migrates only exact previous names',() => {
    const row=KitchenStationRepository.ensure('Tandoor');const config=KioskConfigurationRepository.snapshot();KitchenStationRepository.apply([]);
    expect(KioskConfigurationRepository.apply(config)).toBe(true);expect(KitchenStationRepository.resolve('Tandoor')?.id).toBe(row.id);
    expect(KioskConfigurationRepository.apply({...config,branchId:'foreign'})).toBe(false);
  });
  it('completed practice never mutates production records or starts a network request',async() => {
    const before=JSON.stringify({orders:db.orders,kots:db.kots,stock:db.inventoryItems,cash:db.cashMovements,jobs:db.printJobs});
    const fetch=vi.spyOn(globalThis,'fetch'); const container=document.createElement('div');document.body.append(container); const root=createRoot(container);
    await act(async() => root.render(<StaffPracticePanel/>));
    const click=async(text:string) => {const button=[...container.querySelectorAll('button')].find(row => row.textContent?.includes(text));expect(button).toBeTruthy();await act(async()=>button!.click());};
    await click('Staff practice');await click('Add practice dish');await click('Review order');await click('Send practice KOT');await click('Mark practice ready');await click('Mark practice served');await click('Confirm practice collection');
    expect(container.textContent).toContain('Practice completed');expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify({orders:db.orders,kots:db.kots,stock:db.inventoryItems,cash:db.cashMovements,jobs:db.printJobs})).toBe(before);
    await act(async()=>root.unmount());container.remove();
  });
  it('staff acknowledgement is a separate durable event and stale delivery cannot undo it',() => {
    const msg={id:'svc-request',kind:'CALL_STAFF',recipient:'COUNTER',senderName:'Kiosk',presetText:'Help',createdAt:new Date().toISOString(),status:'SENT'};
    ServiceMessages.applyRemote(msg,'POS');ServiceMessages.acknowledgeRequest(msg.id,'ACCEPTED');
    ServiceMessages.applyRemote(msg,'POS');expect(ServiceMessages.getRequest(msg.id)?.status).toBe('ACCEPTED');
    expect(ServiceMessages.collectSyncRecords()[0].payload.status).toBe('ACCEPTED');
    ServiceMessages.acknowledgeRequest(msg.id,'RESOLVED');expect(ServiceMessages.getRequest(msg.id)?.status).toBe('RESOLVED');
    expect(ServiceMessages.collectSyncRecords()).toHaveLength(1);
  });
  it('new staff journeys are available in Gujarati and Hindi',() => {
    for(const text of ['Staff practice','Confirm practice collection','Practice completed','Accept request','Complete request']) for(const lang of ['gu','hi'] as const) expect(translateStaff(text,lang)).not.toBe(text);
  });
  it('an older pushed acknowledgement cannot discard a newly completed request',() => {
    const msg=ServiceMessages.enqueue({kind:'CALL_STAFF',recipient:'COUNTER',senderName:'Kiosk',presetText:'Help'});
    ServiceMessages.acknowledgeRequest(msg.id,'ACCEPTED'); const pushed=ServiceMessages.collectSyncRecords();
    ServiceMessages.acknowledgeRequest(msg.id,'RESOLVED'); ServiceMessages.markPushed(pushed);
    expect(ServiceMessages.collectSyncRecords()[0].payload.status).toBe('RESOLVED');
    KioskConfigurationRepository.bindBranch('branch-b');expect(ServiceMessages.collectSyncRecords()).toEqual([]);expect(ServiceMessages.getRequest(msg.id)).toBeUndefined();
  });
});
