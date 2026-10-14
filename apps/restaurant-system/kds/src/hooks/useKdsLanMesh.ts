import { useEffect } from 'react';
import { db, kdsDb, NotificationRepository, getTerminalId } from '@jamanvaar/database';
import { lanMeshSync } from '@jamanvaar/sync';
import { KOTRecord } from '@jamanvaar/types';
import { sound } from '@jamanvaar/ui';

/**
 * Real-time multi-device sync engine & cluster listeners -- registers this screen on the LAN
 * mesh, merges in any KOTs the central db already has, and listens for tickets/status changes
 * broadcast by POS/Captain on the same network. Extracted from App.tsx.
 */
export function useKdsLanMesh(setKots: (kots: KOTRecord[]) => void): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    lanMeshSync.registerDevice('KDS', getTerminalId('KDS'), 'Kitchen Display System');
    lanMeshSync.setAttachedDatabase(kdsDb);

    // 1. Initial Merge: Synchronize central db.kots into kdsDb if missing
    if (db.kots && db.kots.length > 0) {
      let changed = false;
      db.kots.forEach((dk) => {
        if (!kdsDb.kots.some((k) => k.id === dk.id)) {
          kdsDb.kots.push(dk);
          changed = true;
        }
      });
      if (changed) {
        kdsDb.notify();
        setKots([...kdsDb.kots]);
      }
    }

    // 2. Real-time Listeners for Newly Fired KOTs from POS / Captain
    const unsubKot = lanMeshSync.on('KOT_CREATED', (event) => {
      const newKots: KOTRecord[] = Array.isArray(event.payload) ? event.payload : [event.payload];
      let hasNew = false;
      newKots.forEach((nk) => {
        if (nk && nk.id && !kdsDb.kots.some((k) => k.id === nk.id)) {
          kdsDb.kots.unshift(nk);
          hasNew = true;
        }
      });
      if (hasNew) {
        kdsDb.notify();
        setKots([...kdsDb.kots]);
      }
    });

    // 3. Listener for Orders Served
    const unsubServed = lanMeshSync.on('ORDER_SERVED', (event) => {
      const { kotId } = event.payload || {};
      if (kotId) {
        const target = kdsDb.kots.find((k) => k.id === kotId);
        if (target && target.status !== 'SERVED') {
          target.status = 'SERVED';
          target.printed = true;
          kdsDb.notify();
          setKots([...kdsDb.kots]);
        }
      }
    });

    // 4. Listener for Food Ready
    const unsubFoodReady = lanMeshSync.on('FOOD_READY', (event) => {
      const { kotId } = event.payload || {};
      if (kotId) {
        const target = kdsDb.kots.find((k) => k.id === kotId);
        if (target && target.status !== 'READY') {
          target.status = 'READY';
          kdsDb.notify();
          setKots([...kdsDb.kots]);
        }
      }
    });

    // 5. Database mutation subscriber
    const unsubDb = kdsDb.subscribe(() => {
      setKots([...kdsDb.kots]);
    });

    // 6. Internal messages from Captain/POS addressed to the Kitchen — a
    // message sent to "Kitchen" previously vanished silently, since KDS
    // never listened for INTERNAL_MESSAGE_SENT at all despite Captain
    // already broadcasting it correctly.
    const unsubMessage = lanMeshSync.on('INTERNAL_MESSAGE_SENT', (event) => {
      const msg = event.payload as { recipient?: string; senderName?: string; presetText?: string; customNote?: string; tableNumber?: string } | undefined;
      if (!msg || (msg.recipient !== 'KITCHEN' && msg.recipient !== 'ALL')) return;
      sound.play('kot');
      NotificationRepository.createNotification({
        type: 'MANAGER_ALERT' as any,
        title: `💬 Message from ${msg.senderName || 'Floor Staff'}${msg.tableNumber ? ` — Table ${msg.tableNumber}` : ''}`,
        message: msg.customNote || msg.presetText || 'New message for the kitchen.',
        priority: 'HIGH',
        targetRoles: ['KDS', 'ALL'],
        tableNumber: msg.tableNumber
      });
    });

    return () => {
      unsubKot();
      unsubServed();
      unsubFoodReady();
      unsubDb();
      unsubMessage();
    };
  }, [setKots]);
}
