import { sound } from '@jamanvaar/ui';

/**
 * What tells a waiter, with the phone in a pocket, that something needs them: a sound and a buzz. Food ready is the urgent one
 * (the plate is getting cold), a message or a guest asking for help is shorter.
 */
export type WaiterAlert = 'FOOD_READY' | 'MESSAGE' | 'GUEST_HELP';

const VIBRATE_KEY = 'jamanvaar_captain_vibrate';

export function vibrationPattern(kind: WaiterAlert): number[] {
  return kind === 'FOOD_READY' ? [220, 90, 220, 90, 220] : kind === 'GUEST_HELP' ? [160, 80, 160] : [120];
}

export function isVibrationOn(): boolean {
  try {
    return localStorage.getItem(VIBRATE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setVibrationOn(on: boolean): void {
  try {
    localStorage.setItem(VIBRATE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable: the choice lasts until the screen is closed.
  }
}

/** A table is the waiter's to act on when they seated it, or nobody did (a kiosk table, a table opened at the counter). */
export function isMyTable(table: { openedById?: string } | undefined, captainId: string | undefined): boolean {
  if (!table) return true; // unknown table: better a buzz too many than a missed plate
  return !table.openedById || table.openedById === captainId;
}

/** Plays the alert. Never throws: a phone without vibration, or a browser that blocks sound before the first touch, just stays quiet. */
export function alertWaiter(kind: WaiterAlert): void {
  try {
    sound.play(kind === 'FOOD_READY' ? 'success' : 'notification');
  } catch {
    // ignored
  }
  try {
    if (isVibrationOn() && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(vibrationPattern(kind));
  } catch {
    // ignored
  }
}
