import { describe, it, expect, vi } from 'vitest';
import { DeviceGate } from '@jamanvaar/sync';

describe('leaving a lock screen that will not clear', () => {
  it('disconnectTerminal clears the lock and runs the app\'s own unbind handler', () => {
    const handler = vi.fn();
    DeviceGate.onIdentityInvalid(handler);
    DeviceGate.applyHeartbeat?.({ locked: true, lockCode: 'DEVICE_LOCKED' } as never);
    DeviceGate.disconnectTerminal();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(DeviceGate.getState().locked).toBe(false);
    expect(DeviceGate.peekDisconnectReason()).toMatch(/activation key/i);
  });
});

describe('a disconnected terminal does not get locked again', () => {
  it('ignores a late "suspended" answer after disconnect, and locks again once a new activation succeeds', () => {
    const store: Record<string, string> = {};
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
    DeviceGate.onIdentityInvalid(() => undefined);
    DeviceGate.disconnectTerminal();
    DeviceGate.applyHeartbeat?.({ locked: true, lockCode: 'DEVICE_LOCKED' } as never);
    expect(DeviceGate.getState().locked).toBe(false);
    DeviceGate.reportSuccess();
    DeviceGate.applyHeartbeat?.({ locked: true, lockCode: 'DEVICE_LOCKED' } as never);
    expect(DeviceGate.getState().locked).toBe(true);
    DeviceGate.reset();
  });
});
