import { describe, it, expect } from 'vitest';
import { paymentPageCsp, renderPaymentPage } from './payment-page.util';

describe('the page behind the kiosk payment QR', () => {
  const pay = { state: 'PAY', restaurantName: 'Sharma Dhaba', amountLabel: '₹5.00', paymentSessionId: 'session_abc123', mode: 'production' } as const;

  it('shows the restaurant and the amount, and opens Cashfree checkout with the payment session in the right mode', () => {
    const html = renderPaymentPage(pay);
    expect(html).toContain('Sharma Dhaba');
    expect(html).toContain('₹5.00');
    expect(html).toContain('https://sdk.cashfree.com/js/v3/cashfree.js');
    expect(html).toContain('"session_abc123"');
    expect(html).toContain('"production"');
    expect(html).toContain('checkout(');
    expect(html).toContain('noindex');
  });

  it('cannot be broken out of by a hostile restaurant name or session text', () => {
    const html = renderPaymentPage({ ...pay, restaurantName: '<script>alert(1)</script>&"\'', paymentSessionId: '</script><img src=x onerror=alert(2)>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    // the only closing script tags are the page's own two; the hostile session text never closes one
    expect((html.match(/<\/script>/g) ?? []).length).toBe(2);
    expect(html).not.toContain('</script><img');
    expect(html).toContain('u003c/script>');
  });

  it("runs only scripts that carry this request's nonce, and the policy allows nothing but that and Cashfree", () => {
    const html = renderPaymentPage(pay, 'abc123==');
    expect((html.match(/nonce="abc123=="/g) ?? []).length).toBe(2);
    const csp = paymentPageCsp('abc123==');
    expect(csp).toContain("script-src 'nonce-abc123==' https://sdk.cashfree.com");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('says so when the payment is already received, and refuses to offer payment when it is closed', () => {
    const done = renderPaymentPage({ state: 'DONE', restaurantName: 'Sharma Dhaba', amountLabel: '₹5.00' });
    expect(done).toContain('Payment received');
    expect(done).not.toContain('cashfree.js');
    const closed = renderPaymentPage({ state: 'CLOSED', message: 'It has expired.' });
    expect(closed).toContain('This payment is closed');
    expect(closed).toContain('It has expired.');
    expect(closed).not.toContain('cashfree.js');
  });
});
