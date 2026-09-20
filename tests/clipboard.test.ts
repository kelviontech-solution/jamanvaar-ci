import { describe, it, expect, afterEach } from 'vitest';
import { copyText } from '@jamanvaar/utils';

/**
 * BUG-002 / BUG-004: about 15 copy buttons called navigator.clipboard.writeText() with
 * no await and no error handling. On a page served over plain http from a LAN address
 * (how restaurants reach the apps) navigator.clipboard does not exist, so the click
 * threw or did nothing, and a "Copied" message could show even when nothing was copied.
 * copyText() reports whether the text really reached the clipboard.
 */
describe('copyText', () => {
  const g = globalThis as any;
  const original = { navigator: g.navigator, document: g.document };

  afterEach(() => {
    Object.defineProperty(g, 'navigator', { value: original.navigator, configurable: true, writable: true });
    g.document = original.document;
  });

  const setNavigator = (nav: unknown) => Object.defineProperty(g, 'navigator', { value: nav, configurable: true, writable: true });

  function fakeDocument(execResult: boolean | 'throw') {
    const calls: { appended: any[]; removed: any[]; exec: string[] } = { appended: [], removed: [], exec: [] };
    g.document = {
      createElement: () => ({ style: {}, value: '', setAttribute() {}, focus() {}, select() {}, setSelectionRange() {} }),
      body: {
        appendChild: (el: any) => calls.appended.push(el),
        removeChild: (el: any) => calls.removed.push(el)
      },
      execCommand: (cmd: string) => {
        calls.exec.push(cmd);
        if (execResult === 'throw') throw new Error('blocked');
        return execResult;
      }
    };
    return calls;
  }

  it('uses the async clipboard API when it is there and reports success', async () => {
    let written = '';
    setNavigator({ clipboard: { writeText: async (t: string) => void (written = t) } });
    expect(await copyText('ABCD-1234')).toBe(true);
    expect(written).toBe('ABCD-1234');
  });

  it('falls back to execCommand when navigator.clipboard is missing (plain http on a LAN address)', async () => {
    setNavigator({});
    const calls = fakeDocument(true);
    expect(await copyText('LAN-CODE')).toBe(true);
    expect(calls.exec).toEqual(['copy']);
    expect(calls.appended[0].value).toBe('LAN-CODE');
    expect(calls.removed).toHaveLength(1); // the temporary textarea is always cleaned up
  });

  it('falls back when the async API rejects (permission denied)', async () => {
    setNavigator({ clipboard: { writeText: async () => { throw new Error('NotAllowedError'); } } });
    const calls = fakeDocument(true);
    expect(await copyText('X')).toBe(true);
    expect(calls.exec).toEqual(['copy']);
  });

  it('reports failure (not a fake success) when nothing can copy', async () => {
    setNavigator({});
    fakeDocument(false);
    expect(await copyText('X')).toBe(false);
  });

  it('never throws, even if the browser throws while copying', async () => {
    setNavigator({ clipboard: { writeText: async () => { throw new Error('nope'); } } });
    const calls = fakeDocument('throw');
    await expect(copyText('X')).resolves.toBe(false);
    expect(calls.removed).toHaveLength(1);
  });

  it('reports failure when there is no clipboard and no document at all', async () => {
    setNavigator(undefined);
    g.document = undefined;
    expect(await copyText('X')).toBe(false);
  });
});
