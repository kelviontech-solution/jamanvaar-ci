import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { SupportTicket, TicketCategory, TicketPriority, PlatformTeamUser, RestaurantCore } from '../../api/types';
import { Modal, Button, Input } from '../../components/ui';
import { CATEGORY_LABEL, MIN_TEXT } from './ticketShared';

/**
 * Extracted from TicketsPage.tsx (which had grown past 650 lines mixing list, filters, and two
 * separate modals). This modal owns its own form state start to finish -- the parent only needs
 * to know when a ticket was created, not track every field while the dialog is open.
 */
export function CreateTicketModal({
  restaurants,
  assignable,
  onClose,
  onCreated
}: {
  restaurants: RestaurantCore[];
  assignable: PlatformTeamUser[];
  onClose: () => void;
  onCreated: (ticket: SupportTicket) => void;
}) {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [category, setCategory] = useState<TicketCategory>('OTHER');
  const [restaurantId, setRestaurantId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [creating, setCreating] = useState(false);
  // BUG-085: the create dialog used to swallow every failure. Errors now live in the dialog,
  // next to the field they belong to.
  const [createError, setCreateError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const errs: Record<string, string> = {};
    if (subject.trim().length < MIN_TEXT) errs.subject = `Subject must be at least ${MIN_TEXT} characters.`;
    if (description.trim().length < MIN_TEXT) errs.description = `Description must be at least ${MIN_TEXT} characters.`;
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setCreating(true);
    try {
      const created = await api.post<SupportTicket>('/api/v1/support-tickets', {
        subject: subject.trim(),
        description: description.trim(),
        priority,
        category,
        restaurantId: restaurantId || undefined,
        assignedToId: assigneeId || undefined
      });
      onCreated(created);
    } catch (err) {
      if (err instanceof ApiError && err.issues?.length) {
        const fromServer: Record<string, string> = {};
        err.issues.forEach((i) => {
          fromServer[i.path] = i.message;
        });
        setFieldErrors(fromServer);
        setCreateError(err.issues.map((i) => i.message).join(' '));
      } else {
        setCreateError(err instanceof ApiError ? err.message : 'Could not create the ticket. Check your connection and try again.');
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal
      title="New Support Ticket"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={creating}>Cancel</Button>
          {/* Inside the form via the `form` attribute, so Enter and the button both submit it. */}
          <Button type="submit" form="new-ticket-form" variant="accent" disabled={creating}>
            {creating ? 'Creating…' : 'Create Ticket'}
          </Button>
        </>
      }
    >
      <form id="new-ticket-form" onSubmit={handleCreate} className="modal-form" noValidate>
        {createError && (
          <div className="form-error" role="alert" style={{ marginBottom: 12 }}>
            {createError}
          </div>
        )}
        <div className="form-field">
          <label htmlFor="ticket-subject">Subject *</label>
          <Input
            id="ticket-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            aria-invalid={!!fieldErrors.subject}
            autoFocus
          />
          {fieldErrors.subject ? (
            <div className="form-error" style={{ fontSize: 12 }}>{fieldErrors.subject}</div>
          ) : (
            <div className="muted" style={{ fontSize: 11 }}>At least {MIN_TEXT} characters.</div>
          )}
        </div>
        <div className="form-field">
          <label htmlFor="ticket-description">Description *</label>
          <textarea
            id="ticket-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="input-textarea"
            maxLength={5000}
            aria-invalid={!!fieldErrors.description}
          />
          {fieldErrors.description ? (
            <div className="form-error" style={{ fontSize: 12 }}>{fieldErrors.description}</div>
          ) : (
            <div className="muted" style={{ fontSize: 11 }}>At least {MIN_TEXT} characters.</div>
          )}
        </div>
        <div className="form-field">
          <label htmlFor="ticket-category">Category</label>
          <select id="ticket-category" value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)} style={{ height: 40 }}>
            {(Object.keys(CATEGORY_LABEL) as TicketCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} style={{ height: 40 }}>
              <option value="LOW">Low (7 day SLA)</option>
              <option value="MEDIUM">Medium (3 day SLA)</option>
              <option value="HIGH">High (24h SLA)</option>
              <option value="URGENT">Urgent (4h SLA)</option>
            </select>
          </div>
          <div className="form-field">
            <label>Assign to</label>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} style={{ height: 40 }}>
              <option value="">Unassigned</option>
              {assignable.map((u) => (
                <option key={u.id} value={u.id}>{u.id === user?.id ? `${u.fullName} (me)` : u.fullName}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-field">
          <label>Restaurant (optional)</label>
          <select value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} style={{ height: 40 }}>
            <option value="">— Platform-wide —</option>
            {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </form>
    </Modal>
  );
}
