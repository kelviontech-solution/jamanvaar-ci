import React from 'react';
import { useCaptainStore } from '../../store/captainStore';
import { GuestAssistanceStrip } from '@jamanvaar/ui';

/** Guest calls remain visible without interrupting ordering or delivery. */
export const CaptainUrgentHelpAlert: React.FC = () => {
  const { notifications, customerRequests, acknowledgeCustomerRequest, markNotificationRead } = useCaptainStore();

  const pending = notifications
    .filter((n) => n.type === 'GUEST_HELP' && !n.isRead && !customerRequests.some(r => r.id === `svc-${n.id.replace(/^notif-/, '')}` && (r.isAcknowledged || r.isResolved)))
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (pending.length === 0) return null;
  const current = pending[0];

  const accept = () => {
    markNotificationRead(current.id);
    // notif-<id> / svc-<id> share the same base id (see receiveMessages in captainStore.ts).
    const base = current.id.replace(/^notif-/, '');
    acknowledgeCustomerRequest(`svc-${base}`);
  };

  return <GuestAssistanceStrip id={current.id} title={current.title} message={current.message} waiting={pending.length - 1} onAccept={accept} />;
};
