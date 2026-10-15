import { deviceFetch } from './cloud/cloudClient';
export interface BranchAdmission {
  available: boolean;
  message: string;
}
let latest: BranchAdmission | undefined;
/** Keep offline counter service; an online terminal checks before creating or confirming a new order. */
export async function checkBranchService(online: boolean): Promise<BranchAdmission> {
  if (!online) return latest ?? { available: true, message: '' };
  const response = await deviceFetch('/api/v1/operations/device/service', {
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok)
    throw new Error('Could not check service availability. Please try again or ask a team member.');
  const data = (await response.json()) as BranchAdmission;
  if (typeof data.available !== 'boolean')
    throw new Error('Could not confirm branch availability. Please ask a team member.');
  latest = { available: data.available, message: data.message };
  return latest;
}
