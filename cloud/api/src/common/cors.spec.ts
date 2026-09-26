import { describe, it, expect } from 'vitest';
import { corsFor, qrOriginsFrom } from './cors';

const inputs = { allowedOrigins: ['https://admin.example.com'], qrOrigins: ['https://order.example.com'] };

describe('CORS: consoles versus the public ordering website', () => {
  it('lets the ordering website call the public QR routes, without credentials', () => {
    const d = corsFor(inputs, '/api/v1/public/qr/abc/menu', 'https://order.example.com');
    expect(d).toMatchObject({ origin: true, credentials: false });
  });
  it('refuses any other website on the public QR routes, including a restaurant console', () => {
    expect(corsFor(inputs, '/api/v1/public/qr/abc', 'https://admin.example.com').origin).toBe(false);
    expect(corsFor(inputs, '/api/v1/qr-guest/session?token=x', 'https://evil.example.net').origin).toBe(false);
    expect(corsFor(inputs, '/api/v1/public/qr/abc', undefined).origin).toBe(false);
  });
  it('never lets the ordering website reach the credentialed console API', () => {
    expect(corsFor(inputs, '/api/v1/restaurant/qr/tables', 'https://order.example.com').origin).toBe(false);
    expect(corsFor(inputs, '/api/v1/orders/sync', 'https://order.example.com').origin).toBe(false);
    expect(corsFor(inputs, '/api/v1/orders/sync', 'https://admin.example.com')).toMatchObject({ origin: true, credentials: true });
  });
  it('derives the ordering origins from configuration, with a local default only outside production', () => {
    expect(qrOriginsFrom({ QR_ORDER_BASE_URL: 'https://order.example.com/', NODE_ENV: 'production' })).toEqual(['https://order.example.com']);
    expect(qrOriginsFrom({ NODE_ENV: 'development' })).toContain('http://localhost:5190');
    expect(qrOriginsFrom({ NODE_ENV: 'production' })).toEqual([]);
    expect(qrOriginsFrom({ QR_ORDER_BASE_URL: 'https://a.example.com', QR_ALLOWED_ORIGINS: 'https://b.example.com, not a url', NODE_ENV: 'production' })).toEqual(['https://a.example.com', 'https://b.example.com']);
  });
});
