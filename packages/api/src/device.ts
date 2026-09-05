import { DeviceHealth, KioskStatus } from '@jamanvaar/types';
import { db } from '@jamanvaar/database';

export class DeviceHealthService {
  public static getHealth(kioskId: string = 'KIOSK-01'): DeviceHealth {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    return {
      kioskId,
      status: isOnline ? 'ONLINE' : 'OFFLINE',
      isOnline,
      cpuUsagePercent: 12 + Math.floor(Math.random() * 8),
      ramUsagePercent: 32 + Math.floor(Math.random() * 5),
      storageFreeGb: 118.2,
      appVersion: '1.0.0-windows-tauri',
      isPrinterOnline: true,
      isPaymentTerminalOnline: true,
      isTouchscreenResponsive: true,
      lastHeartbeat: new Date().toISOString(),
      pendingSyncEventsCount: db.syncEvents.filter((e) => e.status === 'PENDING').length
    };
  }

  public static sendHeartbeat(kioskId: string): void {
    const k = db.kiosks.find((item) => item.kioskCode === kioskId || item.id === kioskId);
    if (k) {
      k.lastHeartbeat = new Date().toISOString();
      k.status = 'ONLINE';
      db.notify();
    }
  }
}
