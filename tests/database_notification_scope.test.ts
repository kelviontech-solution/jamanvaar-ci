import { afterEach, describe, expect, it, vi } from 'vitest';
import { JamanvaarDatabase } from '../packages/database/src/db';
import { KeyValueStore } from '../packages/database/src/key_value_store';

afterEach(() => { vi.restoreAllMocks(); KeyValueStore.reset(); vi.unstubAllGlobals(); });
function harness() {
  const channels: Array<{ onmessage: ((event: { data: unknown }) => void) | null; postMessage: ReturnType<typeof vi.fn> }> = [];
  const events = new Map<string, (event: { key: string }) => void>();
  const values = new Map<string,string>();
  const TestChannel=class {
    onmessage: ((event:{data:unknown})=>void) | null = null;
    postMessage = vi.fn();
    constructor() { channels.push(this); }
  };
  vi.stubGlobal('window',{BroadcastChannel:TestChannel,addEventListener:(name: string,fn: (event:{key:string})=>void)=>events.set(name,fn)});
  vi.stubGlobal('BroadcastChannel',TestChannel);
  const storage = {getItem:(key: string)=>values.get(key)??null,setItem:(key: string,value: string)=>{values.set(key,value);},removeItem:(key: string)=>{values.delete(key);}};
  vi.stubGlobal('localStorage',storage);KeyValueStore.reset();
  const instance=JamanvaarDatabase.getInstanceForRole('POS_ADMIN',`test-${Math.random()}-`);
  return {instance,channels,events,storage};
}
describe('database notifications on a shared application origin',()=>{
  it('uses the durable store acknowledgement instead of a premature global broadcast',()=>{
    const {instance,channels,storage}=harness();
    let remote: (()=>void) | undefined;
    instance.attachDurableStorage({...storage,subscribeRemote:listener=>{remote=()=>listener([{op:'set',key:instance.storagePrefix+'menu_items',value:'[]'}]);return ()=>{};}});
    const load=vi.spyOn(instance as any,'loadFromStorage');
    channels[0].onmessage?.({data:{type:'DB_SYNC',scope:instance.storagePrefix}});
    expect(load).not.toHaveBeenCalled();
    instance.notify();expect(channels[0].postMessage).not.toHaveBeenCalled();
    remote?.();expect(load).toHaveBeenCalledTimes(1);
  });
  it('ignores another app\'s fallback notification and reloads only its own namespace',()=>{
    const {instance,channels,events}=harness();
    KeyValueStore.setBrowserNamespace('jamanvaar_app_pos-admin:');
    const load=vi.spyOn(instance as any,'loadFromStorage');
    channels[0].onmessage?.({data:{type:'DB_SYNC',scope:'jamanvaar_app_kiosk-user:'+instance.storagePrefix}});
    events.get('storage')?.({key:'jamanvaar_app_kiosk-user:'+instance.storagePrefix+'menu_items'});
    expect(load).not.toHaveBeenCalled();
    channels[0].onmessage?.({data:{type:'DB_SYNC',scope:KeyValueStore.browserKey(instance.storagePrefix)}});
    expect(load).toHaveBeenCalledTimes(1);
    instance.notify();expect(channels[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({scope:KeyValueStore.browserKey(instance.storagePrefix)}));
  });
});
