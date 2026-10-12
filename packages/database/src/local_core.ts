import { db } from './db';
import { BusinessDayAccountingService } from './accounting_service';
import './repositories';
import { DeviceRecord } from '@jamanvaar/types';
import { generateSecureCode } from '@jamanvaar/utils';

export interface LocalCoreHealth {
  core_status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  database_status: 'HEALTHY' | 'SYNC_PENDING';
  realtime_status: 'CONNECTED' | 'OFFLINE';
  restaurant_id: string;
  restaurant_name: string;
  outlet_id: string;
  outlet_name: string;
  business_day_id: string;
  business_day_status: string;
  business_day_display: string;
  active_orders_count: number;
  connected_devices_count: number;
  server_timestamp: string;
  version: string;
}

export interface PairingTokenPayload {
  token: string;
  restaurant_id: string;
  outlet_id: string;
  host_ip: string;
  port: number;
  expires_at: string;
}

export class JamanvaarLocalCore {
  private static version = '2.4.0-LOCAL-CORE';
  private static pairingTokens: Map<string, PairingTokenPayload> = new Map();

  /**
   * Returns the canonical database instance
   */
  public static getDatabase() {
    return db;
  }

  public static getRestaurantId(): string {
    return db.restaurant.id;
  }

  public static getOutletId(): string {
    return db.outlet.id;
  }

  /**
   * Health status check for Local Core
   */
  public static getHealth(): LocalCoreHealth {
    const activeDay = BusinessDayAccountingService.getActiveBusinessDay();
    const summary = BusinessDayAccountingService.getBusinessDaySummary(activeDay.id);

    return {
      core_status: db.isLocalCoreConnected() ? 'HEALTHY' : 'UNAVAILABLE',
      database_status: db.getPersistenceHealth().ok ? 'HEALTHY' : 'SYNC_PENDING',
      realtime_status: db.isLocalCoreConnected() ? 'CONNECTED' : 'OFFLINE',
      restaurant_id: this.getRestaurantId(),
      restaurant_name: db.restaurant.name || '',
      outlet_id: this.getOutletId(),
      outlet_name: db.outlet.name || '',
      business_day_id: activeDay.id,
      business_day_status: activeDay.status,
      business_day_display: activeDay.displayDate,
      active_orders_count: summary.active_orders,
      connected_devices_count: (db.devices || []).filter((d) => d.status === 'ONLINE' && Date.now()-Date.parse(d.lastSync ?? '') < 90000).length,
      server_timestamp: new Date().toISOString(),
      version: this.version
    };
  }

  /**
   * Returns all registered devices in the local restaurant network
   */
  public static getRegisteredDevices(): DeviceRecord[] {
    return db.devices || [];
  }

  /**
   * Update device heartbeat/status
   */
  public static updateDeviceStatus(deviceId: string, status: 'ONLINE' | 'OFFLINE', name?: string): DeviceRecord {
    const devices = this.getRegisteredDevices();
    let dev = devices.find((d) => d.id === deviceId);
    if (!dev) {
      dev = {
        id: deviceId,
        name: name || `Device (${deviceId})`,
        type: deviceId.startsWith('CAPTAIN') ? 'CAPTAIN' : deviceId.startsWith('KDS') ? 'KDS' : 'POS',
        platform: 'Android / Windows',
        status,
        lastSync: new Date().toISOString(),
        isPrimary: false
      };
      devices.push(dev);
    } else {
      dev.status = status;
      dev.lastSync = new Date().toISOString();
      if (name) dev.name = name;
    }
    db.notify();
    return dev;
  }

  /**
   * Generate short-lived device pairing token (5 minutes validity)
   */
  public static generatePairingToken(hostIp: string = '127.0.0.1', port: number = 8765): PairingTokenPayload {
    // B2-003: Math.random() is not a CSPRNG — this token is a real bootstrap credential for
    // pairing a new device onto the local service (packages/database/src/local_core.ts pairs
    // with tooling/local-runtime/local_service.cjs's own separately-generated key/PIN pair).
    const token = `PAIR-${generateSecureCode(6, '23456789ABCDEFGHJKMNPQRSTUVWXYZ')}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const payload: PairingTokenPayload = {
      token,
      restaurant_id: this.getRestaurantId(),
      outlet_id: this.getOutletId(),
      host_ip: hostIp,
      port,
      expires_at: expiresAt
    };

    this.pairingTokens.set(token, payload);
    return payload;
  }

  /**
   * Validate and consume pairing token
   */
  public static redeemPairingToken(token: string, deviceName: string, platform: string): DeviceRecord | null {
    const payload = this.pairingTokens.get(token);
    if (!payload) return null;

    if (new Date() > new Date(payload.expires_at)) {
      this.pairingTokens.delete(token);
      return null;
    }

    // Assign new Captain/Device ID
    const count = (db.devices || []).filter((d) => d.type === 'CAPTAIN').length + 1;
    const deviceId = `CAPTAIN-${String(count).padStart(2, '0')}`;

    const newDevice = this.updateDeviceStatus(deviceId, 'ONLINE', deviceName);
    this.pairingTokens.delete(token);
    return newDevice;
  }
}
