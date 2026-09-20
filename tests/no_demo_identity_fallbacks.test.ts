import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-042: reports, bills and headers printed another business's identity (a Bodakdev address, a made-up
 * GSTIN, a phone number) whenever the restaurant had not filled a field in. On a tax document that is worse
 * than blank. A real restaurant's own details are used, and a missing detail is left out, never invented.
 *
 * The demo seed data (a never-activated demo install) is the only place these values may live.
 */
const FORBIDDEN = [
  '24AAACJ1234F1Z5',
  '24AAAAA0000A1Z5',
  '24ABCDE1234F1Z5',
  '10722001000452',
  '+91 98765 43210',
  '+91 79 4890 1234',
  'Sindhu Bhavan',
  'Ahmedabad Flagship',
  'JAMANVAAR Traditional Dining',
  "'JAMANVAAR Restaurant'",
  'www.jamanvaar.in',
  'BY KELVIONTECH',
  '24AABCJ1984K1Z5',
  'Near Iscon Circle',
  '1072200100452',
  'UDYAM-GJ-01-0012345',
  'hello@jamanvaar.com',
  "'JAMANVAAR RESTAURANT'",
  'The Royal Dining',
  "|| 'JAMANVAAR by KELVIONTECH'",
  'JAMANVAAR FOODS & HOSPITALITY'
];

const SOURCE_DIRS = ['../apps', '../packages', '../cloud/super-admin-web/src'];
const SKIP = /node_modules|__tests__|\.test\.|\.d\.ts|dist|target|packages[\\/]database[\\/]src[\\/](seed|db)\.ts|live_db\.json|menu_templates/;
// Text a person sees before typing, or a brand mark, is fine; a fallback VALUE is not.
const ALLOWED_LINE = /placeholder=|e\.g\.|E\.g\.|^\s*(\/\/|\*|\{\/\*)|alt=|@jamanvaar|logo|POWERED BY|Powered by/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (SKIP.test(full)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('no invented business identity in reports and bills (BUG-042)', () => {
  const files = SOURCE_DIRS.flatMap((d) => walk(join(__dirname, d)));

  it.each(FORBIDDEN)('"%s" is not used as a fallback anywhere outside the demo seed', (literal) => {
    const hits: string[] = [];
    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes(literal) && !ALLOWED_LINE.test(line)) hits.push(`${file.replace(join(__dirname, '..'), '')}:${i + 1}: ${line.trim().slice(0, 110)}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
