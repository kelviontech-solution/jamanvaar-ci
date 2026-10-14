import { Link } from 'react-router-dom';
import type { SupportTicketDetail, TicketStatus, TicketPriority, PlatformTeamUser } from '../../api/types';
import { Modal, Button } from '../../components/ui';
import { TicketThread } from './TicketThread';
import { CATEGORY_LABEL } from './ticketShared';

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
  return (
    <Modal
      title={`TKT-${String(ticket.number).padStart(6, '0')} · ${ticket.subject}`}
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            <select
              value={ticket.status}
              onChange={(e) => onUpdate({ status: e.target.value as TicketStatus })}
              style={{ height: 40 }}
            >
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div className="form-field">
            <label>Priority</label>
            <select
              value={ticket.priority}
              onChange={(e) => onUpdate({ priority: e.target.value as TicketPriority })}
              style={{ height: 40 }}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>

        <div className="form-field">
          <label>Assignee</label>
          <select
            value={ticket.assignedToId || ''}
            onChange={(e) => onUpdate({ assignedToId: e.target.value || null })}
            style={{ height: 40 }}
          >
            <option value="">Unassigned</option>
            {/* Active members only, plus the current assignee so an existing assignment still displays. */}
            {team
              .filter((u) => u.status === 'ACTIVE' || u.id === ticket.assignedToId)
              .map((u) => (
                <option key={u.id} value={u.id} disabled={u.status !== 'ACTIVE'}>
                  {u.fullName}{u.status !== 'ACTIVE' ? ' (inactive)' : ''}
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
