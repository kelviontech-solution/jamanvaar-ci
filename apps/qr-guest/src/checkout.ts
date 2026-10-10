import { QrApi, type Placed } from './api';

interface CheckoutInstance { open(): void; on(event: string, fn: (response: unknown) => void): void }
type CheckoutConstructor = new (options: Record<string, unknown>) => CheckoutInstance;
declare global { interface Window { Razorpay?: CheckoutConstructor } }
let scriptRequest: Promise<void> | null = null;
export function loadCheckoutSdk(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (scriptRequest) return scriptRequest;
  scriptRequest = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.referrerPolicy = 'no-referrer'; script.async = true;
    const timer = setTimeout(() => { script.remove(); scriptRequest = null; reject(new Error('Secure payment took too long to load. Please retry your existing order.')); }, 15000);
    script.onload = () => { clearTimeout(timer); if (window.Razorpay) resolve(); else { scriptRequest = null; reject(new Error('Secure payment is unavailable. Please try again.')); } };
    script.onerror = () => { clearTimeout(timer); script.remove(); scriptRequest = null; reject(new Error('Secure payment could not load. Check your connection and retry.')); };
    document.head.appendChild(script);
  });
  return scriptRequest;
}

/** The SDK callback never marks a bill paid. Server HMAC + captured-payment lookup do that. */
export async function openQrCheckout(order: Placed): Promise<Placed> {
  const checkout = order.payment?.checkout;
  if (!checkout) throw new Error('Secure checkout is not ready. Check payment status before retrying.');
  await loadCheckoutSdk();
  return new Promise((resolve, reject) => {
    let handled = false;
    const sdk = new window.Razorpay!({ key: checkout.key, order_id: checkout.orderId, amount: checkout.amount, currency: checkout.currency,
      name: order.restaurantName || 'Jamanvaar', description: `Order ${order.orderNumber ?? ''}`, theme: { color: '#0B253A' },
      handler: async (response: { razorpay_payment_id: string; razorpay_signature: string }) => {
        if (handled) return; handled = true;
        try { resolve(await QrApi.verifyPayment(order.publicOrderId, response.razorpay_payment_id, response.razorpay_signature)); }
        catch { reject(new Error('Your payment is being checked. Use Check payment status; do not pay again until the result is known.')); }
      },
      modal: { ondismiss: () => { if (!handled) { handled = true; resolve(order); } } }
    });
    // Failed attempts stay within the official SDK, where the guest can retry the same provider order.
    sdk.open();
  });
}
