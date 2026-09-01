/**
 * JAMANVAAR Sound Bridge
 * ======================
 * Thin bridge that delegates to the centralized JamanvaarSoundManager
 * from @jamanvaar/ui. This keeps backward compatibility for kiosk-user
 * which imports { SoundService } from '@jamanvaar/utils'.
 *
 * ALL sound now goes through one engine (SoundManager.ts in @jamanvaar/ui).
 * Do NOT duplicate audio logic here. Add new sounds to SoundManager.ts.
 */
import { sound } from '@jamanvaar/ui';

export class SoundService {
  /** Subtle click feedback when tapping buttons or navigating */
  public static playTap(): void {
    sound.play('click');
  }

  /** Satisfying crisp pop tone when adding an item to the order/cart */
  public static playAdd(): void {
    sound.play('add');
  }

  /** Harmonious chime when an order or payment is successfully completed */
  public static playSuccess(): void {
    sound.play('success');
  }

  /** Kitchen Order Ticket (KOT) bell — new kiosk order placed */
  public static playKitchenBell(): void {
    sound.play('kot');
  }

  /** Urgent attention warning for overdue kitchen orders */
  public static playUrgentAlert(): void {
    sound.play('warning');
  }

  /** Payment complete chime (premium 4-note ascending) */
  public static playPayment(): void {
    sound.play('payment');
  }

  /** Error feedback */
  public static playError(): void {
    sound.play('error');
  }

  /** Notification ding */
  public static playNotification(): void {
    sound.play('notification');
  }
}
