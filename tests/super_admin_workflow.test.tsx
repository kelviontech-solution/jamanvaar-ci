// @vitest-environment jsdom
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { productAction, checkAction, ownerConsoleTask } from '../cloud/super-admin-web/src/pages/Restaurants/setupActions';
import { PlanReview } from '../cloud/super-admin-web/src/pages/Subscriptions/PlanReview';
import { RestaurantSetupFlow } from '../cloud/super-admin-web/src/pages/Restaurants/RestaurantSetupFlow';
import { BranchAccessWorkspace } from '../cloud/super-admin-web/src/pages/Branches/BranchAccessWorkspace';
import { usePlatformSearch } from '../cloud/super-admin-web/src/hooks/usePlatformSearch';

// can's mock needs the real AuthContext signature (area, level?) up front — an untyped `()=>true`
// infers a zero-arg mock, so a later, more realistic `mockImplementation((area: string) => ...)`
// call fails the same way a real extra-argument caller mismatch would (EC-11/EC-12: a type gate
// catching a genuine mock/contract drift, not a wording assertion to relax).
const state=vi.hoisted(()=>({role:'SUPER_ADMIN',get:vi.fn(),post:vi.fn(),can:vi.fn((_area?: string | null, _level?: string) => true)}));
vi.mock('../cloud/super-admin-web/src/api/client',()=>({api:{get:state.get,post:state.post}}));
vi.mock('../cloud/super-admin-web/src/auth/AuthContext',()=>({useAuth:()=>({user:{role:state.role},can:state.can})}));
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
async function render(node:React.ReactNode){await act(async()=>{root.render(<MemoryRouter>{node}</MemoryRouter>);});}
async function click(text:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);expect(button, text).toBeTruthy();await act(async()=>button!.click());}
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;state.role='SUPER_ADMIN';state.get.mockReset();state.post.mockReset();state.can.mockReset().mockReturnValue(true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();});

describe('Actionable setup routing',()=>{
  const base={appCode:'KDS' as const,purchased:true,enabled:true,configured:false,ready:false,reason:'SETUP_REQUIRED'};
  it('routes an unconfigured kitchen screen to devices, never menu',()=>expect(productAction(base)).toMatchObject({tab:'devices',area:'devices'}));
  it('routes unavailable purchased products to branch restrictions',()=>expect(productAction({...base,enabled:false})).toMatchObject({tab:'branch-access'}));
  it('routes unpurchased access to the purchased plan',()=>expect(productAction({...base,purchased:false})).toMatchObject({tab:'subscription',area:'subscriptions'}));
  it('routes an untested ordering channel to channel acceptance',()=>expect(productAction({...base,appCode:'POS',configured:true})).toMatchObject({tab:'handover',ownerTask:'acceptance'}));
  it('routes menu/table/printer issues to their actual tasks',()=>{expect(checkAction({id:'menu',page:'MENU'}).tab).toBe('menu');expect(checkAction({id:'tables',page:'FLOOR'}).ownerTask).toBe('tables');expect(checkAction({id:'printer',page:'OPERATIONS_HUB'}).ownerTask).toBe('acceptance');});
  it('builds a real owner route with branch and handover preserved',()=>{const url=new URL(ownerConsoleTask('https://example.invalid/restaurant-admin/','branch-a','handover'));expect(url.pathname).toBe('/restaurant-admin/operations');expect(url.searchParams.get('opsTask')).toBe('handover');expect(url.searchParams.get('branchId')).toBe('branch-a');expect(new URL(ownerConsoleTask('https://example.invalid','b','tables')).pathname).toBe('/restaurant-admin/tables');});
  it('uses the destination ops permission for Products & access',async()=>{
    state.get.mockResolvedValue({branch:{name:'Main'},products:[],checks:[],delivery:[],handovers:[],publishedMenuVersion:0});
    state.can.mockImplementation((area?:string|null)=>area!=='ops');
    await render(<RestaurantSetupFlow restaurantId="r" branchId="b" onOpen={vi.fn()} onStatus={vi.fn()}/>);
    expect([...host.querySelectorAll('button')].find(b=>b.textContent==='2. Products & access')?.disabled).toBe(true);
  });
});

describe('Plan transparency',()=>{
  it('lists actual default products and limits rather than promising everything for PRO',async()=>{
    await render(<PlanReview plan={{id:'p',name:'Only kiosk',tier:'PRO',defaultApps:['KIOSK'],maxBranches:2,maxDevices:3,maxUsers:4,entitlements:{selfOrderKiosk:true}} as any}/>);
    expect(host.textContent).toContain('2 branches');expect(host.textContent).toContain('3 devices');expect(host.textContent).toContain('Kiosk');expect(host.textContent).not.toContain('immediately unlocked');
  });
});

