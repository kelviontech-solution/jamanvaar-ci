import { VoiceConfig, VoiceLanguage, VoiceStyle } from '@jamanvaar/types';

const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  enabled: true,
  style: 'STANDARD',
  language: 'hi',
  volume: 1.0,
  rate: 0.95,
  pitch: 1.0,
  confirmationVoiceEnabled: true,
  readyVoiceEnabled: true,
  quietMode: false
};

let currentVoiceConfig: VoiceConfig = { ...DEFAULT_VOICE_CONFIG };

export class VoiceService {
  public static getConfig(): VoiceConfig {
    return currentVoiceConfig;
  }

  public static updateConfig(updates: Partial<VoiceConfig>): VoiceConfig {
    currentVoiceConfig = { ...currentVoiceConfig, ...updates };
    return currentVoiceConfig;
  }

  /**
   * Generates order confirmation speech text based on language, style and network mode
   */
  public static getConfirmationMessage(
    tokenNumber: string,
    lang: VoiceLanguage = 'hi',
    style: VoiceStyle = 'STANDARD',
    isOnline: boolean = true
  ): string {
    if (!isOnline) {
      switch (lang) {
        case 'en':
          return `Thank you! Your order is confirmed and sent to the kitchen. Your token number is ${tokenNumber}.`;
        case 'gu':
          return `આભાર! તમારો ઓર્ડર સફળતાપૂર્વક નોંધાઈ ગયો છે અને રસોડામાં મોકલી દેવાયો છે. તમારો ટોકન નંબર ${tokenNumber} છે.`;
        case 'hi':
        default:
          return `धन्यवाद! आपका ऑर्डर सफलतापूर्वक दर्ज हो गया है और रसोई में भेज दिया गया है। आपका टोकन नंबर है ${tokenNumber}।`;
      }
    }

    if (style === 'SHORT') {
      switch (lang) {
        case 'en':
          return `Thank you! Your order is confirmed. Your token number is ${tokenNumber}. Thank you!`;
        case 'gu':
          return `આભાર! તમારો ઓર્ડર સફળતાપૂર્વક નોંધાઈ ગયો છે. તમારો ટોકન નંબર ${tokenNumber} છે. આભાર!`;
        case 'hi':
        default:
          return `धन्यवाद! आपका ऑर्डर सफलतापूर्वक दर्ज हो गया है। आपका टोकन नंबर है ${tokenNumber}। धन्यवाद!`;
      }
    }

    // Standard Online Announcement
    switch (lang) {
      case 'en':
        return `Thank you! Your order has been placed successfully. Your token number is ${tokenNumber}. Please collect your order when your token is called. Thank you!`;
      case 'gu':
        return `આભાર! તમારો ઓર્ડર સફળતાપૂર્વક નોંધાઈ ગયો છે. તમારો ટોકન નંબર ${tokenNumber} છે. ટોકન નંબર આવે ત્યારે કૃપા કરીને કાઉન્ટર પરથી તમારો ઓર્ડર મેળવી લો. આભાર!`;
      case 'hi':
      default:
        return `धन्यवाद! आपका ऑर्डर सफलतापूर्वक दर्ज हो गया है। आपका टोकन नंबर है ${tokenNumber}। कृपया टोकन नंबर आने पर अपना ऑर्डर काउंटर से प्राप्त करें। धन्यवाद!`;
    }
  }

  /**
   * Generates Order Ready speech announcement
   */
  public static getReadyMessage(
    tokenNumber: string,
    counterNumber: string | number = '1',
    lang: VoiceLanguage = 'hi'
  ): string {
    switch (lang) {
      case 'en':
        return `Your order is ready. Token number ${tokenNumber}, please collect your order from counter ${counterNumber}.`;
      case 'gu':
        return `તમારો ઓર્ડર તૈયાર છે. ટોકન નંબર ${tokenNumber}, કૃપા કરીને કાઉન્ટર નંબર ${counterNumber} પરથી તમારો ઓર્ડર મેળવી લો.`;
      case 'hi':
      default:
        return `आपका ऑर्डर तैयार है। टोकन नंबर ${tokenNumber}, कृपया काउंटर नंबर ${counterNumber} से अपना ऑर्डर प्राप्त करें।`;
    }
  }

