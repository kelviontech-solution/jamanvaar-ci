import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const admin = (file: string) => readFileSync(join(__dirname, '../apps/restaurant-system/pos-admin/src', file), 'utf8');

describe('Restaurant Admin: display preferences live in Settings, not a floating corner button', () => {
  it('does not mount the floating Display control in either admin entry point', () => {
    expect(admin('main.tsx')).not.toMatch(/<DisplayPreferences/);
    expect(admin('qr/main.tsx')).not.toMatch(/<DisplayPreferences/);
  });

  it('keeps the size/contrast preference in Settings without the now-meaningless show/hide toggle', () => {
    expect(admin('App.tsx')).toContain('<DisplayPreferences showButtonSetting={false} />');
    expect(admin('components/qrconsole/QrConsole.tsx')).toContain('<DisplayPreferences showButtonSetting={false} />');
    expect(admin('components/operations/OperationsConsole.tsx')).toContain('<DisplayPreferences showButtonSetting={false} />');
  });

  it('still applies the saved preset at startup', () => {
    expect(admin('main.tsx')).toContain('initializeDisplayPreferences(');
    expect(admin('qr/main.tsx')).toContain('initializeDisplayPreferences(');
  });
});
