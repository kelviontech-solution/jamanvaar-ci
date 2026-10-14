import React, { useEffect, useRef, useState } from 'react';
import { AppNotification } from '@jamanvaar/types';
import { db, NotificationRepository, ServiceMessages } from '@jamanvaar/database';
import { sound } from './SoundManager';
import { GuestAssistanceStrip } from './GuestAssistanceStrip';

interface UrgentGuestAlertModalProps {
  role: 'POS' | 'POS_ADMIN' | 'CAPTAIN' | 'KDS';
}

/** Prominent nonblocking assistance; authoritative accepted/resolved requests do not resurface. */
export const UrgentGuestAlertModal: React.FC<UrgentGuestAlertModalProps> = ({ role }) => {
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = () => {
      const urgent = NotificationRepository.getNotifications(role, true)
        .filter((n) => n.type === 'GUEST_HELP' && (!n.meta?.serviceRequestId || !['ACCEPTED', 'RESOLVED'].includes(ServiceMessages.getRequest(n.meta.serviceRequestId)?.status || '')))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const fresh = urgent.filter((n) => !seenIds.current.has(n.id));
      if (fresh.length > 0) {
        fresh.forEach((n) => seenIds.current.add(n.id));
        try {
          sound.play('warning');
        } catch {
          // A browser that blocks audio before the first touch still shows the popup.
        }
      }
      setQueue(urgent);
    };

    check();
    const unsub = db.subscribe(check);
    return () => unsub();
  }, [role]);

  if (queue.length === 0) return null;
  const current = queue[0];

  const acknowledge = () => {
    if (current.meta?.serviceRequestId && ServiceMessages.getRequest(current.meta.serviceRequestId)) ServiceMessages.acknowledgeRequest(current.meta.serviceRequestId, 'ACCEPTED');
    NotificationRepository.markAsRead(current.id);
    setQueue((prev) => prev.filter((n) => n.id !== current.id));
  };

  return <GuestAssistanceStrip id={current.id} title={current.title} message={current.message} waiting={queue.length - 1} onAccept={acknowledge} />;
};
