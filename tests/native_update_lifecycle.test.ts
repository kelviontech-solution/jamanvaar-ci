// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ check: vi.fn(), getVersion: vi.fn(), flush: vi.fn(), health: vi.fn(), visible: vi.fn(), apply: vi.fn(), apk: vi.fn(), apkStatus: vi.fn(), installApk: vi.fn() }));
vi.mock('@jamanvaar/database', () => ({ db: { printJobs: [], getPersistenceHealth: mocks.health } }));
vi.mock('@jamanvaar/sync', () => ({ NATIVE_UPDATE_ATTEMPT_KEY: 'jamanvaar_native_update_attempt_v1', AppUpdate: { getVisible: mocks.visible, apply: mocks.apply } }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: mocks.getVersion, getName: async () => 'JAMANVAAR POS' }));
vi.mock('@jamanvaar/tauri-plugin-apk-updater', () => ({ downloadAndInstall: mocks.apk, getUpdateStatus: mocks.apkStatus, installDownloaded: mocks.installApk }));
import { installNativeUpdate, verifyInstalledUpdate, registerNativeUpdateGuard } from '../packages/ui/src/native_update';

describe('installed native update lifecycle', () => {
  it('blocks an unfinished order and rechecks it before installer handoff', async () => {
    let active = true;
    const dispose = registerNativeUpdateGuard(() => active ? 'Finish the order first' : null);
    try {
      await expect(installNativeUpdate(vi.fn())).rejects.toThrow('Finish the order first');
      expect(mocks.check).not.toHaveBeenCalled();
      active = false;
      const install = vi.fn();
      mocks.check.mockResolvedValue({ version: '2.0.0', rawJson, download: vi.fn().mockImplementation(async () => { active = true; }), install, close: vi.fn().mockResolvedValue(undefined) });
      await expect(installNativeUpdate(vi.fn())).rejects.toThrow('Finish the order first');
      expect(install).not.toHaveBeenCalled();
    } finally { dispose(); }
  });
  const rawJson = { platforms: { 'windows-x86_64': { signature: Buffer.from('untrusted comment: test\nAAAA\ntrusted comment: timestamp:1\tfile:JAMANVAAR POS_2.0.0_x64-setup.exe\nAAAA').toString('base64') } } };
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear();
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: 'Windows', configurable: true });
    Object.defineProperty(window, '__jamanvaarStorage', { value: { flush: mocks.flush }, configurable: true });
    mocks.flush.mockResolvedValue(undefined); mocks.health.mockReturnValue({ ok: true }); mocks.visible.mockReturnValue(null);
  });
  it('downloads with the official updater, flushes data, records handoff before install and only confirms on next native launch', async () => {
    const download = vi.fn().mockResolvedValue(undefined), install = vi.fn().mockImplementation(async () => {
      expect(JSON.parse(localStorage.getItem('jamanvaar_native_update_attempt_v1')!).status).toBe('AWAITING_RESTART');
    }), close = vi.fn().mockResolvedValue(undefined);
    mocks.check.mockResolvedValue({ version: '2.0.0', rawJson, download, install, close });
    await installNativeUpdate(vi.fn());
    expect(download).toHaveBeenCalledOnce(); expect(install).toHaveBeenCalledWith({ restartAfterInstall: true }); expect(mocks.flush).toHaveBeenCalledTimes(2);
    expect(mocks.apply).not.toHaveBeenCalled();
    mocks.getVersion.mockResolvedValue('2.0.0'); await verifyInstalledUpdate();
    expect(JSON.parse(localStorage.getItem('jamanvaar_native_update_attempt_v1')!).status).toBe('VERIFIED'); expect(mocks.apply).toHaveBeenCalledWith(null);
  });
  it('invalid signatures/download failures do not call install and remain retryable', async () => {
    const install = vi.fn(), close = vi.fn().mockResolvedValue(undefined);
    mocks.check.mockResolvedValue({ version: '2.0.0', rawJson, download: vi.fn().mockRejectedValue(new Error('Invalid signature')), install, close });
    await expect(installNativeUpdate(vi.fn())).rejects.toThrow('Invalid signature');
    expect(install).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0);
    mocks.check.mockResolvedValue(null); await installNativeUpdate(vi.fn());
  });
  it('storage failure prevents install, retaining the previous application', async () => {
    mocks.flush.mockRejectedValue(new Error('disk full'));
    await expect(installNativeUpdate(vi.fn())).rejects.toThrow('disk full'); expect(mocks.check).not.toHaveBeenCalled();
  });
  it('refuses to install a different manifest version than the heartbeat offer', async () => {
    const download = vi.fn(); mocks.check.mockResolvedValue({ version: '3.0.0', download, close: vi.fn().mockResolvedValue(undefined) });
    await expect(installNativeUpdate(vi.fn(), { latestVersion: '2.0.0', mandatory: false, downloadUrl: null, releaseNotes: null })).rejects.toThrow('disagree');
    expect(download).not.toHaveBeenCalled();
  });
  it('a cancelled/unsuccessful installation is never reported as verified', async () => {
    localStorage.setItem('jamanvaar_native_update_attempt_v1', JSON.stringify({ version: '2.0.0', status: 'AWAITING_RESTART' }));
    mocks.getVersion.mockResolvedValue('1.0.0'); await verifyInstalledUpdate();
    expect(JSON.parse(localStorage.getItem('jamanvaar_native_update_attempt_v1')!).status).toBe('NOT_INSTALLED'); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('rejects a signature describing another application even when the version matches', async () => {
    const download = vi.fn();
    const foreign = { platforms: { 'windows-x86_64': { signature: Buffer.from('untrusted comment: test\nAAAA\ntrusted comment: timestamp:1\tfile:JAMANVAAR Kiosk_2.0.0_x64-setup.exe\nAAAA').toString('base64') } } };
    mocks.check.mockResolvedValue({ version: '2.0.0', rawJson: foreign, download, close: vi.fn().mockResolvedValue(undefined) });
    await expect(installNativeUpdate(vi.fn())).rejects.toThrow('does not match'); expect(download).not.toHaveBeenCalled();
  });
  it('Android permission rejection is surfaced without recording success', async () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Android', configurable: true }); mocks.apk.mockRejectedValue(new Error('Allow updates in Android settings'));
    await expect(installNativeUpdate(vi.fn(), { latestVersion: '2.0.0', mandatory: false, downloadUrl: 'https://x.example/a.apk', downloadSha256: 'a'.repeat(64), releaseNotes: null })).rejects.toThrow('Allow updates');
    expect(JSON.parse(localStorage.getItem('jamanvaar_native_update_attempt_v1')!).status).toBe('FAILED'); expect(mocks.check).not.toHaveBeenCalled();
  });
  it('Android waits for verification and flushes before explicitly opening the system installer', async () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Android', configurable: true });
    mocks.apk.mockResolvedValue({ downloadId: 1 }); mocks.apkStatus.mockResolvedValue({ phase: 'READY_TO_INSTALL', downloadId: 1 }); mocks.installApk.mockResolvedValue(undefined);
    await installNativeUpdate(vi.fn(), { latestVersion: '2.0.0', mandatory: false, downloadUrl: 'https://x.example/a.apk', downloadSha256: 'a'.repeat(64), releaseNotes: null });
    expect(mocks.flush).toHaveBeenCalledTimes(2); expect(mocks.installApk).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem('jamanvaar_native_update_attempt_v1')!).status).toBe('AWAITING_RESTART'); expect(mocks.apply).not.toHaveBeenCalled();
  });
});