describe('Out-of-order search requests',()=>{
  it('never replaces a newer response with an old response',async()=>{
    vi.useFakeTimers();let oldResolve:(value:unknown)=>void=()=>{};
    state.get.mockImplementation((url:string)=>url.includes('old')?new Promise(resolve=>{oldResolve=resolve;}):Promise.resolve({restaurants:[{name:'New result'}],owners:[],devices:[],activationKeys:[]}));
    function Search({query}:{query:string}){const {searchResults}=usePlatformSearch(query);return <output>{JSON.stringify(searchResults)}</output>;}
    await render(<Search query="old"/>);await act(async()=>{await vi.advanceTimersByTimeAsync(300);});
    await render(<Search query="new"/>);await act(async()=>{await vi.advanceTimersByTimeAsync(300);});
    expect(host.textContent).toContain('New result');await act(async()=>oldResolve({restaurants:[{name:'Stale result'}]}));
    expect(host.textContent).toContain('New result');expect(host.textContent).not.toContain('Stale result');
    await render(<Search query=""/>);expect(host.textContent).toBe('null');
  });
});

describe('Reviewed branch copying',()=>{
  const branches=[{id:'a',name:'Main'},{id:'b',name:'Second'}];
  const view={features:[],apps:[{appCode:'POS',enabled:true,reason:'PLAN',revision:0}],history:[]};
  it('requires impact preview and acknowledgement before writing the target',async()=>{
    state.get.mockResolvedValue(view);state.post.mockResolvedValue({previewHash:'signed-review',impact:{activeDevices:1,pendingOrders:2,quotaWarning:null,affectedDevices:[]}});
    await render(<BranchAccessWorkspace restaurantId="r" branchId="a" branches={branches}/>);
    const target=[...host.querySelectorAll('label')].find(l=>l.textContent?.includes('Copy to Second'))!.querySelector('input')!;
    await act(async()=>target.click());await click('Review copy impact');
    expect(state.post).toHaveBeenCalledTimes(1);expect(state.post.mock.calls[0][0]).toBe('/api/v1/branches/b/licenses/preview');
    const apply=[...host.querySelectorAll('button')].find(b=>b.textContent==='Apply reviewed branch copies')!;expect(apply.disabled).toBe(true);
    const ack=[...host.querySelectorAll('label')].find(l=>l.textContent?.includes('I reviewed each branch'))!.querySelector('input')!;
    await act(async()=>ack.click());await click('Apply reviewed branch copies');
    expect(state.post.mock.calls[1][0]).toBe('/api/v1/branches/b/licenses');expect(state.post.mock.calls[1][1]).toMatchObject({previewHash:'signed-review',acknowledgeImpact:true,expectedRevision:0});expect(host.textContent).toContain('Second: scheduled successfully.');
  });
  it('keeps copy controls disabled for support staff',async()=>{state.role='SUPPORT_ADMIN';state.get.mockResolvedValue(view);await render(<BranchAccessWorkspace restaurantId="r" branchId="a" branches={branches}/>);expect(host.querySelector('fieldset')?.disabled).toBe(true);expect(state.post).not.toHaveBeenCalled();});
  it('reports an unsuccessful target write without claiming all branches were updated',async()=>{
    state.get.mockResolvedValue(view);
    state.post.mockImplementation((url:string)=>url.endsWith('/preview')?Promise.resolve({previewHash:'review',impact:{activeDevices:0,pendingOrders:0,quotaWarning:null,affectedDevices:[]}}):Promise.reject(new Error('Allocation changed; review again')));
    await render(<BranchAccessWorkspace restaurantId="r" branchId="a" branches={branches}/>);
    const target=[...host.querySelectorAll('label')].find(l=>l.textContent?.includes('Copy to Second'))!.querySelector('input')!;
    await act(async()=>target.click());await click('Review copy impact');
    const ack=[...host.querySelectorAll('label')].find(l=>l.textContent?.includes('I reviewed each branch'))!.querySelector('input')!;
    await act(async()=>ack.click());await click('Apply reviewed branch copies');
    expect(host.textContent).toContain('Second: NOT saved. Allocation changed; review again');
    expect(host.textContent).not.toContain('scheduled successfully');
    expect(state.post).toHaveBeenCalledTimes(2);
  });
});
