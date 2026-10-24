// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalBackdrop } from '../packages/ui/src/FormControls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const key = (k: string, init: KeyboardEventInit = {}) => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });

function Harness({ onCancel = () => {}, withClose = true, confirmFirst = false }: { onCancel?: () => void; withClose?: boolean; confirmFirst?: boolean }) {
  const [open, setOpen] = useState(true);
  const [asked, setAsked] = useState(false);
  return <>
    <button id="opener">Open</button>
    {open && <ModalBackdrop>
      <div><h2>Apply Order Discount</h2>
        <input aria-label="Value" />
        {withClose && <button onClick={() => { onCancel(); if (confirmFirst && !asked) { setAsked(true); return; } setOpen(false); }}>Cancel</button>}
        <button>Apply</button></div>
    </ModalBackdrop>}
  </>;
}

describe('ModalBackdrop dialog behaviour', () => {
  it('is a modal dialog named by its heading', () => {
    act(() => root.render(<Harness />));
    const dialog = container.querySelector('[role=dialog]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const label = document.getElementById(dialog.getAttribute('aria-labelledby')!)!;
    expect(label.textContent).toBe('Apply Order Discount');
  });

  it('moves focus into the dialog and returns it to the opener when closed', () => {
    const opener = () => document.getElementById('opener')!;
    act(() => root.render(<Harness />));
    (opener() as HTMLElement).focus();
    act(() => root.render(<Harness key="again" />));
    expect(container.querySelector('[role=dialog]')!.contains(document.activeElement)).toBe(true);
    key('Escape');
    expect(container.querySelector('[role=dialog]')).toBeNull();
  });

  it('closes on Escape through the dialog’s own Cancel button, so its own confirmation still runs', () => {
    const onCancel = vi.fn();
    act(() => root.render(<Harness onCancel={onCancel} confirmFirst />));
    key('Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role=dialog]')).not.toBeNull();
    key('Escape');
    expect(container.querySelector('[role=dialog]')).toBeNull();
  });

  it('leaves a dialog open on Escape when it has no close or cancel control', () => {
    act(() => root.render(<Harness withClose={false} />));
    key('Escape');
    expect(container.querySelector('[role=dialog]')).not.toBeNull();
  });

  it('keeps Tab inside the dialog', () => {
    act(() => root.render(<Harness />));
    const buttons = [...container.querySelectorAll<HTMLElement>('[role=dialog] button')];
    buttons[buttons.length - 1].focus();
    key('Tab');
    expect(document.activeElement).not.toBe(buttons[buttons.length - 1]);
    expect(container.querySelector('[role=dialog]')!.contains(document.activeElement)).toBe(true);
  });
});
