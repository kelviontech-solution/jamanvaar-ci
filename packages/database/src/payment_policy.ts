/**
 * What may be accepted, given the state of the internet. The rule is simple and never bends:
 *  - CASH works with no connectivity at all.
 *  - A card terminal that is physically present works with no connectivity (it has its own link).
 *  - UPI (gateway or QR) needs a *verified* internet connection: being joined to Wi-Fi is not enough,
 *    a real request to the cloud must have succeeded recently. There is no fake offline UPI: offline, the
 *    order stays unpaid until cash or a card terminal is used.
 * The decision lives here, below the screens, so no screen and no sync path can mark a UPI bill PAID offline.
 */

export type PaymentKind = 'CASH' | 'UPI' | 'UPI_QR' | 'CARD';

export interface Availability {
  available: boolean;
  reason?: string;
}

const UPI_REASON = 'UPI needs a verified internet connection. Use cash or a card terminal until it is back.';

export class PaymentPolicy {
  private static verifier: (() => boolean) | null = null;
  private static cardTerminal = false;

  static reset(): void {
    this.verifier = null;
    this.cardTerminal = false;
  }

  /** Registers how the app tells whether the internet is really reachable. Until one is registered UPI is not blocked (unit tests, tools). */
  static setInternetVerifier(fn: (() => boolean) | null): void {
    this.verifier = fn;
  }

  static setCardTerminalPresent(present: boolean): void {
    this.cardTerminal = present;
  }

  static internetVerified(): boolean {
    return this.verifier ? this.verifier() : true;
  }

  static availability(): Record<PaymentKind, Availability> {
    const upi: Availability = this.internetVerified() ? { available: true } : { available: false, reason: UPI_REASON };
    return {
      CASH: { available: true },
      UPI: upi,
      UPI_QR: { ...upi },
      CARD: this.cardTerminal ? { available: true } : { available: false, reason: 'No card terminal is connected.' }
    };
  }

  /** Throws if this method may not be recorded as paid right now. */
  static assertAllowed(method: string): void {
    if ((method === 'UPI' || method === 'UPI_QR') && !this.internetVerified()) {
      throw new Error(`UPI_REQUIRES_INTERNET: ${UPI_REASON}`);
    }
  }
}
