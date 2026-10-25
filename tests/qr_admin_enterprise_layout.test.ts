import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..', 'apps/restaurant-system/pos-admin/src');
const read = (file: string) => readFileSync(join(src, file), 'utf8').replace(/\r\n/g, '\n');

describe('QR admin enterprise layout', () => {
  const css = read('qr/workspace.css');

  it('stops the outer pane scrolling so only the sidebar and the page scroll, each on its own', () => {
    const app = read('App.tsx');
    expect(app).toContain("activeTab === 'QR_ORDERING' ? 'overflow-hidden'");
    expect(app).toContain('qr-admin-app qr-admin-app--integrated');
    expect(css).toMatch(/\.qr-admin-app--integrated \.qr-admin-sidebar\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.qr-admin-app--integrated \.qr-workspace-page\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toContain('overscroll-behavior: contain');
  });

  it('keeps the QR styles on the brand palette, with no forest-green leftovers', () => {
    const flow = read('components/qrconsole/qr-owner-flow.css');
    const green = [...flow.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]).filter((h) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      return g >= r && g >= b && (g - r >= 3 || g - b >= 3) && !(r === g && g === b) && h.toLowerCase() !== '#047857' && h.toLowerCase() !== '#ecfdf5' && h.toLowerCase() !== '#a7f3d0';
    });
    expect(green).toEqual([]);
  });

  it('uses the 24px page title and no duplicate Help & Support heading inside the workspace', () => {
    expect(css).toMatch(/\.qr-admin-app \.qr-page-heading h1\s*\{\s*font-size: 24px/);
    expect(read('components/support/SupportTicketsModule.tsx')).toContain('embedded ? "sr-only"');
    expect(read('components/qrconsole/QrConsole.tsx')).toContain('<SupportTicketsModule showToast={showToast} embedded />');
  });

  it('shows display preferences as their own card, not nested inside the settings list', () => {
    expect(read('components/qrconsole/QrConsole.tsx')).not.toContain('<div className="p-4"><DisplayPreferences showButtonSetting={false} /></div>');
  });

  it('makes the standalone /qr/admin app a fixed frame with an independently scrolling sidebar and page', () => {
    expect(css).toMatch(/\.qr-admin-app:not\(\.qr-admin-app--integrated\)\s*\{\s*height: 100dvh;[^}]*overflow: hidden;/);
    expect(css).toMatch(/:not\(\.qr-admin-app--integrated\) \.qr-admin-content \{[^}]*width: 100%;[^}]*margin: 0;/);
    expect(css).toMatch(/:not\(\.qr-admin-app--integrated\) \.qr-workspace-page \{[^}]*overflow-y: auto;/);
  });

  it('keeps one card, tab and summary-row standard across QR pages', () => {
    expect(css).toContain('.qr-admin-app .qr-order-attention { box-shadow: none;');
    expect(css).toMatch(/\.qr-menu-view-switch button\[aria-current="page"\] \{ background: rgb\(191 84 15/);
    expect(css).toContain('.qr-admin-app .ops-console > header');
    expect(css).toContain('button[aria-current]:disabled { opacity: 1; }');
  });

  it('keeps Needs attention in the page flow so it never floats over the cards below', () => {
    expect(css).toContain('.qr-admin-app .qr-order-attention { position: static; }');
  });

  it('keeps save bars, payment tabs and the page-editor toolbar in flow instead of floating over content', () => {
    expect(css).toContain('.qr-admin-app :is(.qr-capabilities-save, .qr-payments-workspace .qr-task-tabs, .qpb-toolbar, .qr-rule-save) { position: static;');
  });
});
