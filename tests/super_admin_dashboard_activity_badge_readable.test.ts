import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dashboard's "Recent Platform Activity" widget already humanizes the event title via
 * formatAuditEvent (e.g. "Platform Login Otp Sent"), but the badge right next to it rendered the
 * raw event.action string unchanged ("PLATFORM_LOGIN_OTP_SENT") -- the same fact shown twice, once
 * readable and once as internal jargon. formatAuditEvent already returns a short human category
 * (e.g. "Authentication", "Licensing") for exactly this purpose; the badge just wasn't using it.
 * (The Audit Logs page's own raw-action chip is deliberately different -- a technical detail
 * view, explicitly labeled "Action", where the raw code is the right thing to show.)
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src/pages/Dashboard/DashboardPage.tsx');

describe('Dashboard: Recent Platform Activity badge shows a human category, not the raw action code', () => {
  const src = readFileSync(SRC, 'utf8');

  it('the activity badge renders formatted.category, not event.action', () => {
    expect(src).toMatch(/className="activity-action-tag">\s*\{formatted\.category\}/);
    expect(src).not.toMatch(/className="activity-action-tag">\s*\{event\.action\}/);
  });
});
