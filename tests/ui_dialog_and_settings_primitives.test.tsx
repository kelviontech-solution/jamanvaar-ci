// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Modal,
  useConfirm,
  SettingsTabs,
  SettingsFeedback,
  SettingsSaveBar,
  SettingsSection,
  SettingsField
} from '../packages/ui/src';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });

describe('shared Modal', () => {
  it('names the dialog from its title, labels the close button, and moves focus inside', () => {
    act(() => root.render(
      <>
        <button id="opener">open</button>
        <Modal isOpen onClose={() => undefined} title="Edit dish"><input id="first" /></Modal>
      </>
    ));
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const labelledBy = dialog.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelledBy)?.textContent).toBe('Edit dish');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('[data-modal-close]')?.getAttribute('aria-label')).toBe('Close Edit dish');
    expect(document.activeElement?.id).toBe('first');
  });

  it('keeps Tab inside the dialog and returns focus to the opener on close', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button id="opener" onClick={() => setOpen(true)}>open</button>
          <Modal isOpen={open} onClose={() => setOpen(false)} title="Dialog"><button id="a">A</button><button id="b">B</button></Modal>
        </>
      );
    }
    act(() => root.render(<Harness />));
    const opener = document.getElementById('opener') as HTMLButtonElement;
    opener.focus();
    act(() => opener.click());
    const b = document.getElementById('b') as HTMLButtonElement;
    b.focus();
    key('Tab');                                   // from the last control wraps to the first
    expect(document.activeElement?.id).not.toBe('opener');
    expect(document.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);
    key('Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.id).toBe('opener');
  });

  it('Escape closes only the top-most of two stacked dialogs', () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    act(() => root.render(
      <>
        <Modal isOpen onClose={closeOuter} title="Outer"><button>x</button></Modal>
        <Modal isOpen onClose={closeInner} title="Inner"><button>y</button></Modal>
      </>
    ));
    key('Escape');
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });
});

describe('useConfirm', () => {
  function Harness({ onResult, mode }: { onResult: (v: unknown) => void; mode: 'confirm' | 'prompt' | 'notify' }) {
    const { confirm, prompt, notify, confirmDialog } = useConfirm();
    return (
      <>
        <button
          id="go"
          onClick={async () => {
            if (mode === 'confirm') onResult(await confirm({ title: 'Delete dish?', message: 'Gone for good.', tone: 'danger', confirmLabel: 'Delete' }));
            if (mode === 'prompt') onResult(await prompt({ title: 'Void bill', message: 'Why?', inputLabel: 'Reason', required: true, confirmLabel: 'Void' }));
            if (mode === 'notify') onResult(await notify({ title: 'Heads up', message: 'Already paid.' }));
          }}
        >go</button>
        {confirmDialog}
      </>
    );
  }
  const flush = () => act(async () => { await Promise.resolve(); });

  it('resolves false on Cancel and true on confirm; the destructive default focus is Cancel', async () => {
    const results: unknown[] = [];
    act(() => root.render(<Harness mode="confirm" onResult={(v) => results.push(v)} />));
    act(() => (document.getElementById('go') as HTMLButtonElement).click());
    await flush();
    const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!;
    expect(document.activeElement).toBe(cancel);
    act(() => cancel.click());
    await flush();
    expect(results).toEqual([false]);

    act(() => (document.getElementById('go') as HTMLButtonElement).click());
    await flush();
    act(() => ([...document.querySelectorAll('button')].find((b) => b.textContent === 'Delete') as HTMLButtonElement).click());
    await flush();
    expect(results).toEqual([false, true]);
  });

  it('prompt returns the text, null on cancel, and blocks an empty required answer', async () => {
    const results: unknown[] = [];
    act(() => root.render(<Harness mode="prompt" onResult={(v) => results.push(v)} />));
    act(() => (document.getElementById('go') as HTMLButtonElement).click());
    await flush();
    const submit = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Void') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const input = document.getElementById('confirm-dialog-input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setter.call(input, 'Abandoned'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(submit.disabled).toBe(false);
    act(() => submit.click());
    await flush();
    expect(results).toEqual(['Abandoned']);
  });

  it('notify has a single acknowledging button', async () => {
    const results: unknown[] = [];
    act(() => root.render(<Harness mode="notify" onResult={(v) => results.push(v)} />));
    act(() => (document.getElementById('go') as HTMLButtonElement).click());
    await flush();
    const labels = [...document.querySelector('[role="dialog"]')!.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toContain('OK');
    expect(labels).not.toContain('Cancel');
  });
});

describe('Settings primitives', () => {
  it('SettingsTabs exposes tab semantics and moves with the arrow keys', () => {
    function Harness() {
      const [active, setActive] = useState<'a' | 'b' | 'c'>('a');
      return <SettingsTabs ariaLabel="Sections" active={active} onChange={setActive} tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]} />;
    }
    act(() => root.render(<Harness />));
    const tabs = () => [...container.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Sections');
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    act(() => { tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
  });

  it('SettingsFeedback announces errors assertively and everything else politely', () => {
    act(() => root.render(<><SettingsFeedback kind="error">bad</SettingsFeedback><SettingsFeedback kind="success">good</SettingsFeedback></>));
    const roles = [...container.querySelectorAll('[role]')].map((el) => el.getAttribute('role'));
    expect(roles).toEqual(['alert', 'status']);
  });

  it('SettingsSaveBar never claims "Saved" while saving and disables Save while busy', () => {
    act(() => root.render(<SettingsSaveBar state="saving" onSave={() => undefined} />));
    expect(container.textContent).toContain('Saving…');
    expect(container.textContent).not.toContain('Saved');
    const save = [...container.querySelectorAll('button')].pop() as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(save.getAttribute('aria-busy')).toBe('true');
  });

  it('SettingsSection labels its region and SettingsField wires label, help and error', () => {
    act(() => root.render(
      <SettingsSection title="Branding" description="Shown on bills">
        <SettingsField label="GSTIN" htmlFor="gstin" required help="15 characters" error="Invalid GSTIN"><input id="gstin" /></SettingsField>
      </SettingsSection>
    ));
    const region = container.querySelector('section')!;
    expect(document.getElementById(region.getAttribute('aria-labelledby')!)?.textContent).toBe('Branding');
    expect(container.querySelector('label[for="gstin"]')).not.toBeNull();
    expect(container.querySelector('#gstin-error')?.getAttribute('role')).toBe('alert');
    expect(container.querySelector('#gstin-help')).toBeNull(); // error replaces help
  });
});
