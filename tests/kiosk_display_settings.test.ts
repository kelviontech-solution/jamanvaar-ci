import { describe, expect, it, beforeEach } from 'vitest';
import { db, KioskDisplaySettingsRepository, WelcomeScreenSettingsRepository } from '@jamanvaar/database';
import { DEFAULT_KIOSK_DISPLAY_SETTINGS, DEFAULT_WELCOME_SCREEN_SETTINGS } from '@jamanvaar/database';
import { localizedName, localizedDescription } from '@jamanvaar/utils';

/**
 * Covers the Kiosk Admin-configurable customer-kiosk settings introduced to
 * replace literal constants (enabled languages, idle timeout thresholds)
 * that used to be hardcoded inside the customer kiosk app itself.
 */
describe('KioskDisplaySettingsRepository', () => {
  beforeEach(() => {
    // Reset to defaults between tests — updateSettings mutates db state directly.
    db.kioskDisplaySettings = { ...DEFAULT_KIOSK_DISPLAY_SETTINGS };
  });

  it('returns the seeded defaults matching the kiosk app previous hardcoded values', () => {
    const settings = KioskDisplaySettingsRepository.getSettings();
    expect(settings.enabledLanguages).toEqual(['en', 'hi', 'gu']);
    expect(settings.defaultLanguage).toBe('en');
    expect(settings.idleWarningAfterSeconds).toBe(45);
    expect(settings.idleResetCountdownSeconds).toBe(15);
  });

  it('applies a partial update and audits it', () => {
    const before = db.auditLogs.length;
    const updated = KioskDisplaySettingsRepository.updateSettings({ idleWarningAfterSeconds: 60 });
    expect(updated.idleWarningAfterSeconds).toBe(60);
    // Untouched fields survive the partial update.
    expect(updated.enabledLanguages).toEqual(['en', 'hi', 'gu']);
    expect(db.auditLogs.length).toBe(before + 1);
  });

  it('rejects disabling every language — the kiosk would have no language screen to show', () => {
    expect(() => KioskDisplaySettingsRepository.updateSettings({ enabledLanguages: [] })).toThrow(
      /at least one language/i
    );
    // Rejected update must not have partially applied.
    expect(KioskDisplaySettingsRepository.getSettings().enabledLanguages.length).toBeGreaterThan(0);
  });

  it('rejects a default language that is not in the enabled list', () => {
    expect(() =>
      KioskDisplaySettingsRepository.updateSettings({ enabledLanguages: ['en', 'hi'], defaultLanguage: 'gu' })
    ).toThrow(/must be one of the enabled languages/i);
  });

  it('allows disabling a language that is not the current default', () => {
    KioskDisplaySettingsRepository.updateSettings({ defaultLanguage: 'en' });
    const updated = KioskDisplaySettingsRepository.updateSettings({ enabledLanguages: ['en', 'hi'] });
    expect(updated.enabledLanguages).toEqual(['en', 'hi']);
  });
});

/**
 * Covers the Kiosk Admin-configurable Welcome Screen content — the kiosk's
 * first screen used to hardcode its heading/subtitle/button text and always
 * show the heritage artwork, with the promo banner concept not existing at
 * all. Defaults must exactly match the "off by default" product spec.
 */
