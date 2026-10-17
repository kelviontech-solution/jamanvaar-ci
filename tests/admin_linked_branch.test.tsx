// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { AdminBranchWorkspace } from '../apps/restaurant-system/pos-admin/src/components/header/AdminBranchWorkspace';
const scope=vi.hoisted(()=>({save:vi.fn(),ready:vi.fn(),notify:vi.fn()}));
vi.mock('@jamanvaar/database',()=>({db:{outlet:{id:'a',name:'Main'},restaurant:{id:'r'},notify:scope.notify}}));
vi.mock('../apps/restaurant-system/pos-admin/src/adminBranchScope',()=>({activeAdminBranch:'a',saveAdminBranch:scope.save}));
vi.mock('../apps/restaurant-system/pos-admin/src/cloud/cloudClient',()=>({fetchCloudBranches:async()=>[{id:'a',name:'Main',status:'ACTIVE',code:'MAIN'}],fetchTenantDashboard:async()=>({scope:{branchId:null}})}));
vi.mock('../apps/restaurant-system/pos-admin/src/components/qrconsole/useQrUnsavedChanges',()=>({requestQrLeave:async()=>true}));
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;scope.save.mockReset();scope.ready.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
it('accepts a matching authorized branch and preserves the exact task query',async()=>{
  history.replaceState({},'', '/restaurant-admin/operations?branchId=a&opsTask=acceptance');
  await act(async()=>root.render(<AdminBranchWorkspace onReady={scope.ready}/>));
  expect(scope.ready).toHaveBeenCalled();expect(scope.save).not.toHaveBeenCalled();expect(location.search).toBe('?opsTask=acceptance');
});
it('does not change workspace or mark it ready for a foreign linked branch',async()=>{
  history.replaceState({},'', '/restaurant-admin/operations?branchId=foreign&opsTask=handover');
  await act(async()=>root.render(<AdminBranchWorkspace onReady={scope.ready}/>));
  expect(host.textContent).toContain('linked branch is unavailable');expect(scope.save).not.toHaveBeenCalled();expect(scope.ready).not.toHaveBeenCalled();
});
