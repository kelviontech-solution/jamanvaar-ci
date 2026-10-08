// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KioskReceiptDeliveryDialog } from '../apps/kiosk-system/kiosk-user/src/KioskReceiptDeliveryDialog';
import { useKioskConfirmationReturn, KIOSK_CONFIRMATION_RETURN_MS } from '../apps/kiosk-system/kiosk-user/src/useKioskConfirmationReturn';

let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement('div');document.body.appendChild(container);root = createRoot(container);
});
afterEach(() => { act(() => root.unmount());container.remove();vi.clearAllTimers();vi.useRealTimers(); });
function button(label: string) {
  const found = [...container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent?.trim() === label);
  if (!found) throw Error('Missing button '+label);return found;
}
async function press(label: string) { act(() => button(label).click());await act(async () => { vi.advanceTimersByTime(20); }); }
async function type(text: string) { for (const char of text) await press('Type '+char); }
const field=()=>container.querySelector('input')!;
const renderDialog=(channel: 'EMAIL'|'WHATSAPP',send=vi.fn(async()=>({success:true,message:'Bill sent'})),close=vi.fn(),done=vi.fn())=>{
  act(() => root.render(<KioskReceiptDeliveryDialog channel={channel} onClose={close} onDone={done} onActivity={()=>undefined} onSend={send}/>));return {send,close,done};
};

describe('touch-only receipt delivery', () => {
  it('types an email with letters, numbers, punctuation, domain shortcuts and correction at the cursor', async () => {
    const {send}=renderDialog('EMAIL');
    expect(field().readOnly).toBe(true);expect(field().getAttribute('inputmode')).toBe('none');
    await type('qa.7');await press('@gmail.com');expect(field().value).toBe('qa.7@gmail.com');
    await press('Backspace');await press('Type m');expect(field().value).toBe('qa.7@gmail.com');
    act(()=>{field().setSelectionRange(2,2);document.dispatchEvent(new Event('selectionchange'));});
    await press('Type x');expect(field().value).toBe('qax.7@gmail.com');
    await press('Email My Bill');expect(send).toHaveBeenCalledWith('qax.7@gmail.com');
    expect(container.textContent).toContain('Email sent');
  });
  it('provides a 10-digit phone keypad, blocks incomplete sends and supports clear/backspace', async () => {
    const {send}=renderDialog('WHATSAPP');
    expect(button('Send WhatsApp Bill').disabled).toBe(true);
    await type('98765432109');expect(field().value).toBe('9876543210');
    await press('Backspace');expect(button('Send WhatsApp Bill').disabled).toBe(true);await press('Type 1');
    await press('Send WhatsApp Bill');expect(send).toHaveBeenCalledWith('9876543211');
    expect(container.textContent).toContain('WhatsApp bill sent');
  });
  it('keeps a slow request open, prevents duplicate sends and refuses closing while sending', async () => {
    let finish!: (value:{success:boolean;message:string})=>void;
    const send=vi.fn(()=>new Promise<{success:boolean;message:string}>(resolve=>{finish=resolve;})),close=vi.fn();
    renderDialog('EMAIL',send,close);await type('qa');await press('@gmail.com');
    await press('Email My Bill');expect(send).toHaveBeenCalledTimes(1);expect(field().disabled).toBe(true);
    expect(button('Sending your bill…').disabled).toBe(true);await press('Cancel');
    act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));
    act(()=>vi.advanceTimersByTime(35000));expect(close).not.toHaveBeenCalled();expect(send).toHaveBeenCalledTimes(1);
    await act(async()=>finish({success:true,message:'PDF dispatched'}));
    expect(container.textContent).toContain('Email sent');expect(container.textContent).toContain('PDF dispatched');
  });
  it('shows a failed delivery, preserves the editable address and allows an explicit retry', async () => {
    const send=vi.fn().mockResolvedValueOnce({success:false,message:'Email provider unavailable'}).mockResolvedValueOnce({success:true,message:'Bill sent'});
    renderDialog('EMAIL',send);await type('qa');await press('@outlook.com');await press('Email My Bill');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Email provider unavailable');expect(field().value).toBe('qa@outlook.com');
    await press('Email My Bill');expect(send).toHaveBeenCalledTimes(2);expect(container.textContent).toContain('Email sent');
  });
  it('waits for success acknowledgement and clears recipient entry for the next opening', async () => {
    const {done}=renderDialog('EMAIL');await type('qa');await press('@yahoo.com');await press('Email My Bill');
    act(()=>vi.advanceTimersByTime(60000));expect(done).not.toHaveBeenCalled();
    await press('Done · Next customer');expect(done).toHaveBeenCalledOnce();
    act(()=>root.render(null));renderDialog('EMAIL');expect(field().value).toBe('');expect(container.textContent).not.toContain('Email sent');
  });
  it('contains unexpected send errors and still permits editing and retry', async () => {
    const send=vi.fn().mockRejectedValueOnce(Error('Unexpected transport rejection')).mockResolvedValueOnce({success:true,message:'Bill sent'});
    renderDialog('WHATSAPP',send);await type('9876543210');await press('Send WhatsApp Bill');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Please try again');expect(field().disabled).toBe(false);
    await press('Clear');expect(field().value).toBe('');expect(button('Send WhatsApp Bill').disabled).toBe(true);
  });
});

describe('confirmation auto-return respects receipt interaction',()=>{
  const renderTimer=(over:Partial<Parameters<typeof useKioskConfirmationReturn>[0]>={})=>{
    const callback=vi.fn();
    const props={active:true,ready:true,blocked:false,activityVersion:0,onReturn:callback,...over};
    function Timer(p:typeof props){useKioskConfirmationReturn(p);return null;}
    act(()=>root.render(<Timer {...props}/>));
    return {callback,update:(change:Partial<typeof props>)=>act(()=>root.render(<Timer {...props} {...change}/>))};
  };
  it('cancels an already armed return when a receipt popup opens and grants a fresh window after it closes',()=>{
    const {callback,update}=renderTimer();act(()=>vi.advanceTimersByTime(KIOSK_CONFIRMATION_RETURN_MS-100));update({blocked:true});
    act(()=>vi.advanceTimersByTime(60000));expect(callback).not.toHaveBeenCalled();update({blocked:false});
    act(()=>vi.advanceTimersByTime(KIOSK_CONFIRMATION_RETURN_MS-1));expect(callback).not.toHaveBeenCalled();act(()=>vi.advanceTimersByTime(1));expect(callback).toHaveBeenCalledOnce();
  });
  it('waits for print/speech completion and restarts on customer activity',()=>{
    const {callback,update}=renderTimer({ready:false});act(()=>vi.advanceTimersByTime(60000));expect(callback).not.toHaveBeenCalled();
    update({ready:true});act(()=>vi.advanceTimersByTime(14000));update({ready:true,activityVersion:1});act(()=>vi.advanceTimersByTime(14000));expect(callback).not.toHaveBeenCalled();act(()=>vi.advanceTimersByTime(1000));expect(callback).toHaveBeenCalledOnce();
  });
  it('never returns a later checkout after leaving confirmation',()=>{
    const {callback,update}=renderTimer();update({active:false});act(()=>vi.advanceTimersByTime(60000));expect(callback).not.toHaveBeenCalled();
  });
});
