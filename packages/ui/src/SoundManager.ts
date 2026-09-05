/**
 * JAMANVAAR Centralized Sound Manager
 * ====================================
 * Shared across: POS Terminal, POS Admin, Kiosk, Kiosk Admin
 *
 * Uses Web Audio API to synthesize premium, short, subtle sounds.
 * No external audio files needed — works fully offline.
 *
 * Usage:
 *   import { sound } from '@jamanvaar/ui';
 *   sound.play('add');
 *   sound.play('payment');
 *   sound.setEnabled(false);
 *
 * Rules:
 *   - ONE user action = ONE sound call
 *   - Never call inside render / useEffect without user trigger
 *   - Never throws — all errors are silently handled
 */

export type SoundName =
  | 'click'
  | 'add'
  | 'remove'
  | 'success'
  | 'warning'
  | 'error'
  | 'notification'
  | 'payment'
  | 'order'
  | 'kot'
  | 'scan';

export type SoundVolume = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SoundSettings {
  enabled: boolean;
  volume: SoundVolume;
}

const STORAGE_KEY = 'jamanvaar_sound_settings';

const VOLUME_MAP: Record<SoundVolume, number> = {
  LOW: 0.25,
  MEDIUM: 0.55,
  HIGH: 0.85,
};

/** Load persisted settings from localStorage */
function loadSettings(): SoundSettings {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SoundSettings>;
        return {
          enabled: parsed.enabled !== false,
          volume: (parsed.volume as SoundVolume) || 'MEDIUM',
        };
      }
    }
  } catch {
    // ignore
  }
  return { enabled: true, volume: 'MEDIUM' };
}

/** Save settings to localStorage */
function saveSettings(settings: SoundSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    // ignore
  }
}

/**
 * Core synthesizer: plays a sequence of oscillator notes.
 * Each note: { freq, duration, type, startTime }
 */
interface Note {
  freq: number;
  duration: number; // seconds
  type?: OscillatorType;
  gainStart?: number;
  gainEnd?: number;
  delay?: number; // offset from context.currentTime
}

class JamanvaarSoundManager {
  private ctx: AudioContext | null = null;
  private settings: SoundSettings;
  private initialized = false;
  private lastPlayTime: Record<string, number> = {};
  private readonly DEBOUNCE_MS = 50; // prevent duplicate sounds within 50ms

  constructor() {
    this.settings = loadSettings();
  }

