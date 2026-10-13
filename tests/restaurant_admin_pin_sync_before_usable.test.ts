import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reported bug: a PIN just issued/reset in Restaurant Admin -> Team could not log in on
 * POS/Captain/KDS/Kiosk while the one-time PIN-reveal screen was still open; it only worked
 * after clicking "Done". Root cause: createUser/resetPin's push to the cloud (syncStaffUsers)
 * only ran as a fire-and-forget microtask nobody awaited -- the reveal screen gave no signal
 * of whether that push had actually landed, so "click Done, then walk to the terminal" just
 * happened to give it enough wall-clock time. StaffRolesModule.tsx already establishes the
 * fix pattern elsewhere in this app (await syncStaffUsers({push:true}) right after a staff
 * mutation, then report pendingStaffChanges()) -- StaffModal needs the same treatment so the
 * PIN screen shows real sync status instead of silently depending on how long it stays open.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/StaffModal.tsx');

describe('Restaurant Admin: a newly issued/reset PIN syncs to other devices before the admin is told it is ready', () => {
  const src = readFileSync(SRC, 'utf8');

  it('imports the staff sync helpers used elsewhere in this app for this exact pattern', () => {
    expect(src).toMatch(/import\s*\{[^}]*syncStaffUsers[^}]*\}\s*from\s*'@jamanvaar\/sync'/);
  });

  it('defines a sync helper that awaits a push sync and reports whether it landed', () => {
    expect(src).toMatch(/await syncStaffUsers\(\{\s*push:\s*true\s*\}\)/);
    expect(src).toMatch(/pendingStaffChanges\(\)/);
  });

  it('triggers that sync helper right after creating a new staff member', () => {
    const idx = src.indexOf('const created = await StaffRepository.createUser(');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/syncIssuedPin\(\)/);
  });

  it('triggers that sync helper right after resetting an existing staff member\'s PIN', () => {
    const idx = src.indexOf('const handleResetPin');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/syncIssuedPin\(\)/);
  });

  it('tells the admin on the PIN screen whether it has actually reached other devices yet', () => {
    const idx = src.indexOf('This PIN is shown only once');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx - 200, idx + 1400);
    expect(block).toMatch(/syncing|Syncing/);
    expect(block).toMatch(/ready|Ready|synced|Synced/);
  });
});
