import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src');

describe('QrCatalog: opening an editor is not itself "unsaved changes" (false-positive "leave this page?" warning)', () => {
  const src = readFileSync(join(SRC, 'components/qrconsole/QrCatalog.tsx'), 'utf8');

  it('dirty is computed by comparing against the snapshot taken when the editor opened, not by truthiness of the draft', () => {
    // The old bug: useQrUnsavedChanges(!!draft || !!categoryDraft) -- true the instant "Edit" (or
    // "Add") is clicked, before any field is touched, so merely opening and then navigating away
    // (without changing anything) triggered a real browser beforeunload warning.
    expect(src).not.toMatch(/useQrUnsavedChanges\(!!draft \|\| !!categoryDraft\)/);
    expect(src).toMatch(/useQrUnsavedChanges\(itemDirty \|\| categoryDirty\)/);
    expect(src).toMatch(/JSON\.stringify\(draft\) !== JSON\.stringify\(draftOriginal\.current\)/);
    expect(src).toMatch(/JSON\.stringify\(categoryDraft\) !== JSON\.stringify\(categoryDraftOriginal\.current\)/);
  });

  it('every place a dish or category editor opens (Add dish, Add category, Edit, Edit category) captures the baseline before/with setDraft so the comparison has something real to compare against', () => {
    const openers = [...src.matchAll(/(draftOriginal|categoryDraftOriginal)\.current\s*=/g)];
    expect(openers.length, 'expected a baseline snapshot captured at each of the 4 editor-opening sites').toBeGreaterThanOrEqual(4);
  });
});

describe('Tables & QR: "Print All" / "Download All" match their sibling buttons\' disabled-when-inapplicable pattern', () => {
  const src = readFileSync(join(SRC, 'components/qrconsole/QrConsole.tsx'), 'utf8');

  it('Print All and Download All are now disabled when there is no active QR code to act on, like Print selected / Generate selected already were', () => {
    const printAllButton = /onClick=\{printAll\}[\s\S]{0,80}/.exec(src)?.[0] ?? '';
    const downloadAllButton = /onClick=\{downloadAll\}[\s\S]{0,80}/.exec(src)?.[0] ?? '';
    expect(printAllButton, 'Print All button markup not found').toMatch(/disabled=\{!hasActiveQr\}/);
    expect(downloadAllButton, 'Download All button markup not found').toMatch(/disabled=\{!hasActiveQr\}/);
  });

  it('hasActiveQr is derived from the real table/QR data, not hardcoded', () => {
    expect(src).toMatch(/hasActiveQr\s*=\s*useMemo\([\s\S]{0,40}tables\.data/);
  });

  it('the "Save table" button explains why it is disabled when the table number is empty, not just a silently greyed-out button', () => {
    expect(src).toMatch(/Enter a table number or name to save\./);
  });
});
