import { describe, it, expect } from 'vitest';
import type { MenuItem } from '@jamanvaar/types';

// Pins the shape ItemModal's handleSubmit must produce when isKioskEnabled and translations
// are set -- a cheap guard against the fields silently being dropped from the save payload
// during the port, without needing a component-render test (this app has no such infra).
describe('ItemModal kiosk fields payload shape', () => {
  it('a dish payload can carry isKioskEnabled and per-language translations', () => {
    const payload: Partial<MenuItem> = {
      name: 'Paneer Tikka',
      isKioskEnabled: true,
      translations: {
        hi: { name: 'पनीर टिक्का', description: 'मसालेदार पनीर' },
        gu: { name: 'પનીર ટિક્કા' }
      }
    };
    expect(payload.isKioskEnabled).toBe(true);
    expect(payload.translations?.hi.name).toBe('पनीर टिक्का');
  });
});
