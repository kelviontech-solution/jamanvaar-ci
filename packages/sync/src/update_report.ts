export const NATIVE_UPDATE_ATTEMPT_KEY = 'jamanvaar_native_update_attempt_v1';
export interface NativeUpdateReport {
  version: string;
  status: 'AWAITING_RESTART' | 'VERIFIED' | 'NOT_INSTALLED' | 'FAILED';
  installedVersion?: string;
  message?: string;
}
export function readNativeUpdateReport(): NativeUpdateReport | undefined {
  try {
    const raw = localStorage.getItem(NATIVE_UPDATE_ATTEMPT_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw);
    if (typeof value.version !== 'string' || value.version.length > 50 || !['AWAITING_RESTART', 'VERIFIED', 'NOT_INSTALLED', 'FAILED'].includes(value.status)) return undefined;
    return { version: value.version, status: value.status, ...(typeof value.installedVersion === 'string' ? { installedVersion: value.installedVersion.slice(0, 50) } : {}), ...(typeof value.message === 'string' ? { message: value.message.slice(0, 200) } : {}) };
  } catch { return undefined; }
}
