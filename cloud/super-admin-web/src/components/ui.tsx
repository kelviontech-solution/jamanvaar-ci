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
