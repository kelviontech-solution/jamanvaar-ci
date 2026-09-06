import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
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
  variant = 'default'
}: {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'luxury' | 'hero' | 'subtle';
}) {
  return <div className={`card card-${variant} ${className}`}>{children}</div>;
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
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
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
  width = '280px'
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  width?: string;
}) {
  return (
    <div className="ui-search-wrapper" style={{ width }}>
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


