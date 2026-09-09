import { DeviceHealth, KioskStatus } from '@jamanvaar/types';
import { db } from '@jamanvaar/database';
import { PrinterService } from './printer';

export class DeviceHealthService {
  public static getHealth(kioskId: string = 'KIOSK-01'): DeviceHealth {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    return {
      kioskId,
      status: isOnline ? 'ONLINE' : 'OFFLINE',
      isOnline,
      // CPU/RAM/disk-free are not readable from a browser context without a
      // native (e.g. Tauri) system-info bridge, which this app does not
      // currently wire up — reporting a fabricated number here would be
      // worse than omitting it, so these stay unavailable rather than fake.
      cpuUsagePercent: null,
      ramUsagePercent: null,
      storageFreeGb: null,
      appVersion: '1.0.0-windows-tauri',
      isPrinterOnline: PrinterService.isOnline(),
      // No real payment-terminal/touchscreen hardware bridge exists in this
      // build either — same reasoning: leave unavailable, don't fake it.
      isPaymentTerminalOnline: null,
      isTouchscreenResponsive: null,
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
