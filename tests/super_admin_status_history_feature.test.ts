import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Super Admin feature request: public/internal status history. "Platform Online" on every page is
 * a live badge with no memory of past incidents. New PlatformIncident model (an append-only
 * `updates` timeline, oldest first) + IncidentsService/Controller + a Super Admin page to open
 * incidents and post timeline updates until resolved.
 */
const SERVICE = join(__dirname, '../cloud/api/src/modules/incidents/incidents.service.ts');
const CONTROLLER = join(__dirname, '../cloud/api/src/modules/incidents/incidents.controller.ts');
const ACCESS = join(__dirname, '../cloud/super-admin-web/src/auth/access.ts');
const PAGE = join(__dirname, '../cloud/super-admin-web/src/pages/Incidents/IncidentsPage.tsx');

describe('Status History (incidents) feature', () => {
  it('addUpdate refuses to add an update to an already-resolved incident', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async addUpdate('), src.indexOf('async addUpdate(') + 600);
    expect(block).toMatch(/if\s*\(existing\.status === 'RESOLVED'\)\s*throw/);
  });

  it('addUpdate appends to the existing timeline rather than replacing it', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async addUpdate('), src.indexOf('async addUpdate(') + 900);
    expect(block).toMatch(/\[\s*\.\.\.\(existing\.updates/);
  });

  it('resolving an incident sets resolvedAt', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async addUpdate('), src.indexOf('async addUpdate(') + 900);
    expect(block).toMatch(/dto\.status === 'RESOLVED'.*resolvedAt: new Date\(\)/s);
  });

  it('the controller is routed under /platform/telemetry/incidents so it inherits the ops RBAC area', () => {
    const src = readFileSync(CONTROLLER, 'utf8');
    expect(src).toMatch(/@Controller\('api\/v1\/platform\/telemetry\/incidents'\)/);
  });

  it('the frontend route->area table registers /status-history under ops', () => {
    const src = readFileSync(ACCESS, 'utf8');
    expect(src).toMatch(/\{\s*prefix:\s*'\/status-history'\s*,\s*area:\s*'ops'\s*\}/);
  });

  it('the Incidents page only shows the update form on a non-resolved incident', () => {
    const src = readFileSync(PAGE, 'utf8');
    expect(src).toMatch(/inc\.status !== 'RESOLVED'/);
  });
});
