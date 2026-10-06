import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
describe('menu asset preparation preserves restaurant data', () => {
  it('runs the real catalog builder without overwriting the legacy restaurant menu', () => {
    const file=resolve('packages/database/src/live_db.json'); const before=readFileSync(file);
    const dir=mkdtempSync(join(tmpdir(),'jamanvaar-menu-manifest-'));
    try {
      const output=join(dir,'manifest.json'); const result=spawnSync(process.execPath,[resolve('tooling/dev/build_canonical_menu_catalog.mjs'),'--manifest-output',output],{encoding:'utf-8'});
      expect(result.status).toBe(0); expect(existsSync(output)).toBe(true); expect(JSON.parse(readFileSync(output,'utf-8')).totalDishes).toBeGreaterThan(0); expect(readFileSync(file).equals(before)).toBe(true);
    } finally { if (dirname(resolve(dir)) !== resolve(tmpdir()) || !basename(dir).startsWith('jamanvaar-menu-manifest-')) throw Error('Unexpected test cleanup target'); rmSync(dir,{recursive:true,force:true}); }
  });
});
