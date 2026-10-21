import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const admin = (file: string) => readFileSync(join(__dirname, '../apps/restaurant-system/pos-admin/src', file), 'utf8');
const QR_MODULES = ['QrAdvanced', 'QrBranchPreferences', 'QrCapabilities', 'QrCatalog', 'QrCrm', 'QrOnboarding', 'QrOperations', 'QrPromotions'];

describe('Branch context bar', () => {
  const bar = admin('components/header/AdminBranchWorkspace.tsx');
  it('keeps the one authoritative branch selector and its original handler', () => {
    expect(bar).toContain('aria-label="Branch workspace"');
    expect(bar).toMatch(/onChange=\{e=>void change\(e\.target\.value\)\}/);
    expect(bar).toContain('await requestQrLeave()');
    expect(bar.match(/aria-label="Branch workspace"/g)).toHaveLength(1);
  });
  it('is a compact strip tinted like the header, with the full branch name available on the control', () => {
    expect(bar).toMatch(/min-h-12 bg-\[#FAF8F5\]/);
    expect(bar).toContain('title={selectedLabel}');
    expect(bar).not.toContain('py-2 px-3 bg-jaman-cream');
  });
  it('keeps the inline search from squeezing the restaurant identity below 1280px', () => {
    const header = admin('components/header/PosAdminHeader.tsx');
    expect(header).toContain('hidden xl:flex items-center flex-1 min-w-[9rem]');
    expect(header).toMatch(/lg:hidden[^"]*"[\s\S]{0,200}aria-label="Open menu"/);
  });
});

describe('QR Ordering shares the Restaurant Admin design tokens', () => {
  it('defines the primary button and form field once, in brand orange', () => {
    const ui = admin('components/qrconsole/qrUi.ts');
    expect(ui).toContain('bg-brand');
    expect(ui).not.toContain('bg-jaman-navy');
    for (const name of QR_MODULES) {
      const source = admin(`components/qrconsole/${name}.tsx`);
      expect(source, name).toContain("from './qrUi'");
      expect(source, name).not.toMatch(/bg-jaman-navy[^"']*text-white|text-white[^"']*bg-jaman-navy/);
    }
    expect(admin('components/qrconsole/QrConsole.tsx')).not.toContain('bg-jaman-navy text-white');
  });
  it('uses the admin ivory, border, orange, title scale and brand focus ring', () => {
    const css = admin('qr/workspace.css');
    expect(css).toMatch(/--qr-orange: #bf540f/);
    expect(css).toMatch(/--qr-line: #ebe6dd/);
    expect(css).toMatch(/background: #faf7f2/);
    expect(css).toMatch(/\.qr-admin-app h1 \{\s*font-size: 24px/);
    expect(css).not.toContain('#19738c');
  });
  it('uses one neutral notice instead of blue info banners', () => {
    expect(admin('components/qrconsole/QrConsole.tsx')).not.toContain('border-blue-200 bg-blue-50');
    expect(admin('components/qrconsole/restaurant-page-editor.css')).not.toContain('background: #f0f5fb');
  });
  it('gives the QR sidebar the same active treatment as the main sidebar', () => {
    const css = admin('qr/workspace.css');
    expect(css).toMatch(/button\[aria-current="page"\]::before/);
    expect(css).not.toContain('border-color: #f1d3bc');
  });
  it('defaults borders to the warm admin border colour', () => {
    expect(readFileSync(join(__dirname, '../apps/restaurant-system/pos-admin/tailwind.config.js'), 'utf8')).toMatch(/borderColor: \{ DEFAULT: '#EBE6DD' \}/);
  });
});
