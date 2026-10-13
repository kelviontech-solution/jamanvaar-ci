import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Super Admin feature request: white-label branding editor. The data field (Restaurant.brandingProfile)
 * already existed and is already writable by the restaurant owner's own Settings page
 * (devices.service.ts's updateRestaurantIdentity, tenant-scoped) -- there was just no Super Admin UI
 * for it. Added one (EditRestaurantModal's new "White-Label Branding" section) backed by a new
 * `branding` field on the platform-scoped update endpoint (update-restaurant.dto.ts).
 *
 * Both sides write the same JSON column, so whichever one saves last must merge its fields into
 * whatever is already there, never replace the whole object -- otherwise Super Admin setting just a
 * logoUrl would silently wipe out a primaryColor the restaurant owner had already set (or vice
 * versa). restaurants.service.ts's update() must spread the existing brandingProfile before
 * spreading the incoming branding patch on top of it.
 */
const DTO = join(__dirname, '../cloud/api/src/modules/restaurants/dto/update-restaurant.dto.ts');
const SERVICE = join(__dirname, '../cloud/api/src/modules/restaurants/restaurants.service.ts');

describe('Super Admin restaurant branding editor', () => {
  it('the update DTO accepts a strict branding object with the expected white-label fields', () => {
    const src = readFileSync(DTO, 'utf8');
    expect(src).toMatch(/branding:\s*z\s*\.object\(/);
    expect(src).toMatch(/logoUrl/);
    expect(src).toMatch(/primaryColor/);
    expect(src).toMatch(/accentColor/);
  });

  it('the service merges the incoming branding patch into the existing brandingProfile instead of replacing it', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async update('), src.indexOf('async update(') + 1200);
    expect(block).toMatch(/data\.brandingProfile\s*=\s*\{\s*\.\.\.\(.*existing\.brandingProfile.*\),\s*\.\.\.branding\s*\}/s);
  });
});
