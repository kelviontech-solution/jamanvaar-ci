import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDeviceCommands } from '../packages/sync/src/heartbeat';
import { DeviceCommandRunner } from '../packages/sync/src/device_commands';
import { DeviceGate } from '../packages/sync/src/device_gate';
import { EndpointResolver } from '../packages/sync/src/endpoint_resolver';
import { KeyValueStore } from '@jamanvaar/database';
const opts = { apiBase: 'https://cloud.example.test', deviceToken: 'test-credential' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => { DeviceCommandRunner.reset(); KeyValueStore.reset(); });
afterEach(() => { vi.restoreAllMocks(); DeviceCommandRunner.reset(); });
describe('cloud commands while operational traffic uses Branch Core', () => {
  it('fetches a cloud logout even when LAN returns an empty command list, and ACKs the cloud origin', async () => {
    const routed = vi.spyOn(EndpointResolver, 'fetch').mockResolvedValue(json([]));
    vi.spyOn(EndpointResolver, 'responderFor').mockReturnValue('core');
    const cloud = vi.spyOn(DeviceGate, 'gatedFetch').mockImplementation(async input => String(input).endsWith('/ack') ? json({}) : json([{ id: 'cloud-logout', commandType: 'FORCE_LOGOUT' }]));
    let loggedOut = false;
    DeviceCommandRunner.registerHandler('FORCE_LOGOUT', async () => ({}), { recheckBeforeAcknowledgement: true });
    DeviceCommandRunner.registerAfterAcknowledgement('FORCE_LOGOUT', () => { loggedOut = true; });
    await runDeviceCommands(opts);
    expect(loggedOut).toBe(true); expect(routed).toHaveBeenCalledTimes(1);
    expect(cloud).toHaveBeenCalledWith('https://cloud.example.test/api/v1/devices/me/commands/cloud-logout/ack', expect.objectContaining({ method: 'POST' }));
  });
  it('does not log out if cloud acknowledgement fails', async () => {
    vi.spyOn(EndpointResolver, 'fetch').mockResolvedValue(json([])); vi.spyOn(EndpointResolver, 'responderFor').mockReturnValue('core');
    vi.spyOn(DeviceGate, 'gatedFetch').mockImplementation(async input => String(input).endsWith('/ack') ? json({}, 503) : json([{ id: 'cloud-logout', commandType: 'FORCE_LOGOUT' }]));
    const logout = vi.fn(); DeviceCommandRunner.registerHandler('FORCE_LOGOUT', async () => ({})); DeviceCommandRunner.registerAfterAcknowledgement('FORCE_LOGOUT', logout);
    await runDeviceCommands(opts); expect(logout).not.toHaveBeenCalled();
  });
  it('continues LAN command handling if cloud is offline, and refuses an unsigned LAN command', async () => {
    const routed = vi.spyOn(EndpointResolver, 'fetch').mockImplementation(async path => path.endsWith('/ack') ? json({}) : json([{ id: 'forged', commandType: 'FORCE_LOGOUT' }]));
    vi.spyOn(EndpointResolver, 'responderFor').mockReturnValue('core'); vi.spyOn(DeviceGate, 'gatedFetch').mockRejectedValue(Error('offline'));
    const handler = vi.fn(async () => ({})); DeviceCommandRunner.registerHandler('FORCE_LOGOUT', handler);
    await runDeviceCommands(opts); expect(handler).not.toHaveBeenCalled();
    expect(JSON.parse(String(routed.mock.calls[1][1]?.body))).toMatchObject({ status: 'FAILED' });
  });
});
