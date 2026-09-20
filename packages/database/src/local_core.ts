import { db } from './db';
import {
  BusinessDayAccountingService,
  BusinessDaySummary
} from './accounting_service';
import { BusinessDayRepository, OrderRepository } from './repositories';
import { Order, BusinessDay, DeviceRecord } from '@jamanvaar/types';
import { formatRestaurantDate, generateBusinessDayId } from '@jamanvaar/utils';

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
  private static restaurantId = 'JAMANVAAR-AHM-FLAGSHIP';
  private static outletId = 'AHM-FLAGSHIP';
  private static version = '2.4.0-LOCAL-CORE';
  private static pairingTokens: Map<string, PairingTokenPayload> = new Map();

  /**
   * Returns the canonical database instance
   */
  public static getDatabase() {
    return db;
  }

  public static getRestaurantId(): string {
    return this.restaurantId;
  }

  public static getOutletId(): string {
    return this.outletId;
  }

  /**
   * Health status check for Local Core
   */
  public static getHealth(): LocalCoreHealth {
    const activeDay = BusinessDayAccountingService.getActiveBusinessDay();
    const summary = BusinessDayAccountingService.getBusinessDaySummary(activeDay.id);

    return {
      core_status: 'HEALTHY',
      database_status: 'HEALTHY',
      realtime_status: 'CONNECTED',
      restaurant_id: this.restaurantId,
      restaurant_name: db.restaurant.name || '',
      outlet_id: this.outletId,
      outlet_name: db.outlet.name || '',
      business_day_id: activeDay.id,
      business_day_status: activeDay.status,
      business_day_display: activeDay.displayDate,
      active_orders_count: summary.active_orders,
      connected_devices_count: (db.devices || []).filter((d) => d.status === 'ONLINE').length || 4,
      server_timestamp: new Date().toISOString(),
      version: this.version
    };
  }

  /**
   * Returns all registered devices in the local restaurant network
   */
  public static getRegisteredDevices(): DeviceRecord[] {
    if (!db.devices || db.devices.length === 0) {
      // Initialize standard restaurant fleet
      const now = new Date().toISOString();
      db.devices = [
        {
          id: 'POS-01',
          name: 'Main Counter POS (POS-01)',
          type: 'POS',
          platform: 'Windows Desktop',
          status: 'ONLINE',
          lastSync: now,
          isPrimary: true
        },
        {
          id: 'ADMIN-01',
          name: 'Manager Backoffice (ADMIN-01)',
          type: 'POS',
          platform: 'Windows Desktop',
          status: 'ONLINE',
          lastSync: now,
          isPrimary: false
        },
        {
          id: 'KDS-01',
          name: 'Kitchen Display System (KDS-01)',
          type: 'KDS',
          platform: 'Windows Touch',
          status: 'ONLINE',
          lastSync: now,
          isPrimary: false
        },
        {
          id: 'CAPTAIN-01',
          name: 'Captain Rahul (Floor Tab)',
          type: 'CAPTAIN',
          platform: 'Android Tablet',
          status: 'ONLINE',
          lastSync: now,
          isPrimary: false
        },
        {
          id: 'CAPTAIN-02',
          name: 'Captain Priya (Floor Phone)',
          type: 'CAPTAIN',
          platform: 'Android Handheld',
          status: 'OFFLINE',
          lastSync: now,
          isPrimary: false
        }
      ];
      db.notify();
    }
    return db.devices;
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
    const token = `PAIR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const payload: PairingTokenPayload = {
      token,
      restaurant_id: this.restaurantId,
      outlet_id: this.outletId,
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
