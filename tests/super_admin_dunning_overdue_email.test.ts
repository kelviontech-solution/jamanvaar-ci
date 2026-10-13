import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Super Admin feature request: dunning / renewal automation. Renewal invoices and PAST_DUE marking
 * already existed, but the restaurant owner was never actually told -- only the internal
 * PlatformNotification feed knew an invoice had gone overdue. markOverdueInvoices() now emails the
 * restaurant's OWNER-role user directly, one email per overdue invoice, after marking it PAST_DUE
 * (so a restaurant with no owner email on file is skipped, not crashed).
 */
const SERVICE = join(__dirname, '../cloud/api/src/modules/billing/invoices.service.ts');

describe('Dunning: overdue invoice emails the restaurant owner', () => {
  const src = readFileSync(SERVICE, 'utf8');
  const block = src.slice(src.indexOf('async markOverdueInvoices('), src.indexOf('async markOverdueInvoices(') + 2500);

  it('fetches the OWNER-role user to email, not just any user', () => {
    expect(block).toMatch(/users:\s*\{\s*where:\s*\{\s*role:\s*'OWNER'\s*\}/);
  });

  it('skips a restaurant with no owner email instead of throwing', () => {
    expect(block).toMatch(/if\s*\(!owner\?\.\s*email\)\s*continue/);
  });

  it('sends the email after the invoice is already marked PAST_DUE in the same pass', () => {
    const updateIdx = block.indexOf('updateMany');
    const sendIdx = block.indexOf('this.email.send');
    expect(updateIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(updateIdx);
  });
});
