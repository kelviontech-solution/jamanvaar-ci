import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Delete, Loader2, Mail, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { Modal } from '@jamanvaar/ui';
import { EBillService } from '@jamanvaar/api';

export type ReceiptDeliveryChannel = 'EMAIL' | 'WHATSAPP';
export interface ReceiptDeliveryResult { success: boolean; message: string }

interface Props {
  channel: ReceiptDeliveryChannel;
  onClose: () => void;
  onDone: () => void;
  onActivity: () => void;
  onSend: (recipient: string) => Promise<ReceiptDeliveryResult>;
}

const letters = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const symbols = ['1234567890', '@.-_+!#$%&', "'*/=?^`{|}~"];

/** The field and touch keyboard share a modal, keeping the address and Send action in view. */
export function KioskReceiptDeliveryDialog({ channel, onClose, onDone, onActivity, onSend }: Props) {
  const email = channel === 'EMAIL';
  const [value, setValue] = useState('');
  const [symbolMode, setSymbolMode] = useState(false);
  const [shift, setShift] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReceiptDeliveryResult | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const submitting = useRef(false);
  const mounted = useRef(true);
  const canSend = email ? value.length <= 254 && EBillService.validateEmail(value) : /^[6-9]\d{9}$/.test(value);

  useEffect(() => {
    mounted.current = true;
    input.current?.focus({ preventScroll: true });
    return () => { mounted.current = false; };
  }, []);

  function change(next: string, caret: number) {
    const clean = email ? next.replace(/\s/g, '').slice(0, 254) : EBillService.sanitizePhoneInput(next);
    setValue(clean);setResult(null);onActivity();
    selection.current = { start: Math.min(caret, clean.length), end: Math.min(caret, clean.length) };
    window.requestAnimationFrame(() => {
      if (!mounted.current || !input.current) return;
      input.current.focus({ preventScroll: true });
      input.current.setSelectionRange(selection.current.start, selection.current.end);
    });
  }
  function insert(text: string) {
    if (submitting.current) return;
    const { start, end } = selection.current;
    change(value.slice(0, start) + text + value.slice(end), start + text.length);
  }
  function backspace() {
    if (submitting.current) return;
    const { start, end } = selection.current;
    const from = start === end ? Math.max(0, start - 1) : start;
    change(value.slice(0, from) + value.slice(end), from);
  }
  function useDomain(domain: string) {
    const local = value.split('@')[0];
    if (local) change(`${local}@${domain}`, local.length + domain.length + 1);
  }
  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canSend || submitting.current) return;
    submitting.current = true;setSending(true);setResult(null);onActivity();
    try {
      const response = await onSend(value.trim());
      if (mounted.current) setResult(response);
    } catch {
      if (mounted.current) setResult({ success: false, message: 'Your bill could not be sent. Please try again or ask the counter for help.' });
    } finally {
      submitting.current = false;
      if (mounted.current) setSending(false);
    }
  }
  const close = () => { if (!submitting.current) onClose(); };
  const keyClass = 'min-w-0 flex-1 h-12 sm:h-14 [@media(max-height:760px)]:h-11 rounded-xl border border-jaman-border bg-white text-jaman-navy text-base sm:text-xl font-bold shadow-sm active:bg-orange-100 active:border-jaman-saffron disabled:opacity-40 touch-manipulation';
  const key = (text: string) => {
    const character = shift && /^[a-z]$/.test(text) ? text.toUpperCase() : text;
    return <button type="button" key={text} aria-label={`Type ${character}`} disabled={sending} onPointerDown={e => e.preventDefault()} onClick={() => { insert(character);if (/^[a-z]$/i.test(character)) setShift(false); }} className={keyClass}>{character}</button>;
  };

  return <Modal isOpen onClose={close} title={email ? 'Email Your Bill' : 'Get Your Bill on WhatsApp'} maxWidth="3xl" showCloseButton={!sending}
    bodyClassName="!p-3 sm:!p-5" className="!max-h-[94dvh]"
    footer={result?.success ? <div className="flex gap-3 flex-wrap">
      <button type="button" onClick={onClose} className="flex-1 min-h-[52px] rounded-xl border border-jaman-border font-bold text-jaman-navy">Back to receipt</button>
      <button type="button" onClick={onDone} className="flex-1 min-h-[52px] rounded-xl bg-jaman-saffron text-white font-extrabold">Done · Next customer</button>
    </div> : <div className="flex items-center gap-3">
      <button type="button" disabled={sending} onClick={close} className="min-h-[52px] px-4 rounded-xl border border-jaman-border font-bold text-jaman-navy disabled:opacity-40">Cancel</button>
      <button type="submit" form="kiosk-receipt-delivery" disabled={sending || !canSend} className="flex-1 min-h-[52px] rounded-xl bg-jaman-saffron text-white font-extrabold flex items-center justify-center gap-2 disabled:opacity-40">
        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}{sending ? 'Sending your bill…' : email ? 'Email My Bill' : 'Send WhatsApp Bill'}
      </button>
    </div>}>
    {result?.success ? <section className="text-center py-6 sm:py-10 space-y-4" role="status" aria-live="polite">
      <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-600" />
      <h3 className="text-2xl font-extrabold text-jaman-navy">{email ? 'Email sent' : 'WhatsApp bill sent'}</h3>
      <p className="text-base text-slate-600 break-words">{result.message}</p>
      <p className="text-sm text-slate-500">{email ? 'Check your inbox or spam folder for your bill.' : 'Check your WhatsApp messages for your bill.'}</p>
      <p className="text-sm font-bold text-jaman-navy">Tap Done when you are finished.</p>
    </section> : <form id="kiosk-receipt-delivery" onSubmit={submit} className="space-y-3">
      <div className="sticky -top-3 sm:-top-5 z-10 bg-white pb-2 space-y-2">
      <p className="text-sm text-slate-600">{email ? 'Enter your email using the touch keyboard below to receive your PDF bill.' : 'Enter your 10-digit mobile number using the keypad below.'}</p>
      <label htmlFor="kiosk-receipt-recipient" className="block text-sm font-bold text-jaman-navy">{email ? 'Email Address' : 'WhatsApp Number'}</label>
      <div className="flex items-center gap-2">
        {!email && <span className="rounded-xl bg-jaman-ivory border border-jaman-border p-3 font-bold text-jaman-navy">+91</span>}
        <div className="flex-1 min-w-0 relative">
          {email ? <Mail className="absolute left-3 top-4 w-5 h-5 text-jaman-saffron" /> : <MessageCircle className="absolute left-3 top-4 w-5 h-5 text-jaman-saffron" />}
          <input ref={input} id="kiosk-receipt-recipient" type="text" inputMode="none" readOnly disabled={sending} autoComplete="off" autoCapitalize="none" spellCheck={false}
            value={value} placeholder={email ? 'you@example.com' : '98765 43210'} aria-describedby="kiosk-receipt-input-help"
            onSelect={() => { if (input.current) selection.current = { start: input.current.selectionStart ?? value.length, end: input.current.selectionEnd ?? value.length }; }}
            onPaste={e => { e.preventDefault();if (!submitting.current) insert(e.clipboardData.getData('text')); }}
            onKeyDown={e => {
              if (sending || e.ctrlKey || e.metaKey || e.altKey) return;
              if (e.key === 'Enter') { e.preventDefault();void submit(); }
              else if (e.key === 'Backspace') { e.preventDefault();backspace(); }
              else if (e.key === 'Delete') { e.preventDefault();const {start,end}=selection.current;change(value.slice(0,start)+value.slice(start===end?end+1:end),start); }
              else if (e.key.length === 1 && (email ? /^[\x21-\x7e]$/.test(e.key) : /^\d$/.test(e.key))) { e.preventDefault();insert(e.key); }
            }}
            className="w-full min-h-[56px] rounded-xl border-2 border-jaman-border bg-jaman-ivory pl-10 pr-3 text-lg sm:text-xl font-semibold text-jaman-navy focus:outline-none focus:border-jaman-saffron disabled:opacity-60" />
        </div>
      </div>
      <p id="kiosk-receipt-input-help" className="text-xs text-slate-500">{email ? 'Use @ and . for your address. Tap inside the field to correct a character.' : `${value.length}/10 digits · Indian mobile number`}</p>
      </div>
      {result && !result.success && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{result.message}</p>}
      {sending && <p role="status" className="rounded-xl bg-orange-50 p-3 text-sm text-jaman-navy">Please wait. This screen stays open while we send your bill.</p>}
      <section aria-label={email ? 'Email touch keyboard' : 'Phone touch keypad'} className="rounded-2xl border border-jaman-border bg-jaman-ivory p-2 sm:p-3 space-y-2">
        {email ? <>
          {!symbolMode && <div className="flex gap-1 sm:gap-2">{[...'1234567890'].map(key)}</div>}
          {(symbolMode ? symbols : letters).map((row, i) => <div className="flex gap-1 sm:gap-2" key={i}>{[...row].map(key)}</div>)}
          <div className="flex gap-1 sm:gap-2">
            <button type="button" aria-label="Shift" aria-pressed={shift} disabled={sending} onPointerDown={e => e.preventDefault()} onClick={() => { setShift(!shift);onActivity(); }} className={`${keyClass} ${shift ? '!bg-jaman-navy !text-white' : ''}`}>⇧</button>
            <button type="button" disabled={sending} onPointerDown={e => e.preventDefault()} onClick={() => { setSymbolMode(!symbolMode);onActivity(); }} className={keyClass}>{symbolMode ? 'ABC' : '?123'}</button>
            {['@', '.', '-', '_', '+'].map(key)}
            <button type="button" aria-label="Backspace" disabled={sending} onPointerDown={e => e.preventDefault()} onClick={backspace} className={keyClass}><Delete className="w-5 h-5 mx-auto" /></button>
          </div>
          <div className="flex gap-2">
            {['gmail.com','outlook.com','yahoo.com'].map(domain => <button type="button" key={domain} disabled={sending || !value.split('@')[0]} onPointerDown={e => e.preventDefault()} onClick={() => useDomain(domain)} className="flex-1 min-w-0 min-h-[44px] rounded-xl border border-jaman-border bg-white text-xs sm:text-sm font-bold text-jaman-navy disabled:opacity-40">@{domain}</button>)}
          </div>
        </> : <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
          {[...'123456789'].map(key)}
          <button type="button" disabled={sending} onClick={() => change('',0)} className={keyClass}>Clear</button>{key('0')}
          <button type="button" aria-label="Backspace" disabled={sending} onPointerDown={e => e.preventDefault()} onClick={backspace} className={keyClass}><Delete className="w-5 h-5 mx-auto" /></button>
        </div>}
        {email && <button type="button" disabled={sending || !value} onClick={() => change('',0)} className="min-h-[44px] w-full text-sm font-bold text-slate-600 rounded-xl border border-jaman-border bg-white disabled:opacity-40">Clear address</button>}
      </section>
      <p className="flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck className="w-4 h-4" /> Your contact details clear when this popup closes.</p>
    </form>}
  </Modal>;
}
