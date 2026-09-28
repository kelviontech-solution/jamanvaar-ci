export type PaymentPageView =
  | { state: 'PAY'; restaurantName: string; amountLabel: string; paymentSessionId: string; mode: 'production' | 'sandbox' }
  | { state: 'DONE'; restaurantName: string; amountLabel: string }
  | { state: 'CLOSED'; message: string };

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** A JSON string that is safe inside a <script> block: "<" can never close it. */
const BACKSLASH = String.fromCharCode(92);
const scriptString = (s: string): string =>
  JSON.stringify(s)
    .replace(/</g, BACKSLASH + 'u003c')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), BACKSLASH + 'u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), BACKSLASH + 'u2029');

const STYLE = `*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#faf7f2;color:#12314d;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
main{background:#fff;border:1px solid #eadfce;border-radius:24px;padding:28px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.06)}
h1{font-size:20px;margin:0 0 4px}.amt{font-size:38px;font-weight:800;margin:8px 0 16px}p{margin:8px 0;color:#4a5b6c;font-size:15px}
button{margin-top:14px;width:100%;padding:15px;border:0;border-radius:14px;background:#ea580c;color:#fff;font-size:17px;font-weight:700}.ok{color:#047857;font-size:56px}.small{font-size:12px;color:#8c9bae;margin-top:18px}`;

/**
 * The security policy for this page only (the API's default forbids every outside script). Our own script runs only with this request's
 * one-time nonce; the only outside code allowed is Cashfree's, which is the payment page itself.
 */
export function paymentPageCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://sdk.cashfree.com https://*.cashfree.com`,
    "connect-src https://*.cashfree.com",
    "frame-src https://*.cashfree.com",
    "style-src 'unsafe-inline'",
    "img-src https: data:",
    "form-action https://*.cashfree.com",
    "base-uri 'none'",
    "frame-ancestors 'none'"
  ].join('; ');
}

const shell = (title: string, body: string, script = ''): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main>${body}</main>${script}</body></html>`;

/**
 * The page a guest lands on after scanning the kiosk's payment QR with a phone camera. It carries no price and no account detail of its
 * own: the amount shown comes from the server's record of the payment, and the payment itself happens on Cashfree's own checkout page,
 * opened with the payment session the server created.
 */
export function renderPaymentPage(view: PaymentPageView, nonce = ''): string {
  const nonceAttr = nonce ? ` nonce="${escapeHtml(nonce)}"` : '';
  if (view.state === 'DONE') {
    return shell('Payment received', `<div class="ok">&#10003;</div><h1>Payment received</h1><p class="amt">${escapeHtml(view.amountLabel)}</p><p>Thank you. Your order is being prepared at ${escapeHtml(view.restaurantName)}. You can close this page.</p>`);
  }
  if (view.state === 'CLOSED') {
    return shell('Payment closed', `<h1>This payment is closed</h1><p>${escapeHtml(view.message)}</p><p class="small">Please go back to the kiosk and choose UPI QR again, or pay at the counter.</p>`);
  }
  const script = `<script${nonceAttr} src="https://sdk.cashfree.com/js/v3/cashfree.js"></script><script${nonceAttr}>
(function(){var session=${scriptString(view.paymentSessionId)};var msg=document.getElementById('msg');
function go(){try{var cashfree=Cashfree({mode:${scriptString(view.mode)}});cashfree.checkout({paymentSessionId:session,redirectTarget:'_self'});}catch(e){msg.textContent='Could not open the payment page. Please tap Pay now.';}}
document.getElementById('pay').addEventListener('click',go);window.addEventListener('load',function(){setTimeout(go,300);});})();
</script>`;
  return shell(
    `Pay ${view.restaurantName}`,
    `<h1>${escapeHtml(view.restaurantName)}</h1><p class="amt">${escapeHtml(view.amountLabel)}</p><p id="msg">Opening the secure payment page&hellip;</p><button id="pay" type="button">Pay now</button><p class="small">Payments are processed securely by Cashfree.</p>`,
    script
  );
}
