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
