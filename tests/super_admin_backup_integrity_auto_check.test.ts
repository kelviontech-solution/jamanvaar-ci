import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Super Admin feature request: automated backup integrity checks. Every one of the 56+ snapshots on
 * the Backups page sat at "UNVERIFIED" forever unless a human opened the page and clicked "Verify
 * SHA256 checksum" on each row by hand -- with that many rows, "UNVERIFIED" was really just the
 * permanent default, not a real signal. Added verifyDueBackups() (reuses the same checksum
 * inspection verifyBackup() already used for the manual click) and registered it with JobsService so
 * it runs automatically instead of waiting for someone to notice.
 */
const SERVICE = join(__dirname, '../cloud/api/src/modules/backups/backups.service.ts');
const JOBS = join(__dirname, '../cloud/api/src/modules/jobs/jobs.service.ts');

describe('Backups: automated integrity check job', () => {
  it('verifyDueBackups only targets COMPLETED, UNVERIFIED backups, capped per run', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async verifyDueBackups'), src.indexOf('async verifyDueBackups') + 1200);
    expect(block).toMatch(/status:\s*'COMPLETED'/);
    expect(block).toMatch(/verificationStatus:\s*'UNVERIFIED'/);
    expect(block).toMatch(/take:\s*50/);
  });

  it('records a SYSTEM-actor audit entry, not a human actorId, for an automated verification', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async verifyDueBackups'), src.indexOf('async verifyDueBackups') + 1600);
    expect(block).toMatch(/actorType:\s*'SYSTEM'/);
  });

  it('the job is registered with JobsService so it actually runs on a schedule', () => {
    const src = readFileSync(JOBS, 'utf8');
    expect(src).toMatch(/name:\s*'backup-integrity-check'/);
    expect(src).toMatch(/this\.backups\.verifyDueBackups\(\)/);
  });
});
