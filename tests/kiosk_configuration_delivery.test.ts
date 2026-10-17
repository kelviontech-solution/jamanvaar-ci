import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({fleet:vi.fn(),send:vi.fn()}));
vi.mock('@jamanvaar/database',()=>({KeyValueStore:{get:()=> 'branch-a'},KioskConfigurationRepository:{snapshot:()=>({updatedAt:'2026-10-16T05:00:00.000Z'})}}));
vi.mock('../apps/restaurant-system/pos-admin/src/cloud/cloudClient',()=>({fetchCloudKiosks:mocks.fleet,sendKioskCommand:mocks.send}));
import {requestConfigurationReceipts} from '../apps/restaurant-system/pos-admin/src/components/kiosk/configurationDelivery';
describe('Versioned kiosk receipt requests',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.send.mockResolvedValue(undefined);mocks.fleet.mockResolvedValue([{id:'a',branchId:'branch-a'},{id:'b',branchId:'branch-b'}]);});
  it('queues only this branch, requests the actual published version, and does not claim receipt',async()=>{
    expect(await requestConfigurationReceipts()).toContain('Receipt checks queued');expect(mocks.send).toHaveBeenCalledTimes(1);expect(mocks.send).toHaveBeenCalledWith('a','REQUEST_SYNC',{scope:'WELCOME',configVersion:'2026-10-16T05:00:00.000Z'});
  });
  it('keeps publication separate from a failed acknowledgement request',async()=>{
    mocks.send.mockRejectedValue(Error('offline'));expect(await requestConfigurationReceipts()).toContain('Some kiosk receipt checks could not be queued');
    mocks.fleet.mockRejectedValue(Error('network'));expect(await requestConfigurationReceipts()).toContain('Could not request kiosk receipt checks');
  });
});
