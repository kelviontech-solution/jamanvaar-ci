// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
beforeEach(()=>{localStorage.clear();sessionStorage.clear();vi.resetModules();});
it('restores the signed proof after the tab storage is lost on browser closure',async()=>{
  const first=await import('../apps/qr-guest/src/guestSession');first.saveGuestSession('qs1.server-signed-proof');
  sessionStorage.clear();vi.resetModules();
  const reopened=await import('../apps/qr-guest/src/guestSession');
  expect(reopened.readGuestSession()).toBe('qs1.server-signed-proof');
  expect(sessionStorage.getItem('jv_qr_session2')).toBe('qs1.server-signed-proof');
});
it('migrates the proof of an existing tab before that tab closes',async()=>{
  sessionStorage.setItem('jv_qr_session2','qs1.existing-tab');
  expect((await import('../apps/qr-guest/src/guestSession')).readGuestSession()).toBe('qs1.existing-tab');
  expect(localStorage.getItem('jv_qr_session2')).toBe('qs1.existing-tab');
});
it('does not manufacture ownership in a fresh browser',async()=>{
  expect((await import('../apps/qr-guest/src/guestSession')).readGuestSession()).toBe('');
  expect(localStorage.getItem('jv_qr_session2')).toBeNull();
});
it('keeps the current tab proof if older tabs have different persisted sessions',async()=>{
  sessionStorage.setItem('jv_qr_session2','qs1.own-order');localStorage.setItem('jv_qr_session2','qs1.other-tab');
  expect((await import('../apps/qr-guest/src/guestSession')).readGuestSession()).toBe('qs1.own-order');
});
