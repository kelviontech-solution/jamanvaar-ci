import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Super Admin feature request: platform-wide announcement / broadcast. New PlatformAnnouncement
 * model + AnnouncementsService/Controller (Super Admin authors, lists, withdraws) + a Super Admin
 * page to manage them. Routed under /platform/settings so it reuses the existing 'settings' RBAC
 * area rather than needing a new rule -- same reasoning already applied to Restaurant Health.
 */
const CONTROLLER = join(__dirname, '../cloud/api/src/modules/announcements/announcements.controller.ts');
const SERVICE = join(__dirname, '../cloud/api/src/modules/announcements/announcements.service.ts');
const SCHEMA = join(__dirname, '../cloud/api/prisma/schema.prisma');
const ACCESS = join(__dirname, '../cloud/super-admin-web/src/auth/access.ts');
const PAGE = join(__dirname, '../cloud/super-admin-web/src/pages/Announcements/AnnouncementsPage.tsx');

describe('Platform Announcements feature', () => {
  it('the controller is routed under /platform/settings/announcements', () => {
    const src = readFileSync(CONTROLLER, 'utf8');
    expect(src).toMatch(/@Controller\('api\/v1\/platform\/settings\/announcements'\)/);
  });

  it('withdraw() refuses to withdraw an already-withdrawn announcement', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async withdraw('), src.indexOf('async withdraw(') + 600);
    expect(block).toMatch(/if\s*\(existing\.withdrawnAt\)\s*throw/);
  });

  it('activeForRestaurants excludes withdrawn and expired announcements', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async activeForRestaurants('));
    expect(block).toMatch(/withdrawnAt:\s*null/);
    expect(block).toMatch(/expiresAt.*gt.*now/s);
  });

  it('the PlatformAnnouncement model exists with a severity and a visibility window', () => {
    const src = readFileSync(SCHEMA, 'utf8');
    const block = src.slice(src.indexOf('model PlatformAnnouncement'), src.indexOf('model PlatformAnnouncement') + 700);
    expect(block).toMatch(/severity\s+String/);
    expect(block).toMatch(/expiresAt\s+DateTime\?/);
    expect(block).toMatch(/withdrawnAt\s+DateTime\?/);
  });

  it('the frontend route->area table registers /announcements under settings', () => {
    const src = readFileSync(ACCESS, 'utf8');
    expect(src).toMatch(/\{\s*prefix:\s*'\/announcements'\s*,\s*area:\s*'settings'\s*\}/);
  });

  it('the Announcements page only shows a Withdraw action on an Active announcement', () => {
    const src = readFileSync(PAGE, 'utf8');
    expect(src).toMatch(/s\.label === 'Active'/);
  });
});
