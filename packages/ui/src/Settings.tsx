import React, { useId, useRef } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';

/**
 * Shared Settings primitives.
 *
 * One anatomy for every settings screen in the ecosystem — page header, optional section tabs,
 * section cards, labelled fields, one feedback banner and one save-status line — so an owner,
 * a cashier and a platform operator recognise the same structure. The primitives carry only
 * structure, spacing, hierarchy and state semantics; each app keeps its own page layout, density
 * and theme. Super Admin keeps its CSS-variable theme and mirrors the same anatomy in
 * `settings-card*` classes (see docs/reports/ui-ux-implementation).
 */

type HeadingLevel = 1 | 2 | 3;
const Heading: React.FC<{ level: HeadingLevel; className?: string; children: React.ReactNode }> = ({ level, className, children }) =>
  React.createElement(`h${level}`, { className }, children);

/* ── Page header ─────────────────────────────────────────────────────────── */

export const SettingsPageHeader: React.FC<{
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Primary page-level action (for pages that save everything with one button). */
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, actions, className = '' }) => (
  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 ${className}`}>
    <div className="min-w-0">
      <Heading level={1} className="text-xl sm:text-2xl font-bold text-jaman-navy flex items-center gap-2">
        {icon}
        <span>{title}</span>
      </Heading>
      {description && <p className="text-xs sm:text-sm text-[#4A5568] mt-0.5">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

/* ── Section tabs ────────────────────────────────────────────────────────── */

export interface SettingsTabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

/** Pill tabs for settings that are split into a few peer sections (e.g. POS: Hardware / Reports / …). */
export function SettingsTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel = 'Settings sections',
  className = ''
}: {
  tabs: ReadonlyArray<SettingsTabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (from: number, delta: number) => {
    const next = tabs[(from + delta + tabs.length) % tabs.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`bg-white border border-jaman-border p-1 rounded-2xl flex flex-wrap items-center gap-1 shadow-2xs ${className}`}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => { refs.current[tab.id] = el; }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); move(index, 1); }
              else if (e.key === 'ArrowLeft') { e.preventDefault(); move(index, -1); }
              else if (e.key === 'Home') { e.preventDefault(); move(0, 0); }
              else if (e.key === 'End') { e.preventDefault(); move(tabs.length - 1, 0); }
            }}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jaman-navy/60 ${
              selected ? 'bg-jaman-saffron text-white shadow-xs' : 'text-slate-600 hover:text-jaman-navy hover:bg-jaman-cream'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Section card ────────────────────────────────────────────────────────── */

export const SettingsSection: React.FC<{
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Small status chip next to the title (e.g. "Connected", "Locked"). */
  badge?: React.ReactNode;
  /** Controls aligned to the header's right edge. */
  actions?: React.ReactNode;
  /** Pinned row under the body, normally a `SettingsSaveBar`. */
  footer?: React.ReactNode;
  /** Section title level. Page title is h1, sections default to h2. */
  headingLevel?: 2 | 3;
  id?: string;
  className?: string;
  children?: React.ReactNode;
}> = ({ title, description, icon, badge, actions, footer, headingLevel = 2, id, className = '', children }) => {
  const autoId = useId();
  const headingId = `${id ?? autoId}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`bg-white border border-jaman-border rounded-2xl p-5 shadow-2xs space-y-4 ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {icon && <span className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true">{icon}</span>}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Heading level={headingLevel} className="text-sm font-bold text-jaman-navy">
                <span id={headingId}>{title}</span>
              </Heading>
              {badge}
            </div>
            {description && <p className="text-xs text-[#4A5568] mt-0.5">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </header>
      {children}
      {footer && <div className="pt-3 border-t border-slate-100">{footer}</div>}
    </section>
  );
};

/* ── Field ───────────────────────────────────────────────────────────────── */

/**
 * Label + control + help + error with correct associations. The control must use `id={htmlFor}`;
 * pass `describedBy` from `settingsFieldIds(htmlFor)` to wire help/error text to it.
 */
export const settingsFieldIds = (htmlFor: string) => ({
  help: `${htmlFor}-help`,
  error: `${htmlFor}-error`
});

export const SettingsField: React.FC<{
  label: string;
  htmlFor: string;
  required?: boolean;
  help?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, required, help, error, className = '', children }) => {
  const ids = settingsFieldIds(htmlFor);
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="block text-xs font-bold text-jaman-navy">
        {label}
        {required && <span className="text-rose-700" aria-hidden="true"> *</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {help && !error && <p id={ids.help} className="text-xs text-[#4A5568]">{help}</p>}
      {error && <p id={ids.error} role="alert" className="text-xs font-semibold text-rose-700 flex items-start gap-1"><AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />{error}</p>}
    </div>
  );
};

/** Shared control chrome so inputs read the same wherever Settings use them. */
export const SETTINGS_INPUT_CLASS =
  'w-full min-h-[44px] rounded-xl border border-jaman-border bg-jaman-cream px-3.5 py-2 text-sm text-jaman-navy placeholder:text-slate-500 ' +
  'focus:bg-white focus:border-jaman-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jaman-navy/40 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed aria-[invalid=true]:border-rose-500 aria-[invalid=true]:bg-rose-50';

/* ── Feedback ────────────────────────────────────────────────────────────── */

const FEEDBACK_STYLE = {
  success: { box: 'bg-emerald-50 text-emerald-900 border-emerald-200', Icon: CheckCircle2, role: 'status' as const },
  info: { box: 'bg-sky-50 text-sky-900 border-sky-200', Icon: Info, role: 'status' as const },
  warning: { box: 'bg-amber-50 text-amber-900 border-amber-200', Icon: AlertTriangle, role: 'status' as const },
  error: { box: 'bg-rose-50 text-rose-900 border-rose-200', Icon: AlertCircle, role: 'alert' as const }
};

/** One banner for every settings outcome. `error` is announced assertively, the rest politely. */
export const SettingsFeedback: React.FC<{
  kind: keyof typeof FEEDBACK_STYLE;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}> = ({ kind, children, onDismiss, className = '' }) => {
  const { box, Icon, role } = FEEDBACK_STYLE[kind];
  return (
    <div role={role} className={`flex items-start gap-2 rounded-2xl border p-3 text-xs font-semibold ${box} ${className}`}>
      <Icon className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss message" className="shrink-0 min-w-[24px] min-h-[24px] rounded-md hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jaman-navy/60">×</button>
      )}
    </div>
  );
};

/* ── Save status + bar ───────────────────────────────────────────────────── */

export type SettingsSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * Plain-language save state. Never shows "saved" unless the caller says persistence succeeded.
 * `scope` states what the setting applies to ("this device", "this restaurant", "all branches").
 */
export const SettingsSaveStatus: React.FC<{
  state: SettingsSaveState;
  message?: string;
  scope?: string;
  className?: string;
}> = ({ state, message, scope, className = '' }) => {
  const text =
    state === 'saving' ? 'Saving…'
    : state === 'saved' ? (message ?? 'Saved')
    : state === 'dirty' ? (message ?? 'You have unsaved changes')
    : state === 'error' ? (message ?? 'Could not save. Your changes are still here — try again.')
    : (message ?? '');
  const tone =
    state === 'error' ? 'text-rose-700'
    : state === 'saved' ? 'text-emerald-800'
    : state === 'dirty' ? 'text-amber-800'
    : 'text-[#4A5568]';
  return (
    <p aria-live={state === 'error' ? 'assertive' : 'polite'} className={`text-xs font-semibold flex items-center gap-1.5 ${tone} ${className}`}>
      {state === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
      {state === 'saved' && <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
      {state === 'error' && <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />}
      <span>{text}</span>
      {scope && <span className="font-medium text-[#4A5568]">· Applies to {scope}</span>}
    </p>
  );
};

/** Primary Save / secondary Cancel row with a status line. Buttons keep their own handlers. */
export const SettingsSaveBar: React.FC<{
  state: SettingsSaveState;
  onSave?: () => void;
  onCancel?: () => void;
  /** Use `submit` inside a <form> so Enter and the button share one code path. */
  saveType?: 'button' | 'submit';
  saveLabel?: string;
  savingLabel?: string;
  cancelLabel?: string;
  message?: string;
  scope?: string;
  /** Disable Save when nothing changed (default true when state is idle/saved). */
  disableWhenClean?: boolean;
  className?: string;
}> = ({
  state, onSave, onCancel, saveType = 'button', saveLabel = 'Save changes', savingLabel = 'Saving…', cancelLabel = 'Cancel',
  message, scope, disableWhenClean = false, className = ''
}) => {
  const busy = state === 'saving';
  const clean = disableWhenClean && (state === 'idle' || state === 'saved');
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <SettingsSaveStatus state={state} message={message} scope={scope} />
      <div className="flex items-center gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[40px] px-4 rounded-xl border border-jaman-border bg-white text-xs font-bold text-jaman-navy hover:bg-jaman-cream disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jaman-navy/60"
          >
            {cancelLabel}
          </button>
        )}
        <button
          type={saveType}
          onClick={saveType === 'button' ? onSave : undefined}
          disabled={busy || clean}
          aria-busy={busy}
          className="min-h-[40px] px-5 rounded-xl bg-[#BF540F] text-white text-xs font-bold hover:bg-[#A9480C] active:bg-[#933E0A] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BF540F] focus-visible:ring-offset-2"
        >
          {busy ? savingLabel : saveLabel}
        </button>
      </div>
    </div>
  );
};
