import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { splitTax, splitTaxPaise } from '../packages/utils/src/currency';

/**
 * BUG-039: CGST and SGST did not add up to the tax on the same bill. Each screen halved the tax its own
 * way: the Business Day dialog showed 41 + 41 = 82 beside ₹81 of tax while Reports showed 41 + 40, and
 * some screens invented a tax figure from a fixed 2.38% of sales when an order had none. Every split now
 * goes through one function that always adds up, and nothing fabricates tax.
 */
describe('splitTax (BUG-039)', () => {
  it('always adds up to the total tax, in rupees to the paisa', () => {
    for (let paise = 0; paise <= 20_000; paise += 1) {
      const total = paise / 100;
      const { cgst, sgst } = splitTax(total);
      expect(Math.round((cgst + sgst) * 100), `tax ${total}`).toBe(paise);
      expect(cgst).toBeGreaterThanOrEqual(0);
      expect(sgst).toBeGreaterThanOrEqual(0);
      expect(Math.abs(cgst - sgst)).toBeLessThanOrEqual(0.01 + 1e-9);
    }
  });

  it('adds up in whole rupees too, so 81 becomes 41 + 40, never 41 + 41', () => {
    expect(splitTax(81, 0)).toEqual({ cgst: 41, sgst: 40 });
    for (let tax = 0; tax <= 5000; tax += 1) {
      const { cgst, sgst } = splitTax(tax, 0);
      expect(cgst + sgst, `tax ${tax}`).toBe(tax);
    }
  });

  it('splits integer paise the same way, for the order sync', () => {
    expect(splitTaxPaise(8100)).toEqual({ cgst: 4050, sgst: 4050 });
    expect(splitTaxPaise(8101)).toEqual({ cgst: 4051, sgst: 4050 });
    for (let p = 0; p < 10_000; p += 1) {
      const { cgst, sgst } = splitTaxPaise(p);
      expect(cgst + sgst).toBe(p);
    }
  });
});

/** Where the splitting used to go wrong. These patterns must not come back. */
const SOURCE_DIRS = ['../apps', '../packages', '../cloud/super-admin-web/src'];
const SKIP = /node_modules|__tests__|\.test\.|\.d\.ts|dist|target/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (SKIP.test(full)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('no fabricated or unbalanced tax in the sources (BUG-039)', () => {
  const files = SOURCE_DIRS.flatMap((d) => walk(join(__dirname, d)));
  const scan = (pattern: RegExp) => {
    const hits: string[] = [];
    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (pattern.test(line) && !/^\s*(\/\/|\*)/.test(line)) hits.push(`${file.replace(join(__dirname, '..'), '')}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    return hits;
  };

  it('no screen derives tax from a fixed share of sales (the 2.38% guess)', () => {
    expect(scan(/0\.0238|0\.0476/)).toEqual([]);
  });

  it('no screen halves the tax with a rounding that can leave the halves one rupee off', () => {
    expect(scan(/Math\.round\([^)]*[tT]ax[^)]*\/\s*2\)/)).toEqual([]);
  });

  it('CGST and SGST are never both computed as the same rounded half of the total tax', () => {
    expect(scan(/(cgst|sgst)Amount:\s*Math\.round\([^)]*[tT]ax[^)]*\/\s*2\)/i)).toEqual([]);
  });
});
