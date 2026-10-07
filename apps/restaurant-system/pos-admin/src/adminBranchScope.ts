export const ADMIN_BRANCH_EVENT='jamanvaar-admin-branch-change';
const key=()=>`jamanvaar_admin_branch:${localStorage.getItem('jamanvaar_cloud_restaurant_id')??'unbound'}`;
export function storedAdminBranch():string|null {try{return localStorage.getItem(key());}catch{return null;}}
// Freeze scope for this document. Another tab changing its selector must not
// redirect this tab's queued mutations into a different branch.
export const activeAdminBranch=storedAdminBranch();
export function saveAdminBranch(branchId:string) {localStorage.setItem(key(),branchId);}
export function adminBranchStorageApp():string {
  const branch=storedAdminBranch(),restaurant=localStorage.getItem('jamanvaar_cloud_restaurant_id');
  return branch&&restaurant?`pos-admin-${restaurant}-${branch}`:'pos-admin';
}
