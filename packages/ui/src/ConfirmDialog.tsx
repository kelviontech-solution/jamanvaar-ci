import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  /** What will happen, in plain words — name the thing and the consequence. */
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for deletes/voids/restores; the confirm button turns red and takes no default focus. */
  tone?: 'default' | 'danger';
}

export interface PromptOptions extends ConfirmOptions {
  inputLabel: string;
  placeholder?: string;
  defaultValue?: string;
  /** When true the confirm button stays disabled until the field has text. */
  required?: boolean;
}

interface DialogRequest extends ConfirmOptions {
  kind: 'confirm' | 'notify' | 'prompt';
  input?: Pick<PromptOptions, 'inputLabel' | 'placeholder' | 'defaultValue' | 'required'>;
}

interface ConfirmDialogProps extends ConfirmOptions {
  isOpen: boolean;
  busy?: boolean;
  /** Single-button notice (replacement for window.alert). */
  hideCancel?: boolean;
  input?: DialogRequest['input'];
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * In-app replacement for window.confirm()/alert()/prompt(): the shared dialog's Escape and focus
 * behaviour, action labels that say what they do, and a consequence line. For destructive
 * confirmations the safe action (Cancel) receives initial focus so a stray Enter never destroys data.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', busy = false,
  hideCancel = false, input, onConfirm, onCancel
}) => {
  const [value, setValue] = useState(input?.defaultValue ?? '');
  useEffect(() => { if (isOpen) setValue(input?.defaultValue ?? ''); }, [isOpen, input?.defaultValue]);
  const missing = !!input?.required && value.trim().length === 0;
  const submit = (e?: React.FormEvent) => { e?.preventDefault(); if (!busy && !missing) onConfirm(value.trim()); };
  return (
    <Modal isOpen={isOpen} onClose={busy ? () => undefined : onCancel} title={title} maxWidth="sm">
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-start gap-3">
          {tone === 'danger' && (
            <span className="shrink-0 w-9 h-9 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700" aria-hidden="true">
              <AlertTriangle className="w-5 h-5" />
            </span>
          )}
          <div className="text-sm text-[#4A5568] leading-relaxed break-words min-w-0">{message}</div>
        </div>
        {input && (
          <div className="space-y-1.5">
            <label htmlFor="confirm-dialog-input" className="block text-xs font-bold text-[#0B253A]">{input.inputLabel}</label>
            <input
              id="confirm-dialog-input"
              data-autofocus=""
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={input.placeholder}
              className="w-full min-h-[44px] rounded-xl border border-[#EBE6DD] bg-[#FBF9F5] px-3.5 text-sm text-[#0B253A] focus:bg-white focus:border-[#0B253A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B253A]/40"
            />
          </div>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {!hideCancel && (
            <button
              type="button"
              data-autofocus={!input && tone === 'danger' ? '' : undefined}
              onClick={onCancel}
              disabled={busy}
              className="min-h-[44px] px-5 rounded-xl border border-[#EBE6DD] bg-white text-sm font-bold text-[#0B253A] hover:bg-[#F8F6F0] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B253A]/60"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="submit"
            data-autofocus={!input && tone !== 'danger' ? '' : undefined}
            disabled={busy || missing}
            aria-busy={busy}
            className={`min-h-[44px] px-5 rounded-xl text-sm font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              tone === 'danger' ? 'bg-rose-700 hover:bg-rose-800 focus-visible:ring-rose-700' : 'bg-[#0B253A] hover:bg-[#133E5E] focus-visible:ring-[#0B253A]'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/**
 * Promise-based replacements so a native-dialog call site converts mechanically:
 *
 *   const { confirm, prompt, notify, confirmDialog } = useConfirm();
 *   if (!(await confirm({ title: 'Delete dish?', message: '…', tone: 'danger', confirmLabel: 'Delete' }))) return;
 *   const reason = await prompt({ title: 'Void bill', message: '…', inputLabel: 'Reason', required: true }); // null = cancelled
 *   await notify({ title: 'Already paid', message: '…' });
 *   ...
 *   return <>{page}{confirmDialog}</>;
 *
 * One dialog is shown at a time; a newer request settles the older one as cancelled.
 */
export function useConfirm() {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const pending = useRef<((value: string | null) => void) | null>(null);

  // A dialog that unmounts while open must not leave its caller awaiting forever.
  useEffect(() => () => { pending.current?.(null); pending.current = null; }, []);

  const open = useCallback((req: DialogRequest) => new Promise<string | null>((resolve) => {
    pending.current?.(null);
    pending.current = resolve;
    setRequest(req);
  }), []);

  const settle = (value: string | null) => {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.(value);
  };

  const confirm = useCallback(async (options: ConfirmOptions) => (await open({ ...options, kind: 'confirm' })) !== null, [open]);
  const notify = useCallback(async (options: Omit<ConfirmOptions, 'cancelLabel' | 'tone'> & { tone?: 'default' | 'danger' }) => {
    await open({ confirmLabel: 'OK', ...options, kind: 'notify' });
  }, [open]);
  const prompt = useCallback(
    (options: PromptOptions) => open({
      ...options,
      kind: 'prompt',
      input: { inputLabel: options.inputLabel, placeholder: options.placeholder, defaultValue: options.defaultValue, required: options.required }
    }),
    [open]
  );

  const confirmDialog = (
    <ConfirmDialog
      isOpen={!!request}
      title={request?.title ?? ''}
      message={request?.message ?? ''}
      confirmLabel={request?.confirmLabel}
      cancelLabel={request?.cancelLabel}
      tone={request?.tone}
      hideCancel={request?.kind === 'notify'}
      input={request?.input}
      onConfirm={(value) => settle(request?.kind === 'prompt' ? value : '')}
      onCancel={() => settle(request?.kind === 'notify' ? '' : null)}
    />
  );
  return { confirm, notify, prompt, confirmDialog };
}
