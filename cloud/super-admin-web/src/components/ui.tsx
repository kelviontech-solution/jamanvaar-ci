import { useDialogFocus } from '../../../../packages/ui/src/useDialogFocus';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, AlertCircle } from 'lucide-react';
import './ui.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
  variant = 'default',
  style
}: {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'luxury' | 'hero' | 'subtle';
  style?: CSSProperties;
}) {
  return (
    <div className={`card card-${variant} ${className}`} style={style}>
      {children}
    </div>
  );
}

export type BadgeTone = 'success' | 'warning' | 'error' | 'neutral' | 'accent' | 'gold';

export function Badge({
  tone,
  children,
  className = '',
  pulse = false
}: {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span className={`badge badge-${tone} ${className}`}>
      <span className={`badge-dot ${pulse ? 'animate-pulse-subtle' : ''}`} />
      {children}
    </span>
  );
}

export function statusTone(status: string): BadgeTone {
  const s = status.toUpperCase();
  if (['ACTIVE', 'ONLINE', 'UP', 'PAID', 'VERIFIED'].includes(s)) return 'success';
  if (['SUSPENDED', 'PENDING', 'TRIAL', 'PENDING_ACTIVATION', 'PAST_DUE'].includes(s)) return 'warning';
  if (['REVOKED', 'EXPIRED', 'DISABLED', 'ARCHIVED', 'DOWN', 'FAILED'].includes(s)) return 'error';
  if (['ENTERPRISE', 'PRO'].includes(s)) return 'gold';
  return 'neutral';
}

