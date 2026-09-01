import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('JAMANVAAR POS — Touchscreen-First & No Keyboard Shortcuts UI Audit', () => {
  const posSrcDir = path.resolve(__dirname, '../apps/restaurant-system/pos/src');

  it('verifies PosHeader has no visible keyboard shortcut badges or Ctrl+K kbd tags', () => {
    const headerPath = path.join(posSrcDir, 'components/layout/PosHeader.tsx');
    const content = fs.readFileSync(headerPath, 'utf-8');

    // Must not contain shortcut labels
    expect(content).not.toContain('+ New Order (F1)');
    expect(content).not.toContain('(F1)');
    expect(content).not.toContain('Ctrl+K');
    expect(content).not.toContain('Keyboard Shortcuts');

    // Must contain clean touch labels
    expect(content).toContain('+ New Order');
    expect(content).toContain('Search dishes, SKU, tables, bills, customers...');
  });

  it('verifies PosCart has no visible (F5) or (F7) keyboard shortcut hints', () => {
    const cartPath = path.join(posSrcDir, 'components/cart/PosCart.tsx');
    const content = fs.readFileSync(cartPath, 'utf-8');

    expect(content).not.toContain('(F5)');
    expect(content).not.toContain('(F7)');
    expect(content).not.toContain('Hold (F7)');
    expect(content).not.toContain('Repeat Last Order (F5)');

    expect(content).toContain('↻ Repeat Last Order');
    expect(content).toContain('Hold Order');
  });

  it('verifies GlobalSearchModal has clean touch-friendly footer without kbd tags', () => {
    const searchModalPath = path.join(posSrcDir, 'components/common/GlobalSearchModal.tsx');
    const content = fs.readFileSync(searchModalPath, 'utf-8');

    expect(content).not.toContain('<kbd');
    expect(content).not.toContain('Navigate');
    expect(content).toContain('Tap any result to select');
  });

  it('verifies ShortcutsHelpModal is decommissioned', () => {
    const shortcutsModalPath = path.join(posSrcDir, 'components/common/ShortcutsHelpModal.tsx');
    const content = fs.readFileSync(shortcutsModalPath, 'utf-8');

    expect(content).toContain('return null;');
    expect(content).not.toContain('POS Keyboard Shortcuts');
  });

  it('verifies PosChatbot does not display Press Enter hints', () => {
    const chatbotPath = path.join(posSrcDir, 'components/assistant/PosChatbot.tsx');
    const content = fs.readFileSync(chatbotPath, 'utf-8');

    expect(content).not.toContain('Press Enter');
  });
});
