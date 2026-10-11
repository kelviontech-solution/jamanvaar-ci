import { installNativeUpdate, type NativeUpdateProgress } from '@jamanvaar/ui';
export type DesktopUpdateProgress = NativeUpdateProgress;
export async function runStaffTriggeredUpdate(onProgress: (p: DesktopUpdateProgress) => void): Promise<void> {
  await installNativeUpdate(onProgress).catch(() => undefined);
}
