// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopyButton } from '../cloud/super-admin-web/src/components/CopyButton';
const clipboard = vi.hoisted(() => ({ copy: vi.fn() }));
vi.mock('../packages/utils/src/clipboard', () => ({ copyText: clipboard.copy }));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  clipboard.copy.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});
describe('Super Admin copy feedback', () => {
  it('copies without an optional callback, shows progress, a tick and success, then restores the label', async () => {
    vi.useFakeTimers();
    let finish!: (value: boolean) => void;
    clipboard.copy.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
    );
    act(() => root.render(<CopyButton text="JM1234567890" label="Copy Restaurant ID" />));
    const button = host.querySelector('button')!;
    act(() => button.click());
    expect(button.disabled).toBe(true);
    expect(button.dataset.copyState).toBe('copying');
    expect(button.textContent).toContain('Copying');
    await act(async () => finish(true));
    expect(clipboard.copy).toHaveBeenCalledExactlyOnceWith('JM1234567890');
    expect(button.dataset.copyState).toBe('copied');
    expect(button.textContent).toBe('Copied');
    expect(button.querySelector('svg.lucide-check')).toBeTruthy();
    act(() => vi.advanceTimersByTime(3001));
    expect(button.textContent).toBe('Copy Restaurant ID');
    expect(button.dataset.copyState).toBe('idle');
  });
  it('offers manual copying and never reports success when the clipboard is blocked', async () => {
    clipboard.copy.mockResolvedValue(false);
    act(() => root.render(<CopyButton text="JM1234567890" label="Copy Restaurant ID" />));
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('button')!.dataset.copyState).toBe('failed');
    expect(host.textContent).not.toContain('Copied');
    const dialog = document.querySelector('[role=dialog][aria-label="Copy manually"]')!;
    expect(dialog).toBeTruthy();
    const field = dialog.querySelector('textarea')!;
    expect(field.value).toBe('JM1234567890');
    expect(field.readOnly).toBe(true);
    expect(dialog.textContent).toContain('browser blocked');
    act(() => dialog.querySelector('button')!.click());
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
  it('does not submit surrounding forms or open the restaurant card when copying', async () => {
    clipboard.copy.mockResolvedValue(true);
    const onClick = vi.fn(),
      onSubmit = vi.fn(),
      onResult = vi.fn();
    act(() =>
      root.render(
        <div onClick={onClick}>
          <form onSubmit={onSubmit}>
            <CopyButton text="copied value" label="Copy" onResult={onResult} />
          </form>
        </div>
      )
    );
    await act(async () => host.querySelector('button')!.click());
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith(true);
  });
  it('keeps icon-only controls accessible and disables empty values', () => {
    act(() => root.render(<CopyButton text="" label="" title="Copy Restaurant ID" />));
    const button = host.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Copy Restaurant ID');
    expect(button.disabled).toBe(true);
    expect(clipboard.copy).not.toHaveBeenCalled();
  });
});