describe('WelcomeScreenSettingsRepository', () => {
  beforeEach(() => {
    db.welcomeScreenSettings = { ...DEFAULT_WELCOME_SCREEN_SETTINGS };
  });

  it('defaults to heritage artwork on and the promo banner off, with no text overrides', () => {
    const settings = WelcomeScreenSettingsRepository.getSettings();
    expect(settings.showHeritageArtwork).toBe(true);
    expect(settings.showPromoBanner).toBe(false);
    expect(settings.headingText).toBeUndefined();
    expect(settings.subtitleText).toBeUndefined();
  });

  it('applies a partial update and audits it, leaving other fields untouched', () => {
    const before = db.auditLogs.length;
    const updated = WelcomeScreenSettingsRepository.updateSettings({ headingText: 'Namaste!' });
    expect(updated.headingText).toBe('Namaste!');
    expect(updated.showHeritageArtwork).toBe(true);
    expect(db.auditLogs.length).toBe(before + 1);
  });

  it('can enable the promo banner with custom text', () => {
    const updated = WelcomeScreenSettingsRepository.updateSettings({
      showPromoBanner: true,
      promoBannerText: 'Festive Thali Special'
    });
    expect(updated.showPromoBanner).toBe(true);
    expect(updated.promoBannerText).toBe('Festive Thali Special');
  });

  it('can disable the heritage artwork', () => {
    const updated = WelcomeScreenSettingsRepository.updateSettings({ showHeritageArtwork: false });
    expect(updated.showHeritageArtwork).toBe(false);
  });
});

describe('localizedName / localizedDescription — the fallback every caller shares', () => {
  it('falls back to the base name/description when no translations exist', () => {
    const item = { name: 'Paneer Tikka', description: 'Grilled cottage cheese' };
    expect(localizedName(item, 'hi')).toBe('Paneer Tikka');
    expect(localizedDescription(item, 'hi')).toBe('Grilled cottage cheese');
  });

  it('returns the translated text when present for that language', () => {
    const item = {
      name: 'Paneer Tikka',
      description: 'Grilled cottage cheese',
      translations: { hi: { name: 'पनीर टिक्का', description: 'भुना हुआ पनीर' } }
    };
    expect(localizedName(item, 'hi')).toBe('पनीर टिक्का');
    expect(localizedDescription(item, 'hi')).toBe('भुना हुआ पनीर');
  });

  it('falls back to English when the requested language has no entry at all', () => {
    const item = {
      name: 'Paneer Tikka',
      description: 'Grilled cottage cheese',
      translations: { hi: { name: 'पनीर टिक्का' } }
    };
    expect(localizedName(item, 'gu')).toBe('Paneer Tikka');
    expect(localizedDescription(item, 'gu')).toBe('Grilled cottage cheese');
  });

  it('falls back to the base description when a translation has a name but no description', () => {
    const item = {
      name: 'Paneer Tikka',
      description: 'Grilled cottage cheese',
      translations: { hi: { name: 'पनीर टिक्का' } }
    };
    expect(localizedDescription(item, 'hi')).toBe('Grilled cottage cheese');
  });

  it('treats a blank-string translation as missing rather than showing empty text', () => {
    const item = {
      name: 'Paneer Tikka',
      description: 'Grilled cottage cheese',
      translations: { hi: { name: '   ' } }
    };
    expect(localizedName(item, 'hi')).toBe('Paneer Tikka');
  });

  it('resolves real seeded menu item translations for Hindi and Gujarati', () => {
    const item = db.menuItems.find((m) => m.id === 'item-hbk');
    expect(item).toBeDefined();
    expect(localizedName(item!, 'hi')).toContain('कबाब');
    expect(localizedName(item!, 'gu')).toContain('કબાબ');
    expect(localizedName(item!, 'en')).toBe(item!.name);
  });

  it('resolves real seeded category translations', () => {
    const category = db.categories.find((c) => c.id === 'cat-starters');
    expect(category).toBeDefined();
    expect(localizedName(category!, 'hi')).toBe('स्टार्टर्स और स्नैक्स');
    expect(localizedName(category!, 'gu')).toBe('સ્ટાર્ટર્સ અને સ્નેક્સ');
  });

  it('every seeded menu item has both Hindi and Gujarati translations', () => {
    for (const item of db.menuItems) {
      expect(item.translations?.hi?.name, `${item.id} missing hi translation`).toBeTruthy();
      expect(item.translations?.gu?.name, `${item.id} missing gu translation`).toBeTruthy();
    }
  });
});
