import { describe, expect, it } from 'vitest';
import { VoiceService } from '../packages/api/src/services/voice';

describe('VoiceService & Multilingual Audio Synthesis', () => {
  it('should generate accurate Hindi confirmation voice message', () => {
    const hindiStandard = VoiceService.getConfirmationMessage('108', 'hi', 'STANDARD', true);
    expect(hindiStandard).toContain('धन्यवाद!');
    expect(hindiStandard).toContain('108');
    expect(hindiStandard).toContain('काउंटर');

    const hindiShort = VoiceService.getConfirmationMessage('108', 'hi', 'SHORT', true);
    expect(hindiShort).toContain('टोकन नंबर है 108');
  });

  it('should generate truthful Hindi offline confirmation voice message', () => {
    const hindiOffline = VoiceService.getConfirmationMessage('108', 'hi', 'STANDARD', false);
    expect(hindiOffline).toContain('आपका ऑर्डर सफलतापूर्वक दर्ज हो गया है');
    expect(hindiOffline).toContain('रसोई में भेज दिया गया है');
  });

  it('should generate English and Gujarati confirmation voice messages', () => {
    const en = VoiceService.getConfirmationMessage('108', 'en', 'STANDARD', true);
    expect(en).toContain('Your token number is 108');

    const gu = VoiceService.getConfirmationMessage('108', 'gu', 'STANDARD', true);
    expect(gu).toContain('તમારો ટોકન નંબર 108 છે');
  });

  it('should generate multilingual Order Ready announcements', () => {
    const readyHi = VoiceService.getReadyMessage('108', '1', 'hi');
    expect(readyHi).toContain('आपका ऑर्डर तैयार है');
    expect(readyHi).toContain('काउंटर नंबर 1');

    const readyEn = VoiceService.getReadyMessage('108', '2', 'en');
    expect(readyEn).toContain('Your order is ready');
    expect(readyEn).toContain('counter 2');
  });
});
