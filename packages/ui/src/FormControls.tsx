import React, { forwardRef } from 'react';

/**
 * Shared building blocks for the compact admin-style forms (modals, panels) that used to repeat
 * the same class strings dozens of times. They render exactly the markup those call sites had;
 * every native prop (value, onChange, ref, aria-*, …) passes straight through.
 */

const FIELD_BASE = 'w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold';
const FIELD_FOCUS = 'focus:outline-none focus:border-brand';

const fieldClass = (mono?: boolean) => `${FIELD_BASE}${mono ? ' font-mono' : ''} ${FIELD_FOCUS}`;

type WithMono<T> = T & {
  /** Monospaced digits/codes (SKUs, phone numbers, PINs). */
  mono?: boolean;
};

export const FormInput = forwardRef<HTMLInputElement, WithMono<React.InputHTMLAttributes<HTMLInputElement>>>(
  ({ mono, ...rest }, ref) => <input ref={ref} className={fieldClass(mono)} {...rest} />
);
FormInput.displayName = 'FormInput';

export const FormSelect = forwardRef<HTMLSelectElement, WithMono<React.SelectHTMLAttributes<HTMLSelectElement>>>(
  ({ mono, ...rest }, ref) => <select ref={ref} className={fieldClass(mono)} {...rest} />
);
FormSelect.displayName = 'FormSelect';

export const FormTextarea = forwardRef<HTMLTextAreaElement, WithMono<React.TextareaHTMLAttributes<HTMLTextAreaElement>>>(
  ({ mono, ...rest }, ref) => <textarea ref={ref} className={fieldClass(mono)} {...rest} />
);
FormTextarea.displayName = 'FormTextarea';

/**
 * Full-screen dimmed layer behind a dialog, drawer or sheet. `className` carries the layout
 * (alignment, padding, animation) so each call site keeps its own arrangement.
 */
export const ModalBackdrop = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...rest }, ref) => (
    <div ref={ref} data-jv-dialog className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-xs ${className}`.trim()} {...rest} />
  )
);
ModalBackdrop.displayName = 'ModalBackdrop';