  /** Must be called after a user interaction to satisfy browser autoplay policy */
  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.initialized = true;
    return this.ctx;
  }

  /** Play a sequence of oscillator notes */
  private playNotes(notes: Note[]): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const masterVolume = VOLUME_MAP[this.settings.volume];
    const now = ctx.currentTime;

    for (const note of notes) {
      try {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.type = note.type || 'sine';
        osc.frequency.setValueAtTime(note.freq, now + (note.delay || 0));

        const gStart = (note.gainStart ?? 0.7) * masterVolume;
        const gEnd = (note.gainEnd ?? 0) * masterVolume;
        const startT = now + (note.delay || 0);
        const endT = startT + note.duration;

        gainNode.gain.setValueAtTime(gStart, startT);
        gainNode.gain.exponentialRampToValueAtTime(Math.max(gEnd, 0.0001), endT);

        osc.start(startT);
        osc.stop(endT + 0.01);
      } catch {
        // ignore individual note failures
      }
    }
  }

  // ─── Sound Definitions ──────────────────────────────────────────────────────

  private sounds: Record<SoundName, () => void> = {
    /** Subtle single click — navigation, category select */
    click: () => {
      this.playNotes([{ freq: 880, duration: 0.04, type: 'sine', gainStart: 0.4, gainEnd: 0 }]);
    },

    /** Add item to cart — ascending two-tone */
    add: () => {
      this.playNotes([
        { freq: 660, duration: 0.07, type: 'sine', gainStart: 0.5, gainEnd: 0.3, delay: 0 },
        { freq: 880, duration: 0.09, type: 'sine', gainStart: 0.6, gainEnd: 0, delay: 0.06 },
      ]);
    },

    /** Remove item — descending two-tone */
    remove: () => {
      this.playNotes([
        { freq: 880, duration: 0.07, type: 'sine', gainStart: 0.5, gainEnd: 0.3, delay: 0 },
        { freq: 600, duration: 0.09, type: 'sine', gainStart: 0.4, gainEnd: 0, delay: 0.06 },
      ]);
    },

    /** Config saved, action completed — 3-note ascending chord */
    success: () => {
      this.playNotes([
        { freq: 523, duration: 0.08, type: 'sine', gainStart: 0.5, gainEnd: 0.1, delay: 0 },
        { freq: 659, duration: 0.08, type: 'sine', gainStart: 0.5, gainEnd: 0.1, delay: 0.07 },
        { freq: 784, duration: 0.14, type: 'sine', gainStart: 0.6, gainEnd: 0, delay: 0.14 },
      ]);
    },

    /** Warning — two gentle pulses at 440Hz */
    warning: () => {
      this.playNotes([
        { freq: 440, duration: 0.08, type: 'sine', gainStart: 0.5, gainEnd: 0, delay: 0 },
        { freq: 440, duration: 0.1, type: 'sine', gainStart: 0.5, gainEnd: 0, delay: 0.14 },
      ]);
    },

    /** Error — low descending buzz */
    error: () => {
      this.playNotes([
        { freq: 280, duration: 0.12, type: 'sawtooth', gainStart: 0.4, gainEnd: 0.2, delay: 0 },
        { freq: 220, duration: 0.14, type: 'sawtooth', gainStart: 0.3, gainEnd: 0, delay: 0.1 },
      ]);
    },

    /** Soft notification ding — new order, new message */
    notification: () => {
      this.playNotes([
        { freq: 1047, duration: 0.12, type: 'sine', gainStart: 0.55, gainEnd: 0, delay: 0 },
      ]);
    },

    /** Premium payment success — pleasant chime */
    payment: () => {
      this.playNotes([
        { freq: 523, duration: 0.09, type: 'sine', gainStart: 0.6, gainEnd: 0.2, delay: 0 },
        { freq: 659, duration: 0.09, type: 'sine', gainStart: 0.65, gainEnd: 0.2, delay: 0.08 },
        { freq: 784, duration: 0.09, type: 'sine', gainStart: 0.65, gainEnd: 0.2, delay: 0.16 },
        { freq: 1047, duration: 0.2, type: 'sine', gainStart: 0.7, gainEnd: 0, delay: 0.24 },
      ]);
    },

    /** Order confirmed — two-tone notification */
    order: () => {
      this.playNotes([
        { freq: 880, duration: 0.1, type: 'sine', gainStart: 0.55, gainEnd: 0.1, delay: 0 },
        { freq: 1047, duration: 0.14, type: 'sine', gainStart: 0.6, gainEnd: 0, delay: 0.09 },
      ]);
    },

    /** KOT dispatched — kitchen alert two-tone */
    kot: () => {
      this.playNotes([
        { freq: 740, duration: 0.08, type: 'square', gainStart: 0.3, gainEnd: 0, delay: 0 },
        { freq: 880, duration: 0.1, type: 'square', gainStart: 0.3, gainEnd: 0, delay: 0.1 },
      ]);
    },

    /** Barcode / QR scan beep */
    scan: () => {
      this.playNotes([{ freq: 1200, duration: 0.06, type: 'sine', gainStart: 0.5, gainEnd: 0, delay: 0 }]);
    },
  };

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Play a sound by name.
   * Silently fails if audio is disabled or unavailable.
   * Debounced to prevent duplicate sounds within 50ms.
   */
  public play(name: SoundName): void {
    if (!this.settings.enabled) return;

    // Debounce: prevent duplicate sounds from rapid state updates
    const now = Date.now();
    if (this.lastPlayTime[name] && now - this.lastPlayTime[name] < this.DEBOUNCE_MS) {
      return;
    }
    this.lastPlayTime[name] = now;

    try {
      const fn = this.sounds[name];
      if (fn) fn.call(this);
    } catch {
      // Never throw to user code
    }
  }

  /** Enable or disable all sounds */
  public setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
    saveSettings(this.settings);
  }

  /** Set volume level */
  public setVolume(volume: SoundVolume): void {
    this.settings.volume = volume;
    saveSettings(this.settings);
  }

  /** Get current settings */
  public getSettings(): SoundSettings {
    return { ...this.settings };
  }

  /** Reload settings from localStorage (call if another tab changed them) */
  public reloadSettings(): void {
    this.settings = loadSettings();
  }

  /** Returns true if audio has been successfully initialized after user gesture */
  public isInitialized(): boolean {
    return this.initialized && this.ctx !== null;
  }

  /**
   * Warm-up: call this on first user interaction to initialize AudioContext.
   * Safe to call multiple times.
   */
  public warmUp(): void {
    this.ensureContext();
  }
}

/** Shared singleton — import this directly in all apps */
export const sound = new JamanvaarSoundManager();

export { JamanvaarSoundManager };
