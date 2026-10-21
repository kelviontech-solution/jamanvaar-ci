// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Modal } from '../packages/ui/src/Modal';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.style.overflow = '';
});

describe('shared UI audit accessibility regressions', () => {
  it('locks background scroll while dialogs are open and restores the previous value', () => {
    document.body.style.overflow = 'auto';
    act(() => root.render(<Modal isOpen onClose={() => {}} title="Audit dialog"><p>Content</p></Modal>));
    expect(document.body.style.overflow).toBe('hidden');
    expect(host.querySelector('[role="dialog"]')?.className).toContain('overscroll-contain');
    expect(host.querySelector('.jv-dialog-body')?.className).toContain('overscroll-contain');
    act(() => root.render(<Modal isOpen={false} onClose={() => {}} title="Audit dialog"><p>Content</p></Modal>));
    expect(document.body.style.overflow).toBe('auto');
  });

  it('uses semantic keyboard-focusable controls for POS status actions', () => {
    const sidebar = readFileSync('apps/restaurant-system/pos/src/components/layout/PosSidebar.tsx', 'utf8');
    const header = readFileSync('apps/restaurant-system/pos/src/components/layout/PosHeader.tsx', 'utf8');
    expect(sidebar).toMatch(/<button[\s\S]*?setIsHoldOrdersOpen\(true\)[\s\S]*?>[\s\S]*?Held Carts/);
    expect(header).toMatch(/<button[\s\S]*?setIsPrintQueueOpen\(true\)[\s\S]*?>[\s\S]*?Thermal Printer/);
    expect(header).toMatch(/<button type="button" onClick=\{toggleNetworkStatus\}[\s\S]*?>[\s\S]*?LAN \/ Cloud Sync/);
    expect(header).not.toMatch(/<div[^>]*onClick=\{toggleNetworkStatus\}/);
  });

  it('gives POS printing toggles switch semantics and accessible names', () => {
    const settings = readFileSync('apps/restaurant-system/pos/src/components/settings/PosSettingsView.tsx', 'utf8');
    expect(settings).toContain('aria-label="Auto-print receipt on settlement"');
    expect(settings).toContain('aria-checked={autoPrintReceipt}');
    expect(settings).toContain('aria-label="Auto-print KOT on order dispatch"');
    expect(settings).toContain('aria-checked={autoPrintKot}');
  });

  it('keeps the shared button focus ring keyboard-specific and avoids transition-all', () => {
    const button = readFileSync('packages/ui/src/Button.tsx', 'utf8');
    expect(button).toContain('focus-visible:ring-2');
    expect(button).not.toContain('transition-all');
    expect(button).toContain('aria-hidden="true"');
  });
});
