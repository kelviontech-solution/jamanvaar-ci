import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { BackupStorageService } from './backup-storage.service';

function storage(values: Record<string, string>) {
  return new BackupStorageService(new ConfigService(values));
}
describe('EC-15 backup encryption policy', () => {
  it('reports production storage unhealthy when the required key is absent', async () => {
    const service = storage({ NODE_ENV: 'production' });
    const health = await service.checkHealth();
    expect(health).toMatchObject({ ok: false, encryptionRequired: true, encryptionEnabled: false, configurationReady: false });
    await expect(service.upload('fixture', '{}')).rejects.toThrow(/disabled until/);
  });
  it('does not silently downgrade an invalid configured key to plaintext in any environment', async () => {
    const service = storage({ NODE_ENV: 'test', BACKUP_ENCRYPTION_KEY_B64: 'invalid' });
    expect(await service.checkHealth()).toMatchObject({ ok: false, configurationReady: false });
    await expect(service.upload('fixture', '{}')).rejects.toThrow(/exactly 32 bytes/);
  });
  it('supports an explicit required-encryption policy in staging', async () => {
    const service = storage({ NODE_ENV: 'development', BACKUP_REQUIRE_ENCRYPTION: 'true' });
    expect(await service.checkHealth()).toMatchObject({ ok: false, encryptionRequired: true });
    await expect(service.upload('fixture', '{}')).rejects.toThrow(/disabled until/);
  });
  it('retains encrypted format compatibility and detects tampering', async () => {
    const secret = Buffer.alloc(32, 19).toString('base64');
    const service = storage({ NODE_ENV: 'production', BACKUP_ENCRYPTION_KEY_B64: secret });
    let stored: Buffer | undefined;
    vi.spyOn(service as unknown as { put: (...args: unknown[]) => Promise<void> }, 'put').mockImplementation(async (_key, body) => {
      stored = body as Buffer;
    });
    expect(await service.upload('fixture', '{"version":1}')).toMatchObject({ encrypted: true });
    expect(service.plainFromRaw(stored!)).toBe('{"version":1}');
    const tampered = Buffer.from(stored!);
    tampered[tampered.length - 1] ^= 1;
    expect(() => service.plainFromRaw(tampered)).toThrow();
    expect(JSON.stringify(service.describe())).not.toContain(secret);
  });
});