export function EmptyState({
  title,
  description,
  icon,
  action
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon-box">
        {icon || <Sparkles className="w-6 h-6 text-slate-400" />}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="empty-state" style={{ borderColor: 'rgba(239, 68, 68, 0.2)', background: '#fffcfc' }}>
      <div className="empty-state-icon-box" style={{ background: 'var(--jv-error-soft)', color: 'var(--jv-error-text)' }}>
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 style={{ color: 'var(--jv-error-text)' }}>Unable to load data</h3>
      <p style={{ color: '#7f1d1d' }}>{message}</p>
      {onRetry && (
        <div className="empty-state-action">
          <Button variant="accent" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Shared dialog behaviour (packages/ui): focus moves in, Tab stays inside, Escape closes only the
  // top-most dialog, focus returns to the control that opened it.
  const { cardRef, dialogId } = useDialogFocus<HTMLDivElement>(true, onClose);
  const titleId = `${dialogId}-title`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" data-modal-close className="modal-close" onClick={onClose} aria-label={`Close ${title}`}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}

/** Backdrop + dialog card for pages that lay out their own header/body/footer markup. Same behaviour as <Modal>. */
export function ModalShell({
  onClose,
  label,
  className = 'modal',
  style,
  children
}: {
  onClose: () => void;
  label: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { cardRef } = useDialogFocus<HTMLDivElement>(true, onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={className}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* ── Confirmations: in-app replacement for window.confirm / window.prompt ── */

interface AdminDialogRequest {
  kind: 'confirm' | 'prompt';
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  inputLabel?: string;
  inputType?: 'text' | 'password';
  required?: boolean;
}

/**
 * Same promise API as the shared `useConfirm` in packages/ui, rendered with the console's own
 * `confirmation-*` styles so dark-theme pages keep their look.
 *   if (!(await confirm({ title, message, danger: true, confirmLabel: 'Delete' }))) return;
 *   const password = await prompt({ title, message, inputLabel: 'Password', inputType: 'password', required: true });
 */
export function useAdminConfirm() {
  const [request, setRequest] = useState<AdminDialogRequest | null>(null);
  const [value, setValue] = useState('');
  const pending = useRef<((v: string | null) => void) | null>(null);
  useEffect(() => () => { pending.current?.(null); pending.current = null; }, []);

  const open = useCallback((req: AdminDialogRequest) => new Promise<string | null>((resolve) => {
    pending.current?.(null);
    pending.current = resolve;
    setValue('');
    setRequest(req);
  }), []);
  const settle = (v: string | null) => {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.(v);
  };

  const confirm = useCallback(
    async (o: Omit<AdminDialogRequest, 'kind' | 'inputLabel' | 'inputType' | 'required'>) => (await open({ ...o, kind: 'confirm' })) !== null,
    [open]
  );
  const prompt = useCallback(
    (o: Omit<AdminDialogRequest, 'kind'> & { inputLabel: string }) => open({ ...o, kind: 'prompt' }),
    [open]
  );

  const missing = !!request?.required && value.trim().length === 0;
  const confirmDialog = request ? (
    <ModalShell onClose={() => settle(null)} label={request.title} className="modal confirmation-dialog">
      <form
        className="confirmation-body"
        onSubmit={(e) => { e.preventDefault(); if (!missing) settle(request.kind === 'prompt' ? value.trim() : ''); }}
      >
        <h2 className="confirmation-title">{request.title}</h2>
        <div className="confirmation-desc">{request.message}</div>
        {request.kind === 'prompt' && (
          <label style={{ display: 'block', textAlign: 'left', marginTop: 12 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{request.inputLabel}</span>
            <input
              className="input"
              data-autofocus=""
              type={request.inputType ?? 'text'}
              autoComplete={request.inputType === 'password' ? 'current-password' : 'off'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        )}
        <div className="confirmation-actions">
          <Button type="button" variant="ghost" data-autofocus={request.kind === 'confirm' && request.danger ? '' : undefined} onClick={() => settle(null)}>
            {request.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            type="submit"
            variant={request.danger ? 'danger' : 'primary'}
            data-autofocus={request.kind === 'confirm' && !request.danger ? '' : undefined}
            disabled={missing}
          >
            {request.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </form>
    </ModalShell>
  ) : null;

  return { confirm, prompt, confirmDialog };
}


export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${props.className || ''}`} {...props} />;
}

/* ── Skeletons ── */
export function SkeletonLine({
  width = '100%',
  height = '14px',
  className = ''
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
}) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{ width, height, borderRadius: '4px' }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({
  rows = 3,
  className = ''
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`card skeleton-card ${className}`} style={{ padding: '20px' }}>
      <SkeletonLine width="40%" height="18px" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonLine key={i} width={`${85 - i * 15}%`} height="12px" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 5
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="skeleton-table-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--jv-border)', background: 'var(--jv-bg)', display: 'flex', gap: '20px' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} width={`${Math.max(60, 100 / cols)}%`} height="12px" />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            style={{
              padding: '16px 20px',
              borderBottom: r === rows - 1 ? 'none' : '1px solid var(--jv-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <SkeletonLine key={c} width={`${c === 0 ? 80 : 60}%`} height="14px" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Standard Page Header ── */
export function PageHeader({
  title,
  subtitle,
  badge,
  actions
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

/* ── Styled Confirm Modal (replaces window.confirm) ── */
export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  isOpen,
  isPending = false,
  onConfirm,
  onClose
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  isOpen: boolean;
  isPending?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  if (!isOpen) return null;
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Processing…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ fontSize: '13.5px', color: 'var(--jv-text)', lineHeight: 1.6, padding: '4px 0' }}>
        {message}
      </div>
    </Modal>
  );
}

/* ── Search Bar Component ── */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search…',
  width = '280px',
  className = ''
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  width?: string;
  className?: string;
}) {
  return (
    <div className={`ui-search-wrapper ${className}`} style={{ width }}>
      <input
        type="text"
        className="ui-search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="ui-search-clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ── Filter Tabs Component ── */
/**
 * Bulk-selection toolbar shown above a data table once at least one row is
 * checked. Every list page that adopts this loops its own row-level PATCH
 * endpoint over the selected IDs (there is no dedicated bulk API) and passes
 * the resulting buttons in as children.
 */
export function BulkActionsBar({
  selectedCount,
  onClear,
  children
}: {
  selectedCount: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (selectedCount === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        background: '#0B253A',
        color: '#fff',
        borderRadius: 10,
        marginBottom: 12
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700 }}>{selectedCount} selected</span>
      <div style={{ display: 'flex', gap: 8 }}>{children}</div>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={onClear}
        style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
      >
        Clear selection
      </button>
    </div>
  );
}

export function FilterTabs<T extends string>({
  options,
  value,
  onChange
}: {
  options: Array<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (val: T) => void;
}) {
  return (
    <div className="ui-filter-tabs">
      {options.map((opt) => {
        const isActive = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            className={`ui-filter-pill ${isActive ? 'active' : ''}`}
            onClick={() => onChange(opt.id)}
          >
            <span>{opt.label}</span>
            {typeof opt.count === 'number' && (
              <span className="ui-filter-pill-count">{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}


