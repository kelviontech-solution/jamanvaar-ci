import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * .qr-admin-header is `position: sticky; top: 0` with no background set anywhere in this
 * stylesheet or in its JSX className list (QrWorkspace.tsx just does
 * `className="qr-admin-header"`, no bg-* utility). Since it's a sticky element pinned over
 * scrolling content, a transparent header lets whatever scrolled underneath show through it --
 * on every QR Admin page (reported on Customer Branding and Payment Settings), this reads as
 * the header visually overlapping/cutting across page content mid-scroll.
 */
const SRC = join(
  __dirname,
  '../apps/restaurant-system/pos-admin/src/qr/workspace.css',
);

describe('.qr-admin-header: opaque so scrolled content cannot show through the sticky header', () => {
  const src = readFileSync(SRC, 'utf8');
  const block = /\.qr-admin-app \.qr-admin-header\s*\{([^}]*)\}/.exec(src)?.[1] ?? '';

  it('the header rule block exists', () => {
    expect(block).not.toBe('');
  });

  it('sets an explicit, opaque background', () => {
    expect(block).toMatch(/background:\s*#fff/);
  });

  it('separates itself from scrolled content with a visible edge (border or shadow), not just a flat color change', () => {
    expect(block).toMatch(/border-bottom|box-shadow/);
  });
});
