import type { TicketCategory, TicketPriority, TicketStatus } from '../../api/types';
import { type BadgeTone } from '../../components/ui';
import { CircleDot, Loader2, CheckCircle2, Archive } from 'lucide-react';

/** Shared across TicketsPage, CreateTicketModal and TicketDetailModal. */

export const MIN_TEXT = 3;

export const PRIORITY_TONE: Record<TicketPriority, BadgeTone> = {
  URGENT: 'error',
  HIGH: 'warning',
  MEDIUM: 'accent',
  LOW: 'neutral'
};

export const STATUS_TONE: Record<TicketStatus, BadgeTone> = {
  OPEN: 'error',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral'
};

// A color-only dot is too subtle in a table already full of colored pills (priority, category,
// "from restaurant"). Each status gets its own icon shape too, so open vs. closed reads at a
// glance even in grayscale or for a colorblind viewer -- the same pattern GitHub/Linear/Jira use.
export const STATUS_ICON: Record<TicketStatus, typeof CircleDot> = {
  OPEN: CircleDot,
  IN_PROGRESS: Loader2,
  RESOLVED: CheckCircle2,
  CLOSED: Archive
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed'
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`badge badge-${STATUS_TONE[status]}`}>
      <Icon className="w-3 h-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  BILLING: 'Billing',
  SYNC: 'Sync',
  HARDWARE: 'Hardware',
  ONBOARDING: 'Onboarding',
  FEATURE_REQUEST: 'Feature request',
  OTHER: 'Other'
};

/** TKT-000123: a number people can quote on a call or in a message. */
export function ticketNumber(n: number): string {
  return `TKT-${String(n).padStart(6, '0')}`;
}

export function slaLabel(slaDueAt: string, resolvedAt: string | null): { text: string; overdue: boolean } {
  if (resolvedAt) return { text: 'Resolved', overdue: false };
  const dueMs = new Date(slaDueAt).getTime() - Date.now();
  const overdue = dueMs < 0;
  const hours = Math.abs(dueMs) / (1000 * 60 * 60);
  const text = hours < 1
    ? `${Math.round(hours * 60)}m ${overdue ? 'overdue' : 'left'}`
    : hours < 48
    ? `${Math.round(hours)}h ${overdue ? 'overdue' : 'left'}`
    : `${Math.round(hours / 24)}d ${overdue ? 'overdue' : 'left'}`;
  return { text, overdue };
}
