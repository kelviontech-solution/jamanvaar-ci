/**
 * The standard UPI deep-link payment request format (NPCI spec) -- any UPI app (GPay, PhonePe,
 * Paytm, the bank's own app...) that scans this QR opens pre-filled with the payee, the exact
 * amount, and a short note, ready for the guest to just confirm and pay. No payment gateway or
 * platform settlement involved: this goes straight from the guest's UPI app to the restaurant's
 * own VPA, the same as a merchant's printed "Scan & Pay" QR sticker.
 */
export function buildUpiPaymentUri(opts: { vpa: string; payeeName: string; amount: number; note?: string }): string {
  const params = new URLSearchParams({
    pa: opts.vpa.trim(),
    pn: opts.payeeName.trim() || 'Restaurant',
    am: opts.amount.toFixed(2),
    cu: 'INR'
  });
  if (opts.note) params.set('tn', opts.note.slice(0, 50));
  return `upi://pay?${params.toString()}`;
}
