import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-018: Super Admin printed and copied "http://localhost:5176" (Restaurant Admin) and ":5173" (Kiosk Admin)
 * in onboarding text, the welcome kit and the WhatsApp message it sends to a restaurant owner. Those addresses
 * only work on the developer's machine. The web addresses now come from configuration in one place.
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src');
const ALLOWED = [join('lib', 'appUrls.ts'), join('api', 'client.ts')];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('Super Admin app addresses (BUG-018)', () => {
  it('no page or component hard-codes a localhost address', () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      if (ALLOWED.some((a) => file.endsWith(a))) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/https?:\/\/localhost:\d+/.test(line) && !/^\s*(\/\/|\*)/.test(line)) hits.push(`${file.replace(SRC, '')}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('the addresses are configurable, with a working default for local development', () => {
    const src = readFileSync(join(SRC, 'lib/appUrls.ts'), 'utf8');
    expect(src).toContain('VITE_RESTAURANT_ADMIN_URL');
    expect(src).toContain('KIOSK_ADMIN_URL = RESTAURANT_ADMIN_URL');
    expect(src).toContain('http://localhost:5176');
    expect(src).not.toContain('http://localhost:5173');
  });
});
