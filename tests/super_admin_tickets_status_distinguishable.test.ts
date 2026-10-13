import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reported: "ticket management in super admin is not up to the mark, I cannot distinguish
 * between open and closed tickets easily." The status column only varied status badges by a
 * small color-tinted dot -- the same shape/weight as every other pill in the row (priority,
 * category, "from restaurant"), so in a dense table it didn't stand out. Industry ticket tools
 * (GitHub, Linear, Jira, Zendesk) solve this two ways: a distinct icon shape per status (not
 * just color) and muting rows that are already resolved/closed so open work visually leads.
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src/pages/Tickets/TicketsPage.tsx');

describe('Super Admin Support Tickets: open vs. closed is obvious at a glance', () => {
  const src = readFileSync(SRC, 'utf8');

  it('gives each ticket status its own icon, not just a color dot shared with every other badge', () => {
    expect(src).toMatch(/STATUS_ICON/);
    // four distinct statuses need four distinct icon references, not the same icon reused
    const match = src.match(/STATUS_ICON\s*[:=][^}]*?OPEN:\s*(\w+)[\s\S]*?IN_PROGRESS:\s*(\w+)[\s\S]*?RESOLVED:\s*(\w+)[\s\S]*?CLOSED:\s*(\w+)/);
    expect(match).not.toBeNull();
    const [, openIcon, inProgressIcon, resolvedIcon, closedIcon] = match!;
    const icons = [openIcon, inProgressIcon, resolvedIcon, closedIcon];
    expect(new Set(icons).size).toBe(4);
  });

  it('visually mutes rows that are already resolved or closed so open work leads', () => {
    const rowIdx = src.indexOf("onClick={() => openTicket(t.id)}");
    expect(rowIdx).toBeGreaterThan(-1);
    const block = src.slice(rowIdx - 400, rowIdx + 50);
    expect(block).toMatch(/RESOLVED|CLOSED/);
    expect(block).toMatch(/opacity/);
  });
});
