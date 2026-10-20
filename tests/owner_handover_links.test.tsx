// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {ownerConsoleTask,ownerProductTask} from '../cloud/super-admin-web/src/pages/Restaurants/setupActions';
import {OwnerHandover} from '../cloud/super-admin-web/src/pages/Restaurants/OwnerHandover';
import {qrWorkspaceBranch,safeQrDestination} from '../apps/restaurant-system/pos-admin/src/qr/qrRoutes';
import type {LaunchStatus} from '../cloud/super-admin-web/src/pages/Restaurants/RestaurantSetupFlow';
const clipboard = vi.hoisted(()=>({copy:vi.fn().mockResolvedValue(true)}));
vi.mock('../packages/utils/src/clipboard',()=>({copyText:clipboard.copy}));
vi.mock('../cloud/super-admin-web/src/auth/AuthContext',()=>({useAuth:()=>({can:()=>true})}));
const status:LaunchStatus={branch:{name:'Main dining'},products:[{appCode:'QR_ORDERING',purchased:true,enabled:true,configured:true,ready:false,reason:'OK'}],checks:[{id:'test-QR',label:'QR test',done:false}],delivery:[],handovers:[],publishedMenuVersion:1};
beforeEach(()=>{vi.stubGlobal('location',new URL('https://system.example.test/restaurants/r?tab=handover'));(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;});
afterEach(()=>{vi.unstubAllGlobals();});
describe('hosted handover task routing',()=>{
  it.each(['acceptance','handover'])('rejects a stale localhost override for %s',task=>{
    const link=new URL(ownerConsoleTask('http://localhost:5176','branch-a',task));
    expect(link.origin).toBe('https://system.example.test');expect(link.pathname).toBe('/restaurant-admin/operations');
    expect(link.searchParams.get('opsTask')).toBe(task);expect(link.searchParams.get('branchId')).toBe('branch-a');
  });
  it('opens QR-only tasks inside QR Admin with branch and operation preserved',()=>{
    const link=new URL(ownerProductTask(['QR_ORDERING'],'branch-a','handover'));
    expect(link.origin).toBe('https://system.example.test');expect(link.pathname).toBe('/qr/admin/');
    expect(link.searchParams.get('tab')).toBe('OPERATIONS');expect(link.searchParams.get('opsTask')).toBe('handover');
    expect(safeQrDestination(link.pathname+link.search)).toBe(link.pathname+link.search);
  });
  it('keeps combined plans in Restaurant Admin and builds QR table setup in QR Admin',()=>{
    expect(new URL(ownerProductTask(['POS_ADMIN','QR_ORDERING'],'a')).pathname).toBe('/restaurant-admin/operations');
    const tables=new URL(ownerProductTask(['QR_ORDERING'],'a','tables'));
    expect(tables.searchParams.get('tab')).toBe('TABLES');expect(tables.searchParams.has('opsTask')).toBe(false);
  });
  it('preserves a secure separately hosted console without duplicating its app prefix',()=>{
    const link=new URL(ownerConsoleTask('https://admin.example.org/team/restaurant-admin/','a'));
    expect(link.origin).toBe('https://admin.example.org');expect(link.pathname).toBe('/team/restaurant-admin/operations');
  });
});
describe('QR linked branch validation',()=>{
  const branches=[{id:'a',status:'ACTIVE'},{id:'b',status:'ACTIVE'},{id:'old',status:'INACTIVE'}];
  it('selects a requested accessible branch ahead of a saved branch',()=>expect(qrWorkspaceBranch('OWNER',null,'b',branches,'a')).toBe('a'));
  it.each(['foreign','old'])('rejects an unavailable linked branch %s',branch=>expect(()=>qrWorkspaceBranch('OWNER',null,'a',branches,branch)).toThrow('linked branch'));
  it('prevents managers from selecting another branch and retains owner all-branch mode',()=>{
    expect(()=>qrWorkspaceBranch('MANAGER','a','a',branches,'b')).toThrow();
    expect(qrWorkspaceBranch('MANAGER','a','b',branches,null)).toBe('a');
    expect(qrWorkspaceBranch('OWNER',null,'all',branches,null)).toBe('all');
  });
  it('retains authorized next tasks and refuses outside-site redirects',()=>{
    expect(safeQrDestination('/qr/admin/?tab=OPERATIONS&branchId=a&opsTask=acceptance')).toContain('opsTask=acceptance');
    expect(safeQrDestination('https://evil.example/')).toBe('/qr/admin/');expect(safeQrDestination('//evil.example/')).toBe('/qr/admin/');
  });
});
describe('handover task presentation',()=>{
  it('explains two distinct tasks, uses QR links, and disables tasks while access is unknown',async()=>{
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    const render=async(value?:LaunchStatus)=>act(async()=>root.render(<MemoryRouter><OwnerHandover name="Cafe" restaurantCode="JM1234567890" branchId="a" status={value} onOwner={()=>{}} onDevices={()=>{}}/></MemoryRouter>));
    try{
      await render(status);expect(host.querySelectorAll('.handover-task-grid article')).toHaveLength(2);
      expect(host.textContent).toContain('Test ordering channels');expect(host.textContent).toContain('Prepare and acknowledge handover');
      for(const anchor of host.querySelectorAll<HTMLAnchorElement>('.handover-task-grid a')){expect(new URL(anchor.href).pathname).toBe('/qr/admin/');expect(anchor.rel).toContain('noopener');}
      const copy=[...host.querySelectorAll('button')].find(button=>button.textContent==='Copy safe summary')!;
      await act(async()=>copy.click());
      expect(clipboard.copy).toHaveBeenCalledWith(expect.stringContaining('https://system.example.test/qr/admin/'));
      await render();expect(host.querySelectorAll('.handover-task-grid a')).toHaveLength(0);
      expect([...host.querySelectorAll<HTMLButtonElement>('.handover-task-grid button')].every(button=>button.disabled)).toBe(true);
    }finally{act(()=>root.unmount());host.remove();}
  });
});
