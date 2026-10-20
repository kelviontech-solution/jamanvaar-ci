import {describe, it, expect} from 'vitest';
import {BrandingService} from './branding.service';
import type {PrismaService} from '../../prisma/prisma.service';

function service(value?: Record<string,string>) {
  return new BrandingService({platformDb:{platformSetting:{findMany:async () => value ? [{key:'platform.branding',value}] : []}}} as unknown as PrismaService);
}
describe('transactional email support contact', () => {
  it('uses the correct support mailbox for a fresh install', async () => {
    expect(await service().emailFooter()).toContain('kelviontech@gmail.com');
  });
  it('repairs the shipped placeholder contact on existing installs', async () => {
    const footer = await service({supportEmail:'support@jamanvaar.app',supportPhone:'+91 98765 43210'}).emailFooter();
    expect(footer).toContain('kelviontech@gmail.com');
    expect(footer).not.toContain('support@jamanvaar.app'); expect(footer).not.toContain('98765');
  });
  it('preserves an intentionally configured support contact and escapes markup', async () => {
    const footer = await service({companyName:'A&B',supportEmail:'support@example.org',supportPhone:'+91 1234567890'}).emailFooter();
    expect(footer).toContain('support@example.org'); expect(footer).toContain('1234567890'); expect(footer).toContain('A&amp;B');
  });
});
