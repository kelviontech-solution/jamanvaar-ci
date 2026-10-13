import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Onboard Restaurant is a 7-step wizard (Restaurant Details ... Review & Launch ... Welcome Kit)
 * but the step pill row was overflow-x:auto/nowrap only -- at a normal 1440px viewport, step 6
 * ("Review & Launch") was visually clipped mid-word and step 7 ("Welcome Kit") was entirely
 * invisible past the right edge, with no scrollbar affordance a user would notice. Same
 * single-row-scroll anti-pattern as the Restaurant Detail tab bar, here hiding an entire step of
 * the platform's single most important workflow. Fixed by letting the pills wrap onto more than
 * one row instead of requiring horizontal scroll to discover them.
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src/pages/Onboarding/onboarding.css');

describe('Onboard Restaurant: all 7 wizard steps are visible, none hidden behind horizontal scroll', () => {
  it('.onboard-steps allows wrapping', () => {
    const css = readFileSync(SRC, 'utf8');
    const block = /\.onboard-steps\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(block).toMatch(/flex-wrap:\s*wrap/);
  });
});
