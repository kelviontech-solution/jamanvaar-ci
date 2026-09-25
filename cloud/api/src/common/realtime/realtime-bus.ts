import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type RealtimeKind = 'orders' | 'inventory' | 'menu' | 'command';

export interface RealtimeEvent {
  restaurantId: string;
  /** Null means every device of the restaurant; otherwise that branch plus restaurant-wide (branchless) devices. */
  branchId: string | null;
  /** When set, only this device receives the event. */
  deviceId?: string;
  kind: RealtimeKind;
  seq?: number;
  /** The device that caused the change; it is not woken by its own write. */
  originDeviceId?: string;
}

/**
 * In-process fan-out of "something changed" wake-ups. Events carry no business data: they only tell a
 * device to pull by cursor, so losing one (a restart, a dropped connection) can never lose a change.
 * Running several API instances would need this backed by a shared channel (Redis pub/sub or Postgres
 * LISTEN/NOTIFY); devices still recover through their periodic pull in the meantime.
 */
@Injectable()
export class RealtimeBus {
  readonly events$ = new Subject<RealtimeEvent>();

  publish(event: RealtimeEvent): void {
    this.events$.next(event);
  }

  /** Whether `event` may be delivered to a device with these credentials. Scope comes from the authenticated device, never from the client. */
  static isVisibleTo(event: RealtimeEvent, device: { id: string; restaurantId: string; branchId: string | null }): boolean {
    if (event.restaurantId !== device.restaurantId) return false;
    if (event.originDeviceId && event.originDeviceId === device.id) return false;
    if (event.deviceId) return event.deviceId === device.id;
    if (event.branchId && device.branchId && event.branchId !== device.branchId) return false;
    return true;
  }
}
