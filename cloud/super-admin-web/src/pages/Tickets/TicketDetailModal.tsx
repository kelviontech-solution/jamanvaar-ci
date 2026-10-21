import { Link } from 'react-router-dom';
import type { SupportTicketDetail, TicketStatus, TicketPriority, PlatformTeamUser } from '../../api/types';
import { Modal, Button } from '../../components/ui';
import { TicketThread } from './TicketThread';
import { CATEGORY_LABEL } from './ticketShared';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../api/client';
import { QrFeatureRequestAction } from './QrFeatureRequestAction';
import { QrPaymentApprovalAction } from './QrPaymentApprovalAction';

/** Extracted from TicketsPage.tsx. `ticket` is still owned by the parent (it's also opened by a
 * `?open=<id>` deep link), so this stays a pure display + "tell the parent what changed" component. */
export function TicketDetailModal({
  ticket,
  team,
  onClose,
  onUpdate,
  onChanged,
  showToast
}: {
  ticket: SupportTicketDetail;
  team: PlatformTeamUser[];
  onClose: () => void;
  onUpdate: (updates: { status?: TicketStatus; priority?: TicketPriority; assignedToId?: string | null }) => void;
  onChanged: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const { can } = useAuth();
  const [issuing, setIssuing] = useState(false),
    [keyCode, setKeyCode] = useState(''),
    [keyError, setKeyError] = useState(''),
    [review, setReview] = useState(false);
  const keyRequest =
    ticket.source === 'RESTAURANT' &&
    ticket.category === 'ONBOARDING' &&
    !!ticket.branchId &&
    (ticket.subject === 'Kiosk activation key' || ticket.events?.some((e) => e.type === 'KIOSK_ACTIVATION_REQUEST'));
  const issued = ticket.events?.find((e) => e.type === 'KIOSK_KEY_ISSUED');
  return (
    <Modal
      title={`TKT-${String(ticket.number).padStart(6, '0')} · ${ticket.subject}`}
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ticket.events?.some(event => event.type === 'QR_PAYMENT_ACTIVATION_REQUEST') && <QrPaymentApprovalAction key={ticket.id} ticketId={ticket.id} onChanged={onChanged} />}
        {ticket.source === 'RESTAURANT' && ticket.category === 'FEATURE_REQUEST' && <QrFeatureRequestAction key={ticket.id} ticketId={ticket.id} onChanged={onChanged} />}
        {keyRequest && (
          <section className="detail-card" style={{ padding: 16 }} aria-label="Kiosk activation request">
            <h3>Connect the requested kiosk</h3>
            <p>
              Issue one customer-facing kiosk key for this request's restaurant and branch. The server verifies product access and both device limits. The key
              expires in seven days.
            </p>
            {issued ? (
              <p>A key has already been issued. Check Devices & Keys before creating a replacement.</p>
            ) : can('devices', 'write') && can('support', 'write') ? (
              <>
                <label>
                  <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /> I reviewed the requested branch and terminal name.
                </label>
                <p>
                  <Button
                    disabled={issuing || !review || !!keyCode}
                    onClick={async () => {
                      setIssuing(true);
                      setKeyError('');
                      try {
                        const result = await api.post<{ code: string | null; alreadyIssued: boolean }>(`/api/v1/support-tickets/${ticket.id}/kiosk-key`, {});
                        if (result.code) setKeyCode(result.code);
                        else setKeyError('A key was already issued. Open Devices & Keys to review it.');
                        await onChanged();
                      } catch (e) {
                        setKeyError(e instanceof Error ? e.message : 'Key could not be issued');
                      } finally {
                        setIssuing(false);
                      }
                    }}
                  >
                    {issuing ? 'Checking access and capacity…' : 'Issue kiosk key from this request'}
                  </Button>
                </p>
              </>
            ) : (
              <p>Ask a platform administrator with device-provisioning permission to issue this key.</p>
            )}
            {keyCode && (
              <div role="status">
                <strong>Key issued. Share securely with the owner.</strong>
                <p className="activation-code-display">{keyCode}</p>
                <p>Enter it on the customer kiosk activation screen, not in Restaurant Admin. The code is not added to the public ticket thread.</p>
              </div>
            )}
            {keyError && <p role="alert">{keyError}</p>}
          </section>
        )}
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--jv-text-secondary)', whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
        <div className="muted" style={{ fontSize: 12 }}>
          {ticket.source === 'RESTAURANT'
            ? `Raised by ${ticket.raisedByName ?? 'a restaurant user'}${ticket.raisedByEmail ? ` (${ticket.raisedByEmail})` : ''} from ${ticket.restaurant?.name ?? 'a restaurant'}`
            : `Created by ${ticket.createdBy?.fullName ?? 'the team'}`}
          {' · '}
          {CATEGORY_LABEL[ticket.category] ?? ticket.category}
          {ticket.restaurantId && (
            <>
              {' · '}
              <Link to={`/restaurants/${ticket.restaurantId}${ticket.deviceId ? '?tab=devices' : ''}`}>Open restaurant</Link>
            </>
          )}
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>Status</label>
            <select value={ticket.status} onChange={(e) => onUpdate({ status: e.target.value as TicketStatus })} style={{ height: 40 }}>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div className="form-field">
            <label>Priority</label>
            <select value={ticket.priority} onChange={(e) => onUpdate({ priority: e.target.value as TicketPriority })} style={{ height: 40 }}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>

        <div className="form-field">
          <label>Assignee</label>
          <select value={ticket.assignedToId || ''} onChange={(e) => onUpdate({ assignedToId: e.target.value || null })} style={{ height: 40 }}>
            <option value="">Unassigned</option>
            {/* Active members only, plus the current assignee so an existing assignment still displays. */}
            {team
              .filter((u) => u.status === 'ACTIVE' || u.id === ticket.assignedToId)
              .map((u) => (
                <option key={u.id} value={u.id} disabled={u.status !== 'ACTIVE'}>
                  {u.fullName}
                  {u.status !== 'ACTIVE' ? ' (inactive)' : ''}
                </option>
              ))}
          </select>
        </div>

        <div className="form-field">
          <label>SLA</label>
          <span className="muted" style={{ fontSize: 13 }}>
            Due {new Date(ticket.slaDueAt).toLocaleString('en-IN')}
            {ticket.resolvedAt && ` · Resolved ${new Date(ticket.resolvedAt).toLocaleString('en-IN')}`}
          </span>
        </div>

        <TicketThread ticket={ticket} onChanged={onChanged} onError={showToast} />
      </div>
    </Modal>
  );
}
