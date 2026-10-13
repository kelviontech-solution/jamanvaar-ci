import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Super Admin feature request: scheduled weekly digest email. Reuses DashboardService.getSummary()
 * (the Executive Dashboard's own numbers) and EmailService.send() (gracefully no-ops when SMTP
 * isn't configured, same as every other transactional email in this codebase). Gated by a
 * PlatformSetting row so it only actually sends once the configured interval has elapsed, even
 * though the job tick itself runs every 15 minutes.
 */
const SERVICE = join(__dirname, '../cloud/api/src/modules/digest/digest.service.ts');
const JOBS = join(__dirname, '../cloud/api/src/modules/jobs/jobs.service.ts');

describe('Weekly digest email', () => {
  it('sendIfDue is a no-op (does not re-send) when the interval has not elapsed', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async sendIfDue('), src.indexOf('async sendIfDue(') + 700);
    expect(block).toMatch(/Date\.now\(\) - lastSentAt\.getTime\(\) < DIGEST_INTERVAL_MS/);
    expect(block).toMatch(/return \{ sent: false/);
  });

  it('only PLATFORM_OWNER and SUPER_ADMIN roles receive the digest', () => {
    const src = readFileSync(SERVICE, 'utf8');
    expect(src).toMatch(/role:\s*\{\s*in:\s*\['PLATFORM_OWNER',\s*'SUPER_ADMIN'\]\s*\}/);
  });

  it('the job is registered with JobsService', () => {
    const src = readFileSync(JOBS, 'utf8');
    expect(src).toMatch(/name:\s*'weekly-digest'/);
    expect(src).toMatch(/this\.digest\.sendIfDue\(\)/);
  });
});