  /**
   * Plays a pleasant 3-tone harmonic confirmation chime via Web Audio API
   */
  public static playHarmonicChime(): void {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const tones = [523.25, 659.25, 783.99]; // C5, E5, G5
      tones.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);

        gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.12);
        osc.stop(ctx.currentTime + idx * 0.12 + 0.4);
      });
    } catch {
      // AudioContext failure should not throw
    }
  }

  /**
   * Non-blocking speech synthesis dispatcher with silent fallback
   */
  public static speak(
    text: string,
    lang: VoiceLanguage = currentVoiceConfig.language,
    overrides?: Partial<VoiceConfig>
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const cfg = { ...currentVoiceConfig, ...overrides };

      if (!cfg.enabled || cfg.style === 'DISABLED' || cfg.quietMode) {
        resolve(false);
        return;
      }

      // Play audio chime
      this.playHarmonicChime();

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve(false);
        return;
      }

      try {
        window.speechSynthesis.cancel(); // Clear any pending speech

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = Math.max(0, Math.min(1, cfg.volume));
        utterance.rate = Math.max(0.5, Math.min(2, cfg.rate));
        utterance.pitch = Math.max(0.5, Math.min(2, cfg.pitch));

        // Map to standard BCP 47 locale
        const langMap: Record<VoiceLanguage, string> = {
          hi: 'hi-IN',
          gu: 'gu-IN',
          en: 'en-IN'
        };
        const targetLocale = langMap[lang] || 'hi-IN';
        utterance.lang = targetLocale;

        // Select voice with robust Hindi / Gujarati / Indian matching
        const findAndSetVoice = () => {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            let matchedVoice: SpeechSynthesisVoice | undefined;

            if (lang === 'gu') {
              // Try Gujarati specific voices first
              matchedVoice = voices.find(
                (v) =>
                  v.lang.toLowerCase().includes('gu') ||
                  v.name.toLowerCase().includes('gujarati') ||
                  v.name.toLowerCase().includes('dhwani') ||
                  v.name.toLowerCase().includes('niranjan')
              );
              // Fallback to Hindi or Indian English voice for authentic Indian phonetic clarity
              if (!matchedVoice) {
                matchedVoice = voices.find((v) => v.lang.toLowerCase().includes('hi') || v.lang.toLowerCase().includes('en-in'));
              }
            } else if (lang === 'hi') {
              // Try Hindi specific voices
              matchedVoice = voices.find(
                (v) =>
                  v.lang.toLowerCase().includes('hi') ||
                  v.name.toLowerCase().includes('hindi') ||
                  v.name.toLowerCase().includes('swara') ||
                  v.name.toLowerCase().includes('kalpana') ||
                  v.name.toLowerCase().includes('hemant')
              );
            } else {
              matchedVoice = voices.find((v) => v.lang.toLowerCase().includes('en-in') || v.lang.toLowerCase().startsWith('en'));
            }

            if (!matchedVoice) {
              matchedVoice = voices.find((v) => v.lang.startsWith(targetLocale) || v.lang.startsWith(lang));
            }

            if (matchedVoice) {
              utterance.voice = matchedVoice;
            }
          }
        };

        findAndSetVoice();

        // If voices aren't loaded yet, try onvoiceschanged
        if (window.speechSynthesis.getVoices().length === 0) {
          window.speechSynthesis.onvoiceschanged = () => {
            findAndSetVoice();
          };
        }

        utterance.onend = () => resolve(true);
        utterance.onerror = () => resolve(false);

        // Slight delay to allow harmonic chime to resonate
        setTimeout(() => {
          try {
            window.speechSynthesis.speak(utterance);
          } catch {
            resolve(false);
          }
        }, 150);
      } catch (err) {
        // Voice failure must NEVER throw or block the order flow
        resolve(false);
      }
    });
  }

  /**
   * Dispatches test voice sample for Admin settings test
   */
  public static testVoice(lang: VoiceLanguage = 'hi'): Promise<boolean> {
    const sample = this.getConfirmationMessage('108', lang, currentVoiceConfig.style, true);
    return this.speak(sample, lang);
  }
}
